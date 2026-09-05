import { useCallback, useMemo, useState } from 'react'

import { fetchProducts } from '../../api'
import { getRequestErrorMessage } from '../../utils/productEntry'
import { readProductCache, writeProductCache } from './productCache'
import { normalizeProductList } from './productLogic'

export function useProductCollection() {
  const initialProducts = useMemo(() => readProductCache(), [])
  const [products, setProductsState] = useState(initialProducts)
  const [loading, setLoading] = useState(initialProducts.length === 0)
  const [loadError, setLoadError] = useState('')

  const setProducts = useCallback((value) => {
    setProductsState(prevProducts => {
      const nextProducts = normalizeProductList(
        typeof value === 'function' ? value(prevProducts) : value,
      )
      writeProductCache(nextProducts)
      return nextProducts
    })
  }, [])

  const reloadProducts = useCallback(() => {
    setLoading(true)
    setLoadError('')
    return fetchProducts()
      .then((data) => {
        const nextProducts = normalizeProductList(data)
        setProductsState(nextProducts)
        writeProductCache(nextProducts)
        return nextProducts
      })
      .catch((err) => {
        setLoadError(getRequestErrorMessage(err, '无法加载产品，请检查后端是否启动'))
        return []
      })
      .finally(() => setLoading(false))
  }, [])

  const upsertProduct = useCallback((product) => {
    if (!product) return
    setProducts(prevProducts => [
      product,
      ...prevProducts.filter(item => item.id !== product.id),
    ])
  }, [setProducts])

  const replaceProduct = useCallback((product) => {
    if (!product) return
    setProducts(prevProducts => prevProducts.map(item => (
      item.id === product.id ? { ...item, ...product } : item
    )))
  }, [setProducts])

  const updateProductUsage = useCallback((productId, usagePercent) => {
    setProducts(prevProducts => prevProducts.map(product => (
      product.id === productId ? { ...product, usage_percent: usagePercent } : product
    )))
  }, [setProducts])

  return {
    products,
    loading,
    loadError,
    reloadProducts,
    upsertProduct,
    replaceProduct,
    updateProductUsage,
  }
}
