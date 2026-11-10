import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CheckIcon, CloseIcon } from '../../components/NavIcons'

const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback((message, tone = 'mint') => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current.slice(-3), { id, message, tone }])
    setTimeout(() => dismiss(id), 4500)
  }, [dismiss])

  const value = useMemo(() => notify, [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface-2 px-4 py-3 text-sm ${toast.tone === 'danger' ? 'border-danger/40 text-danger' : 'border-mint/40'}`}
          >
            {toast.tone !== 'danger' && <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-mint" />}
            <span className="flex-1">{toast.message}</span>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss" className="text-muted hover:text-text">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
