import { useState } from 'react'
import { recognizeProduct, createProduct } from '../api'

const CATEGORIES = ['口红', '眼影', '粉底', '腮红', '其他']

export default function RecognizePanel({ photoFile, previewUrl, onClose, onSaved }) {
  const [step, setStep] = useState('preview') // preview | loading | result
  const [brand, setBrand] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('其他')
  const [color, setColor] = useState('')
  const [saving, setSaving] = useState(false)

  // 调用后端识别 API
  const handleRecognize = async () => {
    setStep('loading')
    try {
      const formData = new FormData()
      formData.append('photo', photoFile)
      const result = await recognizeProduct(formData)
      if (result.recognized) {
        setBrand(result.brand || '')
        setName(result.name || '')
        setCategory(result.category || '其他')
        setColor(result.color || '')
      }
    } catch {
      // 识别失败，进入手动填写
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
    try {
      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('brand', brand.trim())
      formData.append('category', category)
      formData.append('color', color.trim())
      formData.append('photo', photoFile)
      await createProduct(formData)
      onSaved()
    } catch {
      // handled by parent toast
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
              🔍 开始识别
            </button>
          </div>
        )}

        {/* 步骤2：加载动画 */}
        {step === 'loading' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div className="recognize-spinner" />
            <p style={{ marginTop: 20, color: '#888', fontSize: 14 }}>
              AI 正在分析彩妆信息...
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

            <div className="form-group">
              <label className="form-label">品牌</label>
              <input className="form-input" value={brand} onChange={e => setBrand(e.target.value)} placeholder="例如：Dior" />
            </div>

            <div className="form-group">
              <label className="form-label">产品名称 *</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="例如：999 丝绒唇膏" required />
            </div>

            <div className="form-group">
              <label className="form-label">分类</label>
              <select className="form-input" value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">色号</label>
              <input className="form-input" value={color} onChange={e => setColor(e.target.value)} placeholder="例如：#FF0000 或 正红色" />
            </div>

            {/* 搜索官网图 */}
            <button
              type="button"
              className="btn btn-outline btn-block"
              onClick={handleSearchOfficial}
              style={{ marginBottom: 12, fontSize: 13 }}
            >
              🌐 搜索官网宣传图
            </button>

            {/* 确认添加 */}
            <button
              className="btn btn-primary btn-block"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '添加中...' : '✅ 确认添加'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
