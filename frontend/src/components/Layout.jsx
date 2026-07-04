import { NavLink, useLocation } from 'react-router-dom'
import { Sparkles, Package, BookOpen, BookOpenCheck, User } from 'lucide-react'

const TABS = [
  { path: '/', icon: Sparkles, label: '今日' },
  { path: '/products', icon: Package, label: '产品' },
  { path: '/diary', icon: BookOpen, label: '日记' },
  { path: '/tutorial', icon: BookOpenCheck, label: '流程' },
  { path: '/profile', icon: User, label: '我的' },
]

export default function Layout({ children }) {
  const { pathname } = useLocation()

  return (
    <div className="app-container">
      <main className="app-content">{children}</main>
      <nav className="tab-bar" aria-label="主导航">
        {TABS.map(tab => {
          const isActive =
            tab.path === '/'
              ? pathname === '/'
              : pathname.startsWith(tab.path)
          const Icon = tab.icon

          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={`tab-item${isActive ? ' active' : ''}`}
            >
              <Icon size={22} strokeWidth={isActive ? 2 : 1.6} className="tab-icon-svg" />
              <span>{tab.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
