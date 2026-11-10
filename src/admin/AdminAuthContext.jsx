import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ADMIN_PASSWORD_REQUIRED, ADMIN_SESSION_ENDED, adminRequest } from './adminApi'

const AdminAuthContext = createContext(null)

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null)
  const [loading, setLoading] = useState(true)
  const [endedReason, setEndedReason] = useState('')

  useEffect(() => {
    let active = true
    adminRequest('/auth/me')
      .then((result) => {
        if (active) setAdmin(result.admin)
      })
      .catch((error) => {
        if (error.status !== 401) console.error('Could not restore the admin session:', error)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const ended = () => {
      setAdmin(null)
      setEndedReason('Your admin session ended. Please sign in again.')
    }
    const passwordRequired = () => {
      setAdmin((current) => (current ? { ...current, mustChangePassword: true } : current))
    }
    window.addEventListener(ADMIN_SESSION_ENDED, ended)
    window.addEventListener(ADMIN_PASSWORD_REQUIRED, passwordRequired)
    return () => {
      window.removeEventListener(ADMIN_SESSION_ENDED, ended)
      window.removeEventListener(ADMIN_PASSWORD_REQUIRED, passwordRequired)
    }
  }, [])

  const login = useCallback((email, password) =>
    adminRequest('/auth/login', { method: 'POST', body: { email, password } }), [])

  const verify = useCallback(async (challengeId, otp) => {
    const result = await adminRequest('/auth/verify', { method: 'POST', body: { challengeId, otp } })
    setEndedReason('')
    setAdmin(result.admin)
    return result.admin
  }, [])

  const resend = useCallback((challengeId) =>
    adminRequest('/auth/resend', { method: 'POST', body: { challengeId } }), [])

  const logout = useCallback(async () => {
    try {
      await adminRequest('/auth/logout', { method: 'POST' })
    } finally {
      setAdmin(null)
    }
  }, [])

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const result = await adminRequest('/auth/password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    })
    setAdmin((current) => (current ? { ...current, mustChangePassword: false } : current))
    return result
  }, [])

  const value = useMemo(() => ({
    admin,
    loading,
    endedReason,
    login,
    verify,
    resend,
    logout,
    changePassword,
  }), [admin, loading, endedReason, login, verify, resend, logout, changePassword])

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext)
  if (!context) throw new Error('useAdminAuth must be used inside AdminAuthProvider.')
  return context
}
