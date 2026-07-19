import { useState } from 'react'
import { recognizeProduct, createProduct } from '../api'
import { Check, Globe2, Search } from 'lucide-react'

const DEFAULT_CATEGORIES = [
  '洁面',
  '爽肤水',
  '精华',
  '乳液',
  '面霜',
  '眼霜',
  '防晒',
  '面膜',
  '底妆',
  '遮瑕',
  '定妆',
  '眉眼',
  '唇妆',
  '腮红修容',
  '工具',
  '香氛',
  '小样',
  '其他',
]

function getRequestErrorMessage(error, fallback) {
  if (error?.response?.data?.error) return error.response.data.error
  if (error?.response?.data?.message) return error.response.data.message
  if (typeof error?.response?.data === 'string' && error.response.data.trim()) {
    return error.response.data.slice(0, 120)
  }
  if (error?.response?.status) return `服务器错误 (${error.response.status})`
  if (error?.code === 'ECONNABORTED') return '请求超时，请稍后重试'
  if (error?.request) return '无法连接服务器，请检查后端是否启动'
  return fallback
}

export default function RecognizePanel({ photoFile, previewUrl, onClose, onSaved, categories }) {
  const CATEGORIES = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES
  const [step, setStep] = useState('preview') // preview | loading | result
  const [brand, setBrand] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('其他')
  const [color, setColor] = useState('')
  const [volume, setVolume] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [recognizedMeta, setRecognizedMeta] = useState({})
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [noticeMsg, setNoticeMsg] = useState('')
  const [saveError, setSaveError] = useState('')

  // 调用后端识别 API
  const handleRecognize = async () => {
    setStep('loading')
    setErrorMsg('')
    setNoticeMsg('')
    setSaveError('')
    try {
      const formData = new FormData()
      formData.append('photo', photoFile)
      const result = await recognizeProduct(formData)
      if (result.recognized) {
        setBrand(result.brand || '')
        setName(result.name || '')
        setCategory(result.category || '其他')
        setColor(result.color || '')
        setVolume(result.volume || '')
        setRecognizedMeta({
          ingredients: result.ingredients || '',
          efficacy: result.efficacy || '',
          suitable_skin: result.suitable_skin || '',
          usage_instructions: result.usage_instructions || '',
          usage_steps: result.usage_steps || '',
          product_features: result.product_features || '',
          suitable_regions: result.suitable_regions || '',
          suitable_scenes: result.suitable_scenes || '',
          user_feedback: result.user_feedback || '',
          source: result.source || 'gemini',
          confidence: result.confidence || '',
          recognition_mode: result.recognition_mode || '',
        })
        if (result.needs_review || result.message) {
          setNoticeMsg(result.message || 'AI 已生成初步结果，请核对后再保存')
        }
      } else {
        // 显示后端返回的失败原因
        setErrorMsg(result.message || '未能自动识别，请手动填写')
        setRecognizedMeta({})
      }
    } catch (e) {
      // 网络错误 / 超时 / 服务端异常
      if (e.code === 'ECONNABORTED') {
        setErrorMsg('识别超时，请换一张更清晰的照片后重试')
      } else if (e.response) {
        setErrorMsg(getRequestErrorMessage(e, `服务器错误 (${e.response.status})，请稍后重试`))
      } else if (e.request) {
        setErrorMsg('无法连接服务器，请检查后端是否启动')
      } else {
        setErrorMsg('识别失败，请手动填写')
      }
    }
    setStep('result')
  }

  // 搜索官网宣传图
  const handleSearchOfficial = () => {
    const query = [brand, name, '宣传图'].filter(Boolean).join(' ')
    window.open(`https://www.baidu.com/s?wd=${encodeURIComponent(query)}&tbm=isch`, '_blank')
  }

  // 确认添加
  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    setSaveError('')
    try {
      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('brand', brand.trim())
      formData.append('category', category)
      formData.append('color', color.trim())
      formData.append('volume', volume.trim())
      formData.append('purchase_date', purchaseDate)
      formData.append('expiry_date', expiryDate)
      formData.append('ingredients', recognizedMeta.ingredients || '')
      formData.append('efficacy', recognizedMeta.efficacy || '')
      formData.append('suitable_skin', recognizedMeta.suitable_skin || '')
      formData.append('usage_instructions', recognizedMeta.usage_instructions || '')
      formData.append('usage_steps', recognizedMeta.usage_steps || '')
      formData.append('product_features', recognizedMeta.product_features || '')
      formData.append('suitable_regions', recognizedMeta.suitable_regions || '')
      formData.append('suitable_scenes', recognizedMeta.suitable_scenes || '')
      formData.append('user_feedback', recognizedMeta.user_feedback || '')
      formData.append('source', recognizedMeta.source || 'gemini')
      formData.append('photo', photoFile)
      await createProduct(formData)
      onSaved()
    } catch (error) {
      setSaveError(getRequestErrorMessage(error, '保存失败，请重试'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {step === 'preview' && '确认照片'}
            {step === 'loading' && '正在识别...'}
            {step === 'result' && '识别结果'}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* 步骤1：预览照片 */}
        {step === 'preview' && (
          <div style={{ textAlign: 'center' }}>
            <img
              src={previewUrl}
              alt="产品照片"
              style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 12, marginBottom: 20 }}
            />
            <button className="btn btn-primary btn-block" onClick={handleRecognize}>
              <Search size={16} strokeWidth={1.7} />
              开始识别
            </button>
          </div>
        )}

        {/* 步骤2：加载动画 */}
        {step === 'loading' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div className="recognize-spinner" />
            <p style={{ marginTop: 20, color: '#888', fontSize: 14 }}>
              AI 正在识别物品...
            </p>
          </div>
        )}

        {/* 步骤3：识别结果 + 编辑 */}
        {step === 'result' && (
          <div>
            <img
              src={previewUrl}
              alt="产品照片"
              style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 12, marginBottom: 16 }}
            />

            {errorMsg && (
              <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12, border: '1px solid #fecaca' }}>
                {errorMsg}
              </div>
            )}

            {noticeMsg && (
              <div className="soft-error" style={{ marginBottom: 12 }}>
                {noticeMsg}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">品牌</label>
              <input className="form-input" value={brand} onChange={e => setBrand(e.target.value)} placeholder="例如：La Mer" />
            </div>

            <div className="form-group">
              <label className="form-label">产品名称 *</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="例如：奇迹面霜 60ml" required />
            </div>

            <div className="form-group">
              <label className="form-label">分类</label>
              <select className="form-input" value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">规格</label>
              <input className="form-input" value={volume} onChange={e => setVolume(e.target.value)} placeholder="例如：30ml / 50g" />
            </div>

            <div className="form-group">
              <label className="form-label">色号</label>
              <input className="form-input" value={color} onChange={e => setColor(e.target.value)} placeholder="例如：#FF0000 或 正红色" />
            </div>

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

            {/* 搜索官网图 */}
            <button
              type="button"
              className="btn btn-outline btn-block"
              onClick={handleSearchOfficial}
              style={{ marginBottom: 12, fontSize: 13 }}
            >
              <Globe2 size={16} strokeWidth={1.6} />
              搜索官网宣传图
            </button>

            {saveError && (
              <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12, border: '1px solid #fecaca' }}>
                {saveError}
              </div>
            )}

            {/* 确认添加 */}
            <button
              className="btn btn-primary btn-block"
              onClick={handleSave}
              disabled={saving}
            >
              {!saving && <Check size={16} strokeWidth={1.8} />}
              {saving ? '添加中...' : '确认添加'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
