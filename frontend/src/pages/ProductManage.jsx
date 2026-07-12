import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ArrowLeft, CalendarDays, Check, ChevronRight, Edit3, Grid2X2, Pencil, PlusCircle, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { fetchProducts, createProduct, updateProduct, updateProductUsage, deleteProduct, getAnonymousUserId, getPhotoUrl } from '../api'
import ProductCategoryManager from '../components/ProductCategoryManager'
import ProductForm from '../components/ProductForm'
import RecognizePanel from '../components/RecognizePanel'
import ImageViewer from '../components/ImageViewer'
import ProductRecordActions from '../components/ProductRecordActions'
import ProductVoiceSheet from '../components/ProductVoiceSheet'
import productEmptyIllustration from '../assets/illustrations/beauty-mirror-ip/large-prop-product-cabinet-cutout.png'
import productPetMainIllustration from '../assets/ip/beauty-mirror-main-ip-main-layer.png'
import productPetDecorIllustration from '../assets/ip/beauty-mirror-main-ip-decor-layer.png'
import placeholderCleanser from '../assets/illustrations/product-placeholders/cleanser.png'
import placeholderToner from '../assets/illustrations/product-placeholders/toner.png'
import placeholderSerum from '../assets/illustrations/product-placeholders/serum.png'
import placeholderLotion from '../assets/illustrations/product-placeholders/lotion.png'
import placeholderCream from '../assets/illustrations/product-placeholders/cream.png'
import placeholderEyeCream from '../assets/illustrations/product-placeholders/eye-cream.png'
import placeholderSunscreen from '../assets/illustrations/product-placeholders/sunscreen.png'
import placeholderMask from '../assets/illustrations/product-placeholders/mask.png'
import placeholderFoundation from '../assets/illustrations/product-placeholders/foundation.png'
import placeholderConcealer from '../assets/illustrations/product-placeholders/concealer.png'
import placeholderPowder from '../assets/illustrations/product-placeholders/powder.png'
import placeholderEye from '../assets/illustrations/product-placeholders/eye.png'
import placeholderLip from '../assets/illustrations/product-placeholders/lip.png'
import placeholderBlush from '../assets/illustrations/product-placeholders/blush.png'
import placeholderTool from '../assets/illustrations/product-placeholders/tool.png'
import placeholderFragrance from '../assets/illustrations/product-placeholders/fragrance.png'
import placeholderSample from '../assets/illustrations/product-placeholders/sample.png'
import placeholderOther from '../assets/illustrations/product-placeholders/other.png'
import { DEFAULT_CATEGORIES, loadCustomCategories, saveCustomCategories } from '../categories'
import {
  DEFAULT_SHADE_SWATCHES,
  addYears,
  getDetailProfile,
  getProductUsagePercent,
  getProductStatus,
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
let productMemoryCacheUserId = ''

function normalizeProductList(data) {
  return Array.isArray(data) ? data : []
}

function readProductCache() {
  const userId = getAnonymousUserId()
  if (productMemoryCacheUserId === userId && productMemoryCache) return productMemoryCache
  if (typeof window === 'undefined') return []

  try {
    const cached = JSON.parse(window.sessionStorage.getItem(`${PRODUCT_CACHE_KEY}_${userId}`) || '[]')
    productMemoryCache = normalizeProductList(cached)
    productMemoryCacheUserId = userId
    return productMemoryCache
  } catch {
    return []
  }
}

function writeProductCache(products) {
  const userId = getAnonymousUserId()
  const nextProducts = normalizeProductList(products)
  productMemoryCache = nextProducts
  productMemoryCacheUserId = userId

  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(`${PRODUCT_CACHE_KEY}_${userId}`, JSON.stringify(nextProducts))
  } catch {
    // Cache is only for smoother navigation; ignore storage failures.
  }
}

