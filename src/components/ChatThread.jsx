import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import {
  MESSAGE_MAX_LENGTH,
  REPORT_REASONS,
  firstName,
  formatMessageTime,
} from '../lib/chat'
import { ArrowRightIcon, ChatIcon, FlagIcon, LockIcon } from './NavIcons'

function SenderAvatar({ sender }) {
  if (sender.avatar) {
    return <img src={sender.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
  }
  return (
    <span className="grid h-7 w-7 place-items-center rounded-full bg-mint/10 text-[10px] font-extrabold text-mint">
      {firstName(sender.name).charAt(0).toUpperCase()}
    </span>
  )
}

/* Why the composer is closed, and what the person can do about it. */
function ClosedNotice({ thread }) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const personId = thread.person?.id

  async function run(request) {
    setWorking(true)
    setError('')
    try {
      await request()
      await thread.reload()
    } catch (actionError) {
      setError(actionError.message)
    } finally {
      setWorking(false)
    }
  }

  let text = "You can't message this person right now."
  let action = null

  if (thread.kind === 'event') {
    text = thread.reason === 'removed'
      ? 'The host removed you from this event.'
      : 'This event has ended, so its live chat is closed.'
  } else if (thread.reason === 'blocked') {
    text = `You blocked ${firstName(thread.person?.name)}. Unblock them to send messages.`
    action = (
      <button
        type="button"
        disabled={working}
        onClick={() => run(() => apiRequest(`/blocks/${personId}`, { method: 'DELETE' }))}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text transition hover:border-mint/40 hover:text-mint disabled:opacity-50"
      >
        {working ? 'Unblocking…' : 'Unblock'}
      </button>
    )
  } else if (thread.reason === 'not_connected') {
    text = 'You can only message friends, or your host and guests while an event is on. Add each other as friends to keep chatting.'
    if (thread.relationship === 'none') {
      action = (
        <button
          type="button"
          disabled={working}
          onClick={() => run(() => apiRequest(`/friends/requests/${personId}`, { method: 'POST' }))}
          className="rounded-lg bg-mint px-3 py-1.5 text-xs font-bold text-bg transition hover:bg-mint/90 disabled:opacity-50"
        >
          {working ? 'Sending…' : 'Add friend'}
        </button>
      )
    } else if (thread.relationship === 'outgoing') {
      action = <span className="text-xs font-semibold text-mint">Friend request sent</span>
    } else if (thread.relationship === 'incoming') {
      action = (
        <Link to="/people?tab=requests" className="text-xs font-bold text-mint hover:underline">
          Respond to their friend request
        </Link>
      )
    }
  }

  return (
    <div className="border-t border-border bg-surface px-4 py-3">
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
        <LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint" />
        {text}
      </p>
      {action && <div className="mt-2.5 pl-5">{action}</div>}
      {error && <p role="alert" className="mt-2 pl-5 text-xs font-medium text-danger">{error}</p>}
    </div>
  )
}

/* Inline report picker under someone else's message. */
function ReportPicker({ source, messageId, onDone }) {
  const [state, setState] = useState('choosing')
  const [error, setError] = useState('')

  async function report(reason) {
    setState('sending')
    setError('')
    try {
      await apiRequest('/reports', { method: 'POST', body: { source, messageId, reason } })
      setState('sent')
    } catch (reportError) {
      setError(reportError.message)
      setState('choosing')
    }
  }

  if (state === 'sent') {
    return (
      <p role="status" className="mt-1 px-1 text-[11px] font-semibold text-mint">
        Reported. Thanks for keeping Spontii safe.{' '}
        <button type="button" onClick={onDone} className="font-semibold text-muted underline">Close</button>
      </p>
    )
  }

  return (
    <div className="mt-1 flex max-w-xs flex-wrap items-center gap-1.5 px-1">
      <span className="text-[11px] font-semibold text-muted">Report as:</span>
      {REPORT_REASONS.map((reason) => (
        <button
          key={reason.value}
          type="button"
          disabled={state === 'sending'}
          onClick={() => report(reason.value)}
          className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-text transition hover:border-danger/50 hover:text-danger disabled:opacity-50"
        >
          {reason.label}
        </button>
      ))}
      <button type="button" onClick={onDone} className="text-[11px] font-semibold text-muted underline">
        Cancel
      </button>
      {error && <p role="alert" className="w-full text-[11px] text-danger">{error}</p>}
    </div>
  )
}

