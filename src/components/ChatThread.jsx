import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import {
  MESSAGE_MAX_LENGTH,
  REPORT_REASONS,
  firstName,
  formatMessageTime,
} from '../lib/chat'
import { ArrowRightIcon, ChatIcon, LockIcon } from './NavIcons'

function PaperclipIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m8 12.5 7.1-7.1a3 3 0 0 1 4.2 4.2L9.4 19.5a5 5 0 0 1-7.1-7.1l9.2-9.2" />
    </svg>
  )
}

function AddMediaIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <path d="M12 8v8m-4-4h8" />
    </svg>
  )
}

function ReportMarkIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5 20 7v5.1c0 4.5-3.1 7.4-8 9.4-4.9-2-8-4.9-8-9.4V7l8-3.5Z" />
      <path d="M12 8v4.5m0 3h.01" />
    </svg>
  )
}

function CopyIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </svg>
  )
}

async function copyMessageText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall back to the selection-based clipboard path below.
    }
  }

  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  const copied = document.execCommand('copy')
  field.remove()
  if (!copied) throw new Error('Could not copy this message. Try selecting its text instead.')
}

function PhotoIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m21 15-5-5L5 20" />
    </svg>
  )
}

function MicrophoneIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8" />
    </svg>
  )
}

function StopIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

function TrashIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" />
    </svg>
  )
}

function CloseIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

function SenderAvatar({ sender }) {
  const [imageFailed, setImageFailed] = useState(false)
  const initial = firstName(sender.name).trim().charAt(0).toUpperCase() || '?'

  if (sender.avatar && !imageFailed) {
    return (
      <img
        src={sender.avatar}
        alt=""
        onError={() => setImageFailed(true)}
        className="h-10 w-10 rounded-full object-cover"
      />
    )
  }
  return (
    <span className="inbox-message-avatar-initial grid h-10 w-10 place-items-center rounded-full text-base font-extrabold">
      {initial}
    </span>
  )
}

function localDateTimeValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

