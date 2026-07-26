import { NavLink, useLocation } from 'react-router-dom'
import { ScanFace, Plus, BookOpen, BookOpenCheck, User } from 'lucide-react'
import { useThemeSettings } from '../utils/themeSettings'

const TABS = [
  { path: '/', icon: ScanFace, label: '检测' },
  { path: '/tutorial', icon: BookOpenCheck, label: '教程' },
  { path: '/products', to: '/products?add=1', icon: Plus, label: '产品', variant: 'tab-item-action', iconSize: 30 },
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
              to={tab.to || tab.path}
              className={`tab-item${tab.variant ? ` ${tab.variant}` : ''}${isActive ? ' active' : ''}`}
              onClick={event => {
                if (tab.path === '/products' && pathname.startsWith('/products')) {
                  event.preventDefault()
                  window.dispatchEvent(new CustomEvent('beauty-mirror:toggle-product-add'))
                }
              }}
            >
              <Icon size={tab.iconSize || 22} strokeWidth={isActive ? 2 : 1.6} className="tab-icon-svg" />
              <span>{tab.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
