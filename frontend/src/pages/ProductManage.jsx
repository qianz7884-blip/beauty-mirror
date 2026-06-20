import { useState, useEffect, useCallback } from 'react'
import { fetchProducts, createProduct, updateProduct, deleteProduct, getPhotoUrl } from '../api'
import ProductCard from '../components/ProductCard'
import ProductForm from '../components/ProductForm'
import ImageViewer from '../components/ImageViewer'
import { DEFAULT_CATEGORIES, loadCustomCategories, saveCustomCategories, getAllCategories } from '../categories'

/** 按品类分组 */
function groupByCategory(products) {
  const map = {}
  products.forEach(p => {
    const cat = p.category || '其他'
    if (!map[cat]) map[cat] = []
    map[cat].push(p)
  })
  // 默认品类排前面，自定义排后面
  const entries = Object.entries(map)
  entries.sort((a, b) => {
    const ai = DEFAULT_CATEGORIES.indexOf(a[0])
    const bi = DEFAULT_CATEGORIES.indexOf(b[0])
    if (ai === -1 && bi === -1) return a[0].localeCompare(b[0])
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
  return entries
}

export default function ProductManage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('全部')
  const [viewMode, setViewMode] = useState('list')
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [toast, setToast] = useState(null)
  const [viewImage, setViewImage] = useState(null)

  // ---- 自定义品类 ----
  const [customCategories, setCustomCategories] = useState(loadCustomCategories)
  const [showAddCat, setShowAddCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  const allCategories = ['全部', ...DEFAULT_CATEGORIES, ...customCategories]

  const addCategory = () => {
    const name = newCatName.trim()
    if (!name || allCategories.includes(name)) return
    const updated = [...customCategories, name]
    setCustomCategories(updated)
    saveCustomCategories(updated)
    setNewCatName('')
    setShowAddCat(false)
  }

  const removeCategory = (name) => {
    const updated = customCategories.filter(c => c !== name)
    setCustomCategories(updated)
    saveCustomCategories(updated)
    if (category === name) setCategory('全部')
  }

  // ---- 数据加载 ----
  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (search) params.search = search
    if (category && category !== '全部') params.category = category
    fetchProducts(params)
      .then(setProducts)
      .finally(() => setLoading(false))
  }, [search, category])

  useEffect(() => { load() }, [load])

  // ---- Toast ----
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2000)
  }

  // ---- CRUD ----
  const handleSubmit = async (formData) => {
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, formData)
        showToast('产品更新成功！')
      } else {
        await createProduct(formData)
        showToast('产品添加成功！')
      }
      setShowForm(false)
      setEditingProduct(null)
      load()
    } catch (err) {
      showToast(err.response?.data?.error || '操作失败', 'error')
    }
  }

  const handleEdit = (product) => {
    setEditingProduct(product)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这个产品吗？')) return
    try {
      await deleteProduct(id)
      showToast('产品已删除')
      load()
    } catch (err) {
      showToast('删除失败', 'error')
    }
  }

  // ---- 分组数据 ----
  const grouped = !search && category === '全部' ? groupByCategory(products) : null

  // ---- 渲染产品卡片（网格模式） ----
  const renderGridCard = (p) => {
    const photoUrl = p.photo ? getPhotoUrl(p.photo, 'products') : null
    return (
    <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        className={photoUrl ? 'clickable-thumb' : ''}
        onClick={() => photoUrl && setViewImage(photoUrl)}
        style={{
          width: '100%', aspectRatio: '1',
          background: photoUrl
            ? `url(${photoUrl}) center/cover`
            : 'linear-gradient(135deg, #e3ece0, #d5e0d0)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40,
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
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: p.color, border: '1px solid #ddd' }} />
            <span style={{ fontSize: 11, color: '#888' }}>{p.color}</span>
          </div>
        )}
      </div>
    </div>
    )
  }

  // ---- 渲染列表模式（分组 or 平铺） ----
  const renderList = (list) => list.map(p => (
    <ProductCard key={p.id} product={p} onEdit={() => handleEdit(p)} onDelete={() => handleDelete(p.id)} />
  ))

  const renderGrid = (list) => (
    <div className="product-grid">{list.map(renderGridCard)}</div>
  )

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}

      {/* 搜索栏 + 分类筛选 + 视图切换 */}
      <div className="search-bar">
        <input
          className="form-input"
          placeholder="搜索护肤品名称或品牌..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="form-input"
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{ width: 82, fontSize: 12 }}
        >
          {allCategories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          className="btn btn-sm"
          style={{ padding: '0 10px', fontSize: 16, flexShrink: 0, height: 40, background: 'var(--card-bg)', border: '1.5px solid var(--border)', borderRadius: 8, color: '#888', cursor: 'pointer' }}
          onClick={() => setShowAddCat(!showAddCat)}
          title="添加品类"
        >✚</button>
        <div className="view-toggle">
          <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')} title="列表">☰</button>
          <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')} title="网格">▦</button>
        </div>
      </div>

      {/* 添加品类输入框 */}
      {showAddCat && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <input
            className="form-input"
            placeholder="新品类名称..."
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            style={{ flex: 1 }}
            autoFocus
          />
          <button className="btn btn-primary btn-sm" onClick={addCategory}>添加</button>
          <button className="btn btn-sm" style={{ background: '#f5f5f5' }} onClick={() => { setShowAddCat(false); setNewCatName('') }}>取消</button>
        </div>
      )}

      {/* 自定义品类管理标签 */}
      {customCategories.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {customCategories.map(c => (
            <span key={c} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 10px', borderRadius: 14, fontSize: 12,
              background: '#e3ece0', color: '#6d7d64',
            }}>
              {c}
              <span
                style={{ cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                onClick={() => removeCategory(c)}
                title="删除品类"
              >×</span>
            </span>
          ))}
        </div>
      )}

      {/* 产品展示区 */}
      {loading ? (
        <div className="empty-state"><p>加载中...</p></div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🫧</div>
          <p>还没有护肤品，点击右下角 + 添加吧</p>
        </div>
      ) : grouped ? (
        /* ---- 分组展示（无搜索 + 全部分类） ---- */
        <div>
          {grouped.map(([cat, items]) => (
            <div key={cat} className="category-section">
              <div className="category-section-header">
                <span className="category-dot" />
                {cat}
                <span className="category-count">{items.length}</span>
              </div>
              {viewMode === 'list' ? renderList(items) : renderGrid(items)}
            </div>
          ))}
        </div>
      ) : (
        /* ---- 平铺展示（搜索或筛选单个分类） ---- */
        (viewMode === 'list' ? renderList(products) : renderGrid(products))
      )}

      {/* 添加/编辑 表单弹层 */}
      {showForm && (
        <ProductForm
          product={editingProduct}
          categories={DEFAULT_CATEGORIES.concat(customCategories)}
          onSubmit={handleSubmit}
          onClose={() => { setShowForm(false); setEditingProduct(null) }}
        />
      )}

      {/* FAB */}
      {!showForm && (
        <button className="fab" onClick={() => { setEditingProduct(null); setShowForm(true) }}>+</button>
      )}

      {/* 图片查看器 */}
      {viewImage && (
        <ImageViewer src={viewImage} onClose={() => setViewImage(null)} />
      )}
    </div>
  )
}
