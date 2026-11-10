import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import logo from '../../assets/logo.png'
import ThemeToggle from '../../components/ThemeToggle'
import {
  CalendarIcon,
  CloseIcon,
  FlagIcon,
  ShieldCheckIcon,
  UsersIcon,
} from '../../components/NavIcons'
import { useAdminAuth } from '../AdminAuthContext'
import { useAdminQuery } from '../useAdminQuery'
import GlobalSearch from './GlobalSearch'
import {
  GaugeIcon,
  LogOutIcon,
  MegaphoneIcon,
  MenuIcon,
  ScrollIcon,
  ServerIcon,
  SettingsIcon,
} from './icons'

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: GaugeIcon, end: true },
  { to: '/admin/users', label: 'Users', icon: UsersIcon },
  { to: '/admin/events', label: 'Events', icon: CalendarIcon },
  { to: '/admin/reports', label: 'Reports', icon: FlagIcon, badge: 'openReports' },
  { to: '/admin/announcements', label: 'Announcements', icon: MegaphoneIcon },
  { to: '/admin/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/admin/admins', label: 'Admins', icon: ShieldCheckIcon },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollIcon },
  { to: '/admin/system', label: 'System', icon: ServerIcon },
]

function Sidebar({ badges, onNavigate }) {
  return (
    <nav aria-label="Admin" className="flex flex-col gap-1 p-3">
      {NAV.map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              isActive ? 'bg-mint-soft text-mint' : 'text-muted hover:bg-text/5 hover:text-text'
            }`}
        >
          <Icon className="h-[18px] w-[18px]" />
          <span className="flex-1">{label}</span>
          {badge && badges?.[badge] > 0 && (
            <span className="rounded-full bg-warning px-1.5 text-[10px] font-extrabold text-bg">
              {badges[badge] > 99 ? '99+' : badges[badge]}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default function AdminLayout() {
  const { admin, logout } = useAdminAuth()
  const navigate = useNavigate()
  const location = useLocation()
  /* The mobile menu belongs to the page it was opened on, so navigating closes it. */
  const [menuPath, setMenuPath] = useState(null)
  const menuOpen = menuPath === location.pathname
  const setMenuOpen = (open) => setMenuPath(open ? location.pathname : null)
  /* Counts change as admins work through queues, so refresh them on every page change. */
  const badges = useAdminQuery(admin?.mustChangePassword ? null : '/badges', location.pathname)

  async function signOut() {
    await logout().catch(() => {})
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-bg/95 px-4 lg:px-6">
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          className="rounded-lg p-2 text-muted hover:bg-text/5 hover:text-text lg:hidden"
        >
          {menuOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
        <Link to="/admin" className="flex items-center gap-2.5">
          <img src={logo} alt="Spontii" className="h-8 w-auto" />
          <span className="hidden rounded-md border border-mint/30 bg-mint-soft px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-mint sm:inline">
            Admin
          </span>
        </Link>
        <div className="mx-auto hidden w-full max-w-md md:block">
          {!admin?.mustChangePassword && <GlobalSearch />}
        </div>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <ThemeToggle />
          <Link
            to="/admin/account"
            className="hidden max-w-[12rem] truncate rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text sm:block"
            title={admin?.email}
          >
            {admin?.name}
          </Link>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted hover:bg-surface-3 hover:text-text"
          >
            <LogOutIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 overflow-y-auto border-r border-border lg:block">
          {!admin?.mustChangePassword && <Sidebar badges={badges.data} />}
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 top-16 z-30 bg-bg lg:hidden">
            <div className="border-b border-border p-3 md:hidden">
              {!admin?.mustChangePassword && <GlobalSearch />}
            </div>
            {!admin?.mustChangePassword && <Sidebar badges={badges.data} onNavigate={() => setMenuOpen(false)} />}
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
