import { NavLink, useLocation } from 'react-router-dom'
import { ScanFace, ShoppingBag, BookOpen, BookOpenCheck, User } from 'lucide-react'
import { useThemeSettings } from '../utils/themeSettings'

const TABS = [
  { path: '/', icon: ScanFace, label: '检测' },
  { path: '/tutorial', icon: BookOpenCheck, label: '教程' },
  { path: '/products', icon: ShoppingBag, label: '产品' },
  { path: '/diary', icon: BookOpen, label: '日记' },
  { path: '/profile', icon: User, label: '我的' },
]

export default function Layout({ children }) {
  const { pathname } = useLocation()
  const { style } = useThemeSettings()

  return (
    <div className="app-container bm-app-shell" style={style}>
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