function DeleteMessageDialog({ message, mine, openedAt, onDelete, onClose }) {
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [delay, setDelay] = useState('1h')
  const [customDate, setCustomDate] = useState(() =>
    localDateTimeValue(new Date(openedAt + 60 * 60 * 1000)),
  )
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const messageAge = openedAt - new Date(message.createdAt).getTime()
  const deleteEveryoneAvailable = mine && messageAge >= 0 && messageAge <= 15 * 60 * 1000

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && !working) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, working])

  async function submit(action, deleteAt) {
    setWorking(true)
    setError('')
    const result = await onDelete(action, deleteAt)
    if (!result.ok) {
      setError(result.message)
      setWorking(false)
      return
    }
    onClose()
  }

  function scheduledTime() {
    if (delay === 'custom') return new Date(customDate)
    const date = new Date(openedAt)
    if (delay === '1h') date.setHours(date.getHours() + 1)
    if (delay === '24h') date.setHours(date.getHours() + 24)
    if (delay === '7d') date.setDate(date.getDate() + 7)
    return date
  }

  const scheduledDate = scheduledTime()
  const scheduleDelay = scheduledDate.getTime() - openedAt
  const scheduleValid = Number.isFinite(scheduleDelay) &&
    scheduleDelay >= 60 * 1000 &&
    scheduleDelay <= 30 * 24 * 60 * 60 * 1000

  return createPortal(
    <div
      className="inbox-delete-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !working) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-message-title"
        className="inbox-delete-dialog"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={working}
          aria-label="Close delete options"
          className="inbox-delete-close"
        >
          <CloseIcon className="inbox-delete-close-icon h-4 w-4" />
        </button>
        <span className="inbox-delete-mark"><TrashIcon className="h-5 w-5" /></span>
        <h2 id="delete-message-title" className="mt-3 text-center text-base font-extrabold text-text">
          Delete message
        </h2>
        <p className="mt-1 text-center text-xs leading-relaxed text-muted">
          Choose how long this message should remain in your chat.
        </p>

        <div className="mt-5 grid gap-2">
          <button
            type="button"
            disabled={working}
            onClick={() => submit('for_me')}
            className="inbox-delete-option"
          >
            <span>Delete for me</span>
            <span className="inbox-delete-option-note">Remove it from your chat now</span>
          </button>

          <button
            type="button"
            disabled={working}
            onClick={() => {
              setError('')
              setScheduleOpen((open) => !open)
            }}
            aria-expanded={scheduleOpen}
            className="inbox-delete-option"
          >
            <span>{scheduleOpen ? 'Cancel scheduled delete' : 'Schedule delete for me'}</span>
            <span className="inbox-delete-option-note">Remove it from your chat later</span>
          </button>

          {scheduleOpen && (
            <div className="inbox-delete-schedule">
              <label htmlFor="delete-message-delay" className="text-xs font-semibold text-muted">
                Delete from your chat
              </label>
              <select
                id="delete-message-delay"
                value={delay}
                onChange={(event) => setDelay(event.target.value)}
                className="inbox-delete-select"
              >
                <option value="1h">In 1 hour</option>
                <option value="24h">In 24 hours</option>
                <option value="7d">In 7 days</option>
                <option value="custom">Choose date and time</option>
              </select>
              {delay === 'custom' && (
                <input
                  type="datetime-local"
                  value={customDate}
                  min={localDateTimeValue(new Date(openedAt + 60 * 1000))}
                  max={localDateTimeValue(new Date(openedAt + 30 * 24 * 60 * 60 * 1000))}
                  onChange={(event) => setCustomDate(event.target.value)}
                  aria-label="Custom delete date and time"
                  className="inbox-delete-select mt-2"
                />
              )}
              <button
                type="button"
                disabled={working || !scheduleValid}
                onClick={() => submit('schedule_for_me', scheduledDate.toISOString())}
                className="inbox-delete-schedule-submit"
              >
                {working ? 'Scheduling…' : 'Schedule delete'}
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={working || !deleteEveryoneAvailable}
            onClick={() => submit('for_everyone')}
            className="inbox-delete-option inbox-delete-everyone"
          >
            <span>Delete for everyone</span>
            <span className="inbox-delete-option-note">
              {!mine
                ? 'Only the sender can remove this for everyone'
                : deleteEveryoneAvailable
                  ? 'Remove it for everyone (within 15 minutes)'
                  : 'Available only within 15 minutes of sending'}
            </span>
          </button>
        </div>

        {error && <p role="alert" className="mt-3 text-xs font-medium text-danger">{error}</p>}
      </section>
    </div>,
    document.body,
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
    text = thread.reason === 'report_cooldown'
      ? 'Messaging in this event is paused for 5 hours after a message report. You can send messages again when the safety pause expires.'
      : thread.reason === 'removed'
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
  } else if (thread.reason === 'report_cooldown') {
    text = 'Messaging this person is paused for 5 hours after a message report. You can message them again when the safety pause expires.'
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
  const [selectedReason, setSelectedReason] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onDone()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onDone])

  async function report() {
    if (!selectedReason || state === 'sending') return
    setState('sending')
    setError('')
    try {
      await apiRequest('/reports', { method: 'POST', body: { source, messageId, reason: selectedReason } })
      setState('sent')
    } catch (reportError) {
      setError(reportError.message)
      setState('choosing')
    }
  }

  if (state === 'sent') {
    return createPortal(
      <div className="inbox-report-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDone()
      }}>
        <section className="inbox-report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-sent-title">
          <div className="inbox-report-dialog-mark"><ReportMarkIcon className="h-5 w-5" /></div>
          <h2 id="report-sent-title" className="mt-3 text-center text-base font-extrabold text-text">Report received</h2>
          <p role="status" className="mt-2 text-center text-sm leading-relaxed text-muted">
            Thanks for helping keep Spontii safe. We’ll review this message.
          </p>
          <button type="button" onClick={onDone} className="inbox-report-submit mt-5 w-full">Done</button>
        </section>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div className="inbox-report-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onDone()
    }}>
      <section className="inbox-report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-message-title" aria-busy={state === 'sending'}>
        <div className="inbox-report-dialog-mark"><ReportMarkIcon className="h-5 w-5" /></div>
        <h2 id="report-message-title" className="mt-3 text-center text-base font-extrabold text-text">Report this message</h2>
        <p className="mt-1 text-center text-xs leading-relaxed text-muted">
          Choose the reason that best describes your concern. Reports are private and reviewed by Spontii.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {REPORT_REASONS.map((reason) => (
            <button
              key={reason.value}
              type="button"
              disabled={state === 'sending'}
              aria-pressed={selectedReason === reason.value}
              onClick={() => { setSelectedReason(reason.value); setError('') }}
              className={`inbox-report-reason rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${selectedReason === reason.value ? 'is-selected' : ''}`}
            >
              {reason.label}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onDone} className="inbox-report-cancel flex-1" disabled={state === 'sending'}>
            Cancel
          </button>
          <button type="button" onClick={report} className="inbox-report-submit flex-1" disabled={!selectedReason || state === 'sending'}>
            {state === 'sending' ? 'Submitting…' : 'Submit report'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function messageAccent(text) {
  if (/\b(party|celebrate|birthday|congrats)\b/i.test(text)) return '🎉'
  if (/\b(lol|haha|lmao|funny)\b/i.test(text)) return '😂'
  if (/\b(awesome|amazing|great|cool|nice|love|yay)\b/i.test(text)) return '✨'
  return '💬'
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
  const [deletingMessageId, setDeletingMessageId] = useState(null)
  const [deleteDialogOpenedAt, setDeleteDialogOpenedAt] = useState(0)
  const [copiedMessageId, setCopiedMessageId] = useState(null)
  const [copyErrorId, setCopyErrorId] = useState(null)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordError, setRecordError] = useState('')
  const logRef = useRef(null)
  const attachmentMenuRef = useRef(null)
  const copyResetTimerRef = useRef(null)
  const inputRef = useRef(null)
  const photoInputRef = useRef(null)
  const documentInputRef = useRef(null)
  const recorderRef = useRef(null)
  const recordingStreamRef = useRef(null)
  const recordingChunksRef = useRef([])
  const recordingTimerRef = useRef(null)
  const selectedFilesRef = useRef(selectedFiles)
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

  useEffect(() => () => {
    window.clearTimeout(recordingTimerRef.current)
    window.clearTimeout(copyResetTimerRef.current)
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  async function copyMessage(message) {
    const text = message.text?.trim()
    if (!text) return
    try {
      await copyMessageText(text)
      setCopiedMessageId(message.id)
      setCopyErrorId(null)
      window.clearTimeout(copyResetTimerRef.current)
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopiedMessageId((current) => current === message.id ? null : current)
      }, 1800)
    } catch (error) {
      console.error('Could not copy chat message:', error)
      setCopyErrorId(message.id)
      window.clearTimeout(copyResetTimerRef.current)
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopyErrorId((current) => current === message.id ? null : current)
      }, 3000)
    }
  }

  useEffect(() => {
    if (!attachmentMenuOpen) return undefined

    function handlePointerDown(event) {
      if (!attachmentMenuRef.current?.contains(event.target)) {
        setAttachmentMenuOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setAttachmentMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [attachmentMenuOpen])

  async function submit(event) {
    event.preventDefault()
    const text = draft.trim()
    if ((!text && selectedFiles.length === 0) || sending) return
    setSending(true)
    setSendError('')
    const result = await thread.send(text, selectedFiles)
    setSending(false)
    if (result.ok) {
      setDraft('')
      selectedFilesRef.current = []
      setSelectedFiles([])
      inputRef.current?.focus()
    } else {
      setSendError(result.message)
    }
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || [])
    if (files.length) {
      const next = [...selectedFilesRef.current, ...files]
      if (next.length > 5) {
        setSendError('You can attach up to five files per message.')
      } else if (next.some((file) => file.size > 12 * 1024 * 1024) ||
          next.reduce((total, file) => total + file.size, 0) > 24 * 1024 * 1024) {
        setSendError('Each file must be 12 MB or smaller, and attachments must total 24 MB or less.')
      } else {
        selectedFilesRef.current = next
        setSelectedFiles(next)
        setSendError('')
      }
    }
    setAttachmentMenuOpen(false)
  }

  function removeFile(index) {
    const next = selectedFilesRef.current.filter((_, fileIndex) => fileIndex !== index)
    selectedFilesRef.current = next
    setSelectedFiles(next)
  }

  async function toggleVoiceRecording() {
    setRecordError('')
    if (recording && recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
      window.clearTimeout(recordingTimerRef.current)
      setRecording(false)
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecordError('Voice recording is not supported in this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      recordingStreamRef.current = stream
      recorderRef.current = recorder
      recordingChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm'
        const extension = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm'
        const recordingFile = new File(
          [new Blob(recordingChunksRef.current, { type })],
          `voice-note-${Date.now()}.${extension}`,
          { type },
        )
        stream.getTracks().forEach((track) => track.stop())
        recordingStreamRef.current = null
        if (recordingFile.size > 12 * 1024 * 1024) {
          setRecordError('That voice note is too large. Keep recordings under 12 MB.')
          return
        }
        const current = selectedFilesRef.current
        if (current.length >= 5 || current.reduce((total, file) => total + file.size, recordingFile.size) > 24 * 1024 * 1024) {
          setRecordError('Remove an attachment before adding this voice note.')
          return
        }
        selectedFilesRef.current = [...current, recordingFile]
        setSelectedFiles(selectedFilesRef.current)
        setRecordError('')
      }
      recorder.start()
      setRecording(true)
      recordingTimerRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop()
          setRecording(false)
        }
      }, 120_000)
    } catch (error) {
      setRecordError(error.name === 'NotAllowedError'
        ? 'Allow microphone access in your browser to record a voice note.'
        : 'Could not start voice recording. Please try again.')
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
        className="inbox-chat-log flex-1 space-y-1 overflow-y-auto px-3 py-4 sm:px-4"
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
          const deletedForEveryone = message.deletedForEveryone
          const firstInRun = index === 0 || thread.messages[index - 1].sender.id !== message.sender.id
          const lastInRun = index === thread.messages.length - 1 || thread.messages[index + 1].sender.id !== message.sender.id

          return (
            <div
              key={message.id}
              className={`group inbox-message-row flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${
                firstInRun && index > 0 ? 'pt-2.5' : 'inbox-message-row-continuation'
              }`}
            >
              {!mine && (
                <span className="w-10 shrink-0">
                  {firstInRun && <SenderAvatar sender={message.sender} />}
                </span>
              )}
              <div className={`flex max-w-[84%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                {!mine && firstInRun && thread.kind === 'event' && (
                  <span className="mb-1 px-1 text-[11px] font-semibold text-muted">
                    {firstName(message.sender.name)}
                  </span>
                )}
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <div
                      className={`inbox-message-bubble ${firstInRun ? 'inbox-message-first' : ''} ${
                        lastInRun ? 'inbox-message-last' : ''
                      } whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm leading-relaxed ${
                        mine ? 'inbox-message-mine rounded-br-md' : 'inbox-message-other rounded-bl-md'
                      }`}
                    >
                      {deletedForEveryone ? (
                        <p className="italic opacity-80">This message was deleted.</p>
                      ) : message.text && <p>{message.text}</p>}
                      {!deletedForEveryone && message.attachments?.map((attachment) => (
                        <div key={attachment.id} className={message.text ? 'mt-2' : ''}>
                          {attachment.mimeType.startsWith('image/') ? (
                            <a href={attachment.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
                              <img src={attachment.url} alt={attachment.name} loading="lazy" className="max-h-72 max-w-full rounded-xl object-cover" />
                            </a>
                          ) : attachment.mimeType.startsWith('video/') ? (
                            <video src={attachment.url} controls preload="metadata" className="max-h-72 max-w-full rounded-xl" />
                          ) : attachment.mimeType.startsWith('audio/') ? (
                            <audio src={attachment.url} controls preload="metadata" className="max-w-full" />
                          ) : (
                            <a href={attachment.url} download={attachment.name} className="flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-xs font-semibold underline-offset-2 hover:underline">
                              <PaperclipIcon className="h-4 w-4 shrink-0" />
                              <span className="max-w-48 truncate">{attachment.name}</span>
                            </a>
                          )}
                        </div>
                      ))}
                      <div className={`inbox-message-time mt-1 text-[10px] ${mine ? 'text-white/90' : 'text-muted'}`}>
                        <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                      </div>
                    </div>
                    {!deletedForEveryone && !mine && lastInRun && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -right-1.5 -top-2 grid h-5 min-w-5 place-items-center rounded-full border border-mint/20 bg-surface px-1 text-[10px]"
                      >
                        {messageAccent(message.text)}
                      </span>
                    )}
                  </div>
                  {!deletedForEveryone && message.text?.trim() && (
                    <div className="inbox-message-actions flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => copyMessage(message)}
                        aria-label={copiedMessageId === message.id ? 'Message copied' : 'Copy message'}
                        title={copyErrorId === message.id
                          ? 'Could not copy message'
                          : copiedMessageId === message.id ? 'Copied' : 'Copy message'}
                        className={`inbox-message-copy-trigger rounded-xl p-1.5 transition focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 group-hover:opacity-100 [@media(hover:hover)]:opacity-0 ${
                          copiedMessageId === message.id ? 'is-copied' : ''
                        }`}
                      >
                        <CopyIcon className="h-4 w-4" />
                      </button>
                      {(copiedMessageId === message.id || copyErrorId === message.id) && (
                        <span
                          role="status"
                          className={`inbox-message-copy-status text-[10px] font-semibold ${
                            copyErrorId === message.id ? 'text-danger' : 'text-mint'
                          }`}
                        >
                          {copyErrorId === message.id ? 'Could not copy' : 'Copied'}
                        </span>
                      )}
                    </div>
                  )}
                  {!deletedForEveryone && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteDialogOpenedAt(Date.now())
                        setDeletingMessageId(message.id)
                      }}
                      aria-label="Delete message"
                      title="Delete message"
                      className="inbox-message-delete-trigger shrink-0 rounded-xl p-1.5 transition focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  )}
                  {!mine && !deletedForEveryone && (
                    <button
                      type="button"
                      onClick={() => setReportingId(reportingId === message.id ? null : message.id)}
                      aria-label={`Report message from ${firstName(message.sender.name)}`}
                      aria-expanded={reportingId === message.id}
                      aria-controls={`report-message-${message.id}`}
                      className={`inbox-message-report-trigger shrink-0 rounded-xl p-1.5 transition focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 group-hover:opacity-100 [@media(hover:hover)]:opacity-0 ${reportingId === message.id ? 'is-open' : ''}`}
                    >
                      <ReportMarkIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {reportingId === message.id && !deletedForEveryone && (
                  <div id={`report-message-${message.id}`}>
                    <ReportPicker
                      source={thread.kind}
                      messageId={message.id}
                      onDone={() => setReportingId(null)}
                    />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {deletingMessageId && (() => {
        const message = thread.messages.find((item) => item.id === deletingMessageId)
        if (!message || message.deletedForEveryone) return null
        return (
          <DeleteMessageDialog
            message={message}
            mine={message.sender.id === meId}
            openedAt={deleteDialogOpenedAt}
            onDelete={(action, deleteAt) => thread.deleteMessage(message.id, action, deleteAt)}
            onClose={() => setDeletingMessageId(null)}
          />
        )
      })()}

      {thread.canSend ? (
        <form onSubmit={submit} className="inbox-chat-composer border-t border-border p-3">
          {sendError && (
            <p role="alert" className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
              {sendError}
            </p>
          )}
          {(recordError || recording) && (
            <p role={recordError ? 'alert' : 'status'} className={`mb-2 text-xs ${recordError ? 'text-danger' : 'text-mint'}`}>
              {recordError || 'Recording voice note · up to 2 minutes'}
            </p>
          )}
          {selectedFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {selectedFiles.map((file, index) => (
                <span key={`${file.name}-${index}`} className="flex max-w-full items-center gap-2 rounded-lg bg-surface-3 px-2.5 py-1.5 text-xs text-text">
                  <span className="max-w-52 truncate">{file.name}</span>
                  <button type="button" onClick={() => removeFile(index)} aria-label={`Remove ${file.name}`} className="text-muted hover:text-danger">×</button>
                </span>
              ))}
            </div>
          )}
          <div className="inbox-chat-composer-row flex items-center gap-2">
            <div className="relative" ref={attachmentMenuRef}>
              <button
                type="button"
                aria-label="Add attachment"
                aria-expanded={attachmentMenuOpen}
                aria-haspopup="menu"
                onClick={() => setAttachmentMenuOpen((open) => !open)}
                className={`inbox-composer-action inbox-attach-trigger flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 ${attachmentMenuOpen ? 'is-open' : ''}`}
              >
                <AddMediaIcon className="h-5 w-5" />
              </button>
              {attachmentMenuOpen && (
                <div className="inbox-attachment-menu absolute bottom-12 left-0 z-20 min-w-48 rounded-xl p-1.5" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setAttachmentMenuOpen(false); photoInputRef.current?.click() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text transition hover:bg-surface-3">
                    <PhotoIcon className="h-4 w-4 text-mint" /> Photos & videos
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setAttachmentMenuOpen(false); documentInputRef.current?.click() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text transition hover:bg-surface-3">
                    <PaperclipIcon className="h-4 w-4 text-mint" /> Documents & audio
                  </button>
                </div>
              )}
              <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} />
              <input ref={documentInputRef} type="file" accept="application/pdf,text/plain,text/csv,audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav,.doc,.docx,.xlsx,.pptx,.m4a,.mp3,.ogg,.wav" multiple className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MESSAGE_MAX_LENGTH}
              placeholder={placeholder}
              aria-label="Message"
              enterKeyHint="send"
              autoComplete="on"
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck
              className="inbox-chat-input min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2 text-[0.95rem] text-text outline-none transition-colors placeholder:text-muted hover:border-text/20 focus:border-mint/60"
            />
            <button
              type="button"
              onClick={toggleVoiceRecording}
              aria-label={recording ? 'Stop voice note' : 'Record voice note'}
              aria-pressed={recording}
              className={`inbox-composer-action flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 ${recording ? 'is-recording text-danger' : 'text-muted hover:text-mint'}`}
            >
              {recording ? <StopIcon className="h-4 w-4" /> : <MicrophoneIcon className="h-5 w-5" />}
            </button>
            <button
              type="submit"
              disabled={(!draft.trim() && selectedFiles.length === 0) || sending}
              aria-label="Send message"
              className="inbox-chat-send flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint text-bg transition-[opacity,transform] duration-150 hover:bg-mint/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
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
