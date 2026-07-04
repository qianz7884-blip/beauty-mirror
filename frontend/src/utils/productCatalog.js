import { DEFAULT_CATEGORIES } from '../categories'

const USAGE_RECORDS_KEY = 'beauty_mirror_product_usage_records'
const SHADE_RECORDS_KEY = 'beauty_mirror_product_shade_records'

const SHADE_CATEGORIES = ['底妆', '遮瑕', '定妆', '眉眼', '唇妆', '腮红修容']
const SHADE_CATEGORY_KEYWORDS = ['唇', '口红', '唇膏', '唇釉', '眼影', '眼线', '眉', '腮红', '修容', '高光', '粉底', '遮瑕', '粉饼', '散粉']
const SKINCARE_CATEGORIES = ['洁面', '爽肤水', '精华', '乳液', '面霜', '眼霜', '防晒', '面膜']

export const DEFAULT_SHADE_SWATCHES = ['#b42335', '#a94842', '#bd6257', '#8f4144', '#c77a70', '#d59586']

export function groupByCategory(products) {
  const map = {}
  products.forEach(product => {
    const cat = product.category || '其他'
    if (!map[cat]) map[cat] = []
    map[cat].push(product)
  })

  return Object.entries(map).sort((a, b) => {
    const ai = DEFAULT_CATEGORIES.indexOf(a[0])
    const bi = DEFAULT_CATEGORIES.indexOf(b[0])
    if (ai === -1 && bi === -1) return a[0].localeCompare(b[0])
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

export function getProductStatus(product) {
  const text = `${product.notes || ''} ${product.source || ''}`.toLowerCase()
  if (text.includes('过期')) return '已过期'
  if (text.includes('快用完') || text.includes('空瓶')) return '快用完'
  if (text.includes('备用')) return '备用'
  return '在用'
}

export function addYears(dateText, years) {
  if (!dateText) return ''
  const date = new Date(dateText)
  if (Number.isNaN(date.getTime())) return ''
  date.setFullYear(date.getFullYear() + years)
  return date.toISOString().slice(0, 10)
}

export function getUsageEstimate(status) {
  if (status === '已过期') return 100
  if (status === '快用完') return 82
  if (status === '备用') return 8
  return 38
}

export function isHexColor(value) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value || '')
}

export function loadUsageRecords() {
  try {
    return JSON.parse(localStorage.getItem(USAGE_RECORDS_KEY)) || {}
  } catch {
    return {}
  }
}

export function saveUsageRecords(records) {
  localStorage.setItem(USAGE_RECORDS_KEY, JSON.stringify(records))
}

export function loadShadeRecords() {
  try {
    return JSON.parse(localStorage.getItem(SHADE_RECORDS_KEY)) || {}
  } catch {
    return {}
  }
}

export function saveShadeRecords(records) {
  localStorage.setItem(SHADE_RECORDS_KEY, JSON.stringify(records))
}

export function getDetailProfile(product) {
  const category = product.category || '其他'
  const isShadeProduct = SHADE_CATEGORIES.includes(category) || SHADE_CATEGORY_KEYWORDS.some(keyword => category.includes(keyword))
  if (isShadeProduct) {
    return {
      kind: 'shade',
      title: '色号',
      value: product.color || '未记录',
      summary: product.color || category,
    }
  }
  if (category === '香氛') {
    return {
      kind: 'text',
      title: '香调',
      value: product.color || product.notes || '未记录',
      summary: product.color || '未记录香调',
    }
  }
  if (category === '工具') {
    return {
      kind: 'text',
      title: '规格 / 材质',
      value: product.volume || product.notes || '未记录',
      summary: product.volume || category,
    }
  }
  if (SKINCARE_CATEGORIES.includes(category)) {
    return {
      kind: 'text',
      title: '功效备注',
      value: product.notes || '还没有记录功效、肤质或使用感。',
      summary: category,
    }
  }
  return {
    kind: product.color ? 'shade' : 'text',
    title: product.color ? '颜色 / 标记' : '产品备注',
    value: product.color || product.notes || '未记录',
    summary: product.color || category,
  }
}
