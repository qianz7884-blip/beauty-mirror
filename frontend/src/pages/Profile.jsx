import { useState, useEffect } from 'react'
import { fetchDashboard } from '../api'

const SKIN_TYPES = ['干性', '油性', '混合', '敏感']
const SKIN_TYPE_KEY = 'beauty_mirror_skin_type'

export default function Profile() {
  const [stats, setStats] = useState({ totalProducts: 0, totalDiaries: 0 })
  const [skinType, setSkinType] = useState(() => localStorage.getItem(SKIN_TYPE_KEY) || '')
  const [reminderOn, setReminderOn] = useState(() => localStorage.getItem('beauty_mirror_reminder') === 'true')
  const [showSkinPicker, setShowSkinPicker] = useState(false)

  useEffect(() => {
    fetchDashboard()
      .then(data => setStats({ totalProducts: data.total_products, totalDiaries: data.total_diary }))
      .catch(() => {})
  }, [])

  const handleSkinChange = (type) => {
    setSkinType(type)
    localStorage.setItem(SKIN_TYPE_KEY, type)
    setShowSkinPicker(false)
  }

  const handleReminderToggle = () => {
    const next = !reminderOn
    setReminderOn(next)
    localStorage.setItem('beauty_mirror_reminder', String(next))
  }

  return (
    <div>
      {/* 头像区 */}
      <div className="profile-header">
        <div className="profile-avatar">✨</div>
        <h3>Mirror Mate</h3>
        <p className="profile-sub">AI 护肤与形象管理助手</p>
      </div>

      {/* 统计小条 */}
      <div className="profile-stats">
        <div className="profile-stat">
          <div className="stat-num">{stats.totalProducts}</div>
          <div className="stat-label">护肤品数</div>
        </div>
        <div className="profile-stat">
          <div className="stat-num">{stats.totalDiaries}</div>
          <div className="stat-label">日记数</div>
        </div>
      </div>

      {/* 菜单列表 */}
      <div className="profile-menu">

        {/* 肤质偏好 */}
        <button className="profile-menu-item" onClick={() => setShowSkinPicker(!showSkinPicker)}>
          <span className="menu-icon">🫧</span>
          肤质偏好
          <span className="menu-badge">{skinType || '未设置'}</span>
          <span className="menu-arrow">›</span>
        </button>
        {showSkinPicker && (
          <div className="skin-type-options" style={{ padding: '0 16px 12px' }}>
            {SKIN_TYPES.map(type => (
              <button
                key={type}
                className={`skin-type-option${skinType === type ? ' selected' : ''}`}
                onClick={() => handleSkinChange(type)}
              >
                {type}
              </button>
            ))}
          </div>
        )}

        {/* 提醒通知 */}
        <button className="profile-menu-item" onClick={handleReminderToggle}>
          <span className="menu-icon">🔔</span>
          每日提醒
          <span className="menu-badge">{reminderOn ? '已开启' : '已关闭'}</span>
          <span className="menu-arrow">›</span>
        </button>

        {/* 反馈建议 */}
        <button className="profile-menu-item" onClick={() => alert('感谢你的反馈！功能开发中…')}>
          <span className="menu-icon">💬</span>
          反馈建议
          <span className="menu-arrow">›</span>
        </button>

        {/* 关于 */}
        <button className="profile-menu-item" onClick={() => alert('Beauty Mirror v1.0\nAI 护肤与形象管理助手\n莫兰迪鼠尾草绿 · 轻奢护肤 · 移动端优先')}>
          <span className="menu-icon">ℹ️</span>
          关于
          <span className="menu-arrow">›</span>
        </button>

      </div>
    </div>
  )
}
