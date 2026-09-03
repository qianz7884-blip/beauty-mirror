import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, History, ShieldCheck, Sparkles } from 'lucide-react'
import SkinAnalysisPanel from '../components/SkinAnalysisPanel'
import WeatherContext from '../components/WeatherContext'
import { usePageBackground } from '../utils/backgroundSettings'
import todayAdviceIllustration from '../assets/illustrations/beauty-mirror-ip/today-advice-card-cutout.png'

function MirrorCheckAction({ icon: Icon, title, desc, onClick, variant = 'secondary' }) {
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
      <span className="bm-card-mini-stickers" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </button>
  )
}

export default function Dashboard() {
  const pageBackground = usePageBackground('home')
  const [skinPanelProps, setSkinPanelProps] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (location.state?.openSkinAnalysis) {
      setSkinPanelProps({ autoOpenCamera: true })
      navigate('.', { replace: true, state: {} })
    }
  }, [location.state, navigate])

  useEffect(() => {
    const openHistory = () => setSkinPanelProps({ forceHistoryMode: true })
    window.addEventListener('open-skin-history', openHistory)
    return () => window.removeEventListener('open-skin-history', openHistory)
  }, [])

  const today = new Date()
  const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日 ${today.toLocaleDateString('zh-CN', { weekday: 'short' })}`

  return (
    <div className="bm-screen bm-home bm-home-detect-only" style={pageBackground.style}>
      <section className="bm-hero bm-home-hero">
        <WeatherContext />
        <div className="bm-home-advice-figure" aria-hidden="true">
          <img src={todayAdviceIllustration} alt="" />
        </div>
        <span className="bm-home-sparkle bm-home-sparkle-a" aria-hidden="true" />
        <span className="bm-home-sparkle bm-home-sparkle-b" aria-hidden="true" />
        <p className="bm-date">{todayLabel}</p>
        <h1>镜前检测</h1>
        <p className="bm-home-hero-copy">拍一张当前状态，获得今天的镜前建议。</p>
        <div className="bm-privacy">
          <ShieldCheck size={15} strokeWidth={1.8} />
          <span>面部图像默认本地处理</span>
        </div>
      </section>

      <section className="bm-home-list bm-home-detect-list" aria-label="镜前检测入口">
        <MirrorCheckAction
          icon={Sparkles}
          title="开始镜前检测"
          desc="拍照识别当前状态，生成 1-3 条今天可以执行的建议。"
          variant="primary"
          onClick={() => setSkinPanelProps({ autoOpenCamera: true })}
        />
        <MirrorCheckAction
          icon={History}
          title="查看检测记录"
          desc="回看之前的镜前检测结果和肤况变化。"
          onClick={() => setSkinPanelProps({ forceHistoryMode: true })}
        />
      </section>

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
    </div>
  )
}
