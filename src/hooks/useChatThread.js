import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { apiRequest } from '../lib/api'
import { mergeMessages } from '../lib/chat'
import { socket } from '../lib/socket'

/* Subscribes to a Socket.IO event for the lifetime of the component. */
export function useChatEvent(event, handler) {
  const onEvent = useEffectEvent(handler)
  useEffect(() => {
    const listener = (payload) => onEvent(payload)
    socket.on(event, listener)
    return () => socket.off(event, listener)
  }, [event])
}

const INITIAL = {
  status: 'loading',
  error: '',
  messages: [],
  hasMore: false,
  canSend: false,
  reason: null,
  person: null,
  title: '',
  relationship: 'none',
  requestId: null,
}

function threadDetails(data) {
  return {
    canSend: Boolean(data.canSend),
    reason: data.reason ?? null,
    person: data.person ?? null,
    title: data.title ?? '',
    relationship: data.relationship ?? 'none',
    requestId: data.requestId ?? null,
  }
}

function readyThread(data) {
  return {
    ...INITIAL,
    status: 'ready',
    messages: data.messages,
    hasMore: data.hasMore,
    ...threadDetails(data),
  }
}

function unavailableThread(error) {
  return { ...INITIAL, status: 'unavailable', error: error.message }
}

/*
 * One conversation: kind 'event' (threadId = activity id) or 'direct'
 * (threadId = the other person's id). Render the component that uses it
 * with a `key` per thread so switching threads starts fresh.
 *
 * History comes from the REST API; new messages arrive over the socket;
 * after a reconnect, anything missed is fetched with ?after=<last id>.
 */
export function useChatThread(kind, threadId) {
  const { user } = useAuth()
  const { connected, refreshUnread, setActiveThread } = useChat()
  const [thread, setThread] = useState(INITIAL)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const markedReadId = useRef(null)
  const wasConnected = useRef(connected)

  const messagesPath = kind === 'event'
    ? `/activities/${threadId}/chat`
    : `/dm/${threadId}/messages`
  const readPath = kind === 'event'
    ? `/activities/${threadId}/chat/read`
    : `/dm/${threadId}/read`

  async function load() {
    try {
      setThread(readyThread(await apiRequest(messagesPath)))
    } catch (error) {
      setThread(unavailableThread(error))
    }
  }

  useEffect(() => {
    let active = true
    apiRequest(messagesPath)
      .then((data) => active && setThread(readyThread(data)))
      .catch((error) => active && setThread(unavailableThread(error)))
    return () => {
      active = false
    }
  }, [messagesPath])

  useEffect(() => {
    setActiveThread(kind, threadId)
    return () => setActiveThread(null)
  }, [kind, threadId, setActiveThread])

  const isThisThread = (payload) =>
    payload.kind === kind && payload.threadId === String(threadId)

  useChatEvent('message:new', (payload) => {
    if (!isThisThread(payload)) return
    setThread((current) => current.status === 'ready'
      ? { ...current, messages: mergeMessages(current.messages, [payload.message]) }
      : current)
  })

  useChatEvent('thread:access', (payload) => {
    if (!isThisThread(payload)) return
    if (payload.reason === 'removed') {
      setThread({ ...INITIAL, status: 'unavailable', error: 'The host removed you from this event.' })
      return
    }
    setThread((current) => ({ ...current, canSend: payload.canSend, reason: payload.reason ?? null }))
    // Opening up again (say, a friend request was accepted) needs fresh relationship details.
    if (payload.canSend) load()
  })

  const catchUp = useEffectEvent(async () => {
    let after = thread.messages.at(-1)?.id
    for (let page = 0; after && page < 10; page += 1) {
      const data = await apiRequest(`${messagesPath}?after=${after}`)
      setThread((current) => ({
        ...current,
        messages: mergeMessages(current.messages, data.messages),
        ...threadDetails({ ...current, ...data }),
      }))
      if (!data.hasMore || !data.messages.length) break
      after = data.messages.at(-1).id
    }
  })

  useEffect(() => {
    const reconnected = connected && !wasConnected.current
    wasConnected.current = connected
    if (!reconnected) return
    catchUp().catch((error) => console.error('Failed to catch up on missed messages:', error))
  }, [connected])

  /* Mark the newest message read while the thread is on screen. */
  const lastMessage = thread.messages.at(-1)
  const canMarkRead = thread.status === 'ready' && (kind === 'direct' || thread.canSend)
  useEffect(() => {
    if (!canMarkRead || !lastMessage || lastMessage.sender.id === user?.id) return undefined
    if (markedReadId.current === lastMessage.id) return undefined

    function markRead() {
      if (document.visibilityState !== 'visible' || markedReadId.current === lastMessage.id) return
      markedReadId.current = lastMessage.id
      apiRequest(readPath, { method: 'POST', body: { lastReadId: lastMessage.id } })
        .then(refreshUnread)
        .catch((error) => {
          markedReadId.current = null
          console.error('Failed to mark messages as read:', error)
        })
    }

    markRead()
    document.addEventListener('visibilitychange', markRead)
    return () => document.removeEventListener('visibilitychange', markRead)
  }, [canMarkRead, lastMessage, readPath, refreshUnread, user?.id])

  async function send(text) {
    try {
      const { message } = await apiRequest(messagesPath, { method: 'POST', body: { text } })
      setThread((current) => ({ ...current, messages: mergeMessages(current.messages, [message]) }))
      return { ok: true }
    } catch (error) {
      if (error.status === 403 || error.status === 404) {
        const reason = error.data?.reason ||
          (kind === 'event' ? (error.status === 404 ? 'ended' : 'removed') : 'unavailable')
        setThread((current) => ({ ...current, canSend: false, reason }))
      }
      return { ok: false, message: error.message }
    }
  }

  async function loadOlder() {
    const firstId = thread.messages[0]?.id
    if (!firstId || loadingOlder) return
    setLoadingOlder(true)
    try {
      const data = await apiRequest(`${messagesPath}?before=${firstId}`)
      setThread((current) => ({
        ...current,
        messages: mergeMessages(current.messages, data.messages),
        hasMore: data.hasMore,
      }))
    } catch (error) {
      console.error('Failed to load earlier messages:', error)
    } finally {
      setLoadingOlder(false)
    }
  }

  return { ...thread, kind, threadId, loadingOlder, send, loadOlder, reload: load }
}
