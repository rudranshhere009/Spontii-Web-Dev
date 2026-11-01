import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { updates as seedUpdates } from '../data/mockData'
import ChatThread from '../components/ChatThread'
import { useChatEvent, useChatThread } from '../hooks/useChatThread'
import { apiRequest } from '../lib/api'
import { firstName, formatThreadTime, threadKey } from '../lib/chat'
import avatarPlaceholder from '../assets/avatar-placeholder.svg'
import logo from '../assets/logo.png'
import {
  ArrowLeftIcon,
  BellIcon,
  ChatIcon,
  CheckIcon,
  CompassIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  FlagIcon,
  HomeIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserIcon,
  UsersIcon,
} from '../components/NavIcons'

const ICONS = { check: CheckIcon, chat: ChatIcon }

/* Updates saved before links existed still find their action. */
const SEED_LINKS = Object.fromEntries(
  seedUpdates.filter((u) => u.to).map((u) => [u.id, u.to]),
)

/* Only what the app actually does today; no new guarantees. */
const TRUST_POINTS = [
  {
    id: 'trust',
    icon: ShieldCheckIcon,
    title: 'Look for Verified',
    text: 'Check for the Verified badge on hosts and people before you meet.',
    more: 'It appears on activity pages and profiles. Hosts approve who joins each plan.',
  },
  {
    id: 'report',
    icon: FlagIcon,
    title: 'Keep it about the plan',
    text: 'You can message friends, and your host or guests while an event is on.',
    more: "Everyone else talks in the event's live chat. Report a message or block someone if anything feels off, and avoid sharing your address or phone number.",
  },
  {
    id: 'privacy',
    icon: LockIcon,
    title: 'Location stays approximate',
    text: 'The exact meeting point is shared once the host confirms you.',
    more: 'Until then, activity pages only show the general area.',
  },
]

function previewText(lastMessage, meId, kind) {
  if (!lastMessage) return 'No messages yet'
  if (lastMessage.senderId === meId) return `You: ${lastMessage.text}`
  return kind === 'event' ? `${firstName(lastMessage.senderName)}: ${lastMessage.text}` : lastMessage.text
}

