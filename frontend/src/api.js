import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

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
