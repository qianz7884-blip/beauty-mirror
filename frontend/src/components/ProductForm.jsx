import { useState, useRef } from 'react'
import { getPhotoUrl } from '../api'

const CATEGORIES = ['口红', '眼影', '粉底', '腮红', '其他']

export default function ProductForm({ product, onSubmit, onClose, mode = 'full', initialPhoto = null }) {
  const [name, setName] = useState(product?.name || '')
  const [brand, setBrand] = useState(product?.brand || '')
  const [category, setCategory] = useState(product?.category || '其他')
  const [color, setColor] = useState(product?.color || '')
  const [purchaseDate, setPurchaseDate] = useState(product?.purchase_date || '')
  const [price, setPrice] = useState(product?.price || '')
  const [notes, setNotes] = useState(product?.notes || '')
  const [photo, setPhoto] = useState(initialPhoto?.file || null)
  const [photoPreview, setPhotoPreview] = useState(
    initialPhoto?.previewUrl || getPhotoUrl(product?.photo, 'products')
  )
  const [photoUrl, setPhotoUrl] = useState('')
  const fileRef = useRef(null)
  const [submitting, setSubmitting] = useState(false)
  const isQuick = mode === 'quick'

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setPhoto(file)
      setPhotoUrl('')
      setPhotoPreview(URL.createObjectURL(file))
    }
  }

  const handleUrlChange = (e) => {
    const url = e.target.value
    setPhotoUrl(url)
    if (url) {
      setPhoto(null)
      setPhotoPreview(url)
    } else {
      setPhotoPreview(initialPhoto?.previewUrl || getPhotoUrl(product?.photo, 'products'))
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
    if (photo) {
      formData.append('photo', photo)
    } else if (photoUrl.trim()) {
      formData.append('photo_url', photoUrl.trim())
    }

    await onSubmit(formData)
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{product ? '编辑产品' : isQuick ? '快速添加' : '添加产品'}</h3>
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

          {!isQuick && (
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
          )}

          {!isQuick && (
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
          )}

          {!isQuick && (
            <div className="form-group">
              <label className="form-label">备注</label>
              <textarea className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="使用感受、适合场合..." />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">照片</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ fontSize: 13 }} />
            {(!product || isQuick) && (
              <>
                <p style={{ fontSize: 12, color: '#aaa', margin: '6px 0' }}>— 或粘贴图片链接 —</p>
                <input
                  className="form-input"
                  value={photoUrl}
                  onChange={handleUrlChange}
                  placeholder="https://... 品牌官网图片地址"
                  style={{ fontSize: 12 }}
                />
              </>
            )}
            {photoPreview && (
              <img src={photoPreview} alt="预览" className="photo-preview" />
            )}
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={submitting} style={{ marginTop: 16 }}>
            {submitting ? '保存中...' : product ? '更新产品' : isQuick ? '快速添加' : '添加产品'}
          </button>
        </form>
      </div>
    </div>
  )
}
