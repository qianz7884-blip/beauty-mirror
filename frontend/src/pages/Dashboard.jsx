import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchDashboard, createProduct, getPhotoUrl } from '../api'
import { Link, useNavigate } from 'react-router-dom'
import ProductForm from '../components/ProductForm'
import RecognizePanel from '../components/RecognizePanel'

const CATEGORIES = ['全部', '口红', '眼影', '粉底', '腮红', '其他']

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('全部')
  const [recognizePhoto, setRecognizePhoto] = useState(null) // { file, previewUrl }
  const [showManualForm, setShowManualForm] = useState(false)
  const [toast, setToast] = useState(null)
  const cameraInputRef = useRef(null)
  const uploadInputRef = useRef(null)
  const navigate = useNavigate()

  const load = useCallback(() => {
    setLoading(true)
    fetchDashboard()
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2000)
  }

  // ==================== 搜索 ====================

  const handleSearch = (e) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (category && category !== '全部') params.set('category', category)
    navigate(`/products?${params.toString()}`)
  }

  // ==================== 拍照 / 相册 → 识别面板 ====================

  const handlePhotoCapture = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setRecognizePhoto({
      file,
      previewUrl: URL.createObjectURL(file),
    })
    e.target.value = ''
  }

  const handleRecognizeSaved = () => {
    setRecognizePhoto(null)
    showToast('彩妆添加成功！')
    load()
  }

  // ==================== 手动录入 → 快速表单 ====================

  const handleManualSubmit = async (formData) => {
    try {
      await createProduct(formData)
      setShowManualForm(false)
      showToast('彩妆添加成功！')
      load()
    } catch (err) {
      showToast(err.response?.data?.error || '添加失败，请重试', 'error')
    }
  }

  // ==================== 计算小组件数据 ====================

  const categoryCount = data
    ? new Set(data.recent_products.map(p => p.category).filter(Boolean)).size
    : 0

  // ==================== 渲染 ====================

  if (loading) return <div className="empty-state"><p>加载中...</p></div>
  if (!data) return <div className="empty-state"><p>加载失败</p></div>

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}

      {/* ====== 搜索栏 ====== */}
      <form className="search-bar" onSubmit={handleSearch}>
        <input
          className="form-input"
          placeholder="🔍 搜索彩妆名称或品牌..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="form-input"
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{ width: 90 }}
        >
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </form>

      {/* ====== 2x2 小组件 ====== */}
      <div className="widget-grid">
        <button className="widget-card widget-pink" onClick={() => navigate('/gallery')}>
          <span className="widget-icon">📦</span>
          <span className="widget-num">{data.total_products}</span>
          <span className="widget-label">彩妆仓库</span>
        </button>

        <button className="widget-card widget-orange" onClick={() => navigate('/products')}>
          <span className="widget-icon">🆕</span>
          <span className="widget-num">{data.monthly_products}</span>
          <span className="widget-label">本月新增</span>
        </button>

        <button className="widget-card widget-yellow" onClick={() => navigate('/diary')}>
          <span className="widget-icon">📖</span>
          <span className="widget-num">{data.total_diary}</span>
          <span className="widget-label">妆容日记</span>
        </button>

        <button className="widget-card widget-green" onClick={() => navigate('/products')}>
          <span className="widget-icon">📋</span>
          <span className="widget-num">{categoryCount}</span>
          <span className="widget-label">物品管理</span>
        </button>
      </div>

      {/* ====== 快速添加区 ====== */}
      <div className="quick-add-section">
        <div className="section-title">📷 快速添加彩妆</div>
        <div className="quick-add-row">
          <button className="quick-add-item" onClick={() => cameraInputRef.current?.click()}>
            <span className="quick-add-icon">📸</span>
            <span className="quick-add-label">拍照识别</span>
          </button>
          <button className="quick-add-item" onClick={() => uploadInputRef.current?.click()}>
            <span className="quick-add-icon">🖼️</span>
            <span className="quick-add-label">相册识别</span>
          </button>
          <button className="quick-add-item" onClick={() => setShowManualForm(true)}>
            <span className="quick-add-icon">✏️</span>
            <span className="quick-add-label">手动录入</span>
          </button>
        </div>
      </div>

      {/* 隐藏的拍照 / 相册 input */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handlePhotoCapture}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handlePhotoCapture}
      />

      {/* ====== 最近存入 ====== */}
      <div className="card">
        <div className="card-title">🆕 最近存入</div>
        {data.recent_products.length === 0 ? (
          <p style={{ color: '#aaa', fontSize: 14 }}>还没有产品，快去添加吧~</p>
        ) : (
          <div>
            {data.recent_products.map(p => (
              <div key={p.id} className="recent-item">
                <div
                  className="recent-thumb"
                  style={{
                    backgroundImage: p.photo
                      ? `url(${getPhotoUrl(p.photo, 'products')})`
                      : 'linear-gradient(135deg, #e8f5e9, #c8e6c9)',
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
            <Link to="/products" className="recent-link">
              查看全部 →
            </Link>
          </div>
        )}
      </div>

      {/* ====== 识别面板（拍照/相册后） ====== */}
      {recognizePhoto && (
        <RecognizePanel
          photoFile={recognizePhoto.file}
          previewUrl={recognizePhoto.previewUrl}
          onSaved={handleRecognizeSaved}
          onClose={() => setRecognizePhoto(null)}
        />
      )}

      {/* ====== 手动录入表单 ====== */}
      {showManualForm && (
        <ProductForm
          mode="quick"
          onSubmit={handleManualSubmit}
          onClose={() => setShowManualForm(false)}
        />
      )}
    </div>
  )
}
