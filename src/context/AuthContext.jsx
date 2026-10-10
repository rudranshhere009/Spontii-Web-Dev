import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'

const AuthContext = createContext(null)

const USERS_KEY = 'spontii_users_v1'
const SESSION_KEY = 'spontii_session_v1'

function loadUsers() {
  try {
    const saved = localStorage.getItem(USERS_KEY)

    if (saved) {
      return JSON.parse(saved)
    }
  } catch (error) {
    console.error('Failed to load users:', error)
  }

  return []
}

function loadSession() {
  try {
    const saved = localStorage.getItem(SESSION_KEY)

    if (saved) {
      return JSON.parse(saved)
    }
  } catch (error) {
    console.error('Failed to load session:', error)
  }

  return null
}

export function AuthProvider({ children }) {
  const [users, setUsers] = useState(() => loadUsers())
  const [user, setUser] = useState(() => loadSession())

  useEffect(() => {
    try {
      localStorage.setItem(
        USERS_KEY,
        JSON.stringify(users),
      )
    } catch (error) {
      console.error('Failed to save users:', error)
    }
  }, [users])

  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify(user),
        )
      } else {
        localStorage.removeItem(SESSION_KEY)
      }
    } catch (error) {
      console.error('Failed to save session:', error)
    }
  }, [user])

  function signup({ name, email, password }) {
    const cleanName = name.trim()
    const cleanEmail = email.trim().toLowerCase()

    if (!cleanName) {
      return {
        success: false,
        message: 'Please enter your full name.',
      }
    }

    if (!cleanEmail) {
      return {
        success: false,
        message: 'Please enter your email.',
      }
    }

    if (password.length < 6) {
      return {
        success: false,
        message: 'Password must be at least 6 characters.',
      }
    }

    const existingUser = users.find(
      (existing) =>
        existing.email.toLowerCase() === cleanEmail,
    )

    if (existingUser) {
      return {
        success: false,
        message:
          'An account with this email already exists.',
      }
    }

    const newUser = {
      id: `user-${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      password,
      createdAt: new Date().toISOString(),
    }

    setUsers((previous) => [
      ...previous,
      newUser,
    ])

    const sessionUser = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      createdAt: newUser.createdAt,
    }

    setUser(sessionUser)

    return {
      success: true,
      user: sessionUser,
    }
  }

  function login({ email, password }) {
    const cleanEmail = email.trim().toLowerCase()

    const existingUser = users.find(
      (item) =>
        item.email.toLowerCase() === cleanEmail,
    )

    if (!existingUser) {
      return {
        success: false,
        message:
          'No account found with this email.',
      }
    }

    if (existingUser.password !== password) {
      return {
        success: false,
        message: 'Incorrect password.',
      }
    }

    const sessionUser = {
      id: existingUser.id,
      name: existingUser.name,
      email: existingUser.email,
      createdAt: existingUser.createdAt,
    }

    setUser(sessionUser)

    return {
      success: true,
      user: sessionUser,
    }
  }

  function logout() {
    setUser(null)
  }

  const value = {
    user,
    users,
    isAuthenticated: Boolean(user),
    signup,
    login,
    logout,
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