import { useState, useEffect } from 'react'
import { fetchProducts, getPhotoUrl } from '../api'

const CATEGORIES = ['全部', '面霜', '精华', '面膜', '洁面', '防晒', '其他']

export default function MyCosmetics() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('全部')

  useEffect(() => {
    setLoading(true)
    const params = {}
    if (category && category !== '全部') params.category = category
    fetchProducts(params)
      .then(setProducts)
      .finally(() => setLoading(false))
  }, [category])

  return (
    <div>
      {/* 分类筛选 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 8 }}>
        {CATEGORIES.map(c => (
          <button
            key={c}
            className={`btn btn-sm ${category === c ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setCategory(c)}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state"><p>加载中...</p></div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🫧</div>
          <p>该分类下还没有护肤品</p>
        </div>
      ) : (
        <div className="product-grid">
          {products.map(p => (
            <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* 图片 */}
              <div
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  background: p.photo
                    ? `url(${getPhotoUrl(p.photo, 'products')}) center/cover`
                    : 'linear-gradient(135deg, #e3ece0, #d5e0d0)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 40,
                }}
              >
                {!p.photo && '🫧'}
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{p.name}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {p.brand && <span className="tag tag-outline">{p.brand}</span>}
                  {p.category && <span className="tag">{p.category}</span>}
                </div>
                {p.color && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: p.color,
                        border: '1px solid #ddd',
                      }}
                    />
                    <span style={{ fontSize: 11, color: '#888' }}>{p.color}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