function getPlaceholderKind(category = '') {
  const text = category || ''
  if (text.includes('洁面')) return 'cleanser'
  if (text.includes('爽肤水') || text.includes('化妆水')) return 'toner'
  if (text.includes('精华') || text.includes('小样')) return 'serum'
  if (text.includes('乳液')) return 'lotion'
  if (text.includes('面霜')) return 'cream'
  if (text.includes('眼霜')) return 'eyecream'
  if (text.includes('防晒')) return 'sunscreen'
  if (text.includes('面膜')) return 'mask'
  if (text.includes('底妆')) return 'foundation'
  if (text.includes('遮瑕')) return 'concealer'
  if (text.includes('定妆')) return 'powder'
  if (text.includes('眉眼') || text.includes('眼影') || text.includes('眉')) return 'eye'
  if (text.includes('唇妆') || text.includes('口红') || text.includes('唇')) return 'lip'
  if (text.includes('腮红') || text.includes('修容')) return 'blush'
  if (text.includes('工具')) return 'tool'
  if (text.includes('香氛') || text.includes('香水')) return 'fragrance'
  return 'other'
}

const PRODUCT_PLACEHOLDER_IMAGES = {
  cleanser: placeholderCleanser,
  toner: placeholderToner,
  serum: placeholderSerum,
  lotion: placeholderLotion,
  cream: placeholderCream,
  eyecream: placeholderEyeCream,
  sunscreen: placeholderSunscreen,
  mask: placeholderMask,
  foundation: placeholderFoundation,
  concealer: placeholderConcealer,
  powder: placeholderPowder,
  eye: placeholderEye,
  lip: placeholderLip,
  blush: placeholderBlush,
  tool: placeholderTool,
  fragrance: placeholderFragrance,
  other: placeholderOther,
}

function getProductPlaceholderImage(category = '') {
  if ((category || '').includes('小样')) return placeholderSample
  return PRODUCT_PLACEHOLDER_IMAGES[getPlaceholderKind(category)] || placeholderOther
}

