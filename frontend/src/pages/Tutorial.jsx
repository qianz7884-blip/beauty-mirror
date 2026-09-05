import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  ChevronRight,
  Clock3,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { analyzeFaceRatio, fetchProducts } from '../api'
import { usePageBackground } from '../utils/backgroundSettings'
import { compressPhoto } from '../utils/skinAnalysisView'
import tutorialRatioWitchSticker from '../assets/illustrations/beauty-mirror-ip/tutorial-ratio-witch-sticker.png'

import {
  PHOTO_CAPTURE_TIPS,
  SCENES,
  TIME_OPTIONS,
} from './tutorial/tutorialData'
import {
  buildGuide,
  buildMirrorGuideOverlay,
  buildProductRecommendations,
  buildRatioMetricCards,
  buildRatioReferenceRows,
  buildThreePartSegments,
  buildTutorialTimeline,
  buildVideoRecommendations,
  getUsefulRatioTags,
} from './tutorial/tutorialLogic'
import {
  TutorialPrimaryVideoCard,
  TutorialProductMatchesCard,
  TutorialTimelineCard,
} from './tutorial/TutorialRecommendationSections'
import {
  TutorialMirrorOverlay,
  TutorialRatioMetrics,
  TutorialRatioResultInfo,
} from './tutorial/TutorialFaceAnalysisDisplay'

