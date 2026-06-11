import { useState, useEffect, useCallback } from 'react'
import { fetchProducts, createProduct, updateProduct, deleteProduct } from '../api'
import ProductCard from '../components/ProductCard'
import ProductForm from '../components/ProductForm'

const CATEGORIES = ['全部', '口红', '眼影', '粉底', '腮红', '其他']

export default function ProductManage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('全部')
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [toast, setToast] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (search) params.search = search
    if (category && category !== '全部') params.category = category
    fetchProducts(params)
      .then(setProducts)
      .finally(() => setLoading(false))
  }, [search, category])

  useEffect(() => {
    load()
  }, [load])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2000)
  }

  const handleSubmit = async (formData) => {
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, formData)
        showToast('产品更新成功！')
      } else {
        await createProduct(formData)
        showToast('产品添加成功！')
      }
      setShowForm(false)
      setEditingProduct(null)
      load()
    } catch (err) {
      showToast(err.response?.data?.error || '操作失败', 'error')
    }
  }

  const handleEdit = (product) => {
    setEditingProduct(product)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这个产品吗？')) return
    try {
      await deleteProduct(id)
      showToast('产品已删除')
      load()
    } catch (err) {
      showToast('删除失败', 'error')
    }
  }

  const handleAdd = () => {
    setEditingProduct(null)
    setShowForm(true)
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}

      {/* 搜索栏 */}
      <div className="search-bar">
        <input
          className="form-input"
          placeholder="搜索名称或品牌..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="form-input"
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{ width: 90 }}
        >
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* 产品列表 */}
      {loading ? (
        <div className="empty-state"><p>加载中...</p></div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💄</div>
          <p>还没有产品，点击右下角 + 添加吧</p>
        </div>
      ) : (
        <div>
          {products.map(p => (
            <ProductCard
              key={p.id}
              product={p}
              onEdit={() => handleEdit(p)}
              onDelete={() => handleDelete(p.id)}
            />
          ))}
        </div>
      )}

      {/* 添加/编辑 表单弹层 */}
      {showForm && (
        <ProductForm
          product={editingProduct}
          onSubmit={handleSubmit}
          onClose={() => {
            setShowForm(false)
            setEditingProduct(null)
          }}
        />
      )}

      {/* FAB 添加按钮 */}
      {!showForm && (
        <button className="fab" onClick={handleAdd}>+</button>
      )}
    </div>
  )
}
