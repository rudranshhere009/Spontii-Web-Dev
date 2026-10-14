import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  activities as seedActivities,
  currentUser as seedCurrentUser,
  chats as seedChats,
  updates as seedUpdates,
} from '../data/mockData'
import { useAuth } from './AuthContext'
import {
  imageForCategory,
  initialsAvatar,
  isHost,
  isPrivateActivity,
  latestRequestFor,
  mergeParticipants,
  participationFor,
  spotsLeft,
  validRequests,
  visibleLocationFor,
} from '../lib/activities'
import { CITIES, CITY_KEY, DEFAULT_CITY } from '../lib/location'

const AppContext = createContext(null)

const CREATED_KEY = 'spontii_created_v1'
const REQUESTS_KEY = 'spontii_join_requests_v1'
const PROFILE_KEY = 'spontii_profile_v1'
const CHATS_KEY = 'spontii_chats_v1'
const UPDATES_KEY = 'spontii_updates_v1'
const GUEST_KEY = 'spontii_guest_v1'

/*
 * Note: 'spontii_joined_v1' is no longer read. Participation is derived
 * from activity.going + approved join requests.
 */

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function loadJSON(key, fallback) {
  try {
    const saved = localStorage.getItem(key)

    if (saved) {
      return JSON.parse(saved)
    }
  } catch (error) {
    console.error(`Failed to load ${key}:`, error)
  }

  return typeof fallback === 'function' ? fallback() : fallback
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Failed to save ${key}:`, error)
  }
}

/*
 * Plans created before the area/venue split stored the typed meeting
 * point in `location`, which is shown publicly. Move it to `venue` and
 * fall back to the city for the public area.
 */
function loadCreated() {
  const created = loadJSON(CREATED_KEY, [])

  if (!Array.isArray(created)) {
    return []
  }

  return created.map((saved) => {
    /*
     * Plans created before the image fix used random picsum photos.
     * Swap them for the stable category image.
     */
    const activity = String(saved.image ?? '').includes('picsum.photos')
      ? { ...saved, image: imageForCategory(saved.category) }
      : saved

    if (activity.area) {
      return activity
    }

    return {
      ...activity,
      area: seedCurrentUser.city,
      location: seedCurrentUser.city,
      venue: activity.venue || activity.location,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Demo applicant                                                             */
/* -------------------------------------------------------------------------- */

const demoApplicant = {
  id: 'p7',
  name: 'Nisha Kapoor',
  avatar: 'https://i.pravatar.cc/96?u=nisha-kapoor',

  verified: true,

  reliability: 94,
  reliabilityScore: 94,
  trustScore: 94,

  city: 'Pune',

  bio: 'Always up for a good plan, easy conversations and meeting new people.',

  tags: [
    'Social',
    'Outdoors',
    'Curious',
  ],
}

/* -------------------------------------------------------------------------- */
/* Join requests                                                              */
/* -------------------------------------------------------------------------- */

function loadJoinRequests() {
  return loadJSON(REQUESTS_KEY, () => {
    /*
     * Demo request for the host's Sunday Cycling plan.
     *
     * This is only seeded when no saved request data exists.
     */
    const sundayCycling = seedActivities.find(
      (activity) => activity.id === 'sunday-cycling'
    )

    if (!sundayCycling) {
      return {}
    }

    return {
      'sunday-cycling': [
        {
          id: 'demo-request-nisha',
          activityId: 'sunday-cycling',

          applicant: demoApplicant,

          status: 'pending',

          requestedAt: new Date().toISOString(),

          /*
           * Applicant's approximate area only.
           */
          approximateLocation: 'Pune',

          message:
            'Would love to join the Sunday cycling loop!',
        },
      ],
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

export function AppProvider({ children }) {
  const { isAuthenticated } = useAuth()

  const [created, setCreated] = useState(() => loadCreated())

  const [joinRequests, setJoinRequests] = useState(() =>
    loadJoinRequests()
  )

  const [profileEdits, setProfileEdits] = useState(() =>
    loadJSON(PROFILE_KEY, {})
  )

  const [chats, setChats] = useState(() =>
    loadJSON(CHATS_KEY, seedChats)
  )

  const [updates, setUpdates] = useState(() =>
    loadJSON(UPDATES_KEY, seedUpdates)
  )

  /* City (manual pick or matched from shared location) survives refresh. */
  const [city, setCity] = useState(() => {
    const saved = loadJSON(CITY_KEY, DEFAULT_CITY)
    return CITIES.includes(saved) ? saved : DEFAULT_CITY
  })

  /*
   * Logged-out visitors can request to join public plans as a guest. The
   * guest (a first name + random id) is remembered on this device only, so
   * repeat requests are recognised instead of duplicated.
   */
  const [guest, setGuest] = useState(() => {
    const saved = loadJSON(GUEST_KEY, null)
    return saved?.id && saved?.name ? saved : null
  })

  const [notifOpen, setNotifOpen] = useState(false)

  const [hasUnreadNotifs, setHasUnreadNotifs] = useState(
    () => updates.some((update) => !update.read)
  )

  /* ------------------------------------------------------------------------ */
  /* Current user (seed + persisted profile edits, stable id)                 */
  /* ------------------------------------------------------------------------ */

  const currentUser = useMemo(
    () => ({
      ...seedCurrentUser,
      ...profileEdits,
      id: seedCurrentUser.id,
    }),
    [profileEdits]
  )

  /* ------------------------------------------------------------------------ */
  /* Activities                                                               */
  /*                                                                          */
  /* activity.going is the single participant list: seed participants plus    */
  /* applicants whose latest request was approved. The current user's         */
  /* snapshot is swapped for their live profile so edits show everywhere.     */
  /* ------------------------------------------------------------------------ */

  const allActivities = useMemo(() => {
    const resolve = (person) =>
      person?.id === currentUser.id ? currentUser : person

    return [...created, ...seedActivities].map((activity) => ({
      ...activity,
      host: resolve(activity.host),
      going: mergeParticipants(
        activity,
        joinRequests[activity.id] || []
      ).map(resolve),
    }))
  }, [created, joinRequests, currentUser])

  /* ------------------------------------------------------------------------ */
  /* Viewer access (enforced here, at the data source every page reads)       */
  /*                                                                          */
  /* Visibility and access are separate:                                      */
  /* - Everyone can see public and private plans.                             */
  /* - Logged out + private: safe preview only. Participants are anonymised   */
  /*   (count kept) and `restricted` is set; joining needs an account.        */
  /* - Exact venue: only for the host and confirmed participants (a guest     */
  /*   approved on a public plan counts as a confirmed participant).          */
  /*                                                                          */
  /* This is client-side mock data, so it limits what the UI can read; it is  */
  /* not a substitute for server-side authorization.                          */
  /* ------------------------------------------------------------------------ */

  // Who is looking: the member, this device's guest, or nobody yet.
  const viewerId = isAuthenticated ? currentUser.id : guest?.id ?? null

  const activities = useMemo(() => {
    const canSeeVenue = (activity) =>
      Boolean(viewerId) &&
      (isHost(activity, viewerId) ||
        activity.going.some((person) => person.id === viewerId))

    return allActivities.map((activity) => {
      let visible = activity

      if (!isAuthenticated && isPrivateActivity(activity)) {
        visible = {
          ...activity,
          restricted: true,
          going: activity.going.map((_, index) => ({
            id: `hidden-${activity.id}-${index}`,
            name: 'Spontii member',
            avatar: initialsAvatar('S'),
          })),
        }
      }

      if (canSeeVenue(visible) || !('venue' in visible)) {
        return visible
      }

      const { venue: _hidden, ...withoutVenue } = visible
      return withoutVenue
    })
  }, [allActivities, isAuthenticated, viewerId])

  /*
   * Derived: ids of activities the current user is a participant of.
   */
  const joined = useMemo(
    () =>
      new Set(
        !viewerId
          ? []
          : activities
              .filter((activity) =>
                activity.going.some(
                  (person) => person.id === viewerId
                )
              )
              .map((activity) => activity.id)
      ),
    [activities, viewerId]
  )

  function findActivity(activityId) {
    return activities.find((item) => item.id === activityId)
  }

  /* ------------------------------------------------------------------------ */
  /* Persistence                                                              */
  /* ------------------------------------------------------------------------ */

  useEffect(() => saveJSON(CREATED_KEY, created), [created])
  useEffect(() => saveJSON(REQUESTS_KEY, joinRequests), [joinRequests])
  useEffect(() => saveJSON(PROFILE_KEY, profileEdits), [profileEdits])
  useEffect(() => saveJSON(CHATS_KEY, chats), [chats])
  useEffect(() => saveJSON(UPDATES_KEY, updates), [updates])
  useEffect(() => saveJSON(CITY_KEY, city), [city])

  /* ------------------------------------------------------------------------ */
  /* Add activity                                                             */
  /* ------------------------------------------------------------------------ */

  function addActivity(activity) {
    if (!activity?.id) {
      return
    }

    setCreated((previous) => [
      ...previous,
      activity,
    ])
  }

  /* ------------------------------------------------------------------------ */
  /* Participation                                                            */
  /* ------------------------------------------------------------------------ */

  function isJoined(activityId) {
    return joined.has(activityId)
  }

  function getParticipation(
    activityId,
    userId = currentUser.id
  ) {
    const activity = findActivity(activityId)

    if (!activity) {
      return {
        status: 'none',
        request: null,
        spotsLeft: 0,
        isFull: false,
      }
    }

    return participationFor(
      activity,
      joinRequests[activityId] || [],
      isAuthenticated ? userId : guest?.id ?? null
    )
  }

  /* ------------------------------------------------------------------------ */
  /* Guest identity                                                           */
  /* ------------------------------------------------------------------------ */

  /*
   * Returns this device's guest, creating it on first use. Keeps the
   * existing id so one device never turns into two applicants.
   */
  function createGuest(name) {
    const clean = String(name ?? '').trim().slice(0, 40)

    if (!clean) {
      return null
    }

    const next = {
      id:
        guest?.id ||
        `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: clean,
      avatar: initialsAvatar(clean),
      guest: true,
      verified: false,
      city,
    }

    setGuest(next)
    saveJSON(GUEST_KEY, next)
    return next
  }

  /* ------------------------------------------------------------------------ */
  /* Request to join                                                          */
  /* ------------------------------------------------------------------------ */

  /*
   * Returns { success, created, request } or { success: false, message }.
   * `created` is true only when a new request was saved, so the UI shows
   * its confirmation once and never for an existing pending request.
   */
  function requestToJoin(
    activityId,
    applicant = isAuthenticated ? currentUser : guest
  ) {
    const activity = findActivity(activityId)

    if (!activity) {
      return { success: false, message: 'Plan not found.' }
    }

    /* Logged out: public plans only, and only as this device's guest. */
    if (!isAuthenticated) {
      if (isPrivateActivity(activity)) {
        return {
          success: false,
          needsAccount: true,
          message:
            'Create an account or log in to request to join this private plan.',
        }
      }

      if (!applicant?.guest) {
        return {
          success: false,
          needsGuest: true,
          message: 'Add your first name to send a request.',
        }
      }
    }

    const applicantId = applicant?.id

    if (!applicantId) {
      return { success: false, message: 'Missing applicant.' }
    }

    if (isHost(activity, applicantId)) {
      return {
        success: false,
        message: "You can't request to join your own plan.",
      }
    }

    const participation = participationFor(
      activity,
      joinRequests[activityId] || [],
      applicantId
    )

    if (participation.status === 'going') {
      return { success: false, message: "You're already going." }
    }

    /*
     * Only one active (pending) request per applicant.
     */
    if (participation.status === 'pending') {
      return {
        success: true,
        created: false,
        request: participation.request,
      }
    }

    if (participation.isFull) {
      return { success: false, message: 'This plan is full.' }
    }

    const reliability =
      applicant.reliability ??
      applicant.reliabilityScore ??
      null

    const request = {
      id: `request-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,

      activityId,

      applicant: {
        ...applicant,

        verified: applicant.verified === true,

        reliability,

        reliabilityScore:
          applicant.reliabilityScore ?? reliability,

        trustScore:
          applicant.trustScore ?? reliability,
      },

      status: 'pending',

      requestedAt: new Date().toISOString(),

      /*
       * The applicant's own approximate area (never an exact address).
       */
      approximateLocation:
        applicant.city ||
        city ||
        'Nearby area',

      message: '',
    }

    setJoinRequests((previous) => ({
      ...previous,

      [activityId]: [
        ...(previous[activityId] || []),
        request,
      ],
    }))

    return { success: true, created: true, request }
  }

  /* ------------------------------------------------------------------------ */
  /* Request lookups                                                          */
  /* ------------------------------------------------------------------------ */

  function getRequestStatus(
    activityId,
    applicantId = currentUser.id
  ) {
    const activity = findActivity(activityId)

    if (!activity) {
      return null
    }

    return (
      latestRequestFor(
        validRequests(activity, joinRequests[activityId]),
        applicantId
      )?.status || null
    )
  }

  /*
   * Requests the host can review: never includes the host's own requests.
   */
  function getJoinRequests(activityId) {
    const activity = findActivity(activityId)

    if (!activity) {
      return []
    }

    return validRequests(activity, joinRequests[activityId])
  }

  function getRequestById(requestId) {
    if (!isAuthenticated) {
      return null
    }

    for (const [activityId, requests] of Object.entries(joinRequests)) {
      const request = (requests || []).find(
        (item) => item.id === requestId
      )

      if (request) {
        const activity = findActivity(activityId) || null

        if (activity && !validRequests(activity, [request]).length) {
          return null
        }

        return { request, activity }
      }
    }

    return null
  }

  /* ------------------------------------------------------------------------ */
  /* Review (approve / reject)                                                */
  /*                                                                          */
  /* Returns { success, message }. Only the host may review, and only         */
  /* pending requests from someone other than the host.                       */
  /* ------------------------------------------------------------------------ */

  function validateReview(activityId, requestId) {
    if (!isAuthenticated) {
      return { error: 'Log in to review requests.' }
    }

    const activity = findActivity(activityId)

    if (!activity) {
      return { error: 'Plan not found.' }
    }

    if (!isHost(activity, currentUser.id)) {
      return { error: 'Only the host can review requests.' }
    }

    const request = validRequests(
      activity,
      joinRequests[activityId]
    ).find((item) => item.id === requestId)

    if (!request) {
      return { error: 'Request not found.' }
    }

    if (request.status !== 'pending') {
      return { error: 'This request was already reviewed.' }
    }

    return { activity, request }
  }

  function setRequestStatus(activityId, requestId, status) {
    const timestampKey =
      status === 'approved' ? 'approvedAt' : 'rejectedAt'

    setJoinRequests((previous) => ({
      ...previous,

      [activityId]: (previous[activityId] || []).map(
        (request) =>
          request.id === requestId
            ? {
                ...request,
                status,
                [timestampKey]: new Date().toISOString(),
              }
            : request
      ),
    }))
  }

  function approveRequest(activityId, requestId) {
    const { error, activity } = validateReview(
      activityId,
      requestId
    )

    if (error) {
      return { success: false, message: error }
    }

    if (spotsLeft(activity) <= 0) {
      return { success: false, message: 'This plan is already full.' }
    }

    setRequestStatus(activityId, requestId, 'approved')

    return { success: true }
  }

  function rejectRequest(activityId, requestId) {
    const { error } = validateReview(activityId, requestId)

    if (error) {
      return { success: false, message: error }
    }

    setRequestStatus(activityId, requestId, 'rejected')

    return { success: true }
  }

  /* ------------------------------------------------------------------------ */
  /* Get visible location                                                     */
  /*                                                                          */
  /* Exact venue only for the host and confirmed participants.                */
  /* ------------------------------------------------------------------------ */

  function getVisibleLocation(
    activityId,
    userId = currentUser.id
  ) {
    const activity = findActivity(activityId)

    return visibleLocationFor(
      activity,
      activity ? getParticipation(activityId, userId).status : null,
      city
    )
  }

  /* ------------------------------------------------------------------------ */
  /* Clear request                                                            */
  /* ------------------------------------------------------------------------ */

  function clearRequest(
    activityId,
    requestId
  ) {
    if (!activityId || !requestId) {
      return
    }

    setJoinRequests((previous) => ({
      ...previous,

      [activityId]: (previous[activityId] || []).filter(
        (request) => request.id !== requestId
      ),
    }))
  }

  /* ------------------------------------------------------------------------ */
  /* Profile                                                                  */
  /* ------------------------------------------------------------------------ */

  function updateProfile(fields) {
    const { id: _ignored, ...rest } = fields || {}

    setProfileEdits((previous) => ({
      ...previous,
      ...rest,
    }))
  }

  /* ------------------------------------------------------------------------ */
  /* Inbox                                                                    */
  /* ------------------------------------------------------------------------ */

  function markChatRead(chatId) {
    setChats((previous) =>
      previous.map((chat) =>
        chat.id === chatId ? { ...chat, unread: false } : chat
      )
    )
  }

  function sendMessage(chatId, text) {
    const clean = text?.trim()

    if (!clean) {
      return
    }

    const message = { from: 'me', text: clean, time: 'Now' }

    setChats((previous) =>
      previous.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: [...chat.messages, message],
              lastMessage: `You: ${clean}`,
              time: 'Now',
            }
          : chat
      )
    )
  }

  function clearUpdates() {
    setUpdates([])
    setHasUnreadNotifs(false)
  }

  /* Read state is kept on each update instead of deleting it. */
  function markUpdatesRead() {
    setUpdates((previous) =>
      previous.map((update) => ({ ...update, read: true }))
    )
    setHasUnreadNotifs(false)
  }

  function markUpdateRead(updateId) {
    setUpdates((previous) => {
      const next = previous.map((update) =>
        update.id === updateId ? { ...update, read: true } : update
      )
      setHasUnreadNotifs(next.some((update) => !update.read))
      return next
    })
  }

  /* ------------------------------------------------------------------------ */
  /* Notifications                                                            */
  /* ------------------------------------------------------------------------ */

  function toggleNotifications() {
    setNotifOpen((previous) => !previous)
    setHasUnreadNotifs(false)
  }

  function closeNotifications() {
    setNotifOpen(false)
  }

  /* ------------------------------------------------------------------------ */
  /* Context value                                                            */
  /* ------------------------------------------------------------------------ */

  const value = {
    /* Current user */
    currentUser,
    updateProfile,

    /* Activities */
    activities,
    created,
    addActivity,

    /* Guest (logged-out requests to public plans) */
    guest,
    createGuest,

    /* Participation (derived) */
    joined,
    isJoined,
    getParticipation,

    /* Join requests */
    joinRequests: isAuthenticated ? joinRequests : {},
    requestToJoin,
    getRequestStatus,
    getJoinRequests,
    getRequestById,
    approveRequest,
    rejectRequest,
    clearRequest,

    /* Location privacy */
    getVisibleLocation,

    /* User location */
    city,
    setCity,

    /* Inbox */
    chats,
    markChatRead,
    sendMessage,
    updates,
    clearUpdates,
    markUpdatesRead,
    markUpdateRead,

    /* Notifications */
    notifOpen,
    setNotifOpen,
    toggleNotifications,
    closeNotifications,
    hasUnreadNotifs,
    setHasUnreadNotifs,
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

export function useApp() {
  const context = useContext(AppContext)

  if (!context) {
    throw new Error(
      'useApp must be used inside AppProvider'
    )
  }

  return context
}
