import { activities as seedActivities } from '../data/mockData.js'

/*
 * Pure helpers shared by AppContext and pages.
 *
 * Data model:
 *   activity.location → public, approximate area (e.g. "Koregaon Park")
 *   activity.venue    → exact meeting point, only for the host and
 *                       approved participants
 *   activity.going    → confirmed participants (seed list + approved
 *                       join requests, merged in AppContext)
 */

/* -------------------------------------------------------------------------- */
/* Visibility                                                                 */
/* -------------------------------------------------------------------------- */

export function isPrivateActivity(activity) {
  return (
    activity?.visibility === 'private' ||
    activity?.isPrivate === true ||
    activity?.access === 'private' ||
    String(activity?.badge ?? '').toUpperCase() === 'PRIVATE'
  )
}

/* -------------------------------------------------------------------------- */
/* Participant preference                                                     */
/*                                                                            */
/* The host's preferred participant group, not the host's own gender. It is   */
/* shown before anyone requests; it never blocks a request (the host still    */
/* reviews every request). Plans without the field count as 'any'.            */
/* -------------------------------------------------------------------------- */

export const GENDER_OPTIONS = [
  { id: 'any', label: 'Any gender' },
  { id: 'women', label: 'Women' },
  { id: 'men', label: 'Men' },
]

export function genderPreferenceOf(activity) {
  return GENDER_OPTIONS.some((o) => o.id === activity?.genderPreference)
    ? activity.genderPreference
    : 'any'
}

export function genderPreferenceLabel(activity) {
  const id = genderPreferenceOf(activity)
  return GENDER_OPTIONS.find((o) => o.id === id).label
}

/* Short card label, only when the host chose a specific group. */
export function genderPreferenceTag(activity) {
  const id = genderPreferenceOf(activity)
  return id === 'any' ? null : `For ${id}`
}

/* -------------------------------------------------------------------------- */
/* Guests                                                                     */
/* -------------------------------------------------------------------------- */

/*
 * Initials avatar for guests (no photo is invented for them). Inline SVG,
 * so no image service is involved.
 */
export function initialsAvatar(name) {
  const initial = (String(name ?? '').trim()[0] || '?').toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#231c33"/><text x="32" y="41" font-family="Manrope, sans-serif" font-size="28" font-weight="700" fill="#3eebae" text-anchor="middle">${initial.replace(/[<>&"]/g, '')}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

const WEEKEND_DATES = ['friday', 'saturday', 'sunday', 'this weekend']

export function matchesDateFilter(activity, filter) {
  const date = String(activity?.date ?? '').toLowerCase()

  if (filter === 'Today') return date === 'today'
  if (filter === 'Tomorrow') return date === 'tomorrow'
  if (filter === 'This Weekend') return WEEKEND_DATES.includes(date)

  return true
}

/* -------------------------------------------------------------------------- */
/* Hosting                                                                    */
/* -------------------------------------------------------------------------- */

export function isHost(activity, userId) {
  return Boolean(userId) && activity?.host?.id === userId
}

/* -------------------------------------------------------------------------- */
/* Join requests                                                              */
/* -------------------------------------------------------------------------- */

/*
 * Requests for an activity, excluding any request the host made to
 * their own plan (hosts can never be applicants to themselves).
 */
export function validRequests(activity, requests = []) {
  const hostId = activity?.host?.id

  return requests.filter(
    (request) =>
      request?.applicant?.id &&
      request.applicant.id !== hostId,
  )
}

/*
 * The most recent request from one applicant. Older rejected requests
 * stay in the list as history; the latest one decides the UI state.
 */
export function latestRequestFor(requests = [], applicantId) {
  let latest = null

  for (const request of requests) {
    if (request?.applicant?.id !== applicantId) continue

    if (
      !latest ||
      requestTime(request) >= requestTime(latest)
    ) {
      latest = request
    }
  }

  return latest
}

function requestTime(request) {
  const time = new Date(request?.requestedAt).getTime()
  return Number.isNaN(time) ? 0 : time
}

/*
 * Applicants whose latest request is approved.
 */
export function approvedApplicants(activity, requests = []) {
  const valid = validRequests(activity, requests)
  const ids = [...new Set(valid.map((r) => r.applicant.id))]

  return ids
    .map((id) => latestRequestFor(valid, id))
    .filter((request) => request?.status === 'approved')
    .map((request) => request.applicant)
}

/*
 * activity.going = seed participants + approved applicants (deduped).
 */
export function mergeParticipants(activity, requests = []) {
  const seen = new Set()
  const going = []

  for (const person of [
    ...(activity.going ?? []),
    ...approvedApplicants(activity, requests),
  ]) {
    if (!person?.id || seen.has(person.id)) continue
    seen.add(person.id)
    going.push(person)
  }

  return going
}

export function spotsLeft(activity) {
  return Math.max(
    (activity?.capacity ?? 0) - (activity?.going?.length ?? 0),
    0,
  )
}

/*
 * Participation of one user in one (merged) activity.
 *
 * status: 'hosting' | 'going' | 'pending' | 'rejected' | 'none'
 */
export function participationFor(activity, requests = [], userId) {
  const request = latestRequestFor(
    validRequests(activity, requests),
    userId,
  )

  const left = spotsLeft(activity)

  let status = 'none'

  if (isHost(activity, userId)) {
    status = 'hosting'
  } else if (activity.going?.some((p) => p.id === userId)) {
    status = 'going'
  } else if (request?.status === 'pending') {
    status = 'pending'
  } else if (request?.status === 'rejected') {
    status = 'rejected'
  }

  return {
    status,
    request,
    spotsLeft: left,
    isFull: left <= 0,
  }
}

/* -------------------------------------------------------------------------- */
/* Location privacy                                                           */
/* -------------------------------------------------------------------------- */

export function approximateArea(activity, fallbackCity) {
  return (
    activity?.area ||
    activity?.location ||
    activity?.city ||
    fallbackCity ||
    'Nearby area'
  )
}

/*
 * Only the host and confirmed participants get the exact venue.
 */
export function visibleLocationFor(
  activity,
  participationStatus,
  fallbackCity,
) {
  if (!activity) {
    return {
      value: 'Location unavailable',
      area: null,
      venue: null,
      precise: false,
    }
  }

  const area = approximateArea(activity, fallbackCity)

  const canSeeVenue =
    participationStatus === 'hosting' ||
    participationStatus === 'going'

  if (canSeeVenue && activity.venue) {
    return {
      value: activity.venue,
      area,
      venue: activity.venue,
      precise: true,
    }
  }

  return {
    value: area,
    area,
    venue: null,
    precise: false,
  }
}

/* -------------------------------------------------------------------------- */
/* Images for created plans                                                   */
/* -------------------------------------------------------------------------- */

/*
 * Created plans reuse the photo of the first seed plan in the same category
 * (public plans preferred). Deterministic: the same category always maps to
 * the same image, and no random or extra image service is involved.
 */
const CATEGORY_IMAGES = (() => {
  const map = {}

  for (const activity of [
    ...seedActivities.filter((a) => !isPrivateActivity(a)),
    ...seedActivities.filter((a) => isPrivateActivity(a)),
  ]) {
    if (activity.category && activity.image && !map[activity.category]) {
      map[activity.category] = activity.image
    }
  }

  return map
})()

export function imageForCategory(category) {
  return (
    CATEGORY_IMAGES[category] ||
    CATEGORY_IMAGES.Social ||
    seedActivities[0]?.image
  )
}
