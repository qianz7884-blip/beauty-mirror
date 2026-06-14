import { NavLink, useLocation } from 'react-router-dom'

const TABS = [
  { path: '/', icon: '📊', label: '首页' },
  { path: '/products', icon: '💄', label: '产品' },
  { path: '/gallery', icon: '🎨', label: '画廊' },
  { path: '/diary', icon: '📖', label: '日记' },
]

export default function Layout({ children }) {
  const { pathname } = useLocation()
  const isHome = pathname === '/'

  return (
    <div className="app-container">
      {!isHome && <header className="app-header">彩妆管理助手</header>}
      <main className="app-content">{children}</main>
      <nav className="tab-bar">
        {TABS.map(tab => {
          const isActive =
            tab.path === '/'
              ? pathname === '/'
              : pathname.startsWith(tab.path)
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={`tab-item${isActive ? ' active' : ''}`}
            >
              <span className="tab-icon">{tab.icon}</span>
              {tab.label}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
