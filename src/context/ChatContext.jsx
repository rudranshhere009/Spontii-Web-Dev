import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { apiRequest } from '../lib/api'
import { threadKey } from '../lib/chat'
import { socket } from '../lib/socket'
import { useAuth } from './AuthContext'

const ChatContext = createContext(null)

/*
 * Owns the Socket.IO connection (open while logged in) and the unread
 * count shown on the Inbox icon.
 */
export function ChatProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [connected, setConnected] = useState(false)
  // The thread on screen; its messages don't add to the unread count.
  const activeThread = useRef(null)

  const refreshUnread = useCallback(async () => {
    try {
      const { total } = await apiRequest('/inbox/unread-count')
      setUnreadTotal(Number(total) || 0)
    } catch (error) {
      if (error.status !== 401) console.error('Failed to load unread messages:', error)
    }
  }, [])

  const setActiveThread = useCallback((kind, threadId) => {
    activeThread.current = kind ? threadKey(kind, threadId) : null
  }, [])

  useEffect(() => {
    if (!userId) return undefined

    function onConnect() {
      setConnected(true)
      // Catch up on anything that arrived while disconnected.
      refreshUnread()
    }
    function onDisconnect() {
      setConnected(false)
    }
    function onMessage({ kind, threadId, message }) {
      if (message.sender.id === userId) return
      if (activeThread.current === threadKey(kind, threadId)) return
      window.dispatchEvent(new CustomEvent('spontii:message-received', {
        detail: {
          id: `message:${kind}:${threadId}:${message.id}`,
          title: 'You have a new message',
          message: `${message.sender.name}: ${message.text || 'Sent an attachment'}`,
          type: 'chat_message',
          route: `/inbox/${kind === 'event' ? 'event' : 'dm'}/${encodeURIComponent(String(threadId))}`,
        },
      }))
      setUnreadTotal((total) => total + 1)
    }
    function onMessagesDeleted() {
      refreshUnread()
    }
    function onFriendsChanged() {
      window.dispatchEvent(new Event('spontii:friends-changed'))
    }
    function onAccountEnded() {
      apiRequest('/auth/me').catch((error) => {
        if (error.status !== 401) console.error('Failed to check the account session:', error)
      })
    }
    function onNotificationCreated(notification) {
      if (!notification?.id) return
      window.dispatchEvent(new CustomEvent('spontii:notification-created', {
        detail: notification,
      }))
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('message:new', onMessage)
    socket.on('message:deleted-for-me', onMessagesDeleted)
    socket.on('message:deleted-for-everyone', onMessagesDeleted)
    socket.on('notification:new', onNotificationCreated)
    socket.on('friends:changed', onFriendsChanged)
    socket.on('account:ended', onAccountEnded)
    socket.connect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('message:new', onMessage)
      socket.off('message:deleted-for-me', onMessagesDeleted)
      socket.off('message:deleted-for-everyone', onMessagesDeleted)
      socket.off('notification:new', onNotificationCreated)
      socket.off('friends:changed', onFriendsChanged)
      socket.off('account:ended', onAccountEnded)
      socket.disconnect()
      setConnected(false)
      setUnreadTotal(0)
    }
  }, [userId, refreshUnread])

  const value = useMemo(
    () => ({ connected, unreadTotal, refreshUnread, setActiveThread }),
    [connected, unreadTotal, refreshUnread, setActiveThread],
  )

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const context = useContext(ChatContext)

  if (!context) {
    throw new Error('useChat must be used inside ChatProvider')
  }

  return context
}
