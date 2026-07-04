import axios from 'axios'

function normalizeApiBaseURL(value) {
  const raw = (value || '/api').replace(/\/$/, '')
  if (raw === '/api' || raw.endsWith('/api')) return raw
  return `${raw}/api`
}

const apiBaseURL = normalizeApiBaseURL(import.meta.env.VITE_API_BASE_URL)
const ANONYMOUS_USER_ID_KEY = 'beauty_mirror_anonymous_user_id'
let cachedAnonymousUserId = ''

function createAnonymousUserId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `anon_${crypto.randomUUID()}`
  }
  return `anon_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

export function getAnonymousUserId() {
  if (cachedAnonymousUserId) return cachedAnonymousUserId

  if (typeof localStorage === 'undefined') {
    cachedAnonymousUserId = createAnonymousUserId()
    return cachedAnonymousUserId
  }

  try {
    const existing = localStorage.getItem(ANONYMOUS_USER_ID_KEY)
    if (existing) {
      cachedAnonymousUserId = existing
      return cachedAnonymousUserId
    }
  } catch {
    cachedAnonymousUserId = createAnonymousUserId()
    return cachedAnonymousUserId
  }

  cachedAnonymousUserId = createAnonymousUserId()
  try {
    localStorage.setItem(ANONYMOUS_USER_ID_KEY, cachedAnonymousUserId)
  } catch {
    // Keep the in-memory ID for this tab if storage is unavailable.
  }
  return cachedAnonymousUserId
}

// 上传文件的基础地址：／/api → 去掉 /api → 拼接 /uploads
const _uploadsBase = (() => {
  if (apiBaseURL.startsWith('http')) {
    // 生产环境：https://xxx.onrender.com/api → https://xxx.onrender.com
    return apiBaseURL.replace(/\/api\/?$/, '')
  }
  return '' // 开发环境：空字符串，使用相对路径走 Vite 代理
})()

/**
 * 获取产品/日记/肤质分析图片的完整 URL
 * @param {string} filename 数据库中的文件名
 * @param {'products'|'diary'|'skin'} type
 * @returns {string}
 */
export function getPhotoUrl(filename, type = 'products') {
  if (!filename) return ''
  return `${_uploadsBase}/uploads/${type}/${filename}`
}

const api = axios.create({
  baseURL: apiBaseURL,
  timeout: 10000,
})

api.interceptors.request.use(config => {
  config.headers = config.headers || {}
  config.headers['X-Anonymous-User-Id'] = getAnonymousUserId()
  return config
})

// ==================== AI 识别 ====================

export function recognizeProduct(formData) {
  return api.post('/recognize', formData, { timeout: 45000 }).then(r => r.data)
}

export function recognizeProductVoice(formData) {
  return api.post('/recognize-voice', formData, { timeout: 60000 }).then(r => r.data)
}

// ==================== 肤质分析 ====================

export function analyzeSkin(formData) {
  return api.post('/skin-analysis', formData, { timeout: 60000 }).then(r => r.data)
}

// ==================== Dashboard ====================

export function fetchDashboard() {
  return api.get('/dashboard').then(r => r.data)
}

// ==================== 产品 ====================

export function fetchProducts(params = {}) {
  return api.get('/products', { params }).then(r => r.data)
}

export function fetchProduct(id) {
  return api.get(`/products/${id}`).then(r => r.data)
}

export function createProduct(formData) {
  return api.post('/products', formData).then(r => r.data)
}

export function updateProduct(id, formData) {
  return api.put(`/products/${id}`, formData).then(r => r.data)
}

export function deleteProduct(id) {
  return api.delete(`/products/${id}`).then(r => r.data)
}

// ==================== 肤质分析历史 ====================

export function fetchSkinAnalyses() {
  return api.get('/skin-analyses').then(r => r.data)
}

export function fetchSkinAnalysis(id) {
  return api.get(`/skin-analyses/${id}`).then(r => r.data)
}

export function deleteSkinAnalysis(id) {
  return api.delete(`/skin-analyses/${id}`).then(r => r.data)
}

// ==================== 日记 ====================

export function fetchDiaries() {
  return api.get('/diary').then(r => r.data)
}

export function fetchDiary(id) {
  return api.get(`/diary/${id}`).then(r => r.data)
}

export function createDiary(formData) {
  return api.post('/diary', formData).then(r => r.data)
}

export function updateDiary(id, formData) {
  return api.put(`/diary/${id}`, formData).then(r => r.data)
}

export function deleteDiary(id) {
  return api.delete(`/diary/${id}`).then(r => r.data)
}

export function fetchMoods() {
  return api.get('/moods').then(r => r.data)
}
