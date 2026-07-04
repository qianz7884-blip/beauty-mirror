import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronRight, ShieldCheck, Sparkles, Wand2, PackagePlus } from 'lucide-react'
import { createProduct } from '../api'
import ProductAddSheet from '../components/ProductAddSheet'
import ProductForm from '../components/ProductForm'
import ProductVoiceSheet from '../components/ProductVoiceSheet'
import RecognizePanel from '../components/RecognizePanel'
import SkinAnalysisPanel from '../components/SkinAnalysisPanel'
import { getAllCategories } from '../categories'
import { usePageBackground } from '../utils/backgroundSettings'

function TodayAction({ icon: Icon, title, desc, onClick, variant = 'secondary' }) {
  return (
    <button className={`bm-home-card bm-home-card-text bm-home-card-${variant}`} type="button" onClick={onClick}>
      <span className="bm-card-fallback-icon">
        <Icon size={21} strokeWidth={1.7} />
      </span>
      <span className="bm-card-copy">
        <strong>{title}</strong>
        <span>{desc}</span>
      </span>
      <span className="bm-card-arrow">
        <ChevronRight size={18} strokeWidth={1.8} />
      </span>
    </button>
  )
}

export default function Dashboard() {
  const pageBackground = usePageBackground('home')
  const [recognizePhoto, setRecognizePhoto] = useState(null)
  const [showManualForm, setShowManualForm] = useState(false)
  const [showProductActions, setShowProductActions] = useState(false)
  const [showVoiceEntry, setShowVoiceEntry] = useState(false)
  const [initialValues, setInitialValues] = useState({})
  const [toast, setToast] = useState(null)
  const [skinPanelProps, setSkinPanelProps] = useState(null)
  const cameraInputRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (location.state?.openSkinAnalysis) {
      setSkinPanelProps({})
      navigate('.', { replace: true, state: {} })
    }
  }, [location.state])

  useEffect(() => {
    const openHistory = () => setSkinPanelProps({ forceHistoryMode: true })
    window.addEventListener('open-skin-history', openHistory)
    return () => window.removeEventListener('open-skin-history', openHistory)
  }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    window.setTimeout(() => setToast(null), 2000)
  }

  const handlePhotoCapture = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setRecognizePhoto({ file, previewUrl: URL.createObjectURL(file) })
    setShowProductActions(false)
    e.target.value = ''
  }

  const handleRecognizeSaved = () => {
    setRecognizePhoto(null)
    showToast('已收进美妆柜')
  }

  const openManualForm = (values = {}) => {
    setInitialValues(values)
    setShowProductActions(false)
    setShowManualForm(true)
  }

  const startVoiceEntry = () => {
    setShowProductActions(false)
    setShowVoiceEntry(true)
  }

  const handleVoiceResult = (values) => {
    setShowVoiceEntry(false)
    openManualForm(values)
  }

  const handleManualSubmit = async (formData) => {
    try {
      await createProduct(formData)
      setShowManualForm(false)
      setShowProductActions(false)
      setInitialValues({})
      showToast('产品已记录')
    } catch (err) {
      showToast(err.response?.data?.error || '暂时没有记录成功', 'error')
    }
  }

  const today = new Date()
  const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日 ${today.toLocaleDateString('zh-CN', { weekday: 'short' })}`

  return (
    <div className="bm-screen bm-home" style={pageBackground.style}>
      {toast && (
        <div className="d-toast-container">
          <div className={`d-toast d-toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}

      <section className="bm-hero bm-home-hero">
        <p className="bm-date">{todayLabel}</p>
        <h1>今天要去哪？</h1>
        <div className="bm-privacy">
          <ShieldCheck size={15} strokeWidth={1.8} />
          <span>面部图像默认本地处理</span>
        </div>
      </section>

      <section className="bm-home-list" aria-label="今日核心入口">
        <TodayAction
          icon={Sparkles}
          title="开始镜前建议"
          desc="拍当前状态，给 1-3 条建议。"
          variant="primary"
          onClick={() => setSkinPanelProps({})}
        />
        <div className="bm-home-secondary-grid">
          <TodayAction
            icon={Wand2}
            title="生成今天流程"
            desc="按场景、时间生成步骤。"
            onClick={() => navigate('/tutorial')}
          />
          <TodayAction
            icon={PackagePlus}
            title="快速记录产品"
            desc="拍照、语音或手动录入。"
            onClick={() => setShowProductActions(true)}
          />
        </div>
      </section>

      <input ref={cameraInputRef} type="file" accept="image/*" hidden onChange={handlePhotoCapture} />

      {showProductActions && (
        <ProductAddSheet
          title="快速记录产品"
          onClose={() => setShowProductActions(false)}
          onCamera={() => cameraInputRef.current?.click()}
          onVoice={startVoiceEntry}
          onManual={() => openManualForm()}
        />
      )}

      {showVoiceEntry && (
        <ProductVoiceSheet
          onClose={() => setShowVoiceEntry(false)}
          onResult={handleVoiceResult}
        />
      )}

      {recognizePhoto && (
        <RecognizePanel
          photoFile={recognizePhoto.file}
          previewUrl={recognizePhoto.previewUrl}
          categories={getAllCategories()}
          onSaved={handleRecognizeSaved}
          onClose={() => setRecognizePhoto(null)}
        />
      )}

      {skinPanelProps && (
        <SkinAnalysisPanel
          photoFile={skinPanelProps.photoFile}
          previewUrl={skinPanelProps.previewUrl}
          viewHistoryId={skinPanelProps.viewHistoryId}
          forceHistoryMode={skinPanelProps.forceHistoryMode}
          autoOpenCamera={skinPanelProps.autoOpenCamera}
          onClose={() => {
            setSkinPanelProps(null)
          }}
        />
      )}

      {showManualForm && (
        <ProductForm
          mode="quick"
          categories={getAllCategories()}
          initialValues={initialValues}
          onSubmit={handleManualSubmit}
          onClose={() => {
            setShowManualForm(false)
            setInitialValues({})
          }}
        />
      )}
    </div>
  )
}
