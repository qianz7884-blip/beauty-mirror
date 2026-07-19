import { useState, useRef } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { getPhotoUrl } from '../api'
import { normalizePriceInput } from '../utils/productCatalog'
import ImageViewer from './ImageViewer'

const DEFAULT_CATEGORIES = ['面霜', '精华', '面膜', '洁面', '防晒', '其他']
const STEP_OPTIONS = ['护肤', '妆前', '底妆', '遮瑕', '定妆', '眼妆', '唇妆', '补妆']
const FEATURE_OPTIONS = ['保湿', '清爽', '控油', '修护', '提亮', '遮瑕', '持妆', '舒缓']
const REGION_OPTIONS = ['T区', '鼻翼', '眼下', '唇周', '脸颊', '下颌', '全脸']
const SCENE_OPTIONS = ['通勤', '办公室', '晚间出门', '拍照', '干燥天气', '潮湿天气']
const FEEDBACK_OPTIONS = ['好用', '持妆好', '不卡粉', '容易卡粉', '搓泥', '闷痘', '太油', '太干']

function parseTags(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  return String(value || '')
    .split(/[、,，/]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function serializeTags(value) {
  return parseTags(value).join('、')
}

function TagPicker({ label, value, options, onChange }) {
  const selected = parseTags(value)
  const toggle = (option) => {
    const next = selected.includes(option)
      ? selected.filter(item => item !== option)
      : [...selected, option]
    onChange(serializeTags(next))
  }

  return (
    <div className="form-group product-tag-group">
      <label className="form-label">{label}</label>
      <div className="product-tag-picker">
        {options.map(option => (
          <button
            key={option}
            type="button"
            className={selected.includes(option) ? 'active' : ''}
            onClick={() => toggle(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ProductForm({ product, onSubmit, onClose, mode = 'full', initialPhoto = null, initialValues = {}, categories }) {
  const CATEGORIES = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES
  const [name, setName] = useState(product?.name || initialValues.name || '')
  const [brand, setBrand] = useState(product?.brand || initialValues.brand || '')
  const [category, setCategory] = useState(product?.category || initialValues.category || '其他')
  const [color, setColor] = useState(product?.color || initialValues.color || '')
  const [volume, setVolume] = useState(product?.volume || initialValues.volume || '')
  const [purchaseDate, setPurchaseDate] = useState(product?.purchase_date || initialValues.purchase_date || '')
  const [expiryDate, setExpiryDate] = useState(product?.expiry_date || initialValues.expiry_date || '')
  const [price, setPrice] = useState(normalizePriceInput(product?.price ?? initialValues.price ?? ''))
  const [notes, setNotes] = useState(product?.notes || initialValues.notes || '')
  const [usageSteps, setUsageSteps] = useState(product?.usage_steps || initialValues.usage_steps || '')
  const [productFeatures, setProductFeatures] = useState(product?.product_features || initialValues.product_features || '')
  const [suitableRegions, setSuitableRegions] = useState(product?.suitable_regions || initialValues.suitable_regions || '')
  const [suitableScenes, setSuitableScenes] = useState(product?.suitable_scenes || initialValues.suitable_scenes || '')
  const [userFeedback, setUserFeedback] = useState(product?.user_feedback || initialValues.user_feedback || '')
  const [usagePercent, setUsagePercent] = useState(product?.usage_percent ?? initialValues.usage_percent ?? 0)
  const [photo, setPhoto] = useState(initialPhoto?.file || null)
  const [photoPreview, setPhotoPreview] = useState(
    initialPhoto?.previewUrl || getPhotoUrl(product?.photo, 'products')
  )
  const [photoUrl, setPhotoUrl] = useState('')
  const fileRef = useRef(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [viewImage, setViewImage] = useState(null)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const isQuick = mode === 'quick'

  const getSubmitErrorMessage = (error) => {
    if (error?.response?.data?.error) return error.response.data.error
    if (error?.response?.data?.message) return error.response.data.message
    if (typeof error?.response?.data === 'string' && error.response.data.trim()) {
      return error.response.data.slice(0, 120)
    }
    if (error?.response?.status) return `服务器错误 (${error.response.status})`
    if (error?.code === 'ECONNABORTED') return '请求超时，请稍后重试'
    if (error?.request) return '无法连接服务器，请检查后端是否启动'
    return error?.message || '保存失败，请检查输入内容'
  }

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
    setSubmitError('')

    const formData = new FormData()
    formData.append('name', name.trim())
    formData.append('brand', brand.trim())
    formData.append('category', category)
    formData.append('color', color.trim())
    formData.append('volume', volume.trim())
    formData.append('purchase_date', purchaseDate)
    formData.append('expiry_date', expiryDate)
    formData.append('price', price || 0)
    formData.append('notes', notes.trim())
    formData.append('usage_percent', usagePercent || 0)
    formData.append('ingredients', initialValues.ingredients || product?.ingredients || '')
    formData.append('efficacy', initialValues.efficacy || product?.efficacy || '')
    formData.append('suitable_skin', initialValues.suitable_skin || product?.suitable_skin || '')
    formData.append('usage_instructions', initialValues.usage_instructions || product?.usage_instructions || '')
    formData.append('usage_steps', serializeTags(usageSteps))
    formData.append('product_features', serializeTags(productFeatures))
    formData.append('suitable_regions', serializeTags(suitableRegions))
    formData.append('suitable_scenes', serializeTags(suitableScenes))
    formData.append('user_feedback', serializeTags(userFeedback))
    formData.append('source', initialValues.source || product?.source || 'manual')
    if (photo) {
      formData.append('photo', photo)
    } else if (photoUrl.trim()) {
      formData.append('photo_url', photoUrl.trim())
    }

    try {
      await onSubmit(formData)
    } catch (error) {
      setSubmitError(getSubmitErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet product-form-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{product ? '编辑产品' : isQuick ? '快速添加' : '添加产品'}</h3>
          <button className="modal-close" type="button" aria-label="关闭" onClick={onClose}>✕</button>
        </div>

        <form className="product-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">产品名称 *</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="例如：La Mer 奇迹面霜" required />
          </div>

          <div className="form-group">
            <label className="form-label">品牌</label>
            <input className="form-input" value={brand} onChange={e => setBrand(e.target.value)} placeholder="例如：La Mer" />
          </div>

          <div className="form-group">
            <label className="form-label">分类</label>
            <div className={categoryOpen ? 'product-category-select open' : 'product-category-select'}>
              <button
                type="button"
                className="product-category-trigger"
                aria-haspopup="listbox"
                aria-expanded={categoryOpen}
                onClick={() => setCategoryOpen(prev => !prev)}
              >
                <span>{category}</span>
                <ChevronDown size={18} strokeWidth={1.8} />
              </button>
              {categoryOpen && (
                <div className="product-category-menu" role="listbox">
                  {CATEGORIES.map(c => (
                    <button
                      key={c}
                      type="button"
                      role="option"
                      aria-selected={category === c}
                      className={category === c ? 'active' : ''}
                      onClick={() => {
                        setCategory(c)
                        setCategoryOpen(false)
                      }}
                    >
                      <span>{c}</span>
                      {category === c && <Check size={15} strokeWidth={2.1} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">规格</label>
            <input className="form-input" value={volume} onChange={e => setVolume(e.target.value)} placeholder="例如：30ml / 50g" />
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
                <label className="form-label">预计到期</label>
                <input className="form-input" type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
              </div>
            </div>
          )}

          {!isQuick && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">价格 ¥</label>
                <input className="form-input" type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" />
              </div>
            </div>
          )}

          {!isQuick && (
            <div className="form-group">
              <label className="form-label">备注</label>
              <textarea className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="使用感受、适合肤质..." />
            </div>
          )}

          {!isQuick && (
            <>
              <TagPicker label="适合步骤" value={usageSteps} options={STEP_OPTIONS} onChange={setUsageSteps} />
              <TagPicker label="产品特点" value={productFeatures} options={FEATURE_OPTIONS} onChange={setProductFeatures} />
              <TagPicker label="适合区域" value={suitableRegions} options={REGION_OPTIONS} onChange={setSuitableRegions} />
              <TagPicker label="适合场景" value={suitableScenes} options={SCENE_OPTIONS} onChange={setSuitableScenes} />
              <TagPicker label="我的反馈" value={userFeedback} options={FEEDBACK_OPTIONS} onChange={setUserFeedback} />
            </>
          )}

          {!isQuick && (
            <div className="form-group">
              <label className="form-label">使用进度：{usagePercent}%</label>
              <input
                className="bm-usage-slider"
                type="range"
                min="0"
                max="100"
                step="1"
                value={usagePercent}
                style={{ '--usage-value': `${usagePercent}%` }}
                onChange={e => setUsagePercent(e.target.value)}
              />
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
              <img
                src={photoPreview}
                alt="预览"
                className="photo-preview clickable-thumb"
                onClick={() => setViewImage(photoPreview)}
              />
            )}
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={submitting} style={{ marginTop: 16 }}>
            {submitting ? '保存中...' : product ? '更新产品' : isQuick ? '快速添加' : '添加产品'}
          </button>
          {submitError && (
            <div className="soft-error" style={{ marginTop: 12 }}>
              {submitError}
            </div>
          )}
        </form>
      </div>

      {/* 图片查看器 */}
      {viewImage && (
        <ImageViewer src={viewImage} onClose={() => setViewImage(null)} />
      )}
    </div>
  )
}
