import { useState, useEffect, useCallback } from 'react'
import { fetchDiaries, createDiary, updateDiary, deleteDiary, fetchProducts } from '../api'
import DiaryCard from '../components/DiaryCard'
import DiaryForm from '../components/DiaryForm'

export default function MakeupDiary() {
  const [diaries, setDiaries] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingDiary, setEditingDiary] = useState(null)
  const [toast, setToast] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([fetchDiaries(), fetchProducts()])
      .then(([d, p]) => {
        setDiaries(d)
        setProducts(p)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2000)
  }

  const handleSubmit = async (formData) => {
    try {
      if (editingDiary) {
        await updateDiary(editingDiary.id, formData)
        showToast('日记更新成功！')
      } else {
        await createDiary(formData)
        showToast('日记发布成功！')
      }
      setShowForm(false)
      setEditingDiary(null)
      load()
    } catch (err) {
      showToast(err.response?.data?.error || '操作失败', 'error')
    }
  }

  const handleEdit = (diary) => {
    setEditingDiary(diary)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这篇日记吗？')) return
    try {
      await deleteDiary(id)
      showToast('日记已删除')
      load()
    } catch (err) {
      showToast('删除失败', 'error')
    }
  }

  const handleAdd = () => {
    setEditingDiary(null)
    setShowForm(true)
  }

  // 构建 product id -> name 映射
  const productMap = {}
  products.forEach(p => { productMap[p.id] = p })

  return (
    <div>
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}

      {loading ? (
        <div className="empty-state"><p>加载中...</p></div>
      ) : diaries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📖</div>
          <p>还没有日记，记录你的每日妆容吧</p>
        </div>
      ) : (
        diaries.map(d => (
          <DiaryCard
            key={d.id}
            diary={d}
            productMap={productMap}
            onEdit={() => handleEdit(d)}
            onDelete={() => handleDelete(d.id)}
          />
        ))
      )}

      {showForm && (
        <DiaryForm
          diary={editingDiary}
          products={products}
          onSubmit={handleSubmit}
          onClose={() => {
            setShowForm(false)
            setEditingDiary(null)
          }}
        />
      )}

      {!showForm && (
        <button className="fab" onClick={handleAdd}>+</button>
      )}
    </div>
  )
}
