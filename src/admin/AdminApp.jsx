import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AdminAuthProvider, useAdminAuth } from './AdminAuthContext'
import AdminLayout from './components/AdminLayout'
import { ToastProvider } from './components/Toast'
import { Loading } from './components/ui'
import Account from './pages/Account'
import Admins from './pages/Admins'
import Announcements from './pages/Announcements'
import AuditLog from './pages/AuditLog'
import Dashboard from './pages/Dashboard'
import EventDetail from './pages/EventDetail'
import Events from './pages/Events'
import AdminLogin from './pages/Login'
import ReportDetail from './pages/ReportDetail'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import System from './pages/System'
import UserDetail from './pages/UserDetail'
import Users from './pages/Users'

function RequireAdmin({ children }) {
  const { admin, loading } = useAdminAuth()
  const location = useLocation()

  if (loading) {
    return <div className="min-h-dvh bg-bg"><Loading label="Opening the admin portal…" /></div>
  }
  if (!admin) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (admin.mustChangePassword && location.pathname !== '/admin/account') {
    return <Navigate to="/admin/account" replace />
  }
  return children
}

/* Lazy-loaded from main.jsx, outside the user app's providers. */
export default function AdminApp() {
  return (
    <AdminAuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="login" element={<AdminLogin />} />
          <Route element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
            <Route index element={<Dashboard />} />
            <Route path="account" element={<Account />} />
            <Route path="users" element={<Users />} />
            <Route path="users/:id" element={<UserDetail />} />
            <Route path="events" element={<Events />} />
            <Route path="events/:id" element={<EventDetail />} />
            <Route path="reports" element={<Reports />} />
            <Route path="reports/:id" element={<ReportDetail />} />
            <Route path="announcements" element={<Announcements />} />
            <Route path="settings" element={<Settings />} />
            <Route path="admins" element={<Admins />} />
            <Route path="audit" element={<AuditLog />} />
            <Route path="system" element={<System />} />
          </Route>
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </ToastProvider>
    </AdminAuthProvider>
  )
}
