import { getAnonymousUserId } from '../../api'
import { normalizeProductList } from './productLogic'

export const PRODUCT_CACHE_KEY = 'beauty_mirror_products_cache_v1'

let productMemoryCache = null
let productMemoryCacheUserId = ''

export function readProductCache() {
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

export function writeProductCache(products) {
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