/*
 * Message list and composer for one thread from useChatThread. The parent
 * draws the header (title, back button, block) around it.
 */
export default function ChatThread({ thread, meId, placeholder = 'Write a message…' }) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [reportingId, setReportingId] = useState(null)
  const logRef = useRef(null)
  const inputRef = useRef(null)
  const scrollState = useRef({ lastId: null, firstId: null, height: 0 })

  /*
   * New message at the bottom: scroll to it. Older page added at the top:
   * keep the current messages where they were on screen.
   */
  const firstId = thread.messages[0]?.id ?? null
  const lastId = thread.messages.at(-1)?.id ?? null
  useLayoutEffect(() => {
    const log = logRef.current
    if (!log) return
    const previous = scrollState.current
    if (lastId !== previous.lastId) {
      log.scrollTop = log.scrollHeight
    } else if (firstId !== previous.firstId) {
      log.scrollTop += log.scrollHeight - previous.height
    }
    scrollState.current = { lastId, firstId, height: log.scrollHeight }
  }, [firstId, lastId])

  async function submit(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setSendError('')
    const result = await thread.send(text)
    setSending(false)
    if (result.ok) {
      setDraft('')
      inputRef.current?.focus()
    } else {
      setSendError(result.message)
    }
  }

  if (thread.status === 'loading') {
    return <p className="flex-1 px-4 py-6 text-sm text-muted">Loading the conversation…</p>
  }

  if (thread.status === 'unavailable') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-surface-3 text-muted">
          <LockIcon className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm font-bold text-text">This conversation isn’t available</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">{thread.error}</p>
      </div>
    )
  }

  return (
    <>
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Messages"
        className="flex-1 space-y-1 overflow-y-auto px-3 py-4 sm:px-4"
      >
        {thread.hasMore && (
          <div className="pb-3 text-center">
            <button
              type="button"
              onClick={thread.loadOlder}
              disabled={thread.loadingOlder}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-text disabled:opacity-50"
            >
              {thread.loadingOlder ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}

        {thread.messages.length === 0 && (
          <div className="flex h-full min-h-48 flex-col items-center justify-center px-5 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-mint/20 bg-mint/10 text-mint">
              <ChatIcon className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-bold text-text">The conversation starts here</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
              Keep it about the plan, and avoid sharing your address or phone number.
            </p>
          </div>
        )}

        {thread.messages.map((message, index) => {
          const mine = message.sender.id === meId
          const firstInRun = index === 0 || thread.messages[index - 1].sender.id !== message.sender.id

          return (
            <div
              key={message.id}
              className={`group flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${
                firstInRun && index > 0 ? 'pt-2.5' : ''
              }`}
            >
              {!mine && (
                <span className="w-7 shrink-0">
                  {firstInRun && <SenderAvatar sender={message.sender} />}
                </span>
              )}
              <div className={`flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                {!mine && firstInRun && thread.kind === 'event' && (
                  <span className="mb-1 px-1 text-[11px] font-semibold text-muted">
                    {firstName(message.sender.name)}
                  </span>
                )}
                <div className="flex items-center gap-1.5">
                  <div
                    className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                      mine ? 'rounded-br-md bg-mint text-bg' : 'rounded-bl-md bg-surface-3 text-text'
                    }`}
                  >
                    {message.text}
                    <div className={`mt-0.5 text-[10px] ${mine ? 'text-bg/70 [[data-theme=light]_&]:text-bg/90' : 'text-muted'}`}>
                      <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                    </div>
                  </div>
                  {!mine && (
                    <button
                      type="button"
                      onClick={() => setReportingId(reportingId === message.id ? null : message.id)}
                      aria-label={`Report message from ${firstName(message.sender.name)}`}
                      className="shrink-0 rounded-full p-1.5 text-muted-2 transition hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
                    >
                      <FlagIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {reportingId === message.id && (
                  <ReportPicker
                    source={thread.kind}
                    messageId={message.id}
                    onDone={() => setReportingId(null)}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {thread.canSend ? (
        <form onSubmit={submit} className="border-t border-border p-3">
          {sendError && (
            <p role="alert" className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
              {sendError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MESSAGE_MAX_LENGTH}
              placeholder={placeholder}
              aria-label="Message"
              enterKeyHint="send"
              className="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-muted hover:border-text/20 focus:border-mint/60"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint text-bg transition-[opacity,transform] duration-150 hover:bg-mint/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
            >
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </div>
        </form>
      ) : (
        <ClosedNotice thread={thread} />
      )}
    </>
  )
}
