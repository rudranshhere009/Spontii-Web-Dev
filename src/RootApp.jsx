import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import App from './App.jsx'
import { AppProvider } from './context/AppContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ChatProvider } from './context/ChatContext.jsx'
import SiteStatus from './components/SiteStatus.jsx'

const AdminApp = lazy(() => import('./admin/AdminApp.jsx'))

function UserApp() {
  return (
    <AuthProvider>
      <ChatProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </ChatProvider>
    </AuthProvider>
  )
}

export default function RootApp() {
  return (
    <Routes>
      <Route
        path="/admin/*"
        element={(
          <Suspense fallback={<div className="flex min-h-dvh items-center justify-center bg-bg text-text">Loading admin portal...</div>}>
            <AdminApp />
          </Suspense>
        )}
      />
      <Route
        path="/*"
        element={(
          <SiteStatus>
            <UserApp />
          </SiteStatus>
        )}
      />
    </Routes>
  )
}
