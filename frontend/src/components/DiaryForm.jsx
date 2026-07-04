import { useState, useRef, useEffect } from 'react'
import { getPhotoUrl, fetchSkinAnalyses } from '../api'
import { Camera, Image, X } from 'lucide-react'
import { MOOD_OPTIONS, LEGACY_MOOD_MAP } from '../utils/moods'

/* ── 预设标签 ── */
const PRESET_TAGS = ['补水', '敏感肌', '熬夜', '换季', '控油', '美白']

export default function DiaryForm({ diary, products, onSubmit, onClose }) {
  const isEdit = !!diary?.id

  const [title, setTitle] = useState(diary?.title || '')
  const [content, setContent] = useState(diary?.content || '')
  const [mood, setMood] = useState(() => {
    const m = diary?.mood
    if (MOOD_OPTIONS.find(o => o.key === m)) return m
    return LEGACY_MOOD_MAP[m] || 'stable'
  })
  const [createdDate, setCreatedDate] = useState(
    diary?.created_date || new Date().toISOString().slice(0, 10)
  )
  const [selectedProductIds, setSelectedProductIds] = useState(diary?.product_ids || [])
  const [selectedTags, setSelectedTags] = useState(diary?.tags || [])
  const [photo, setPhoto] = useState(diary?.photo_file || null)
  const [photoPreview, setPhotoPreview] = useState(
    diary?.photo_preview_url || (isEdit ? getPhotoUrl(diary?.photo, 'diary') : '')
  )
  const [skinAnalysisId, setSkinAnalysisId] = useState(diary?.skin_analysis_id || null)
  const [todayAnalyses, setTodayAnalyses] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const fileRef = useRef(null)
  const cameraRef = useRef(null)

  /* 获取当日镜前状态 */
  useEffect(() => {
    fetchSkinAnalyses()
      .then(list => {
        const todayStr = createdDate
        const today = list.filter(a => (a.created_at || '').startsWith(todayStr))
        setTodayAnalyses(today)
        if (!isEdit && !skinAnalysisId && today.length > 0) {
          setSkinAnalysisId(today[0].id)
        }
      })
      .catch(() => {})
  }, [createdDate])

  /* ── Photo ── */
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setPhoto(file)
      setPhotoPreview(URL.createObjectURL(file))
    }
    e.target.value = ''
  }

  /* ── Product toggle ── */
  const toggleProduct = (id) => {
    setSelectedProductIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  /* ── Tag toggle ── */
  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  /* ── Submit ── */
  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)

    const formData = new FormData()
    formData.append('title', title.trim())
    formData.append('content', content.trim())
    formData.append('mood', mood)
    formData.append('created_date', createdDate)
    formData.append('tags', JSON.stringify(selectedTags))
    if (skinAnalysisId) formData.append('skin_analysis_id', String(skinAnalysisId))
    selectedProductIds.forEach(id => formData.append('product_ids', id))
    if (photo) formData.append('photo', photo)

    await onSubmit(formData)
    setSubmitting(false)
  }

  const todayAnalysis = todayAnalyses.find(a => a.id === skinAnalysisId)
  const hasPhotoPreview = !!(photoPreview)

  return (
    <div className="dv-form-overlay" onClick={onClose}>
      <div className="dv-form-sheet" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="dv-form-header">
          <h3>{isEdit ? '编辑日记' : '新日记'}</h3>
          <button className="dv-form-close" onClick={onClose}>
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="dv-form-scroll">
          {/* ── Section 1: 封面照片 ── */}
          <div className="dv-form-section">
            <p className="dv-form-section-label">封面照片</p>
            {hasPhotoPreview ? (
              <div className="dv-form-photo-area" style={{ borderStyle: 'solid' }} onClick={() => fileRef.current?.click()}>
                <img src={photoPreview} alt="预览" />
              </div>
            ) : (
              <div className="dv-form-photo-area" onClick={() => fileRef.current?.click()}>
                <Camera size={28} strokeWidth={1.2} className="dv-form-photo-icon" />
                <span className="dv-form-photo-text">添加今日照片</span>
              </div>
            )}
            <div className="dv-form-photo-actions">
              <button type="button" className="dv-form-photo-btn" onClick={() => cameraRef.current?.click()}>
                <Camera size={16} strokeWidth={1.6} /> 拍照
              </button>
              <button type="button" className="dv-form-photo-btn" onClick={() => fileRef.current?.click()}>
                <Image size={16} strokeWidth={1.6} /> 相册
              </button>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>

          {/* ── Section 2: 今日心情 ── */}
          <div className="dv-form-section">
            <p className="dv-form-section-label">今日心情</p>
            <div className="dv-mood-selector">
              {MOOD_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  className={`dv-mood-option${mood === opt.key ? ' dv-mood-selected' : ''}`}
                  style={mood === opt.key ? { borderColor: opt.color, background: opt.color + '0C' } : {}}
                  onClick={() => setMood(opt.key)}
                >
                  <span className="dv-mood-swatch" style={{ background: opt.color }} />
                  <span className="dv-mood-option-label" style={{ color: mood === opt.key ? opt.color : '#868685' }}>
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Section 3: 护肤心得 ── */}
          <div className="dv-form-section">
            <p className="dv-form-section-label">护肤心得</p>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <input
                className="form-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="给今天的日记取个名字…"
                required
              />
            </div>
            <textarea
              className="dv-form-textarea"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="记录今天的护肤心得、用后感受、皮肤变化..."
              rows={5}
              style={{ marginTop: 10 }}
            />
            <div className="form-group" style={{ marginTop: 8 }}>
              <input
                className="form-input"
                type="date"
                value={createdDate}
                onChange={e => { setCreatedDate(e.target.value) }}
              />
            </div>
          </div>

          {/* ── Section 4: 今日产品 ── */}
          <div className="dv-form-section">
            <p className="dv-form-section-label">今日使用产品</p>
            {products.length === 0 ? (
              <p style={{ fontSize: 13, color: '#B0B0AE' }}>暂无可关联的产品，先去产品库添加吧</p>
            ) : (
              <div className="dv-form-products-grid">
                {products.map(p => {
                  const isSel = selectedProductIds.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`dv-form-product-chip${isSel ? ' dv-product-selected' : ''}`}
                      onClick={() => toggleProduct(p.id)}
                    >
                      <div
                        className="dv-form-product-chip-thumb"
                        style={{
                          backgroundImage: p.photo
                            ? `url(${getPhotoUrl(p.photo, 'products')})`
                            : 'linear-gradient(135deg, #e8ede6, #dce3d9)',
                        }}
                      />
                      <span className="dv-form-product-chip-name">{p.name}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Section 5: 今日镜前状态 ── */}
          <div className="dv-form-section">
            <p className="dv-form-section-label">今日镜前状态</p>
            {todayAnalyses.length === 0 ? (
              <p className="dv-form-analysis-none">今日暂无镜前状态记录</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {todayAnalyses.map(a => (
                  <div
                    key={a.id}
                    className="dv-form-analysis-card"
                    style={skinAnalysisId === a.id ? { borderColor: '#7C9473', background: 'rgba(124,148,115,0.05)' } : {}}
                    onClick={() => setSkinAnalysisId(a.id === skinAnalysisId ? null : a.id)}
                  >
                    <span className="dv-form-analysis-score">已记录</span>
                    <div className="dv-form-analysis-info">
                      <div className="dv-form-analysis-type">{a.skin_type || '未知'}</div>
                      <div className="dv-form-analysis-date">{a.created_at?.slice(0, 10)}</div>
                    </div>
                    {skinAnalysisId === a.id && (
                      <span style={{ fontSize: 12, color: '#7C9473', fontWeight: 600 }}>已选</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Section 6: 标签 ── */}
          <div className="dv-form-section">
            <p className="dv-form-section-label">标签</p>
            <div className="dv-form-tags-grid">
              {PRESET_TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  className={`dv-form-tag-chip${selectedTags.includes(tag) ? ' dv-tag-selected' : ''}`}
                  onClick={() => toggleTag(tag)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer submit */}
        <div className="dv-form-footer">
          <button
            className="dv-form-submit"
            type="button"
            disabled={submitting || !title.trim()}
            onClick={handleSubmit}
          >
            {submitting ? '保存中...' : isEdit ? '更新日记' : '发布日记'}
          </button>
        </div>
      </div>
    </div>
  )
}
