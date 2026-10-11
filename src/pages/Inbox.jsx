import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { people, updates as seedUpdates } from '../data/mockData'
import AvatarStack from '../components/AvatarStack'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
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

const PEOPLE_BY_ID = Object.fromEntries(people.map((p) => [p.id, p]))

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
    text: 'Activity chats are for coordinating the meetup itself.',
    more: "If something feels off, you don't have to go. Avoid sharing personal details like your address or phone number in chat.",
  },
  {
    id: 'privacy',
    icon: LockIcon,
    title: 'Location stays approximate',
    text: 'The exact meeting point is shared once the host confirms you.',
    more: 'Until then, activity pages only show the general area.',
  },
]

/* Participant names for the conversation header. */
function participantsFor(chat, activities, meId) {
  const activity = activities.find((a) => a.id === chat.activityId)
  const list = [chat.person, activity?.host, ...(activity?.going ?? [])]
  const seen = new Set([meId])
  return list.filter((p) => p && !seen.has(p.id) && seen.add(p.id))
}

export default function Inbox() {
  /*
   * Chats and updates live in AppContext (persisted to localStorage), so
   * read state and sent messages survive navigation and refresh.
   */
  const {
    currentUser,
    activities,
    chats,
    updates,
    markChatRead,
    sendMessage: sendChatMessage,
    markUpdatesRead,
    markUpdateRead,
  } = useApp()
  const [activeId, setActiveId] = useState(null)
  const [draft, setDraft] = useState('')
  // Messages present when the chat opened; anything after animates in.
  const [openedCount, setOpenedCount] = useState(0)
  const [openTrust, setOpenTrust] = useState(null)

  const panelRef = useRef(null)
  const logRef = useRef(null)
  const inputRef = useRef(null)

  const active = chats.find((c) => c.id === activeId)
  const unreadChats = chats.filter((c) => c.unread).length
  const unreadUpdates = updates.filter((u) => !u.read).length
  const firstName = currentUser.name.split(' ')[0]

  function openChat(id) {
    const chat = chats.find((c) => c.id === id)
    setActiveId(id)
    setOpenedCount(chat?.messages.length ?? 0)
    setDraft('')
    markChatRead(id)
  }

  function closeChat() {
    const id = activeId
    setActiveId(null)
    // Return keyboard focus to the row that opened the chat.
    requestAnimationFrame(() => document.getElementById(`chat-row-${id}`)?.focus())
  }

  function sendMessage(e) {
    e.preventDefault()
    if (!draft.trim() || !active) return
    sendChatMessage(active.id, draft)
    setDraft('')
    inputRef.current?.focus()
  }

  // Keep the newest message in view.
  const messageCount = active?.messages.length ?? 0
  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [activeId, messageCount])

  // Below xl the conversation replaces the list, so bring it into view.
  useEffect(() => {
    if (!activeId || !window.matchMedia('(max-width: 1279px)').matches) return
    panelRef.current?.scrollIntoView({ block: 'start' })
  }, [activeId])

  const participants = active ? participantsFor(active, activities, currentUser.id) : []

  return (
    <div className="mx-auto max-w-[1600px] space-y-8 px-5 py-8 sm:px-6">
      <div>
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-mint">Stay in the loop</span>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Your inbox</h1>
        <p className="mt-2 text-sm text-muted sm:text-base">The useful stuff: plans, people and what happens next.</p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* ================= ACTIVITY CHATS ================= */}
        <section aria-labelledby="chats-heading" className="min-w-0 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="chats-heading" className="text-xs font-bold uppercase tracking-widest text-muted">
              Activity chats
            </h2>
            <p className="text-sm font-semibold text-mint">
              {chats.length} active
              {unreadChats > 0 && (
                <span className="font-medium text-muted"> · {unreadChats} unread</span>
              )}
            </p>
          </div>

          <div className={active ? 'xl:grid xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-4' : ''}>
            {/* Chat list (hidden below xl while a conversation is open) */}
            <ul className={`space-y-2.5 ${active ? 'hidden xl:block' : ''}`}>
              {chats.map((c) => {
                const selected = c.id === activeId
                return (
                  <li key={c.id}>
                    <button
                      id={`chat-row-${c.id}`}
                      type="button"
                      onClick={() => openChat(c.id)}
                      aria-current={selected ? 'true' : undefined}
                      className={`group flex w-full items-center gap-3.5 rounded-2xl border p-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 sm:gap-4 sm:p-3.5 ${
                        selected
                          ? 'border-mint/50 bg-mint/[0.07]'
                          : 'border-border bg-surface-2 hover:border-text/20 hover:bg-surface-3/60'
                      }`}
                    >
                      <img src={c.image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className={`truncate ${c.unread ? 'font-extrabold text-text' : 'font-bold text-text'}`}>
                            {c.title}
                          </p>
                          <span className={`shrink-0 text-xs ${c.unread ? 'font-semibold text-mint' : 'text-muted'}`}>
                            {c.time}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-3">
                          <p className={`min-w-0 flex-1 truncate text-sm ${c.unread ? 'text-text' : 'text-muted'}`}>
                            {c.lastMessage}
                          </p>
                          {c.unread && (
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-mint">
                              <span className="sr-only">Unread</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRightIcon
                        className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 ${
                          selected ? 'text-mint' : 'text-muted'
                        } ${active ? 'xl:hidden' : ''}`}
                      />
                    </button>
                  </li>
                )
              })}
            </ul>

            {/* Conversation panel */}
            {active && (
              <div
                key={active.id}
                ref={panelRef}
                onKeyDown={(e) => e.key === 'Escape' && closeChat()}
                className="animate-rise-in flex h-[calc(100dvh-15rem-env(safe-area-inset-bottom))] min-h-[340px] scroll-mt-36 flex-col overflow-hidden rounded-2xl border border-border bg-surface-2 md:h-[calc(100dvh-20rem)] lg:h-[600px] lg:scroll-mt-28"
              >
                <div className="flex items-center gap-3 border-b border-border px-3 py-3 sm:px-4">
                  <button
                    type="button"
                    onClick={closeChat}
                    aria-label="Back to chats"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-text/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 xl:hidden"
                  >
                    <ArrowLeftIcon className="h-4 w-4" />
                  </button>
                  <img src={active.image} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/activities/${active.activityId}`}
                      className="block truncate font-bold transition-colors hover:text-mint focus-visible:text-mint focus-visible:outline-none"
                    >
                      {active.title}
                    </Link>
                    <p className="truncate text-xs text-muted">
                      You, {participants.slice(0, 2).map((p) => p.name.split(' ')[0]).join(', ')}
                      {participants.length > 2 && ` +${participants.length - 2}`}
                    </p>
                  </div>
                  <div className="hidden shrink-0 sm:block">
                    <AvatarStack people={participants} max={3} size={26} />
                  </div>
                  <button
                    type="button"
                    onClick={closeChat}
                    aria-label="Close chat"
                    className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-text/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 xl:flex"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>

                <div
                  ref={logRef}
                  role="log"
                  aria-label={`Messages in ${active.title}`}
                  className="flex-1 space-y-1 overflow-y-auto px-3 py-4 sm:px-4"
                >
                  {active.messages.map((m, i) => {
                    const mine = m.from === 'me'
                    const sender = PEOPLE_BY_ID[m.from]
                    const firstInRun = i === 0 || active.messages[i - 1].from !== m.from

                    return (
                      <div
                        key={i}
                        className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${
                          firstInRun && i > 0 ? 'pt-2.5' : ''
                        } ${i >= openedCount ? 'animate-rise-in' : ''}`}
                      >
                        {!mine && (
                          <span className="w-7 shrink-0">
                            {firstInRun && sender && (
                              <img src={sender.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                            )}
                          </span>
                        )}
                        <div className={`flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                          {!mine && firstInRun && sender && (
                            <span className="mb-1 px-1 text-[11px] font-semibold text-muted">
                              {sender.name.split(' ')[0]}
                            </span>
                          )}
                          <div
                            className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                              mine ? 'rounded-br-md bg-mint text-bg' : 'rounded-bl-md bg-surface-3 text-text'
                            }`}
                          >
                            {m.text}
                            <div className={`mt-0.5 text-[10px] ${mine ? 'text-bg/70 [[data-theme=light]_&]:text-bg/90' : 'text-muted'}`}>
                              {m.time}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <form onSubmit={sendMessage} className="border-t border-border p-3">
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Message the group..."
                      aria-label={`Message ${active.title}`}
                      enterKeyHint="send"
                      className="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-muted hover:border-text/20 focus:border-mint/60"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim()}
                      aria-label="Send message"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint text-bg transition-[opacity,transform] duration-150 hover:bg-mint/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
                    >
                      <ArrowRightIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 px-1 text-[11px] text-muted-2">
                    Messages are saved on this device only for now.
                  </p>
                </form>
              </div>
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
                <p className="mt-3 text-sm font-bold">You're all caught up, {firstName}.</p>
                <p className="mt-1 text-xs text-muted">New plan updates will show up here.</p>
              </div>
            ) : (
              <>
                {unreadUpdates === 0 && (
                  <div className="animate-rise-in mb-3 flex items-center gap-2.5 rounded-xl bg-mint/[0.07] px-3 py-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mint/15 text-mint">
                      <CheckIcon className="h-3.5 w-3.5" />
                    </span>
                    <p className="text-xs font-semibold">You're all caught up, {firstName}.</p>
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