function CategoryProductPlaceholder({ category }) {
  const kind = getPlaceholderKind(category)
  const sharedSparkles = (
    <g className="bm-ph-sparkles" aria-hidden="true">
      <path d="M18 22l2.5 5 5 2.5-5 2.5-2.5 5-2.5-5-5-2.5 5-2.5 2.5-5Z" />
      <path d="M78 17l1.7 3.4 3.4 1.7-3.4 1.7L78 27.2l-1.7-3.4-3.4-1.7 3.4-1.7L78 17Z" />
    </g>
  )

  return (
    <svg className={`bm-category-placeholder bm-category-placeholder-${kind}`} viewBox="0 0 96 86" aria-hidden="true">
      <path className="bm-ph-wash" d="M13 58c7-21 30-35 54-31 18 3 25 13 23 27-3 19-24 27-49 24-23-3-34-4-28-20Z" />
      <path className="bm-ph-ground" d="M23 72c13 5 39 5 54 0" />
      {sharedSparkles}

      {kind === 'cleanser' && (
        <g className="bm-ph-line">
          <path d="M35 25h25l4 9-4 35H34l-4-35 5-9Z" />
          <path d="M38 18h19l3 7H35l3-7Z" />
          <path d="M38 45c7 5 15 5 22 0" />
        </g>
      )}

      {kind === 'toner' && (
        <g className="bm-ph-line">
          <path d="M40 20h18l2 10c4 4 6 13 5 24-1 12-8 18-17 18s-16-6-17-18c-1-11 1-20 6-24l3-10Z" />
          <path d="M40 29c5 3 15 3 20 0" />
          <path d="M38 50c8 4 17 4 25 0" />
        </g>
      )}

      {kind === 'serum' && (
        <g className="bm-ph-line">
          <path d="M42 27h18l3 42H36l3-42h3Z" />
          <path d="M44 18h14v9H44z" />
          <path d="M49 12c3 0 6 2 6 6" />
          <path d="M45 49h10" />
          <path d="M50 44v10" />
        </g>
      )}

      {kind === 'lotion' && (
        <g className="bm-ph-line">
          <path d="M34 31h27c5 6 6 25 1 38H32c-5-13-4-32 2-38Z" />
          <path d="M40 20h15v11H40z" />
          <path d="M54 23h12" />
          <path d="M37 49c8 5 17 5 25 0" />
        </g>
      )}

      {kind === 'cream' && (
        <g className="bm-ph-line">
          <path d="M27 48c5-9 35-9 42 0v16c-6 10-36 10-42 0V48Z" />
          <path d="M29 49c9 7 30 7 39 0" />
          <path d="M34 39c8-5 23-5 31 0" />
        </g>
      )}

      {kind === 'eyecream' && (
        <g className="bm-ph-line">
          <path d="M26 51c9-11 35-11 44 0-8 12-36 12-44 0Z" />
          <path d="M43 51a6 6 0 1 0 12 0 6 6 0 0 0-12 0Z" />
          <path d="M40 29h20l4 12H36l4-12Z" />
        </g>
      )}

      {kind === 'sunscreen' && (
        <g className="bm-ph-line">
          <path d="M33 24h29l4 44H29l4-44Z" />
          <path d="M38 18h19l3 6H35l3-6Z" />
          <path d="M48 40v16" />
          <path d="M40 48h16" />
          <path d="M63 21l8-8" />
        </g>
      )}

      {kind === 'mask' && (
        <g className="bm-ph-line">
          <path d="M28 22h40l6 46H23l5-46Z" />
          <path d="M36 45c4-3 8-3 12 0 4-3 8-3 12 0" />
          <path d="M41 56c5 3 11 3 16 0" />
        </g>
      )}

      {kind === 'foundation' && (
        <g className="bm-ph-line">
          <path d="M39 31h20l5 38H34l5-38Z" />
          <path d="M42 18h14v13H42z" />
          <path d="M38 46c8 4 17 4 25 0" />
        </g>
      )}

      {kind === 'concealer' && (
        <g className="bm-ph-line">
          <path d="M31 58l27-36 9 7-27 36-9-7Z" />
          <path d="M57 20l8-10 9 7-8 10-9-7Z" />
          <path d="M34 54l9 7" />
        </g>
      )}

      {kind === 'powder' && (
        <g className="bm-ph-line">
          <path d="M25 45c9-12 38-12 48 0v15c-9 13-39 13-48 0V45Z" />
          <path d="M26 45c10 8 36 8 46 0" />
          <path d="M34 36c7-5 23-5 30 0" />
          <path d="M40 57h18" />
        </g>
      )}

      {kind === 'eye' && (
        <g className="bm-ph-line">
          <path d="M25 41c8-9 37-9 47 0v18c-10 9-38 9-47 0V41Z" />
          <path d="M32 46h10M44 46h10M56 46h10" />
          <path d="M28 61l40-20" />
        </g>
      )}

      {kind === 'lip' && (
        <g className="bm-ph-line">
          <path d="M33 65l18-35 13 6-18 35-13-6Z" />
          <path d="M50 29l5-16 10 5-2 17-13-6Z" />
          <path d="M37 57l13 6" />
        </g>
      )}

      {kind === 'blush' && (
        <g className="bm-ph-line">
          <path d="M29 43c8-13 35-13 43 0v18c-8 12-35 12-43 0V43Z" />
          <path d="M30 44c9 7 31 7 40 0" />
          <path d="M42 52c5-3 12-3 17 0" />
          <path d="M60 28l12-10" />
        </g>
      )}

      {kind === 'tool' && (
        <g className="bm-ph-line">
          <path d="M31 65l19-37 7 4-20 36-6-3Z" />
          <path d="M47 25c3-9 12-12 20-7-1 9-7 16-17 15l-3-8Z" />
          <path d="M58 50l12 17" />
          <path d="M70 50L58 67" />
        </g>
      )}

      {kind === 'fragrance' && (
        <g className="bm-ph-line">
          <path d="M38 31h22c6 7 7 29 1 38H37c-6-9-5-31 1-38Z" />
          <path d="M44 20h10v11H44z" />
          <path d="M42 49c5 4 12 4 17 0" />
          <path d="M62 23h9" />
        </g>
      )}

      {kind === 'other' && (
        <g className="bm-ph-line">
          <path d="M31 35c9-9 29-9 38 0v28c-8 10-30 10-38 0V35Z" />
          <path d="M38 28h23" />
          <path d="M41 46l7 7 14-15" />
        </g>
      )}
    </svg>
  )
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
  const [detailEditing, setDetailEditing] = useState(false)
  const [detailSaving, setDetailSaving] = useState(false)
  const [detailDraft, setDetailDraft] = useState({})
  const [usageRecords, setUsageRecords] = useState(loadUsageRecords)
  const [shadeRecords, setShadeRecords] = useState(loadShadeRecords)
  const [customCategories, setCustomCategories] = useState(loadCustomCategories)
  const cameraInputRef = useRef(null)
  const petRef = useRef(null)
  const petDragRef = useRef(null)
  const petAnimationTimerRef = useRef(null)
  const [petPosition, setPetPosition] = useState(null)
  const [petAnimating, setPetAnimating] = useState(false)

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

  useEffect(() => () => {
    if (petAnimationTimerRef.current) window.clearTimeout(petAnimationTimerRef.current)
  }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    window.setTimeout(() => setToast(null), 2000)
  }

  const clampPetPosition = (x, y, width, height) => {
    if (typeof window === 'undefined') return { x, y }
    const margin = 8
    return {
      x: Math.min(Math.max(margin, x), window.innerWidth - width - margin),
      y: Math.min(Math.max(margin, y), window.innerHeight - height - margin),
    }
  }

  const handlePetPointerDown = (event) => {
    if (event.button != null && event.button !== 0) return
    const node = petRef.current
    if (!node) return

    const rect = node.getBoundingClientRect()
    petDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    }
    setPetPosition({ x: rect.left, y: rect.top })
    node.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  const handlePetPointerMove = (event) => {
    const drag = petDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const next = clampPetPosition(
      drag.originX + event.clientX - drag.startX,
      drag.originY + event.clientY - drag.startY,
      drag.width,
      drag.height,
    )
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) {
      drag.moved = true
    }
    setPetPosition(next)
  }

  const handlePetPointerEnd = (event) => {
    const drag = petDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    petRef.current?.releasePointerCapture?.(event.pointerId)
    petDragRef.current = null

    if (!drag.moved && typeof window !== 'undefined') {
      if (petAnimationTimerRef.current) window.clearTimeout(petAnimationTimerRef.current)
      setPetAnimating(false)
      window.requestAnimationFrame(() => {
        setPetAnimating(true)
        petAnimationTimerRef.current = window.setTimeout(() => setPetAnimating(false), 650)
      })
    }
  }

  const handleSubmit = async (formData) => {
    try {
      const savedProduct = editingProduct
      const isEditingSelected = selectedProduct && savedProduct?.id === selectedProduct.id
      let nextProduct = null
      if (editingProduct) {
        nextProduct = await updateProduct(editingProduct.id, formData)
        showToast('产品更新成功')
      } else {
        nextProduct = await createProduct(formData)
        showToast('产品添加成功')
      }
      setShowForm(false)
      setEditingProduct(null)
      setInitialValues({})
      load()
      if (isEditingSelected && nextProduct) setSelectedProduct(nextProduct)
    } catch (err) {
      showToast(getRequestErrorMessage(err), 'error')
      throw err
    }
  }

  const buildProductFormData = (values, baseProduct = {}) => {
    const formData = new FormData()
    formData.append('name', (values.name ?? baseProduct.name ?? '').trim())
    formData.append('brand', (values.brand ?? baseProduct.brand ?? '').trim())
    formData.append('category', values.category ?? baseProduct.category ?? '其他')
    formData.append('color', (values.color ?? baseProduct.color ?? '').trim())
    formData.append('volume', (values.volume ?? baseProduct.volume ?? '').trim())
    formData.append('purchase_date', values.purchase_date ?? baseProduct.purchase_date ?? '')
    formData.append('price', values.price ?? baseProduct.price ?? 0)
    formData.append('notes', (values.notes ?? baseProduct.notes ?? '').trim())
    formData.append('usage_percent', values.usage_percent ?? baseProduct.usage_percent ?? 0)
    formData.append('ingredients', baseProduct.ingredients || '')
    formData.append('efficacy', baseProduct.efficacy || '')
    formData.append('suitable_skin', baseProduct.suitable_skin || '')
    formData.append('usage_instructions', baseProduct.usage_instructions || '')
    formData.append('source', baseProduct.source || 'manual')
    return formData
  }

  const startDetailEdit = () => {
    if (!selectedProduct) return
    setDetailDraft({
      name: selectedProduct.name || '',
      brand: selectedProduct.brand || '',
      category: selectedProduct.category || '其他',
      color: selectedProduct.color || '',
      volume: selectedProduct.volume || '',
      purchase_date: selectedProduct.purchase_date || '',
      price: selectedProduct.price || '',
      notes: selectedProduct.notes || '',
      usage_percent: getProductUsagePercent(selectedProduct, usageRecords),
    })
    setDetailEditing(true)
  }

  const updateDetailDraft = (field, value) => {
    setDetailDraft(prev => ({ ...prev, [field]: value }))
  }

  const cancelDetailEdit = () => {
    setDetailEditing(false)
    setDetailDraft({})
  }

  const saveDetailEdit = async () => {
    if (!selectedProduct) return
    if (!(detailDraft.name || '').trim()) {
      showToast('产品名称不能为空', 'error')
      return
    }
    setDetailSaving(true)
    try {
      const savedProduct = await updateProduct(
        selectedProduct.id,
        buildProductFormData(detailDraft, selectedProduct),
      )
      setProducts(prev => {
        const next = prev.map(product => (
          product.id === savedProduct.id ? { ...product, ...savedProduct } : product
        ))
        writeProductCache(next)
        return next
      })
      setSelectedProduct(savedProduct)
      setDetailEditing(false)
      setDetailDraft({})
      showToast('产品更新成功')
    } catch (err) {
      showToast(getRequestErrorMessage(err, '保存产品失败'), 'error')
    } finally {
      setDetailSaving(false)
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

  const applyUsageRecord = (productId, value) => {
    const nextValue = Math.max(0, Math.min(100, Number(value) || 0))
    setUsageRecords(prev => {
      const next = { ...prev, [productId]: nextValue }
      saveUsageRecords(next)
      return next
    })
    setProducts(prev => {
      const next = prev.map(product => (
        product.id === productId ? { ...product, usage_percent: nextValue } : product
      ))
      writeProductCache(next)
      return next
    })
    setSelectedProduct(prev => (
      prev?.id === productId ? { ...prev, usage_percent: nextValue } : prev
    ))
    return nextValue
  }

  const persistUsageRecord = async (productId, value) => {
    const nextValue = applyUsageRecord(productId, value)
    try {
      const savedProduct = await updateProductUsage(productId, nextValue)
      setProducts(prev => {
        const next = prev.map(product => (
          product.id === productId ? { ...product, ...savedProduct } : product
        ))
        writeProductCache(next)
        return next
      })
      setSelectedProduct(prev => (
        prev?.id === productId ? { ...prev, ...savedProduct } : prev
      ))
    } catch (err) {
      showToast(getRequestErrorMessage(err, '使用进度保存失败'), 'error')
    }
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
    const usagePercent = getProductUsagePercent(product, usageRecords)
    const displayProduct = { ...product, usage_percent: usagePercent }

    return (
      <article key={product.id} className={`bm-product-card ${viewMode === 'grid' ? 'bm-product-grid-card' : ''}`}>
        <button
          type="button"
          className={`bm-product-photo ${photoUrl ? '' : 'is-placeholder'}`}
          onClick={() => photoUrl && setViewImage(photoUrl)}
          style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
          aria-label={photoUrl ? '查看产品图片' : `${product.category || '产品'}占位插画`}
        >
          {!photoUrl && (
            <img
              className="bm-category-placeholder"
              src={getProductPlaceholderImage(product.category)}
              alt=""
              aria-hidden="true"
            />
          )}
        </button>
        <button type="button" className="bm-product-info" onClick={() => setSelectedProduct(displayProduct)}>
          <span className="bm-product-status">{getProductStatus(displayProduct)}</span>
          <h3>{product.name}</h3>
          <p>{product.brand || '未记录品牌'}</p>
          <div className="bm-product-tags">
            {product.volume && <span>容量 {product.volume}</span>}
            {product.color && <span>色号 {product.color}</span>}
            {usagePercent > 0 && <span>已用 {usagePercent}%</span>}
            {product.price > 0 && <span>¥{product.price}</span>}
          </div>
        </button>
        <div className="bm-product-actions">
          <button
            type="button"
            aria-label="编辑"
            onClick={() => {
              setSelectedProduct(displayProduct)
              setDetailDraft({
                name: product.name || '',
                brand: product.brand || '',
                category: product.category || '其他',
                color: product.color || '',
                volume: product.volume || '',
                purchase_date: product.purchase_date || '',
                price: product.price || '',
                notes: product.notes || '',
                usage_percent: usagePercent,
              })
              setDetailEditing(true)
            }}
          >
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
  const lowStockCount = useMemo(() => (
    products.filter(product => getProductUsagePercent(product, usageRecords) >= 80).length
  ), [products, usageRecords])
  const petReminderText = lowStockCount > 0
    ? `还有 ${lowStockCount} 件产品快用完啦`
    : '现在没有快用完的产品'
  const showPetReminder = !isInitialLoading && !loadError && products.length > 0 && category === '全部'
  if (selectedProduct) {
    const photoUrl = selectedProduct.photo ? getPhotoUrl(selectedProduct.photo, 'products') : ''
    const usagePercent = getProductUsagePercent(selectedProduct, usageRecords)
    const detailUsagePercent = detailEditing
      ? Math.max(0, Math.min(100, Number(detailDraft.usage_percent) || 0))
      : usagePercent
    const detailProduct = { ...selectedProduct, usage_percent: detailUsagePercent }
    const status = getProductStatus(detailProduct)
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
          <button
            type="button"
            className="bm-detail-back"
            onClick={() => {
              setSelectedProduct(null)
              cancelDetailEdit()
            }}
            aria-label="返回产品列表"
          >
            <ArrowLeft size={22} strokeWidth={1.8} />
          </button>
          <span className="bm-detail-count">1 / 1</span>
          <button
            type="button"
            className={`bm-detail-main-photo ${photoUrl ? '' : 'is-placeholder'}`}
            style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
            onClick={() => photoUrl && setViewImage(photoUrl)}
            aria-label="查看产品大图"
          >
            {!photoUrl && (
              <img
                className="bm-category-placeholder"
                src={getProductPlaceholderImage(selectedProduct.category)}
                alt=""
                aria-hidden="true"
              />
            )}
          </button>
        </section>

        <section className="bm-detail-content">
          <div className="bm-detail-heading">
            <div>
              {detailEditing ? (
                <input
                  className="bm-detail-title-input"
                  value={detailDraft.name || ''}
                  onChange={event => updateDetailDraft('name', event.target.value)}
                  placeholder="产品名称"
                />
              ) : (
                <h1>{selectedProduct.name || '未命名产品'}</h1>
              )}
              {detailEditing ? (
                <input
                  className="bm-detail-subtitle-input"
                  value={detailDraft.brand || ''}
                  onChange={event => updateDetailDraft('brand', event.target.value)}
                  placeholder="品牌"
                />
              ) : (
                <p>{detailProfile.summary || selectedProduct.category || '未记录分类'}</p>
              )}
            </div>
            <span className={`bm-detail-status ${status === '快用完' ? 'is-low' : status === '已过期' ? 'is-expired' : ''}`}>
              {status}
            </span>
          </div>

          <div className="bm-detail-facts" aria-label="产品信息">
            <div>
              <span>品牌</span>
              {detailEditing ? (
                <input value={detailDraft.brand || ''} onChange={event => updateDetailDraft('brand', event.target.value)} placeholder="品牌" />
              ) : (
                <strong>{selectedProduct.brand || '未记录'}</strong>
              )}
            </div>
            <div>
              <span>分类</span>
              {detailEditing ? (
                <select value={detailDraft.category || '其他'} onChange={event => updateDetailDraft('category', event.target.value)}>
                  {DEFAULT_CATEGORIES.concat(customCategories).map(item => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              ) : (
                <strong>{selectedProduct.category || '其他'}</strong>
              )}
            </div>
            <div>
              <span>规格</span>
              {detailEditing ? (
                <input value={detailDraft.volume || ''} onChange={event => updateDetailDraft('volume', event.target.value)} placeholder="30ml" />
              ) : (
                <strong>{selectedProduct.volume || '未记录'}</strong>
              )}
            </div>
            <div>
              <span>颜色 / 色号</span>
              {detailEditing ? (
                <input value={detailDraft.color || ''} onChange={event => updateDetailDraft('color', event.target.value)} placeholder="色号" />
              ) : (
                <strong>{selectedProduct.color || '未记录'}</strong>
              )}
            </div>
            <div>
              <span>购买日期</span>
              {detailEditing ? (
                <input type="date" value={detailDraft.purchase_date || ''} onChange={event => updateDetailDraft('purchase_date', event.target.value)} />
              ) : (
                <strong>{selectedProduct.purchase_date || '未记录'}</strong>
              )}
            </div>
            <div>
              <span>价格</span>
              {detailEditing ? (
                <input type="number" min="0" step="0.01" value={detailDraft.price ?? ''} onChange={event => updateDetailDraft('price', event.target.value)} placeholder="0" />
              ) : (
                <strong>{selectedProduct.price > 0 ? `¥${selectedProduct.price}` : '未记录'}</strong>
              )}
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
            <p className="bm-usage-copy">已使用 {detailUsagePercent}%</p>
            <input
              className="bm-usage-slider"
              type="range"
              min="0"
              max="100"
              step="1"
              value={detailUsagePercent}
              style={{ '--usage-value': `${detailUsagePercent}%` }}
              onChange={event => {
                if (detailEditing) {
                  updateDetailDraft('usage_percent', event.target.value)
                } else {
                  applyUsageRecord(selectedProduct.id, event.target.value)
                }
              }}
              onPointerUp={event => {
                if (!detailEditing) persistUsageRecord(selectedProduct.id, event.currentTarget.value)
              }}
              onKeyUp={event => {
                if (!detailEditing) persistUsageRecord(selectedProduct.id, event.currentTarget.value)
              }}
              onBlur={event => {
                if (!detailEditing) persistUsageRecord(selectedProduct.id, event.currentTarget.value)
              }}
              aria-label="调整产品使用进度"
            />
          </div>

          <div className="bm-detail-list">
            <div>
              <CalendarDays size={17} strokeWidth={1.7} />
              <span>备注</span>
              {detailEditing ? (
                <textarea
                  value={detailDraft.notes || ''}
                  onChange={event => updateDetailDraft('notes', event.target.value)}
                  placeholder="使用感受、适合肤质..."
                />
              ) : (
                <p>{selectedProduct.notes || '还没有记录使用感、妆效或回购想法。'}</p>
              )}
              <button
                type="button"
                aria-label="编辑备注"
                onClick={startDetailEdit}
              >
                <Pencil size={16} strokeWidth={1.7} />
              </button>
            </div>
            {expiryDate && (
              <div>
                <CalendarDays size={17} strokeWidth={1.7} />
                <span>预计到期</span>
                <p>{expiryDate}</p>
                <ChevronRight size={16} strokeWidth={1.7} />
              </div>
            )}
          </div>
        </section>

        <div className="bm-detail-actions">
          {detailEditing ? (
            <>
              <button type="button" onClick={cancelDetailEdit}>
                <X size={18} strokeWidth={1.8} />
                取消
              </button>
              <button type="button" className="primary" onClick={saveDetailEdit} disabled={detailSaving}>
                <Check size={18} strokeWidth={1.8} />
                {detailSaving ? '保存中' : '保存'}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={startDetailEdit}>
                <Pencil size={18} strokeWidth={1.8} />
                编辑
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  persistUsageRecord(selectedProduct.id, usagePercent + 5)
                  showToast('已记录一次使用')
                }}
              >
                <PlusCircle size={18} strokeWidth={1.8} />
                记录使用
              </button>
            </>
          )}
        </div>

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
              className={showAddActions ? 'active' : ''}
              onClick={() => {
                setShowAddActions(value => !value)
                setShowSearch(false)
              }}
              aria-label="添加产品"
            >
              <PlusCircle size={21} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className={showSearch ? 'active' : ''}
              onClick={() => {
                setShowSearch(value => !value)
                setShowAddActions(false)
              }}
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

        {showAddActions && (
          <div className="bm-vault-add-popover" role="dialog" aria-label="快速添加产品">
            <ProductRecordActions
              className="bm-vault-add-actions"
              onCamera={() => cameraInputRef.current?.click()}
              onVoice={startVoiceEntry}
              onManual={() => openManualForm()}
            />
          </div>
        )}

      </section>

      {showPetReminder && (
        <section
          ref={petRef}
          className={`bm-vault-pet ${lowStockCount > 0 ? 'is-alert' : ''} ${petAnimating ? 'is-dancing' : ''}`}
          style={petPosition ? { left: petPosition.x, top: petPosition.y, bottom: 'auto' } : undefined}
          aria-label="库存提醒桌宠，可拖动"
          onPointerDown={handlePetPointerDown}
          onPointerMove={handlePetPointerMove}
          onPointerUp={handlePetPointerEnd}
          onPointerCancel={handlePetPointerEnd}
        >
          <div className="bm-vault-pet-avatar" aria-hidden="true">
            <img
              className="bm-vault-pet-image bm-vault-pet-main"
              src={productPetMainIllustration}
              alt=""
              draggable="false"
            />
            <img
              className="bm-vault-pet-image bm-vault-pet-dress"
              src={productPetMainIllustration}
              alt=""
              draggable="false"
            />
            <img
              className="bm-vault-pet-image bm-vault-pet-decor"
              src={productPetDecorIllustration}
              alt=""
              draggable="false"
            />
          </div>
          <div className="bm-vault-pet-bubble">
            <strong>{petReminderText}</strong>
            <span>{lowStockCount > 0 ? '记得安排补货，别让常用款断档。' : '今天的美妆柜状态很稳。'}</span>
          </div>
        </section>
      )}

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
          <img className="bm-empty-visual" src={productEmptyIllustration} alt="" aria-hidden="true" />
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