function ThreadRow({ id, selected, onOpen, image, round, title, preview, time, unread }) {
  return (
    <li>
      <button
        id={id}
        type="button"
        onClick={onOpen}
        aria-current={selected ? 'true' : undefined}
        className={`inbox-conversation-row group flex w-full items-center gap-2.5 px-2.5 py-2.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 sm:gap-3 sm:px-3 ${
          selected
            ? 'is-selected bg-mint/[0.08]'
            : 'hover:bg-surface-3/60'
        }`}
      >
        <span className="inbox-avatar-frame relative h-10 w-10 shrink-0">
          <img src={image} alt="" className={`h-10 w-10 object-cover ring-1 ring-white/10 ${round ? 'rounded-full' : 'rounded-xl'}`} />
          {unread > 0 && <span className="inbox-avatar-unread absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-surface-2 bg-mint" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className={`truncate text-[0.95rem] text-text ${unread ? 'font-extrabold' : 'font-bold'}`}>{title}</p>
            <span className={`shrink-0 text-[11px] ${unread ? 'font-semibold text-mint' : 'text-muted'}`}>{time}</span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <p className={`min-w-0 flex-1 truncate text-[0.82rem] ${unread ? 'text-text' : 'text-muted'}`}>{preview}</p>
            {unread > 0 && (
              <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-mint px-1.5 text-[10px] font-extrabold text-bg">
                {unread > 99 ? '99+' : unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </div>
        </div>
        <ChevronRightIcon
          className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 ${selected ? 'text-mint' : 'text-muted'}`}
        />
      </button>
    </li>
  )
}

/* One open conversation: header (title, block, close) around the shared ChatThread. */
function ThreadPanel({ kind, threadId, summary, meId, onClose, onChanged, panelRef }) {
  const thread = useChatThread(kind, threadId)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [blockError, setBlockError] = useState('')
  const isEvent = kind === 'event'
  const person = thread.person || summary?.person
  const title = isEvent ? thread.title || summary?.title || 'Event chat' : person?.name || 'Conversation'
  const image = isEvent ? summary?.image : person?.avatar || avatarPlaceholder
  const canBlock = !isEvent && person && thread.status === 'ready' && thread.reason !== 'blocked'

  async function block() {
    setBlocking(true)
    setBlockError('')
    try {
      await apiRequest(`/blocks/${threadId}`, { method: 'POST' })
      setConfirmBlock(false)
      await thread.reload()
      onChanged()
    } catch (error) {
      setBlockError(error.message)
    } finally {
      setBlocking(false)
    }
  }

  return (
    <div
      ref={panelRef}
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
      className="inbox-thread-panel animate-rise-in flex h-full min-h-0 w-full flex-col overflow-hidden bg-bg"
    >
      <div className="inbox-thread-header flex items-center gap-3 border-b border-border px-3 py-3 sm:px-5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to chats"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-text/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 xl:hidden"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        {image && (
          <img
            src={image}
            alt=""
            onError={!isEvent ? (event) => {
              event.currentTarget.src = avatarPlaceholder
            } : undefined}
            className={`h-10 w-10 shrink-0 object-cover ${isEvent ? 'rounded-xl' : 'rounded-full'}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <Link
            to={isEvent ? `/activities/${threadId}` : `/people/${threadId}`}
            className="block truncate font-bold transition-colors hover:text-mint focus-visible:text-mint focus-visible:outline-none"
          >
            {title}
          </Link>
          <p className="truncate text-xs text-muted">
            {isEvent ? 'Live chat · host and approved guests' : thread.relationship === 'friends' ? 'Friend · Direct message' : 'Direct message'}
          </p>
        </div>
        {canBlock && !confirmBlock && (
          <button
            type="button"
            onClick={() => setConfirmBlock(true)}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60"
          >
            Block
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-text/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 xl:flex"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {confirmBlock && (
        <div className="border-b border-border bg-danger/5 px-4 py-3">
          <p className="text-xs leading-relaxed text-text">
            Block {firstName(person?.name)}? You won’t be able to message each other, any friendship
            between you ends, and you won’t see their messages in event chats.
          </p>
          {blockError && <p role="alert" className="mt-1.5 text-xs text-danger">{blockError}</p>}
          <div className="mt-2.5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmBlock(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={blocking}
              onClick={block}
              className="rounded-lg bg-red-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {blocking ? 'Blocking…' : 'Block'}
            </button>
          </div>
        </div>
      )}

      <ChatThread
        thread={thread}
        meId={meId}
        placeholder={isEvent ? 'Message the group…' : `Message ${firstName(person?.name)}…`}
      />
    </div>
  )
}

export default function Inbox() {
  const { currentUser, updates, markUpdatesRead, markUpdateRead } = useApp()
  const { user } = useAuth()
  const meId = user?.id
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [inbox, setInbox] = useState(null)
  const [inboxError, setInboxError] = useState('')
  const [openTrust, setOpenTrust] = useState(null)
  const [activeTab, setActiveTab] = useState('all')
  const [searchText, setSearchText] = useState('')
  const panelRef = useRef(null)
  const refreshTimer = useRef(null)

  const routeThread = location.pathname.match(/^\/inbox\/(event|dm)\/([^/]+)$/)
  const eventParam = routeThread?.[1] === 'event' ? routeThread[2] : searchParams.get('event')
  const dmParam = routeThread?.[1] === 'dm' ? routeThread[2] : searchParams.get('dm')
  const active = eventParam
    ? { kind: 'event', threadId: eventParam }
    : dmParam && /^\d+$/.test(dmParam)
      ? { kind: 'direct', threadId: dmParam }
      : null
  const activeKey = active ? threadKey(active.kind, active.threadId) : null

  const loadInbox = useCallback(async () => {
    try {
      const data = await apiRequest('/inbox')
      setInbox(data)
      setInboxError('')
    } catch (error) {
      console.error('Failed to load inbox:', error)
      setInboxError('Your conversations could not be loaded. Please try again.')
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(loadInbox, 0)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearTimeout(refreshTimer.current)
    }
  }, [loadInbox])

  /* Several messages in a burst cause one list refresh. */
  function scheduleRefresh() {
    window.clearTimeout(refreshTimer.current)
    refreshTimer.current = window.setTimeout(loadInbox, 400)
  }
  useChatEvent('message:new', scheduleRefresh)
  useChatEvent('thread:access', scheduleRefresh)

  function openThread(kind, threadId) {
    const routeKind = kind === 'event' ? 'event' : 'dm'
    navigate(`/inbox/${routeKind}/${encodeURIComponent(String(threadId))}`)
  }

  function closeThread() {
    const key = activeKey
    if (routeThread) {
      navigate('/inbox')
    } else {
      setSearchParams({})
    }
    loadInbox()
    // Return keyboard focus to the row that opened the chat.
    requestAnimationFrame(() => document.getElementById(`thread-row-${key}`)?.focus())
  }

  // Below xl the conversation replaces the list, so bring it into view.
  useEffect(() => {
    if (!activeKey || !window.matchMedia('(max-width: 1279px)').matches) return
    panelRef.current?.scrollIntoView({ block: 'start' })
  }, [activeKey])

  const eventChats = inbox?.eventChats ?? []
  const directMessages = inbox?.directMessages ?? []
  const normalizedSearch = searchText.trim().toLocaleLowerCase()
  const visibleEventChats = eventChats.filter((chat) => (
    `${chat.title} ${previewText(chat.lastMessage, meId, 'event')}`.toLocaleLowerCase().includes(normalizedSearch)
  ))
  const visibleDirectMessages = directMessages.filter((chat) => (
    `${chat.person.name} ${previewText(chat.lastMessage, meId, 'direct')}`.toLocaleLowerCase().includes(normalizedSearch)
  ))
  // The open thread is being read, so it never shows as unread.
  const unreadOf = (kind, threadId, count) => (threadKey(kind, threadId) === activeKey ? 0 : count)
  const unreadThreads = [
    ...eventChats.map((chat) => unreadOf('event', chat.activityId, chat.unreadCount)),
    ...directMessages.map((chat) => unreadOf('direct', chat.person.id, chat.unreadCount)),
  ].filter(Boolean).length
  const filteredEventChats = visibleEventChats.filter((chat) => (
    activeTab !== 'unread' || unreadOf('event', chat.activityId, chat.unreadCount) > 0
  ))
  const filteredDirectMessages = activeTab === 'groups'
    ? []
    : visibleDirectMessages.filter((chat) => (
      activeTab !== 'unread' || unreadOf('direct', chat.person.id, chat.unreadCount) > 0
    ))
  const filteredConversationCount = filteredEventChats.length + filteredDirectMessages.length
  const activeSummary = active?.kind === 'event'
    ? eventChats.find((chat) => chat.activityId === active.threadId)
    : directMessages.find((chat) => String(chat.person.id) === active?.threadId)

  const unreadUpdates = updates.filter((u) => !u.read).length
  const totalConversations = eventChats.length + directMessages.length
  const viewerFirstName = firstName(currentUser.name)

  return (
    <div className="inbox-shell h-full min-h-0 bg-bg text-text">
      <div className="flex h-full min-h-0">
        <nav aria-label="Inbox navigation" className="inbox-navigation hidden w-[168px] shrink-0 flex-col border-r border-border/70 bg-surface px-2.5 py-4 lg:flex">
          <Link to="/" aria-label="Spontii home" className="mb-6 flex items-center gap-2.5 rounded-xl px-2 py-1.5">
            <img src={logo} alt="" className="h-8 w-8 object-contain" />
            <span className="text-base font-extrabold tracking-tight">spontii</span>
          </Link>
          <div className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-2">Workspace</div>
          <div className="flex flex-1 flex-col gap-1">
            {[
              { to: '/', label: 'Home', Icon: HomeIcon },
              { to: '/explore', label: 'Explore', Icon: CompassIcon },
              { to: '/inbox', label: 'Messages', Icon: ChatIcon },
              { to: '/people', label: 'People', Icon: UsersIcon },
            ].map(({ to, label, Icon }) => (
              <Link
                key={label}
                to={to}
                aria-current={label === 'Messages' ? 'page' : undefined}
                className={`inbox-navigation-link flex h-10 items-center gap-2.5 rounded-xl px-3 text-[13px] font-semibold transition-colors ${
                  label === 'Messages' ? 'is-active bg-mint/10 text-mint' : 'text-muted hover:bg-surface-3 hover:text-text'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span>{label}</span>
              </Link>
            ))}
            <button
              type="button"
              onClick={() => setActiveTab('updates')}
              className={`inbox-navigation-link flex h-10 items-center gap-2.5 rounded-xl px-3 text-left text-[13px] font-semibold transition-colors ${
                activeTab === 'updates' ? 'is-active bg-mint/10 text-mint' : 'text-muted hover:bg-surface-3 hover:text-text'
              }`}
            >
              <BellIcon className="h-[18px] w-[18px]" />
              <span className="flex-1">Updates</span>
              {unreadUpdates > 0 && <span className="inbox-nav-count">{unreadUpdates}</span>}
            </button>
            <Link to="/people" aria-label="Start a new conversation" className="inbox-new-message mt-2 flex h-10 items-center gap-2.5 rounded-xl border border-mint/20 px-3 text-[13px] font-bold text-mint transition hover:border-mint/40 hover:bg-mint/5">
              <PlusIcon className="h-[18px] w-[18px]" />
              <span>New message</span>
            </Link>
          </div>
          <Link to="/profile" aria-label={`Your profile: ${currentUser.name}`} className="inbox-current-profile mt-4 flex items-center gap-2 rounded-xl border-t border-border px-2 pt-3 transition hover:bg-surface-3/50">
            <img src={currentUser.avatar || avatarPlaceholder} alt="" className="h-7 w-7 rounded-full border border-border object-cover" />
            <span className="min-w-0 flex-1 truncate text-xs font-bold">{currentUser.name}</span>
            <UserIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted" />
          </Link>
        </nav>

        <aside className={`inbox-sidebar flex min-h-0 w-full shrink-0 flex-col border-r border-border/70 bg-surface-2 md:w-[320px] ${
          active ? 'hidden md:flex' : 'flex'
        }`}>
          <header className="inbox-sidebar-header border-b border-border px-3.5 pb-2.5 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-mint">Your inbox</p>
                <h1 className="mt-0.5 truncate text-lg font-extrabold tracking-tight">Messages</h1>
                <p className="mt-0.5 text-[11px] text-muted">{totalConversations} conversations</p>
              </div>
              <Link to="/people" aria-label="New message" title="New message" className="inbox-new-message mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-text transition hover:border-mint/50 hover:text-mint">
                <PlusIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="inbox-tabs mt-3 grid grid-cols-3 gap-1 rounded-xl border border-border bg-bg/55 p-1" role="tablist" aria-label="Filter conversations">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'all'}
                onClick={() => setActiveTab('all')}
                className={`relative rounded-lg py-1 text-xs font-bold transition-colors ${
                  activeTab === 'all' ? 'inbox-tab-active bg-surface-3 text-text' : 'text-muted hover:text-text'
                }`}
              >
                All
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'unread'}
                onClick={() => setActiveTab('unread')}
                className={`relative rounded-lg py-1 text-xs font-bold transition-colors ${
                  activeTab === 'unread' ? 'inbox-tab-active bg-surface-3 text-text' : 'text-muted hover:text-text'
                }`}
              >
                Unread{unreadThreads > 0 && <span className="ml-1.5 text-xs text-mint">{unreadThreads}</span>}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'groups'}
                onClick={() => setActiveTab('groups')}
                className={`relative rounded-lg py-1 text-xs font-bold transition-colors ${
                  activeTab === 'groups' ? 'inbox-tab-active bg-surface-3 text-text' : 'text-muted hover:text-text'
                }`}
              >
                Groups
              </button>
            </div>
          </header>

          {activeTab !== 'updates' ? (
            <>
              <label className="inbox-search mx-3 mt-2.5 flex h-9 items-center gap-2 rounded-xl border border-border bg-bg/55 px-3 text-muted transition focus-within:border-mint/35 focus-within:ring-2 focus-within:ring-mint/10">
                <SearchIcon className="h-4 w-4 shrink-0" />
                <input
                  type="search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search messages"
                  aria-label="Search conversations"
                  className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted-2"
                />
                <span className="shrink-0 text-xs">{filteredConversationCount}</span>
              </label>

              {inboxError && (
                <p role="alert" className="mx-4 mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{inboxError}</p>
              )}

              <div className="inbox-conversation-list min-h-0 flex-1 overflow-y-auto px-1.5 pb-3 pt-3">
                {!inbox && !inboxError && <p className="px-3 py-4 text-sm text-muted">Loading conversations…</p>}
                {inbox && totalConversations === 0 && activeTab !== 'unread' && (
                  <div className="inbox-empty-conversations mx-2 rounded-2xl border border-border p-4">
                    <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-mint/10 text-mint"><ChatIcon className="h-5 w-5" /></span>
                    <p className="text-sm font-bold text-text">No conversations yet</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">Message a friend from their profile, or your host once you’re approved. Plans you host or get approved for open a live chat here.</p>
                    <Link to="/people" className="inbox-find-people mt-4 inline-flex items-center gap-1.5 rounded-lg border border-mint/20 bg-mint/5 px-3 py-2 text-xs font-bold text-mint transition hover:bg-mint/10">
                      Find people <ChevronRightIcon className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                )}
                {inbox && filteredConversationCount === 0 && (totalConversations > 0 || activeTab === 'unread') && (
                  <p className="mx-2 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted">
                    {activeTab === 'unread'
                      ? 'You’re all caught up. No unread messages.'
                      : activeTab === 'groups'
                        ? 'No group conversations yet.'
                        : `No conversations match “${searchText}”.`}
                  </p>
                )}
                {filteredEventChats.length > 0 && (
                  <section aria-labelledby="event-chats-heading" className="mb-5">
                    <h2 id="event-chats-heading" className="px-3 pb-2 text-[11px] font-bold uppercase tracking-widest text-muted-2">Event chats</h2>
                    <ul>
                      {filteredEventChats.map((chat) => (
                        <ThreadRow
                          key={chat.activityId}
                          id={`thread-row-${threadKey('event', chat.activityId)}`}
                          selected={activeKey === threadKey('event', chat.activityId)}
                          onOpen={() => openThread('event', chat.activityId)}
                          image={chat.image}
                          title={chat.title}
                          preview={previewText(chat.lastMessage, meId, 'event')}
                          time={formatThreadTime(chat.lastMessage?.createdAt)}
                          unread={unreadOf('event', chat.activityId, chat.unreadCount)}
                        />
                      ))}
                    </ul>
                  </section>
                )}
                {filteredDirectMessages.length > 0 && (
                  <section aria-labelledby="direct-messages-heading">
                    <h2 id="direct-messages-heading" className="px-3 pb-2 text-[11px] font-bold uppercase tracking-widest text-muted-2">Messages</h2>
                    <ul>
                      {filteredDirectMessages.map((chat) => (
                        <ThreadRow
                          key={chat.person.id}
                          id={`thread-row-${threadKey('direct', chat.person.id)}`}
                          selected={activeKey === threadKey('direct', chat.person.id)}
                          onOpen={() => openThread('direct', chat.person.id)}
                          image={chat.person.avatar || avatarPlaceholder}
                          round
                          title={chat.person.name}
                          preview={previewText(chat.lastMessage, meId, 'direct')}
                          time={formatThreadTime(chat.lastMessage?.createdAt)}
                          unread={unreadOf('direct', chat.person.id, chat.unreadCount)}
                        />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <BellIcon className="h-4 w-4 text-muted" />
                  Updates
                  {unreadUpdates > 0 && <span className="rounded-full bg-mint/15 px-2 py-0.5 text-[11px] font-bold text-mint">{unreadUpdates} new</span>}
                </h2>
                <button
                  type="button"
                  onClick={markUpdatesRead}
                  disabled={unreadUpdates === 0}
                  className="rounded-md px-1.5 py-2 text-xs font-semibold text-muted transition-colors hover:text-text disabled:cursor-default disabled:text-muted-2"
                >
                  Mark read
                </button>
              </div>
              {updates.length === 0 ? (
                <div className="flex flex-col items-center px-4 py-6 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-mint/10 text-mint"><CheckIcon className="h-5 w-5" /></span>
                  <p className="mt-3 text-sm font-bold">You're all caught up, {viewerFirstName}.</p>
                  <p className="mt-1 text-xs text-muted">New plan updates will show up here.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {updates.map((u) => {
                    const Icon = ICONS[u.icon] ?? BellIcon
                    const to = u.to ?? SEED_LINKS[u.id]
                    const rowClass = `group flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors ${
                      u.read ? 'border-transparent bg-surface text-muted hover:text-text' : 'border-mint/25 bg-mint/[0.06] text-text hover:border-mint/45'
                    }`
                    const body = (
                      <>
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${u.read ? 'text-muted-2' : 'text-mint'}`} />
                        <span className="min-w-0 flex-1">{u.text}</span>
                        {to ? <ChevronRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" /> : !u.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-mint" />}
                        {!u.read && <span className="sr-only">(unread)</span>}
                      </>
                    )
                    return (
                      <li key={u.id}>
                        {to ? (
                          <Link to={to} onClick={() => markUpdateRead(u.id)} className={rowClass}>{body}</Link>
                        ) : (
                          <button type="button" onClick={() => markUpdateRead(u.id)} disabled={u.read} className={`${rowClass} disabled:cursor-default`}>{body}</button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
              <section aria-labelledby="trust-heading" className="mt-6 border-t border-border pt-5">
                <h2 id="trust-heading" className="font-bold">Meet with confidence.</h2>
                <p className="mt-1 text-sm text-muted">A few things that keep plans comfortable for everyone.</p>
                <ul className="mt-3 divide-y divide-border">
                  {TRUST_POINTS.map(({ id, icon: Icon, title, text, more }) => {
                    const open = openTrust === id
                    return (
                      <li key={id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-mint"><Icon className="h-4 w-4" /></span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">{title}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted">{text}</p>
                            {open && <p id={`trust-more-${id}`} className="mt-1.5 text-xs leading-relaxed text-muted">{more}</p>}
                            <button type="button" onClick={() => setOpenTrust(open ? null : id)} aria-expanded={open} aria-controls={open ? `trust-more-${id}` : undefined} className="mt-1 inline-flex items-center gap-1 py-1 text-xs font-semibold text-mint hover:text-mint/80">
                              {open ? 'Show less' : 'Learn more'}
                              <ChevronDownIcon className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            </div>
          )}

          <Link to="/profile" aria-label={`Your profile: ${currentUser.name}`} className="flex items-center gap-2 border-t border-border px-4 py-3 transition hover:bg-surface-3/50 md:hidden">
            <img src={currentUser.avatar || avatarPlaceholder} alt="" className="h-8 w-8 rounded-full object-cover" />
            <span className="min-w-0 flex-1 truncate text-xs font-bold">{currentUser.name}</span>
            <UserIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted" />
          </Link>
        </aside>

        <main className={`min-h-0 min-w-0 flex-1 ${
          active ? 'flex' : 'hidden md:flex'
        }`}>
          {active ? (
            <ThreadPanel
              key={activeKey}
              kind={active.kind}
              threadId={active.threadId}
              summary={activeSummary}
              meId={meId}
              onClose={closeThread}
              onChanged={loadInbox}
              panelRef={panelRef}
            />
          ) : (
            <div className="inbox-welcome flex h-full w-full items-center justify-center px-4 py-5 sm:px-8">
              <div className="w-full text-center">
                <div className="inbox-empty-icon mx-auto grid h-20 w-20 place-items-center rounded-[1.6rem] border border-mint/20 text-mint">
                  <ChatIcon className="h-9 w-9" />
                </div>
                <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.2em] text-mint">Stay connected</p>
                <h2 className="mt-2 text-3xl font-extrabold tracking-tight">Your messages</h2>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">Choose a conversation from your inbox, or find people and make a plan together.</p>
                <Link to="/people" className="inbox-find-people mt-7 inline-flex items-center gap-2 rounded-xl bg-mint px-5 py-3 text-sm font-extrabold text-bg transition hover:-translate-y-0.5 hover:bg-mint/90">
                  <PlusIcon className="h-4 w-4" />
                  Find people
                </Link>
                <p className="mt-6 text-xs text-muted-2">Your conversations will appear here</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