export default function Tutorial() {
  const pageBackground = usePageBackground('tutorial')
  const [products, setProducts] = useState([])
  const [facePhotoPreview, setFacePhotoPreview] = useState('')
  const [faceRatio, setFaceRatio] = useState(null)
  const [faceRatioError, setFaceRatioError] = useState('')
  const [analyzingFaceRatio, setAnalyzingFaceRatio] = useState(false)
  const [toast, setToast] = useState(null)
  const [timeId, setTimeId] = useState('daily')
  const [sceneId, setSceneId] = useState('commute')
  const [mirrorImageLayout, setMirrorImageLayout] = useState(null)
  const facePreviewFrameRef = useRef(null)
  const facePreviewImageRef = useRef(null)
  const faceCameraRef = useRef(null)
  const faceAlbumRef = useRef(null)

  useEffect(() => {
    fetchProducts().then(setProducts).catch(() => setProducts([]))
  }, [])

  useEffect(() => {
    return () => {
      if (facePhotoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(facePhotoPreview)
      }
    }
  }, [facePhotoPreview])

  const refreshMirrorImageLayout = () => {
    const frame = facePreviewFrameRef.current
    const image = facePreviewImageRef.current

    if (!frame || !image || !image.naturalWidth || !image.naturalHeight) {
      setMirrorImageLayout(null)
      return
    }

    const width = frame.clientWidth
    const height = frame.clientHeight
    if (!width || !height) {
      setMirrorImageLayout(null)
      return
    }

    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
    const renderedWidth = image.naturalWidth * scale
    const renderedHeight = image.naturalHeight * scale
    const nextLayout = {
      width,
      height,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      scale,
      offsetX: (width - renderedWidth) / 2,
      offsetY: (height - renderedHeight) / 2,
    }

    setMirrorImageLayout(prev => {
      if (
        prev
        && Math.abs(prev.width - nextLayout.width) < 0.5
        && Math.abs(prev.height - nextLayout.height) < 0.5
        && Math.abs(prev.naturalWidth - nextLayout.naturalWidth) < 0.5
        && Math.abs(prev.naturalHeight - nextLayout.naturalHeight) < 0.5
        && Math.abs(prev.offsetY - nextLayout.offsetY) < 0.5
      ) {
        return prev
      }
      return nextLayout
    })
  }

  useEffect(() => {
    if (!facePhotoPreview) {
      setMirrorImageLayout(null)
      return undefined
    }

    const frame = facePreviewFrameRef.current
    const rafId = window.requestAnimationFrame(refreshMirrorImageLayout)
    let observer = null

    if (typeof ResizeObserver !== 'undefined' && frame) {
      observer = new ResizeObserver(refreshMirrorImageLayout)
      observer.observe(frame)
    }

    window.addEventListener('resize', refreshMirrorImageLayout)
    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('resize', refreshMirrorImageLayout)
      observer?.disconnect()
    }
  }, [facePhotoPreview])

  const activeGuide = useMemo(
    () => buildGuide(timeId, sceneId, products),
    [timeId, sceneId, products],
  )
  const displayedRatioTags = (getUsefulRatioTags(faceRatio).length ? getUsefulRatioTags(faceRatio) : faceRatio?.ratio_tags || []).slice(0, 5)
  const ratioTips = faceRatio?.makeup_tips?.slice(0, 3) || []
  const ratioQualityFlags = faceRatio?.quality_flags || []
  const hairlineReason = faceRatio?.measurements?.three_part?.upper?.source
    || faceRatio?.measurements?.hairline?.reason
    || ''
  const needsHairlineRetake = faceRatio?.measurements?.three_part?.upper?.hairline_available === false
    && hairlineReason !== 'hairline_skipped'
  const ratioRetakeMessages = ratioQualityFlags.length > 0
    ? ratioQualityFlags
    : needsHairlineRetake ? ['请露出额头和发际线后重拍'] : []
  const ratioReferenceRows = useMemo(() => buildRatioReferenceRows(faceRatio), [faceRatio])
  const threePartSegments = useMemo(() => buildThreePartSegments(faceRatio), [faceRatio])
  const mirrorGuideOverlay = useMemo(() => buildMirrorGuideOverlay(faceRatio, mirrorImageLayout), [faceRatio, mirrorImageLayout])
  const ratioMetricCards = useMemo(() => buildRatioMetricCards(faceRatio), [faceRatio])
  const videoRecommendations = useMemo(
    () => buildVideoRecommendations(faceRatio, activeGuide),
    [faceRatio, activeGuide],
  )
  const primaryVideo = videoRecommendations[0]
  const tutorialTimeline = useMemo(
    () => buildTutorialTimeline(activeGuide, products),
    [activeGuide, products],
  )
  const productRecommendations = useMemo(
    () => buildProductRecommendations(activeGuide, products),
    [activeGuide, products],
  )

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 2200)
  }

  const handleFaceRatioPhotoSelected = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (facePhotoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(facePhotoPreview)
    }

    setFacePhotoPreview(URL.createObjectURL(file))
    setFaceRatio(null)
    setFaceRatioError('')
    setAnalyzingFaceRatio(true)
    event.target.value = ''

    try {
      const analysisFile = await compressPhoto(file, 1024)
      const formData = new FormData()
      formData.append('photo', analysisFile)
      formData.append('use_hairline', '1')
      const data = await analyzeFaceRatio(formData)
      const nextRatio = data.face_ratio

      if (!data.success || !nextRatio?.ok) {
        throw new Error(data.message || nextRatio?.message || '面部比例分析失败')
      }

      setFaceRatio(nextRatio)
      showToast('已生成视频推荐方向')
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        setFaceRatioError('分析超时了。请换一张更清晰的正脸照，或稍后重试；第一次加载模型会更慢。')
      } else if (error.request && !error.response) {
        setFaceRatioError('比例增强暂时连接失败；上面的基础教程推荐仍可正常使用。请确认后端已启动后再试。')
      } else {
        setFaceRatioError(error.response?.data?.message || error.response?.data?.error || error.message || '面部比例分析失败')
      }
    } finally {
      setAnalyzingFaceRatio(false)
    }
  }

  const handleClearFaceRatio = () => {
    if (facePhotoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(facePhotoPreview)
    }
    setFacePhotoPreview('')
    setFaceRatio(null)
    setFaceRatioError('')
    setAnalyzingFaceRatio(false)
  }

  const handleCopyVideoQuery = async (query) => {
    try {
      await navigator.clipboard.writeText(query)
      showToast('已复制视频搜索词')
    } catch {
      showToast(query)
    }
  }

  return (
    <div className="bm-screen bm-tutorial bm-tutorial-mirror" style={pageBackground.style}>
      {toast && (
        <div className="d-toast-container">
          <div className={`d-toast d-toast-${toast.type}`}>{toast.message}</div>
        </div>
      )}

      <section className="bm-hero bm-tutorial-hero">
        <div>
          <h1>教程推荐</h1>
          <p className="bm-flow-copy">先按时间和场景找教程，拍照比例分析只作为增强参考</p>
        </div>
        <span className="bm-tutorial-brand-mark">Beauty<br />Mirror</span>
      </section>

      <div className="bm-flow-content">
        <section className="bm-flow-panel bm-tutorial-control-panel" aria-label="教程筛选">
          <div className="bm-tutorial-choice-row">
            <div className="bm-tutorial-choice-label">
              <Clock3 size={16} strokeWidth={1.7} />
              <span>时间</span>
            </div>
            <div className="bm-segment bm-tutorial-pill-group">
              {TIME_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  className={option.id === timeId ? 'active' : ''}
                  onClick={() => setTimeId(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bm-tutorial-choice-row">
            <div className="bm-tutorial-choice-label">
              <Sparkles size={16} strokeWidth={1.7} />
              <span>场景</span>
            </div>
            <div className="bm-scene-grid bm-tutorial-pill-group">
              {SCENES.map(scene => {
                const SceneIcon = scene.icon
                return (
                  <button
                    key={scene.id}
                    type="button"
                    className={scene.id === sceneId ? 'active' : ''}
                    onClick={() => setSceneId(scene.id)}
                  >
                    <SceneIcon size={17} strokeWidth={1.7} />
                    <span>{scene.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <TutorialPrimaryVideoCard
          activeGuide={activeGuide}
          primaryVideo={primaryVideo}
          onCopyVideoQuery={handleCopyVideoQuery}
        />

        <TutorialTimelineCard
          activeGuide={activeGuide}
          tutorialTimeline={tutorialTimeline}
        />

        <TutorialProductMatchesCard
          activeGuide={activeGuide}
          productRecommendations={productRecommendations}
        />

        <details className="bm-tutorial-assist-details">
          <summary>
            <span className="bm-soft-icon"><Sparkles size={18} strokeWidth={1.7} /></span>
            <span>
              <strong>辅助增强：三庭五眼 / 脸型</strong>
              <small>需要更细的局部手法时再拍照分析</small>
            </span>
            <ChevronRight className="bm-assist-chevron" size={18} strokeWidth={1.8} />
          </summary>

          <section className={`bm-face-ratio-card bm-mirror-analysis-card${faceRatio?.ok ? ' has-result' : ''}`}>
          <div className="bm-mirror-stage">
            <span className="bm-mirror-note" aria-hidden="true">
              <span>你的比例</span>
              <small>{analyzingFaceRatio ? '正在分析中...' : faceRatio?.ok ? '已生成教程方向' : '等待正面照'}</small>
            </span>
            <img className="bm-mirror-ip-sticker" src={tutorialRatioWitchSticker} alt="" aria-hidden="true" />
            <button
              ref={facePreviewFrameRef}
              type="button"
              className={`bm-face-ratio-drop bm-mirror-photo${facePhotoPreview ? ' has-photo' : ''}`}
              onClick={() => faceCameraRef.current?.click()}
              disabled={analyzingFaceRatio}
            >
              {facePhotoPreview ? (
                <img
                  ref={facePreviewImageRef}
                  src={facePhotoPreview}
                  alt="面部比例分析预览"
                  onLoad={refreshMirrorImageLayout}
                />
              ) : (
                <span className="bm-mirror-placeholder">
                  <Camera size={26} strokeWidth={1.6} />
                  <strong>可选：拍照增强推荐</strong>
                  <small>鼻梁居中，露出发际线、眉毛和下巴</small>
                </span>
              )}
              <TutorialMirrorOverlay mirrorGuideOverlay={mirrorGuideOverlay} />
              {analyzingFaceRatio && (
                <span className="bm-face-ratio-loading">
                  <Loader2 size={20} strokeWidth={1.8} />
                  分析中
                </span>
              )}
            </button>

            <div className="bm-mirror-actions" aria-label="面部比例分析操作">
              <button
                type="button"
                className="bm-mirror-primary-action"
                onClick={() => faceCameraRef.current?.click()}
                disabled={analyzingFaceRatio}
              >
                <Camera size={18} strokeWidth={1.7} />
                <span>拍照分析</span>
              </button>
              <button
                type="button"
                onClick={() => faceAlbumRef.current?.click()}
                disabled={analyzingFaceRatio}
              >
                <ImageIcon size={17} strokeWidth={1.7} />
                <span>相册选择</span>
              </button>
              {faceRatio?.ok && (
                <button type="button" onClick={handleClearFaceRatio}>
                  <RotateCcw size={15} strokeWidth={1.8} />
                  <span>重测</span>
                </button>
              )}
            </div>
          </div>

          <div className="bm-photo-capture-guide" aria-label="拍照提示">
            <div>
              <strong>比例增强</strong>
              <span>不拍照也能看基础教程，拍照后用发际线增强三庭判断</span>
            </div>
            <ul>
              {PHOTO_CAPTURE_TIPS.map(tip => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>

          <TutorialRatioMetrics ratioMetricCards={ratioMetricCards} />

          <TutorialRatioResultInfo
            displayedRatioTags={displayedRatioTags}
            faceRatio={faceRatio}
            faceRatioError={faceRatioError}
            needsHairlineRetake={needsHairlineRetake}
            ratioReferenceRows={ratioReferenceRows}
            ratioRetakeMessages={ratioRetakeMessages}
            ratioTips={ratioTips}
            threePartSegments={threePartSegments}
            onRetake={() => faceCameraRef.current?.click()}
          />

          <input
            ref={faceCameraRef}
            type="file"
            accept="image/*"
            capture="user"
            className="bm-hidden-file"
            onChange={handleFaceRatioPhotoSelected}
          />
          <input
            ref={faceAlbumRef}
            type="file"
            accept="image/*"
            className="bm-hidden-file"
            onChange={handleFaceRatioPhotoSelected}
          />
          </section>
        </details>
      </div>
    </div>
  )
}
