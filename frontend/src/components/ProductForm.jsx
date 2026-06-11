import { useState, useRef } from 'react'

const CATEGORIES = ['口红', '眼影', '粉底', '腮红', '其他']

export default function ProductForm({ product, onSubmit, onClose }) {
  const [name, setName] = useState(product?.name || '')
  const [brand, setBrand] = useState(product?.brand || '')
  const [category, setCategory] = useState(product?.category || '其他')
  const [color, setColor] = useState(product?.color || '')
  const [purchaseDate, setPurchaseDate] = useState(product?.purchase_date || '')
  const [price, setPrice] = useState(product?.price || '')
  const [notes, setNotes] = useState(product?.notes || '')
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(
    product?.photo ? `/uploads/products/${product.photo}` : ''
  )
  const fileRef = useRef(null)
  const [submitting, setSubmitting] = useState(false)

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setPhoto(file)
      setPhotoPreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)

    const formData = new FormData()
    formData.append('name', name.trim())
    formData.append('brand', brand.trim())
    formData.append('category', category)
    formData.append('color', color.trim())
    formData.append('purchase_date', purchaseDate)
    formData.append('price', price || 0)
    formData.append('notes', notes.trim())
    if (photo) formData.append('photo', photo)

    await onSubmit(formData)
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{product ? '编辑产品' : '添加产品'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">产品名称 *</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="例如：Dior 999" required />
          </div>

          <div className="form-group">
            <label className="form-label">品牌</label>
            <input className="form-input" value={brand} onChange={e => setBrand(e.target.value)} placeholder="例如：Dior" />
          </div>

          <div className="form-group">
            <label className="form-label">分类</label>
            <select className="form-input" value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">颜色</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="form-input" value={color} onChange={e => setColor(e.target.value)} placeholder="例如：#FF0000 或 正红色" style={{ flex: 1 }} />
              {color && (
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: color, border: '2px solid #ddd', flexShrink: 0
                }} />
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">购买日期</label>
              <input className="form-input" type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">价格 ¥</label>
              <input className="form-input" type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">备注</label>
            <textarea className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="使用感受、适合场合..." />
          </div>

          <div className="form-group">
            <label className="form-label">照片</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ fontSize: 13 }} />
            {photoPreview && (
              <img src={photoPreview} alt="预览" className="photo-preview" />
            )}
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={submitting} style={{ marginTop: 16 }}>
            {submitting ? '保存中...' : product ? '更新产品' : '添加产品'}
          </button>
        </form>
      </div>
    </div>
  )
}
