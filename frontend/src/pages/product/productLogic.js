import {
  DEFAULT_SHADE_SWATCHES,
  addMonthsToDate,
  formatProductPrice,
  getDetailProfile,
  getProductExpiryDate,
  getProductStatus,
  getProductUsagePercent,
  groupByCategory,
  isHexColor,
  normalizePriceInput,
} from '../../utils/productCatalog'
import {
  ALL_PRODUCTS_CATEGORY,
  PRODUCT_DETAIL_TAG_FIELDS,
  PRODUCT_KNOWLEDGE_FIELDS,
} from './productData'

export function normalizeProductList(data) {
  return Array.isArray(data) ? data : []
}

export function parseTagText(value) {
  return String(value || '')
    .split(/[、,，/]/)
    .map(item => item.trim())
    .filter(Boolean)
}

export function serializeTagText(value) {
  return parseTagText(value).join('、')
}

export function toggleTagValue(value, option) {
  const selected = parseTagText(value)
  const next = selected.includes(option)
    ? selected.filter(item => item !== option)
    : [...selected, option]
  return serializeTagText(next)
}

export function buildProductFormData(values, baseProduct = {}) {
  const formData = new FormData()
  formData.append('name', (values.name ?? baseProduct.name ?? '').trim())
  formData.append('brand', (values.brand ?? baseProduct.brand ?? '').trim())
  formData.append('category', values.category ?? baseProduct.category ?? '其他')
  formData.append('color', (values.color ?? baseProduct.color ?? '').trim())
  formData.append('volume', (values.volume ?? baseProduct.volume ?? '').trim())
  formData.append('production_date', values.production_date ?? baseProduct.production_date ?? '')
  formData.append('shelf_life_months', values.shelf_life_months ?? baseProduct.shelf_life_months ?? 0)
  formData.append('purchase_date', values.purchase_date ?? baseProduct.purchase_date ?? '')
  formData.append(
    'expiry_date',
    values.expiry_date
      || baseProduct.expiry_date
      || addMonthsToDate(values.production_date ?? baseProduct.production_date, values.shelf_life_months ?? baseProduct.shelf_life_months)
      || '',
  )
  formData.append('price', values.price ?? baseProduct.price ?? 0)
  formData.append('notes', (values.notes ?? baseProduct.notes ?? '').trim())
  formData.append('usage_percent', values.usage_percent ?? baseProduct.usage_percent ?? 0)
  formData.append('ingredients', baseProduct.ingredients || '')
  formData.append('efficacy', baseProduct.efficacy || '')
  formData.append('suitable_skin', baseProduct.suitable_skin || '')
  formData.append('usage_instructions', baseProduct.usage_instructions || '')
  formData.append('usage_steps', values.usage_steps ?? baseProduct.usage_steps ?? '')
  formData.append('product_features', values.product_features ?? baseProduct.product_features ?? '')
  formData.append('suitable_regions', values.suitable_regions ?? baseProduct.suitable_regions ?? '')
  formData.append('suitable_scenes', values.suitable_scenes ?? baseProduct.suitable_scenes ?? '')
  formData.append('user_feedback', values.user_feedback ?? baseProduct.user_feedback ?? '')
  formData.append('source', baseProduct.source || 'manual')
  return formData
}

export function buildProductDetailDraft(product, usageRecords = {}, options = {}) {
  const includeLifecycleFields = options.includeLifecycleFields !== false
  const draft = {
    name: product.name || '',
    brand: product.brand || '',
    category: product.category || '其他',
    color: product.color || '',
    volume: product.volume || '',
  }

  if (includeLifecycleFields) {
    draft.production_date = product.production_date || ''
    draft.shelf_life_months = product.shelf_life_months || ''
  }

  return {
    ...draft,
    purchase_date: product.purchase_date || '',
    expiry_date: product.expiry_date || '',
    price: normalizePriceInput(product.price),
    notes: product.notes || '',
    usage_percent: getProductUsagePercent(product, usageRecords),
    usage_steps: product.usage_steps || '',
    product_features: product.product_features || '',
    suitable_regions: product.suitable_regions || '',
    suitable_scenes: product.suitable_scenes || '',
    user_feedback: product.user_feedback || '',
  }
}

