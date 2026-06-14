import axios from 'axios'

const apiBaseURL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

// 上传文件的基础地址：／/api → 去掉 /api → 拼接 /uploads
const _uploadsBase = (() => {
  if (import.meta.env.VITE_API_BASE_URL) {
    // 生产环境：https://xxx.onrender.com/api → https://xxx.onrender.com
    return import.meta.env.VITE_API_BASE_URL.replace(/\/api\/?$/, '')
  }
  return '' // 开发环境：空字符串，使用相对路径走 Vite 代理
})()

/**
 * 获取产品/日记图片的完整 URL
 * @param {string} filename 数据库中的文件名
 * @param {'products'|'diary'} type
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

// ==================== AI 识别 ====================

export function recognizeProduct(formData) {
  return api.post('/recognize', formData).then(r => r.data)
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
