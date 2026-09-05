import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Grid2X2, Search, SlidersHorizontal } from 'lucide-react'
import { createProduct, updateProduct, updateProductUsage, deleteProduct, getPhotoUrl } from '../api'
import ProductCategoryManager from '../components/ProductCategoryManager'
import ProductForm from '../components/ProductForm'
import RecognizePanel from '../components/RecognizePanel'
import ImageViewer from '../components/ImageViewer'
import ProductRecordActions from '../components/ProductRecordActions'
import ProductVoiceSheet from '../components/ProductVoiceSheet'
import ProductCatalogSheet from '../components/ProductCatalogSheet'
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
  loadShadeRecords,
  loadUsageRecords,
  saveShadeRecords,
  saveUsageRecords,
} from '../utils/productCatalog'
import { getRequestErrorMessage } from '../utils/productEntry'
import { usePageBackground } from '../utils/backgroundSettings'
import {
  ALL_PRODUCTS_CATEGORY,
} from './product/productData'
import {
  buildProductCardDisplayData,
  buildProductDetailDraft,
  buildProductDetailViewData,
  buildProductFormData,
  buildProductListView,
  countLowStockProducts,
  updateProductDraftField,
} from './product/productLogic'
import { useProductCollection } from './product/useProductCollection'
import { ProductDetailView } from './product/ProductDetailView'
import { ProductListCard } from './product/ProductListCard'

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
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    products,
    loading,
    loadError,
    reloadProducts,
    replaceProduct,
    updateProductUsage: updateProductUsageInCollection,
    upsertProduct,
  } = useProductCollection()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(ALL_PRODUCTS_CATEGORY)
  const [showSearch, setShowSearch] = useState(false)
  const [viewMode, setViewMode] = useState('list')
  const [showForm, setShowForm] = useState(false)
  const [showCatalogSheet, setShowCatalogSheet] = useState(false)
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
  const filterCategories = [ALL_PRODUCTS_CATEGORY, ...productCategories]

  useEffect(() => { reloadProducts() }, [reloadProducts])

  useEffect(() => {
    if (searchParams.get('add') !== '1') return

    setSelectedProduct(null)
    setShowForm(false)
    setEditingProduct(null)
    setInitialValues({})
    setShowSearch(false)
    setShowCatalogSheet(true)

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('add')
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    const handleToggleAddActions = () => {
      setSelectedProduct(null)
      setShowForm(false)
      setEditingProduct(null)
      setInitialValues({})
      setShowSearch(false)
      setShowCatalogSheet(value => !value)
    }

    window.addEventListener('beauty-mirror:toggle-product-add', handleToggleAddActions)
    return () => window.removeEventListener('beauty-mirror:toggle-product-add', handleToggleAddActions)
  }, [])

  useEffect(() => () => {
    if (petAnimationTimerRef.current) window.clearTimeout(petAnimationTimerRef.current)
  }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    window.setTimeout(() => setToast(null), 2000)
  }

  const openCatalogSheet = () => {
    setSelectedProduct(null)
    setShowForm(false)
    setEditingProduct(null)
    setInitialValues({})
    setShowSearch(false)
    setShowCatalogSheet(true)
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
      reloadProducts()
      if (isEditingSelected && nextProduct) setSelectedProduct(nextProduct)
    } catch (err) {
      showToast(getRequestErrorMessage(err), 'error')
      throw err
    }
  }

  const startDetailEdit = () => {
    if (!selectedProduct) return
    setDetailDraft(buildProductDetailDraft(selectedProduct, usageRecords))
    setDetailEditing(true)
  }

  const updateDetailDraft = (field, value) => {
    setDetailDraft(prev => updateProductDraftField(prev, field, value))
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
      replaceProduct(savedProduct)
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
    setShowCatalogSheet(false)
    setShowForm(true)
  }

  const handlePhotoPick = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setShowCatalogSheet(false)
    setRecognizePhoto({
      file,
      previewUrl: URL.createObjectURL(file),
    })
    event.target.value = ''
  }

  const handleRecognizeSaved = () => {
    setRecognizePhoto(null)
    showToast('产品添加成功')
    reloadProducts()
  }

  const startVoiceEntry = () => {
    setShowCatalogSheet(false)
    setShowVoiceEntry(true)
  }

  const handleCatalogAdded = (product) => {
    if (product) {
      upsertProduct(product)
    }
    showToast('已加入化妆柜')
    reloadProducts()
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
      reloadProducts()
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
    if (category === name) setCategory(ALL_PRODUCTS_CATEGORY)
    showToast('分类已删除')
  }

  const applyUsageRecord = (productId, value) => {
    const nextValue = Math.max(0, Math.min(100, Number(value) || 0))
    setUsageRecords(prev => {
      const next = { ...prev, [productId]: nextValue }
      saveUsageRecords(next)
      return next
    })
    updateProductUsageInCollection(productId, nextValue)
    setSelectedProduct(prev => (
      prev?.id === productId ? { ...prev, usage_percent: nextValue } : prev
    ))
    return nextValue
  }

  const persistUsageRecord = async (productId, value) => {
    const nextValue = applyUsageRecord(productId, value)
    try {
      const savedProduct = await updateProductUsage(productId, nextValue)
      replaceProduct(savedProduct)
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
    const displayData = buildProductCardDisplayData(product, usageRecords)

    return (
      <ProductListCard
        key={product.id}
        displayData={displayData}
        photoUrl={photoUrl}
        placeholderImage={getProductPlaceholderImage(product.category)}
        product={product}
        viewMode={viewMode}
        onDelete={() => handleDelete(product.id)}
        onEdit={() => {
          setSelectedProduct(displayData.displayProduct)
          setDetailDraft(buildProductDetailDraft(product, usageRecords, { includeLifecycleFields: false }))
          setDetailEditing(true)
        }}
        onImageOpen={() => photoUrl && setViewImage(photoUrl)}
        onOpen={() => setSelectedProduct(displayData.displayProduct)}
      />
    )
  }

  const {
    normalizedSearch,
    visibleProducts,
    grouped,
    isInitialLoading,
    isEmpty,
  } = useMemo(() => (
    buildProductListView(products, { category, search, loading })
  ), [products, category, search, loading])
  const lowStockCount = useMemo(() => (
    countLowStockProducts(products, usageRecords)
  ), [products, usageRecords])
  const petReminderText = lowStockCount > 0
    ? `还有 ${lowStockCount} 件产品快用完啦`
    : '现在没有快用完的产品'
  const showPetReminder = !isInitialLoading && !loadError && products.length > 0 && category === ALL_PRODUCTS_CATEGORY
  if (selectedProduct) {
    const photoUrl = selectedProduct.photo ? getPhotoUrl(selectedProduct.photo, 'products') : ''
    const detailViewData = buildProductDetailViewData(selectedProduct, {
      detailDraft,
      detailEditing,
      shadeRecords,
      usageRecords,
    })

    return (
      <div className="bm-screen bm-product-detail-page" style={pageBackground.style}>
        {toast && (
          <div className="toast-container">
            <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
          </div>
        )}

        <ProductDetailView
          actions={{
            onBack: () => {
              setSelectedProduct(null)
              cancelDetailEdit()
            },
            onCancelEdit: cancelDetailEdit,
            onDraftChange: updateDetailDraft,
            onImageOpen: () => photoUrl && setViewImage(photoUrl),
            onImageViewerClose: () => setViewImage(null),
            onRecordUsage: (nextUsagePercent) => {
              persistUsageRecord(selectedProduct.id, nextUsagePercent)
              showToast('已记录一次使用')
            },
            onSaveEdit: saveDetailEdit,
            onShadeChange: shade => updateShadeRecord(selectedProduct.id, shade),
            onStartEdit: startDetailEdit,
            onUsageChange: value => applyUsageRecord(selectedProduct.id, value),
            onUsageCommit: value => persistUsageRecord(selectedProduct.id, value),
          }}
          categories={DEFAULT_CATEGORIES.concat(customCategories)}
          detailDraft={detailDraft}
          detailEditing={detailEditing}
          detailSaving={detailSaving}
          detailViewData={detailViewData}
          photoUrl={photoUrl}
          placeholderImage={getProductPlaceholderImage(selectedProduct.category)}
          selectedProduct={selectedProduct}
          viewImage={viewImage}
        />
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
              onClick={() => {
                setShowSearch(value => !value)
                setShowCatalogSheet(false)
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
          <button className="bm-empty-category" type="button" onClick={reloadProducts}>
            重试
          </button>
        </section>
      ) : isEmpty ? (
        <section className="bm-product-empty">
          <img className="bm-empty-visual" src={productEmptyIllustration} alt="" aria-hidden="true" />
          <h2>开始建立你的美妆柜</h2>
          <p>优先从产品库搜索，一键加入；搜不到时再拍照或手动录入。</p>
          <div className="bm-empty-actions">
            <button className="bm-catalog-empty-primary" type="button" onClick={openCatalogSheet}>
              <Search size={18} strokeWidth={1.8} />
              从产品库添加
            </button>
            <ProductRecordActions
              className="bm-empty-secondary-actions"
              onCamera={() => cameraInputRef.current?.click()}
              onVoice={startVoiceEntry}
              onManual={() => openManualForm()}
            />
          </div>
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
        className="bm-hidden-file"
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

      {showCatalogSheet && (
        <ProductCatalogSheet
          categories={productCategories}
          cabinetProducts={products}
          getPlaceholderImage={getProductPlaceholderImage}
          onAdded={handleCatalogAdded}
          onCamera={() => cameraInputRef.current?.click()}
          onVoice={startVoiceEntry}
          onManual={() => openManualForm()}
          onClose={() => setShowCatalogSheet(false)}
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
