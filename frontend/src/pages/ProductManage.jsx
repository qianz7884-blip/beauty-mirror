import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ArrowLeft, CalendarDays, ChevronRight, Edit3, Grid2X2, MapPin, Pencil, Plus, PlusCircle, Search, SlidersHorizontal, Trash2 } from 'lucide-react'
import { fetchProducts, createProduct, updateProduct, deleteProduct, getPhotoUrl } from '../api'
import ProductAddSheet from '../components/ProductAddSheet'
import ProductCategoryManager from '../components/ProductCategoryManager'
import ProductForm from '../components/ProductForm'
import RecognizePanel from '../components/RecognizePanel'
import ImageViewer from '../components/ImageViewer'
import ProductRecordActions from '../components/ProductRecordActions'
import ProductVoiceSheet from '../components/ProductVoiceSheet'
import { DEFAULT_CATEGORIES, loadCustomCategories, saveCustomCategories } from '../categories'
import {
  DEFAULT_SHADE_SWATCHES,
  addYears,
  getDetailProfile,
  getProductStatus,
  getUsageEstimate,
  groupByCategory,
  isHexColor,
  loadShadeRecords,
  loadUsageRecords,
  saveShadeRecords,
  saveUsageRecords,
} from '../utils/productCatalog'
import { getRequestErrorMessage } from '../utils/productEntry'
import { usePageBackground } from '../utils/backgroundSettings'

const PRODUCT_CACHE_KEY = 'beauty_mirror_products_cache_v1'
let productMemoryCache = null

function normalizeProductList(data) {
  return Array.isArray(data) ? data : []
}

function readProductCache() {
  if (productMemoryCache) return productMemoryCache
  if (typeof window === 'undefined') return []

  try {
    const cached = JSON.parse(window.sessionStorage.getItem(PRODUCT_CACHE_KEY) || '[]')
    productMemoryCache = normalizeProductList(cached)
    return productMemoryCache
  } catch {
    return []
  }
}

function writeProductCache(products) {
  const nextProducts = normalizeProductList(products)
  productMemoryCache = nextProducts

  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(nextProducts))
  } catch {
    // Cache is only for smoother navigation; ignore storage failures.
  }
}

function ProductListSkeleton() {
  return (
    <section className="bm-product-skeleton" aria-label="正在加载产品">
      <div className="bm-skeleton-category" />
      {[0, 1, 2].map(item => (
        <div className="bm-skeleton-card" key={item}>
          <div className="bm-skeleton-photo" />
          <div className="bm-skeleton-copy">
            <span />
            <strong />
            <em />
            <i />
          </div>
          <div className="bm-skeleton-actions" />
        </div>
      ))}
    </section>
  )
}

