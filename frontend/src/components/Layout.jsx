import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { api } from '../api/client';
import { fmtDateTime } from './ui';

/* ---------- Beautiful inline SVG icons (dependency-free) ---------- */
const p = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
};

const Icons = {
  sparkles: (c) => (
    <svg {...p} {...c}><path d="M9.9 2.3 11.5 7l4.7 1.6-4.7 1.6-1.6 4.7-1.6-4.7L4 8.6 8.7 7z" /><path d="M19 13l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" /></svg>
  ),
  layout: (c) => (
    <svg {...p} {...c}><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
  ),
  tasks: (c) => (
    <svg {...p} {...c}><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></svg>
  ),
  brain: (c) => (
    <svg {...p} {...c}><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /><path d="M12 5v13" /></svg>
  ),
  map: (c) => (
    <svg {...p} {...c}><path d="M14.1 5.5 18 4.2a1 1 0 0 1 1.3 1L19 18.8a1 1 0 0 1-.9 1l-3.9 1.3a1 1 0 0 1-.8 0l-5-1.6a1 1 0 0 0-.6-.1L3 20.8a1 1 0 0 1-1.3-1L2 5.2a1 1 0 0 1 .9-1l4-1.3a1 1 0 0 1 .6.1l5 1.6a1 1 0 0 0 .6.1z" /><path d="M5 4v16" /><path d="M19 4v16" /></svg>
  ),
  users: (c) => (
    <svg {...p} {...c}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  ),
  box: (c) => (
    <svg {...p} {...c}><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
  ),
  trophy: (c) => (
    <svg {...p} {...c}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
  ),
  gauge: (c) => (
    <svg {...p} {...c}><path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></svg>
  ),
  shield: (c) => (
    <svg {...p} {...c}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
  ),
  file: (c) => (
    <svg {...p} {...c}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M12 18v-6" /><path d="m9 15 3 3 3-3" /></svg>
  ),
  coins: (c) => (
    <svg {...p} {...c}><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><path d="M7 6h1v4" /><path d="m16.71 13.88.7.71-2.82 2.82" /></svg>
  ),
  template: (c) => (
    <svg {...p} {...c}><rect width="18" height="7" x="3" y="3" rx="1" /><rect width="9" height="7" x="3" y="14" rx="1" /><rect width="5" height="7" x="16" y="14" rx="1" /></svg>
  ),
  digest: (c) => (
    <svg {...p} {...c}><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M7 8h10" /><path d="M7 12h10" /><path d="M7 16h6" /></svg>
  ),
  search: (c) => (
    <svg {...p} {...c}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
  ),
  settings: (c) => (
    <svg {...p} {...c}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
  ),
  bell: (c) => (
    <svg {...p} {...c}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
  ),
  logout: (c) => (
    <svg {...p} {...c}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
  ),
  chevronLeft: (c) => (
    <svg {...p} {...c}><path d="m15 18-6-6 6-6" /></svg>
  ),
  chevronRight: (c) => (
    <svg {...p} {...c}><path d="m9 18 6-6-6-6" /></svg>
  ),
  menu: (c) => (
    <svg {...p} {...c}><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
  ),
};

const adminNav = [
  { to: '/', label: 'AI Assistant', icon: 'sparkles', color: 'text-fuchsia-300', end: true },
  { to: '/dashboard', label: 'Command Dashboard', icon: 'layout', color: 'text-indigo-300' },
  { to: '/tasks', label: 'Tasks', icon: 'tasks', color: 'text-emerald-300' },
  { to: '/visions', label: 'Vision Canvas', icon: 'brain', color: 'text-violet-300' },
  { to: '/roadmaps', label: 'Roadmaps', icon: 'map', color: 'text-cyan-300' },
  { to: '/capabilities', label: 'Employees', icon: 'users', color: 'text-sky-300' },
  { to: '/products', label: 'Product', icon: 'box', color: 'text-amber-300' },
  { to: '/leaderboard', label: 'Leaderboard', icon: 'trophy', color: 'text-yellow-300' },
  { to: '/utilization', label: 'Employee Intelligence', icon: 'gauge', color: 'text-teal-300' },
  { to: '/evaluations', label: 'Evaluation Oversight', icon: 'shield', color: 'text-orange-300' },
  { to: '/ai-audit', label: 'AI Decision Audit', icon: 'file', color: 'text-rose-300' },
  { to: '/cost-monitor', label: 'AI Cost Monitor', icon: 'coins', color: 'text-lime-300' },
  { to: '/templates', label: 'Task Templates', icon: 'template', color: 'text-blue-300' },
  { to: '/digests', label: 'Digest History', icon: 'digest', color: 'text-pink-300' },
  { to: '/search', label: 'Global Search', icon: 'search', color: 'text-slate-300' },
  { to: '/settings', label: 'Settings', icon: 'settings', color: 'text-slate-300' },
];

