import { useState, useEffect } from 'react'
import { fetchDashboard } from '../api'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="empty-state"><p>加载中...</p></div>
  if (!data) return <div className="empty-state"><p>加载失败</p></div>

  return (
    <div>
      {/* 统计卡片 */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-num">{data.total_products}</div>
          <div className="stat-label">💄 全部产品</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{data.total_diary}</div>
          <div className="stat-label">📖 妆容日记</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{data.monthly_products}</div>
          <div className="stat-label">🗓️ 本月新增</div>
        </div>
      </div>

      {/* 最近产品 */}
      <div className="card">
        <div className="card-title">🆕 最近添加</div>
        {data.recent_products.length === 0 ? (
          <p style={{ color: '#aaa', fontSize: 14 }}>还没有产品，快去添加吧~</p>
        ) : (
          <div>
            {data.recent_products.map(p => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: '1px solid #f5f5f5',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: p.photo
                      ? `url(/uploads/products/${p.photo}) center/cover`
                      : '#f5f5f5',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>
                    {p.brand || '未标记品牌'}{p.category ? ` · ${p.category}` : ''}
                  </div>
                </div>
              </div>
            ))}
            <Link to="/products" style={{ fontSize: 13, color: 'var(--pink)', display: 'block', marginTop: 10 }}>
              查看全部 →
            </Link>
          </div>
        )}
      </div>

      {/* 最新日记 */}
      <div className="card">
        <div className="card-title">📝 最新日记</div>
        {data.latest_diary ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 28 }}>{data.latest_diary.mood}</span>
              <div>
                <div style={{ fontWeight: 600 }}>{data.latest_diary.title}</div>
                <div style={{ fontSize: 12, color: '#999' }}>{data.latest_diary.created_date}</div>
              </div>
            </div>
            {data.latest_diary.content && (
              <p style={{ fontSize: 13, color: '#666', marginTop: 8, lineHeight: 1.6 }}>
                {data.latest_diary.content.slice(0, 100)}
                {data.latest_diary.content.length > 100 ? '...' : ''}
              </p>
            )}
            <Link to="/diary" style={{ fontSize: 13, color: 'var(--pink)', display: 'block', marginTop: 10 }}>
              查看全部日记 →
            </Link>
          </div>
        ) : (
          <p style={{ color: '#aaa', fontSize: 14 }}>还没有日记，记录你的每日妆容吧~</p>
        )}
      </div>
    </div>
  )
}
