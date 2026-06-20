import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchDashboard, createProduct, getPhotoUrl } from '../api'
import { Link, useNavigate } from 'react-router-dom'
import ProductForm from '../components/ProductForm'
import RecognizePanel from '../components/RecognizePanel'
import SkinAnalysisPanel from '../components/SkinAnalysisPanel'
import ImageViewer from '../components/ImageViewer'
import { getAllCategories } from '../categories'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('全部')
  const [recognizePhoto, setRecognizePhoto] = useState(null) // { file, previewUrl }
  const [showManualForm, setShowManualForm] = useState(false)
  const [toast, setToast] = useState(null)
  const [viewImage, setViewImage] = useState(null)
  const [showSkinMenu, setShowSkinMenu] = useState(false)
  const [skinPanelProps, setSkinPanelProps] = useState(null) // null | { photoFile, previewUrl, ... }
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
    showToast('护肤品添加成功！')
    load()
  }

  // ==================== 肤质分析入口 ====================

  const openSkinCamera = () => {
    setShowSkinMenu(false)
    setSkinPanelProps({ autoOpenCamera: true })
  }

  const openSkinHistory = () => {
    setShowSkinMenu(false)
    setSkinPanelProps({ forceHistoryMode: true })
  }

  const handleSkinClose = () => {
    setSkinPanelProps(null)
    load() // 刷新 Dashboard（可能有新的历史记录）
  }

  // ==================== 手动录入 → 快速表单 ====================

  const handleManualSubmit = async (formData) => {
    try {
      await createProduct(formData)
      setShowManualForm(false)
      showToast('护肤品添加成功！')
      load()
    } catch (err) {
      showToast(err.response?.data?.error || '添加失败，请重试', 'error')
    }
  }

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
          placeholder="🔍 搜索护肤品名称或品牌..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="form-input"
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{ width: 90 }}
        >
          {['全部', ...getAllCategories()].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </form>

      {/* ====== 2x2 小组件 ====== */}
      <div className="widget-grid">
        <button className="widget-card widget-blush" onClick={() => navigate('/products')}>
          <span className="widget-icon">🫧</span>
          <span className="widget-num">{data.total_products}</span>
          <span className="widget-label">护肤仓库</span>
        </button>

        <button className="widget-card widget-warm" onClick={() => navigate('/products')}>
          <span className="widget-icon">🌱</span>
          <span className="widget-num">{data.monthly_products}</span>
          <span className="widget-label">本月新增</span>
        </button>

        <button className="widget-card widget-cream" onClick={() => navigate('/diary')}>
          <span className="widget-icon">📖</span>
          <span className="widget-num">{data.total_diary}</span>
          <span className="widget-label">护肤日记</span>
        </button>

        <button className="widget-card widget-sage" onClick={() => setShowSkinMenu(true)}>
          <span className="widget-icon">🔬</span>
          <span className="widget-num">{data.total_analyses || 0}</span>
          <span className="widget-label">肤质分析</span>
        </button>
      </div>

      {/* ====== 肤质分析菜单 ====== */}
      {showSkinMenu && (
        <div className="modal-overlay" onClick={() => setShowSkinMenu(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔬 肤质分析</h3>
              <button className="modal-close" onClick={() => setShowSkinMenu(false)}>✕</button>
            </div>
            <div style={{ padding: '10px 0' }}>
              <button
                className="btn btn-primary btn-block"
                style={{ marginBottom: 10, padding: '14px', fontSize: 15 }}
                onClick={openSkinCamera}
              >
                📸 拍照分析
              </button>
              <button
                className="btn btn-outline btn-block"
                style={{ padding: '14px', fontSize: 15 }}
                onClick={openSkinHistory}
              >
                📋 查看历史报告
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== 快速添加区 ====== */}
      <div className="quick-add-section">
        <div className="section-title">📷 快速添加护肤品</div>
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
          <p style={{ color: '#aaa', fontSize: 14 }}>还没有护肤品，快去添加吧~</p>
        ) : (
          <div>
            {data.recent_products.map(p => {
              const photoUrl = p.photo ? getPhotoUrl(p.photo, 'products') : null
              return (
              <div key={p.id} className="recent-item">
                <div
                  className={`recent-thumb${photoUrl ? ' clickable-thumb' : ''}`}
                  onClick={() => photoUrl && setViewImage(photoUrl)}
                  style={{
                    backgroundImage: photoUrl
                      ? `url(${photoUrl})`
                      : 'linear-gradient(135deg, #e3ece0, #d5e0d0)',
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>
                    {p.brand || '未标记品牌'}{p.category ? ` · ${p.category}` : ''}
                  </div>
                </div>
              </div>
              )
            })}
            <Link to="/products" className="recent-link">
              查看全部 →
            </Link>
          </div>
        )}
      </div>

      {/* ====== 肤质分析历史卡片 ====== */}
      {data.recent_analyses && data.recent_analyses.length > 0 && (
        <div className="card">
          <div className="card-title">🔬 近期肤质分析</div>
          <div>
            {data.recent_analyses.map(a => (
              <div
                key={a.id}
                className="skin-dashboard-item"
                onClick={() => {
                  setSkinPanelProps({ viewHistoryId: a.id })
                }}
              >
                <div className="skin-dashboard-thumb">
                  {a.photo ? (
                    <img src={getPhotoUrl(a.photo, 'skin')} alt="" />
                  ) : (
                    <div className="skin-dashboard-placeholder">🔬</div>
                  )}
                </div>
                <div className="skin-dashboard-info">
                  <div className="skin-dashboard-type">{a.skin_type}</div>
                  <div className="skin-dashboard-score">综合 {a.overall_score} 分</div>
                </div>
                <div className="skin-dashboard-time">{a.created_at}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ====== 识别面板（拍照/相册后） ====== */}
      {recognizePhoto && (
        <RecognizePanel
          photoFile={recognizePhoto.file}
          previewUrl={recognizePhoto.previewUrl}
          categories={getAllCategories()}
          onSaved={handleRecognizeSaved}
          onClose={() => setRecognizePhoto(null)}
        />
      )}

      {/* 图片查看器 */}
      {viewImage && (
        <ImageViewer src={viewImage} onClose={() => setViewImage(null)} />
      )}

      {/* 肤质分析面板（统一入口） */}
      {skinPanelProps && (
        <SkinAnalysisPanel
          photoFile={skinPanelProps.photoFile}
          previewUrl={skinPanelProps.previewUrl}
          viewHistoryId={skinPanelProps.viewHistoryId}
          forceHistoryMode={skinPanelProps.forceHistoryMode}
          autoOpenCamera={skinPanelProps.autoOpenCamera}
          onClose={handleSkinClose}
        />
      )}

      {/* ====== 手动录入表单 ====== */}
      {showManualForm && (
        <ProductForm
          mode="quick"
          categories={getAllCategories()}
          onSubmit={handleManualSubmit}
          onClose={() => setShowManualForm(false)}
        />
      )}
    </div>
  )
}
