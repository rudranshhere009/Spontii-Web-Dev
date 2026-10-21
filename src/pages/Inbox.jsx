import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { updates as seedUpdates } from '../data/mockData'
import ChatThread from '../components/ChatThread'
import { useChatEvent, useChatThread } from '../hooks/useChatThread'
import { apiRequest } from '../lib/api'
import { firstName, formatThreadTime, threadKey } from '../lib/chat'
import avatarPlaceholder from '../assets/avatar-placeholder.svg'
import {
  ArrowLeftIcon,
  BellIcon,
  ChatIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  FlagIcon,
  LockIcon,
  ShieldCheckIcon,
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
        className={`group flex w-full items-center gap-3.5 rounded-2xl border p-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 sm:gap-4 sm:p-3.5 ${
          selected
            ? 'border-mint/50 bg-mint/[0.07]'
            : 'border-border bg-surface-2 hover:border-text/20 hover:bg-surface-3/60'
        }`}
      >
        <img src={image} alt="" className={`h-14 w-14 shrink-0 object-cover ${round ? 'rounded-full' : 'rounded-xl'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className={`truncate text-text ${unread ? 'font-extrabold' : 'font-bold'}`}>{title}</p>
            <span className={`shrink-0 text-xs ${unread ? 'font-semibold text-mint' : 'text-muted'}`}>{time}</span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <p className={`min-w-0 flex-1 truncate text-sm ${unread ? 'text-text' : 'text-muted'}`}>{preview}</p>
            {unread > 0 && (
              <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-mint px-1.5 text-[11px] font-extrabold text-bg">
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
      className="animate-rise-in flex h-[calc(100dvh-15rem-env(safe-area-inset-bottom))] min-h-[340px] scroll-mt-36 flex-col overflow-hidden rounded-2xl border border-border bg-surface-2 md:h-[calc(100dvh-20rem)] lg:h-[600px] lg:scroll-mt-28"
    >
      <div className="flex items-center gap-3 border-b border-border px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to chats"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-text/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 xl:hidden"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        {image && (
          <img src={image} alt="" className={`h-10 w-10 shrink-0 object-cover ${isEvent ? 'rounded-xl' : 'rounded-full'}`} />
        )}
        <div className="min-w-0 flex-1">
          <Link
            to={isEvent ? `/activities/${threadId}` : `/people/${threadId}`}
            className="block truncate font-bold transition-colors hover:text-mint focus-visible:text-mint focus-visible:outline-none"
          >
            {title}
          </Link>
          <p className="truncate text-xs text-muted">
            {isEvent ? 'Live chat · host and approved guests' : 'Direct message'}
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [inbox, setInbox] = useState(null)
  const [inboxError, setInboxError] = useState('')
  const [openTrust, setOpenTrust] = useState(null)
  const panelRef = useRef(null)
  const refreshTimer = useRef(null)

  const eventParam = searchParams.get('event')
  const dmParam = searchParams.get('dm')
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
    setSearchParams({ [kind === 'event' ? 'event' : 'dm']: String(threadId) })
  }

  function closeThread() {
    const key = activeKey
    setSearchParams({})
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
  // The open thread is being read, so it never shows as unread.
  const unreadOf = (kind, threadId, count) => (threadKey(kind, threadId) === activeKey ? 0 : count)
  const unreadThreads = [
    ...eventChats.map((chat) => unreadOf('event', chat.activityId, chat.unreadCount)),
    ...directMessages.map((chat) => unreadOf('direct', chat.person.id, chat.unreadCount)),
  ].filter(Boolean).length
  const activeSummary = active?.kind === 'event'
    ? eventChats.find((chat) => chat.activityId === active.threadId)
    : directMessages.find((chat) => String(chat.person.id) === active?.threadId)

  const unreadUpdates = updates.filter((u) => !u.read).length
  const viewerFirstName = firstName(currentUser.name)

  return (
    <div className="wide-screen-container mx-auto max-w-[1600px] space-y-8 px-5 py-8 sm:px-6">
      <div>
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-mint">Stay in the loop</span>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Your inbox</h1>
        <p className="mt-2 text-sm text-muted sm:text-base">The useful stuff: plans, people and what happens next.</p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* ================= CONVERSATIONS ================= */}
        <section aria-labelledby="chats-heading" className="min-w-0 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="chats-heading" className="text-xs font-bold uppercase tracking-widest text-muted">
              Conversations
            </h2>
            <p className="text-sm font-semibold text-mint">
              {eventChats.length + directMessages.length} active
              {unreadThreads > 0 && (
                <span className="font-medium text-muted"> · {unreadThreads} unread</span>
              )}
            </p>
          </div>

          {inboxError && (
            <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{inboxError}</p>
          )}

          <div className={active ? 'xl:grid xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-4' : ''}>
            {/* Thread lists (hidden below xl while a conversation is open) */}
            <div className={`space-y-6 ${active ? 'hidden xl:block' : ''}`}>
              {!inbox && !inboxError && (
                <p className="rounded-2xl border border-border bg-surface-2 p-5 text-sm text-muted">Loading conversations…</p>
              )}

              {inbox && (
                <>
                  <div>
                    <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-muted-2">Event chats</h3>
                    {eventChats.length ? (
                      <ul className="space-y-2.5">
                        {eventChats.map((chat) => (
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
                    ) : (
                      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
                        Plans you host or get approved for open a live chat here.
                      </p>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-muted-2">Messages</h3>
                    {directMessages.length ? (
                      <ul className="space-y-2.5">
                        {directMessages.map((chat) => (
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
                    ) : (
                      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
                        Message a friend from their profile, or your host once you’re approved.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Conversation panel */}
            {active && (
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
            )}
          </div>
        </section>

        {/* ================= SIDEBAR ================= */}
        <aside className="space-y-5">
          {/* Updates */}
          <section aria-labelledby="updates-heading" className="rounded-2xl border border-border bg-surface-2 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="updates-heading" className="flex items-center gap-2 text-sm font-bold">
                <BellIcon className="h-4 w-4 text-muted" />
                Updates
                {unreadUpdates > 0 && (
                  <span className="rounded-full bg-mint/15 px-2 py-0.5 text-[11px] font-bold text-mint">
                    {unreadUpdates} new
                  </span>
                )}
              </h2>
              <button
                type="button"
                onClick={markUpdatesRead}
                disabled={unreadUpdates === 0}
                className="-my-1 rounded-md px-1.5 py-2 text-xs font-semibold text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 disabled:cursor-default disabled:text-muted-2 disabled:hover:text-muted-2"
              >
                Mark read
              </button>
            </div>

            {updates.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-6 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-mint/10 text-mint">
                  <CheckIcon className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-bold">You're all caught up, {viewerFirstName}.</p>
                <p className="mt-1 text-xs text-muted">New plan updates will show up here.</p>
              </div>
            ) : (
              <>
                {unreadUpdates === 0 && (
                  <div className="animate-rise-in mb-3 flex items-center gap-2.5 rounded-xl bg-mint/[0.07] px-3 py-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mint/15 text-mint">
                      <CheckIcon className="h-3.5 w-3.5" />
                    </span>
                    <p className="text-xs font-semibold">You're all caught up, {viewerFirstName}.</p>
                  </div>
                )}
                <ul className="space-y-2">
                  {updates.map((u) => {
                    const Icon = ICONS[u.icon] ?? BellIcon
                    const to = u.to ?? SEED_LINKS[u.id]
                    const rowClass = `group flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 ${
                      u.read
                        ? 'border-transparent bg-surface text-muted hover:text-text'
                        : 'border-mint/25 bg-mint/[0.06] text-text hover:border-mint/45'
                    }`
                    const body = (
                      <>
                        <Icon
                          className={`mt-0.5 h-4 w-4 shrink-0 transition-colors duration-300 ${u.read ? 'text-muted-2' : 'text-mint'}`}
                        />
                        <span className="min-w-0 flex-1">{u.text}</span>
                        {to ? (
                          <ChevronRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5" />
                        ) : (
                          !u.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-mint" />
                        )}
                        {!u.read && <span className="sr-only">(unread)</span>}
                      </>
                    )

                    return (
                      <li key={u.id}>
                        {to ? (
                          <Link to={to} onClick={() => markUpdateRead(u.id)} className={rowClass}>
                            {body}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => markUpdateRead(u.id)}
                            disabled={u.read}
                            className={`${rowClass} disabled:cursor-default`}
                          >
                            {body}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </section>

          {/* Trust & safety */}
          <section aria-labelledby="trust-heading" className="rounded-2xl border border-border bg-surface-2 p-5">
            <h2 id="trust-heading" className="font-bold">Meet with confidence.</h2>
            <p className="mt-1 text-sm text-muted">A few things that keep plans comfortable for everyone.</p>

            <ul className="mt-4 divide-y divide-border">
              {TRUST_POINTS.map(({ id, icon: Icon, title, text, more }) => {
                const open = openTrust === id
                return (
                  <li key={id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-mint">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{title}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted">{text}</p>
                        {open && (
                          <p id={`trust-more-${id}`} className="animate-rise-in mt-1.5 text-xs leading-relaxed text-muted">
                            {more}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => setOpenTrust(open ? null : id)}
                          aria-expanded={open}
                          aria-controls={open ? `trust-more-${id}` : undefined}
                          className="-my-1 mt-0.5 inline-flex items-center gap-1 rounded py-2 text-xs font-semibold text-mint transition-colors hover:text-mint/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60"
                        >
                          {open ? 'Show less' : 'Learn more'}
                          <ChevronDownIcon className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
