/* Helpers shared by the inbox, event live chat and direct messages. */

export const MESSAGE_MAX_LENGTH = 2000

export const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'safety', label: 'Safety concern' },
  { value: 'other', label: 'Something else' },
]

export function threadKey(kind, threadId) {
  return `${kind}:${threadId}`
}

/* Adds messages by id (a socket echo and a POST response are the same message), oldest first. */
export function mergeMessages(current, incoming) {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((first, second) => Number(first.id) - Number(second.id))
}

export function formatMessageTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/* Inbox row time: the time today, "Yesterday", then a short date. */
export function formatThreadTime(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  const daysAgo = Math.round((today - day) / (24 * 60 * 60 * 1000))
  if (daysAgo === 0) return formatMessageTime(iso)
  if (daysAgo === 1) return 'Yesterday'
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export function firstName(name) {
  return (name || 'Someone').trim().split(/\s+/)[0]
}