export default function ProductManage() {
  const pageBackground = usePageBackground('products')
  const [products, setProducts] = useState(() => readProductCache())
  const [loading, setLoading] = useState(() => readProductCache().length === 0)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('全部')
  const [showSearch, setShowSearch] = useState(false)
  const [viewMode, setViewMode] = useState('list')
  const [showForm, setShowForm] = useState(false)
  const [showAddActions, setShowAddActions] = useState(false)
  const [showVoiceEntry, setShowVoiceEntry] = useState(false)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [editingProduct, setEditingProduct] = useState(null)
  const [recognizePhoto, setRecognizePhoto] = useState(null)
  const [initialValues, setInitialValues] = useState({})
  const [toast, setToast] = useState(null)
  const [viewImage, setViewImage] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [usageRecords, setUsageRecords] = useState(loadUsageRecords)
  const [shadeRecords, setShadeRecords] = useState(loadShadeRecords)
  const [customCategories, setCustomCategories] = useState(loadCustomCategories)
  const cameraInputRef = useRef(null)

  const productCategories = [...DEFAULT_CATEGORIES, ...customCategories]
  const filterCategories = ['全部', ...productCategories]

  const load = useCallback(() => {
    setLoading(true)
    setLoadError('')
    fetchProducts()
      .then((data) => {
        const nextProducts = normalizeProductList(data)
        setProducts(nextProducts)
        writeProductCache(nextProducts)
      })
      .catch((err) => {
        setLoadError(getRequestErrorMessage(err, '无法加载产品，请检查后端是否启动'))
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    window.setTimeout(() => setToast(null), 2000)
  }

  const handleSubmit = async (formData) => {
    try {
      const savedProduct = editingProduct
      const isEditingSelected = selectedProduct && savedProduct?.id === selectedProduct.id
      if (editingProduct) {
        await updateProduct(editingProduct.id, formData)
        showToast('产品更新成功')
      } else {
        await createProduct(formData)
        showToast('产品添加成功')
      }
      setShowForm(false)
      setEditingProduct(null)
      setInitialValues({})
      load()
      if (isEditingSelected) setSelectedProduct(null)
    } catch (err) {
      showToast(getRequestErrorMessage(err), 'error')
      throw err
    }
  }

  const openManualForm = (values = {}) => {
    setEditingProduct(null)
    setInitialValues(values)
    setShowAddActions(false)
    setShowForm(true)
  }

  const handlePhotoPick = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setShowAddActions(false)
    setRecognizePhoto({
      file,
      previewUrl: URL.createObjectURL(file),
    })
    event.target.value = ''
  }

  const handleRecognizeSaved = () => {
    setRecognizePhoto(null)
    showToast('产品添加成功')
    load()
  }

  const startVoiceEntry = () => {
    setShowAddActions(false)
    setShowVoiceEntry(true)
  }

  const handleVoiceResult = (values) => {
    setShowVoiceEntry(false)
    openManualForm(values)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这个产品吗？')) return
    try {
      await deleteProduct(id)
      showToast('产品已删除')
      load()
    } catch {
      showToast('删除失败', 'error')
    }
  }

  const addCategory = () => {
    const nextName = newCategory.trim()
    if (!nextName) return
    if (productCategories.includes(nextName)) {
      showToast('这个分类已经存在', 'error')
      return
    }
    const updated = [...customCategories, nextName]
    setCustomCategories(updated)
    saveCustomCategories(updated)
    setNewCategory('')
    setCategory(nextName)
    showToast('分类已添加')
  }

  const deleteCustomCategory = (name) => {
    const inUse = products.some(product => product.category === name)
    if (inUse && !window.confirm('这个分类下已有产品。删除分类后，产品仍会保留原分类名称，确定删除吗？')) return
    const updated = customCategories.filter(cat => cat !== name)
    setCustomCategories(updated)
    saveCustomCategories(updated)
    if (category === name) setCategory('全部')
    showToast('分类已删除')
  }

  const updateUsageRecord = (productId, value) => {
    const nextValue = Math.max(0, Math.min(100, Number(value) || 0))
    setUsageRecords(prev => {
      const next = { ...prev, [productId]: nextValue }
      saveUsageRecords(next)
      return next
    })
  }

  const updateShadeRecord = (productId, value) => {
    setShadeRecords(prev => {
      const next = { ...prev, [productId]: value }
      saveShadeRecords(next)
      return next
    })
  }

  const renderProductCard = (product) => {
    const photoUrl = product.photo ? getPhotoUrl(product.photo, 'products') : ''

    return (
      <article key={product.id} className={`bm-product-card ${viewMode === 'grid' ? 'bm-product-grid-card' : ''}`}>
        <button
          type="button"
          className={`bm-product-photo ${photoUrl ? '' : 'is-placeholder'}`}
          onClick={() => photoUrl && setViewImage(photoUrl)}
          style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
          aria-label="查看产品图片"
        />
        <button type="button" className="bm-product-info" onClick={() => setSelectedProduct(product)}>
          <span className="bm-product-status">{getProductStatus(product)}</span>
          <h3>{product.name}</h3>
          <p>{product.brand || '未记录品牌'}</p>
          <div className="bm-product-tags">
            {product.volume && <span>容量 {product.volume}</span>}
            {product.color && <span>色号 {product.color}</span>}
            {product.price > 0 && <span>¥{product.price}</span>}
          </div>
        </button>
        <div className="bm-product-actions">
          <button type="button" aria-label="编辑" onClick={() => { setInitialValues({}); setEditingProduct(product); setShowForm(true) }}>
            <Edit3 size={17} strokeWidth={1.7} />
          </button>
          <button type="button" aria-label="删除" onClick={() => handleDelete(product.id)}>
            <Trash2 size={17} strokeWidth={1.7} />
          </button>
        </div>
      </article>
    )
  }

  const normalizedSearch = search.trim().toLowerCase()
  const visibleProducts = useMemo(() => (
    products.filter(product => {
      const matchesCategory = category === '全部' || product.category === category
      if (!matchesCategory) return false
      if (!normalizedSearch) return true

      return [
        product.name,
        product.brand,
        product.category,
        product.volume,
        product.color,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch)
    })
  ), [products, category, normalizedSearch])
  const grouped = !normalizedSearch && category === '全部' ? groupByCategory(visibleProducts) : null
  const isInitialLoading = loading && products.length === 0
  const isEmpty = !isInitialLoading && visibleProducts.length === 0

  if (selectedProduct) {
    const photoUrl = selectedProduct.photo ? getPhotoUrl(selectedProduct.photo, 'products') : ''
    const status = getProductStatus(selectedProduct)
    const usagePercent = usageRecords[selectedProduct.id] ?? getUsageEstimate(status)
    const expiryDate = addYears(selectedProduct.purchase_date, 2)
    const colorIsHex = isHexColor(selectedProduct.color)
    const selectedShade = shadeRecords[selectedProduct.id] || (colorIsHex ? selectedProduct.color : DEFAULT_SHADE_SWATCHES[0])
    const detailProfile = getDetailProfile(selectedProduct)
    const showShadeRow = detailProfile.kind === 'shade'

    return (
      <div className="bm-screen bm-product-detail-page" style={pageBackground.style}>
        {toast && (
          <div className="toast-container">
            <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
          </div>
        )}

        <section className="bm-detail-hero">
          <button type="button" className="bm-detail-back" onClick={() => setSelectedProduct(null)} aria-label="返回产品列表">
            <ArrowLeft size={22} strokeWidth={1.8} />
          </button>
          <span className="bm-detail-count">1 / 1</span>
          <button
            type="button"
            className={`bm-detail-main-photo ${photoUrl ? '' : 'is-placeholder'}`}
            style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
            onClick={() => photoUrl && setViewImage(photoUrl)}
            aria-label="查看产品大图"
          />
        </section>

        <section className="bm-detail-content">
          <div className="bm-detail-heading">
            <div>
              <h1>{selectedProduct.name || '未命名产品'}</h1>
              <p>{detailProfile.summary || selectedProduct.category || '未记录分类'}</p>
            </div>
            <span className={`bm-detail-status ${status === '快用完' ? 'is-low' : status === '已过期' ? 'is-expired' : ''}`}>
              {status}
            </span>
          </div>

          <div className="bm-detail-facts" aria-label="产品信息">
            <div>
              <span>购买价格</span>
              <strong>{selectedProduct.price > 0 ? `¥${selectedProduct.price}` : '未记录'}</strong>
            </div>
            <div>
              <span>规格</span>
              <strong>{selectedProduct.volume || '未记录'}</strong>
            </div>
            <div>
              <span>购买日期</span>
              <strong>{selectedProduct.purchase_date || '未记录'}</strong>
            </div>
            <div>
              <span>预计到期</span>
              <strong>{expiryDate || '未记录'}</strong>
            </div>
          </div>

          <div className="bm-detail-panel">
            <div className="bm-detail-panel-title">
              <strong>{detailProfile.title}</strong>
              <span>{detailProfile.value}</span>
            </div>
            {showShadeRow ? (
              <div className="bm-shade-row">
                {[...new Set([colorIsHex ? selectedProduct.color : null, ...DEFAULT_SHADE_SWATCHES].filter(Boolean))].map(shade => (
                  <button
                    key={shade}
                    type="button"
                    className={`bm-shade ${selectedShade === shade ? 'active' : ''}`}
                    style={{ background: shade }}
                    onClick={() => updateShadeRecord(selectedProduct.id, shade)}
                    aria-label={`选择色号 ${shade}`}
                  />
                ))}
                <label className="bm-shade-picker" aria-label="自定义色号颜色">
                  <input
                    type="color"
                    value={selectedShade}
                    onChange={event => updateShadeRecord(selectedProduct.id, event.target.value)}
                  />
                  <span>自选</span>
                </label>
              </div>
            ) : (
              <p className="bm-detail-field-copy">{detailProfile.value}</p>
            )}
          </div>

          <div className="bm-detail-panel">
            <div className="bm-detail-panel-title">
              <strong>使用记录</strong>
              <span>手动滑动记录</span>
            </div>
            <p className="bm-usage-copy">已使用 {usagePercent}%</p>
            <input
              className="bm-usage-slider"
              type="range"
              min="0"
              max="100"
              step="1"
              value={usagePercent}
              style={{ '--usage-value': `${usagePercent}%` }}
              onChange={event => updateUsageRecord(selectedProduct.id, event.target.value)}
              aria-label="调整产品使用进度"
            />
          </div>

          <div className="bm-detail-list">
            <div>
              <CalendarDays size={17} strokeWidth={1.7} />
              <span>备注</span>
              <p>{selectedProduct.notes || '还没有记录使用感、妆效或回购想法。'}</p>
              <button
                type="button"
                aria-label="编辑备注"
                onClick={() => {
                  setInitialValues({})
                  setEditingProduct(selectedProduct)
                  setShowForm(true)
                }}
              >
                <Pencil size={16} strokeWidth={1.7} />
              </button>
            </div>
            <div>
              <MapPin size={17} strokeWidth={1.7} />
              <span>存放位置</span>
              <p>未记录</p>
              <ChevronRight size={16} strokeWidth={1.7} />
            </div>
          </div>
        </section>

        <div className="bm-detail-actions">
          <button
            type="button"
            onClick={() => {
              setInitialValues({})
              setEditingProduct(selectedProduct)
              setShowForm(true)
            }}
          >
            <Pencil size={18} strokeWidth={1.8} />
            编辑
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              updateUsageRecord(selectedProduct.id, usagePercent + 5)
              showToast('已记录一次使用')
            }}
          >
            <PlusCircle size={18} strokeWidth={1.8} />
            记录使用
          </button>
        </div>

        {showForm && (
          <ProductForm
            product={editingProduct}
            categories={DEFAULT_CATEGORIES.concat(customCategories)}
            initialValues={initialValues}
            onSubmit={handleSubmit}
            onClose={() => { setShowForm(false); setEditingProduct(null); setInitialValues({}) }}
          />
        )}

        {viewImage && (
          <ImageViewer src={viewImage} onClose={() => setViewImage(null)} />
        )}
      </div>
    )
  }

  return (
    <div className="bm-screen bm-vault" style={pageBackground.style}>
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}

      <section className="bm-vault-simple-head">
        <div className="bm-vault-title-row">
          <div>
            <h1>我的产品</h1>
            <p>管理你的美妆库存</p>
          </div>
          <div className="bm-vault-head-actions">
            <button
              type="button"
              className={showSearch ? 'active' : ''}
              onClick={() => setShowSearch(value => !value)}
              aria-label="搜索"
            >
              <Search size={21} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
              aria-label={viewMode === 'list' ? '切换网格视图' : '切换列表视图'}
            >
              {viewMode === 'list'
                ? <SlidersHorizontal size={22} strokeWidth={1.9} />
                : <Grid2X2 size={20} strokeWidth={1.9} />}
            </button>
          </div>
        </div>

        {showSearch && (
          <label className="bm-vault-search-inline">
            <Search size={17} strokeWidth={1.7} />
            <input
              autoFocus
              placeholder="搜索品牌或产品名"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </label>
        )}

        <div className="bm-vault-tabs" role="tablist" aria-label="产品分类">
          {filterCategories.map(tab => (
            <button
              key={tab}
              type="button"
              className={category === tab ? 'active' : ''}
              onClick={() => setCategory(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

      </section>

      {isInitialLoading ? (
        <ProductListSkeleton />
      ) : loadError && products.length === 0 ? (
        <section className="bm-product-empty">
          <h2>产品加载失败</h2>
          <p>{loadError}</p>
          <button className="bm-empty-category" type="button" onClick={load}>
            重试
          </button>
        </section>
      ) : isEmpty ? (
        <section className="bm-product-empty">
          <svg className="bm-empty-visual" viewBox="0 0 220 150" aria-hidden="true">
            <path className="wash wash-blue" d="M43 94c12-25 43-39 78-35 35 3 62 21 62 41 0 22-34 33-75 30-42-3-77-13-65-36Z" />
            <path className="wash wash-rose" d="M132 42c17-13 43-9 52 7 8 15-4 31-27 32-22 1-38-9-37-23 1-7 5-12 12-16Z" />
            <g className="line-art">
              <path d="M49 111c31 11 88 15 135-2" />
              <path className="rose-line" d="M59 64l21 9-16 37-21-9 16-37Z" />
              <path className="rose-line" d="M66 48l19 8-6 16-21-9 8-15Z" />
              <path className="rose-line" d="M77 31l17 7-9 18-19-8 11-17Z" />
              <path className="rose-line" d="M58 82l16 7" />

              <path d="M103 46c9-6 26-6 36 0 5 17 4 47-3 65-10 5-26 4-36-2-4-19-3-46 3-63Z" />
              <path d="M104 51c9 6 26 7 35 0" />
              <path d="M100 103c10 7 27 8 36 2" />
              <path d="M115 39c3-5 11-5 14 0" />

              <path d="M151 69c9-8 27-8 36 1 5 11 1 27-9 35-9 6-26 3-33-7-4-9-2-22 6-29Z" />
              <path d="M150 75c10 7 28 7 38 0" />
              <path d="M149 94c9 6 23 7 32 2" />
              <path className="sage-line" d="M172 57c12 4 22 12 29 24" />
              <path className="sage-line" d="M183 62c-6 8-14 13-24 15" />
            </g>
            <g className="sparkles">
              <path d="M39 53l4 8 8 4-8 4-4 8-4-8-8-4 8-4 4-8Z" />
              <path d="M188 100l3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z" />
            </g>
          </svg>
          <h2>开始建立你的美妆柜</h2>
          <p>选择一种记录方式，之后都可以继续修改。</p>
          <ProductRecordActions
            className="bm-empty-actions"
            onCamera={() => cameraInputRef.current?.click()}
            onVoice={startVoiceEntry}
            onManual={() => openManualForm()}
          />
          <button className="bm-empty-category" type="button" onClick={() => setShowCategoryManager(true)}>
            先管理分类
          </button>
        </section>
      ) : grouped ? (
        <div className="bm-category-stack">
          {grouped.map(([groupName, groupProducts], index) => (
            <section key={groupName} className={`bm-category ${index === 0 ? 'bm-category-first' : ''}`}>
              <div className="bm-category-head">
                <span className="bm-category-icon" />
                <h2>{groupName}</h2>
                <em>{groupProducts.length}</em>
              </div>
              <div className={viewMode === 'grid' ? 'bm-product-grid' : 'bm-product-list'}>
                {groupProducts.map(renderProductCard)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="bm-category bm-category-first">
          <div className={viewMode === 'grid' ? 'bm-product-grid' : 'bm-product-list'}>
            {visibleProducts.map(renderProductCard)}
          </div>
        </section>
      )}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handlePhotoPick}
      />

      {!isEmpty && (
        <>
          <button className="bm-add-product" type="button" onClick={() => setShowAddActions(true)}>
            <Plus size={18} /> 添加产品
          </button>
          <button className="bm-add-category" type="button" onClick={() => setShowCategoryManager(true)}>管理分类</button>
        </>
      )}

      {showAddActions && (
        <ProductAddSheet
          onClose={() => setShowAddActions(false)}
          onCamera={() => cameraInputRef.current?.click()}
          onVoice={startVoiceEntry}
          onManual={() => openManualForm()}
        />
      )}

      {showVoiceEntry && (
        <ProductVoiceSheet
          onClose={() => setShowVoiceEntry(false)}
          onResult={handleVoiceResult}
        />
      )}

      {recognizePhoto && (
        <RecognizePanel
          photoFile={recognizePhoto.file}
          previewUrl={recognizePhoto.previewUrl}
          categories={DEFAULT_CATEGORIES.concat(customCategories)}
          onSaved={handleRecognizeSaved}
          onClose={() => setRecognizePhoto(null)}
        />
      )}

      {showForm && (
        <ProductForm
          product={editingProduct}
          categories={DEFAULT_CATEGORIES.concat(customCategories)}
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onClose={() => { setShowForm(false); setEditingProduct(null); setInitialValues({}) }}
        />
      )}

      {showCategoryManager && (
        <ProductCategoryManager
          customCategories={customCategories}
          newCategory={newCategory}
          onNewCategoryChange={setNewCategory}
          onAddCategory={addCategory}
          onDeleteCategory={deleteCustomCategory}
          onClose={() => setShowCategoryManager(false)}
        />
      )}

      {viewImage && (
        <ImageViewer src={viewImage} onClose={() => setViewImage(null)} />
      )}
    </div>
  )
}