const workerNav = [
  { to: '/worker', label: 'My Queue', icon: 'tasks', color: 'text-emerald-300', end: true },
  { to: '/my-performance', label: 'My Performance', icon: 'trophy', color: 'text-yellow-300' },
  { to: '/profile', label: 'My Profile', icon: 'users', color: 'text-sky-300' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';
  const nav = isAdmin ? adminNav : workerNav;
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ao_sidebar') === '1');
  const [notifs, setNotifs] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const { on } = useSocket();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem('ao_sidebar', collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    api.get('/notifications').then((d) => setNotifs(d.notifications || [])).catch(() => {});
    return on('notification', (n) => setNotifs((p) => [n, ...p].slice(0, 50)));
  }, [on]);

  const unread = notifs.filter((n) => !n.read).length;

  async function markAllRead() {
    await api.patch('/notifications/read-all').catch(() => {});
    setNotifs((p) => p.map((n) => ({ ...n, read: true })));
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col overflow-hidden bg-gradient-to-b from-[#221a4d] via-[#2e2a78] to-[#4b1d6e] shadow-2xl shadow-indigo-900/20 transition-all duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:w-16' : 'lg:w-60'}`}
      >
        {/* Ambient glow blobs */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-fuchsia-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-12 h-52 w-52 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-1/3 h-40 w-40 -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl" />

        <div className="relative flex h-14 items-center justify-between gap-2 border-b border-white/10 px-3">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 via-violet-400 to-fuchsia-400 text-sm font-extrabold text-white shadow-lg shadow-fuchsia-500/30">
              A
            </span>
            {(mobileNavOpen || !collapsed) && <span className="whitespace-nowrap font-bold text-white">AgencyOps</span>}
          </div>
          <button
            className="hidden shrink-0 rounded-lg p-1.5 text-indigo-200/60 transition-colors hover:bg-white/10 hover:text-white lg:block"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <Icons.chevronRight className="h-4 w-4" /> : <Icons.chevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav className="relative px-3 py-4">
          {nav.map((item) => {
            const NavIcon = Icons[item.icon];
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={collapsed ? item.label : undefined}
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  `group mb-1 flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition-all ${
                    collapsed && !mobileNavOpen ? 'justify-center px-0' : ''
                  } ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-500/90 via-violet-500/90 to-fuchsia-500/90 text-white shadow-lg shadow-fuchsia-900/40'
                      : 'text-indigo-100/70 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 transition-colors group-hover:bg-white/15 ${
                    item.color
                  }`}
                >
                  {NavIcon && <NavIcon className="h-4 w-4" />}
                </span>
                {(mobileNavOpen || !collapsed) && <span className="truncate">{item.label}</span>}
              </NavLink>            );
          })}
        </nav>

        {(mobileNavOpen || !collapsed) && (
          <div className="relative border-t border-white/10 p-4">
            <p className="text-xs text-indigo-200/50">Closed-Loop Agency Operations Engine</p>
          </div>
        )}
      </aside>

      {/* Mobile nav backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="relative z-20 flex h-14 items-center justify-between gap-2 border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700">
            <button
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-violet-200 hover:text-violet-600 lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              title="Open menu"
            >
              <Icons.menu className="h-4 w-4" />
            </button>
            <span className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-200 sm:flex">
              <Icons.sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="truncate">{isAdmin ? 'Agency Command' : 'Delivery Terminal'}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Notifications */}
            <div className="relative">
              <button
                className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-violet-200 hover:text-violet-600"
                onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen) markAllRead(); }}
                title="Notifications"
              >
                <Icons.bell className="h-4 w-4" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-red-500 px-1 text-[10px] font-bold text-white shadow">
                    {unread}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-11 z-40 max-h-96 w-80 max-w-[calc(100vw-2rem)] overflow-auto rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-indigo-100/60 animate-pop">
                  <div className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Notifications
                  </div>
                  {notifs.length === 0 && <div className="p-4 text-sm text-slate-500">No notifications</div>}
                  {notifs.map((n) => (
                    <div key={n.id} className="border-b border-slate-100 px-4 py-3 transition-colors hover:bg-violet-50/40">
                      <p className="text-sm font-medium text-slate-800">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-xs text-slate-500">{n.body}</p>}
                      <p className="mt-1 text-[10px] text-slate-400">{fmtDateTime(n.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <NavLink to="/profile" title="My profile">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-sm font-bold text-white shadow-md shadow-violet-200">
                  {user?.name?.[0]?.toUpperCase() || 'U'}
                </div>
              </NavLink>
              <div className="hidden leading-tight md:block">
                <p className="text-sm font-semibold text-slate-800">{user?.name}</p>
                <p className="text-xs text-slate-500">{isAdmin ? 'Admin' : 'Worker'}</p>
              </div>
            </div>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 md:h-auto md:w-auto md:gap-1.5 md:px-3 md:py-1.5 md:text-sm"
              onClick={handleLogout}
              title="Logout"
            >
              <Icons.logout className="h-4 w-4" />
              <span className="hidden md:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
