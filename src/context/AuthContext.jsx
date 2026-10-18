import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'
import { apiRequest } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    apiRequest('/auth/me')
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser)
      })
      .catch((error) => {
        if (error.status !== 401) {
          console.error('Failed to restore auth session:', error)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  async function signup(details) {
    const result = await apiRequest('/auth/signup', {
      method: 'POST',
      body: details,
    })
    setUser(null)
    return result
  }

  async function sendVerificationCode(details) {
    return apiRequest('/auth/send-verification-code', {
      method: 'POST',
      body: details,
    })
  }

  async function verifyEmail(details) {
    return apiRequest('/auth/verify-email', {
      method: 'POST',
      body: details,
    })
  }

  async function resendOtp(details) {
    return apiRequest('/auth/resend-otp', {
      method: 'POST',
      body: details,
    })
  }

  async function login(credentials) {
    const result = await apiRequest('/auth/login', {
      method: 'POST',
      body: credentials,
    })
    setUser(result.user)
    return result.user
  }

  async function sendLoginCode(details) {
    return apiRequest('/auth/send-login-code', {
      method: 'POST',
      body: details,
    })
  }

  async function loginWithCode(details) {
    const result = await apiRequest('/auth/login-with-code', {
      method: 'POST',
      body: details,
    })
    setUser(result.user)
    return result.user
  }

  async function updateProfile(fields) {
    const result = await apiRequest('/profile', {
      method: 'PATCH',
      body: fields,
    })
    setUser(result.user)
    return result.user
  }

  async function uploadProfilePhoto(file) {
    const formData = new FormData()
    formData.append('photo', file)
    const result = await apiRequest('/profile/photo', {
      method: 'POST',
      body: formData,
    })
    setUser(result.user)
    return result.user
  }

  async function logout() {
    await apiRequest('/auth/logout', { method: 'POST' })
    setUser(null)
  }

  const value = {
    user,
    loading,
    isAuthenticated: Boolean(user),
    signup,
    sendVerificationCode,
    verifyEmail,
    resendOtp,
    login,
    sendLoginCode,
    loginWithCode,
    logout,
    updateProfile,
    uploadProfilePhoto,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error(
      'useAuth must be used inside AuthProvider',
    )
  }

  return context
}