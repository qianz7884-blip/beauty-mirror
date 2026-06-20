import { useState, useRef } from 'react'
import { getPhotoUrl } from '../api'

const MOODS = [
  ['😍', '超满意'],
  ['😊', '开心'],
  ['😐', '一般'],
  ['😢', '不满意'],
]

export default function DiaryForm({ diary, products, onSubmit, onClose }) {
  const [title, setTitle] = useState(diary?.title || '')
  const [content, setContent] = useState(diary?.content || '')
  const [mood, setMood] = useState(diary?.mood || '😊')
  const [createdDate, setCreatedDate] = useState(diary?.created_date || new Date().toISOString().slice(0, 10))
  const [selectedProductIds, setSelectedProductIds] = useState(diary?.product_ids || [])
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(
    getPhotoUrl(diary?.photo, 'diary')
  )
  const fileRef = useRef(null)
  const [submitting, setSubmitting] = useState(false)

  const toggleProduct = (id) => {
    setSelectedProductIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setPhoto(file)
      setPhotoPreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)

    const formData = new FormData()
    formData.append('title', title.trim())
    formData.append('content', content.trim())
    formData.append('mood', mood)
    formData.append('created_date', createdDate)
    selectedProductIds.forEach(id => formData.append('product_ids', id))
    if (photo) formData.append('photo', photo)

    await onSubmit(formData)
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{diary ? '编辑日记' : '新日记'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* 心情选择 */}
          <div className="form-group">
            <label className="form-label">今日心情</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {MOODS.map(([emoji, label]) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setMood(emoji)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: mood === emoji ? '2px solid var(--primary)' : '2px solid #eee',
                    background: mood === emoji ? 'var(--primary-light)' : '#fff',
                    cursor: 'pointer',
                    fontSize: 24,
                  }}
                >
                  <span>{emoji}</span>
                  <span style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">标题 *</label>
            <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="给今天的护肤日记取个名字" required />
          </div>

          <div className="form-group">
            <label className="form-label">日期</label>
            <input className="form-input" type="date" value={createdDate} onChange={e => setCreatedDate(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">内容</label>
            <textarea className="form-input" value={content} onChange={e => setContent(e.target.value)} placeholder="记录今天的护肤心得..." rows={4} />
          </div>

          {/* 关联产品 */}
          <div className="form-group">
            <label className="form-label">使用的产品</label>
            {products.length === 0 ? (
              <p style={{ fontSize: 13, color: '#aaa' }}>暂无可关联的产品</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {products.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={`btn btn-sm ${selectedProductIds.includes(p.id) ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => toggleProduct(p.id)}
                    style={{ fontSize: 12 }}
                  >
                    {selectedProductIds.includes(p.id) ? '✓ ' : ''}{p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">照片</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ fontSize: 13 }} />
            {photoPreview && (
              <img src={photoPreview} alt="预览" className="photo-preview" />
            )}
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={submitting} style={{ marginTop: 16 }}>
            {submitting ? '保存中...' : diary ? '更新日记' : '发布日记'}
          </button>
        </form>
      </div>
    </div>
  )
}