export function updateProductDraftField(previousDraft, field, value) {
  const next = { ...previousDraft, [field]: value }
  if (field === 'production_date' || field === 'shelf_life_months') {
    const nextExpiry = addMonthsToDate(next.production_date, next.shelf_life_months)
    if (nextExpiry) next.expiry_date = nextExpiry
  }
  return next
}

export function normalizeProductSearch(search) {
  return search.trim().toLowerCase()
}

export function filterProducts(products, category, search) {
  const normalizedSearch = normalizeProductSearch(search)
  return products.filter(product => {
    const matchesCategory = category === ALL_PRODUCTS_CATEGORY || product.category === category
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
}

export function buildProductListView(products, { category, search, loading }) {
  const normalizedSearch = normalizeProductSearch(search)
  const visibleProducts = filterProducts(products, category, search)
  const grouped = !normalizedSearch && category === ALL_PRODUCTS_CATEGORY
    ? groupByCategory(visibleProducts)
    : null

  return {
    normalizedSearch,
    visibleProducts,
    grouped,
    isInitialLoading: loading && products.length === 0,
    isEmpty: !(loading && products.length === 0) && visibleProducts.length === 0,
  }
}

export function countLowStockProducts(products, usageRecords) {
  return products.filter(product => getProductUsagePercent(product, usageRecords) >= 80).length
}

export function buildProductCardDisplayData(product, usageRecords) {
  const usagePercent = getProductUsagePercent(product, usageRecords)
  const displayProduct = { ...product, usage_percent: usagePercent }
  const recommendationTags = [
    ...parseTagText(product.product_features),
    ...parseTagText(product.suitable_regions),
    ...parseTagText(product.usage_steps),
  ].slice(0, 3)

  return {
    usagePercent,
    displayProduct,
    recommendationTags,
    priceText: formatProductPrice(product.price),
    status: getProductStatus(displayProduct),
  }
}

export function buildProductDetailTagGroups(product) {
  return PRODUCT_DETAIL_TAG_FIELDS.map(({ field, label }) => ({
    label,
    items: parseTagText(product[field]),
  })).filter(group => group.items.length > 0)
}

export function buildProductKnowledgeDetails(product) {
  return PRODUCT_KNOWLEDGE_FIELDS.map(({ field, label }) => ({
    label,
    value: product[field],
  })).filter(item => String(item.value || '').trim())
}

export function buildProductDetailViewData(selectedProduct, {
  detailDraft,
  detailEditing,
  shadeRecords,
  usageRecords,
}) {
  const usagePercent = getProductUsagePercent(selectedProduct, usageRecords)
  const detailUsagePercent = detailEditing
    ? Math.max(0, Math.min(100, Number(detailDraft.usage_percent) || 0))
    : usagePercent
  const detailProduct = { ...selectedProduct, usage_percent: detailUsagePercent }
  const colorIsHex = isHexColor(selectedProduct.color)
  const detailProfile = getDetailProfile(selectedProduct)

  return {
    usagePercent,
    detailUsagePercent,
    detailProduct,
    status: getProductStatus(detailProduct),
    expiryDate: getProductExpiryDate(selectedProduct),
    colorIsHex,
    selectedShade: shadeRecords[selectedProduct.id] || (colorIsHex ? selectedProduct.color : DEFAULT_SHADE_SWATCHES[0]),
    shadeOptions: [...new Set([colorIsHex ? selectedProduct.color : null, ...DEFAULT_SHADE_SWATCHES].filter(Boolean))],
    detailProfile,
    showShadeRow: detailProfile.kind === 'shade',
    recommendationTags: buildProductDetailTagGroups(selectedProduct),
    knowledgeDetails: buildProductKnowledgeDetails(selectedProduct),
  }
}
