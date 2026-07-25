import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Briefcase,
  Camera,
  Clock3,
  Copy,
  Image as ImageIcon,
  Loader2,
  Moon,
  Package,
  RotateCcw,
  Sparkles,
  Sun,
  Video,
} from 'lucide-react'
import { analyzeFaceRatio, fetchProducts } from '../api'
import { usePageBackground } from '../utils/backgroundSettings'

const TIME_OPTIONS = [
  { id: 'quick', label: '5分钟救急', minutes: 5, keywords: '快速出门妆 懒人淡妆' },
  { id: 'daily', label: '15分钟日常', minutes: 15, keywords: '通勤妆 自然精致妆' },
  { id: 'complete', label: '30分钟完整', minutes: 30, keywords: '完整妆容 约会拍照妆' },
]

const SCENES = [
  {
    id: 'commute',
    label: '通勤前',
    title: '快速出门教程',
    icon: Sun,
    focus: '自然、干净、减少步骤',
  },
  {
    id: 'office',
    label: '办公室光',
    title: '自然精致教程',
    icon: Briefcase,
    focus: '底妆清透、边界干净',
  },
  {
    id: 'evening',
    label: '晚间出门',
    title: '完整氛围教程',
    icon: Moon,
    focus: '加强层次、但不过度',
  },
]

const PRODUCT_PRIORITY = {
  commute: ['防晒', '底妆', '眉眼', '唇妆'],
  office: ['底妆', '遮瑕', '定妆', '眉眼', '唇妆'],
  evening: ['底妆', '遮瑕', '眉眼', '腮红修容', '唇妆'],
}

function buildGuide(timeId, sceneId, products) {
  const time = TIME_OPTIONS.find(item => item.id === timeId) || TIME_OPTIONS[1]
  const scene = SCENES.find(item => item.id === sceneId) || SCENES[0]
  const priority = PRODUCT_PRIORITY[scene.id] || PRODUCT_PRIORITY.commute
  const pickedProducts = []

  priority.forEach(category => {
    const found = products.find(product => {
      const productCategory = product.category || ''
      if (!productCategory) return false
      return productCategory === category || productCategory.includes(category) || category.includes(productCategory)
    })
    if (found && !pickedProducts.some(item => item.id === found.id)) {
      pickedProducts.push(found)
    }
  })

  return {
    ...scene,
    time: time.label,
    minutes: time.minutes,
    timeKeywords: time.keywords,
    products: pickedProducts.slice(0, 5).map(product => product.name),
  }
}

function getUsefulRatioTags(faceRatio) {
  const tags = faceRatio?.ratio_tags || []
  return tags.filter(tag => (
    tag
    && tag !== '面部比例整体均衡'
    && !tag.includes('均衡')
    && !tag.includes('基本均衡')
  ))
}

function buildVideoRecommendations(faceRatio, guide) {
  if (!faceRatio?.ok || !guide) return []

  const sourceTags = [
    ...getUsefulRatioTags(faceRatio),
    ...(faceRatio.video_query_tags || []),
  ].filter(Boolean)
  const uniqueTags = [...new Set(sourceTags)]
  const mainTag = uniqueTags[0] || '清透自然'
  const secondTag = uniqueTags[1] || '新手友好'
  const thirdTag = uniqueTags[2] || '面部比例修饰'
  const timePart = guide.time.replace(/\s/g, '')
  const timeKeywords = guide.timeKeywords || '日常新手妆'

  return [
    {
      title: '比例修饰教程',
      query: `${mainTag} ${guide.label} 妆容教程`,
    },
    {
      title: '时间预算教程',
      query: `${timePart} ${timeKeywords} ${guide.label} ${secondTag} 教程`,
    },
    {
      title: '局部手法教程',
      query: `${thirdTag} 腮红 修容 眼妆 教程`,
    },
  ]
}

function formatRatioNumber(value, digits = 2) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '--'
  return number.toFixed(digits).replace(/\.?0+$/, '')
}

function formatRatioPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '--'
  return `${formatRatioNumber(number * 100, 1)}%`
}

function getPrimaryRatioTag(faceRatio, matcher, fallback) {
  const tags = faceRatio?.primary_tags || []
  return tags.find(matcher) || fallback
}

function buildRatioReferenceRows(faceRatio) {
  if (!faceRatio?.ok) return []

  const measurements = faceRatio.measurements || {}
  const threePart = measurements.three_part || {}
  const fiveEye = measurements.five_eye || {}
  const contour = measurements.contour || {}

  const threeRows = [
    ['upper', '上庭', '上庭均衡'],
    ['middle', '中庭', '中庭均衡'],
    ['lower', '下庭', '下庭均衡'],
  ].map(([key, label, fallback]) => {
    const item = threePart[key] || {}
    return {
      id: `three-${key}`,
      group: '三庭',
      label,
      value: `${formatRatioPercent(item.share)} · ${formatRatioNumber(item.normalized)}x`,
      reference: '约 33.3% · 0.88-1.12x',
      status: getPrimaryRatioTag(faceRatio, tag => tag.startsWith(label), fallback),
    }
  })

  return [
    ...threeRows,
    {
      id: 'five-eye-count',
      group: '五眼',
      label: '脸宽折算',
      value: `${formatRatioNumber(fiveEye.face_eye_count)} 个眼宽`,
      reference: '4.45-5.55 个眼宽',
      status: getPrimaryRatioTag(
        faceRatio,
        tag => tag.includes('五眼') || tag.includes('横向'),
        '五眼比例基本均衡',
      ),
    },
    {
      id: 'eye-spacing',
      group: '五眼',
      label: '眼距 / 眼宽',
      value: `${formatRatioNumber(fiveEye.eye_spacing_ratio)}x`,
      reference: '0.86-1.16x',
      status: getPrimaryRatioTag(faceRatio, tag => tag.startsWith('眼距'), '眼距基本均衡'),
    },
    {
      id: 'face-height-width',
      group: '辅助',
      label: '脸长 / 脸宽',
      value: `${formatRatioNumber(contour.face_height_width_ratio)}x`,
      reference: '1.18-1.46x',
      status: getPrimaryRatioTag(faceRatio, tag => tag.startsWith('面部'), '面部长宽比例均衡'),
    },
  ]
}

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

  const activeGuide = useMemo(
    () => buildGuide(timeId, sceneId, products),
    [timeId, sceneId, products],
  )
  const Icon = activeGuide.icon
  const displayedRatioTags = (getUsefulRatioTags(faceRatio).length ? getUsefulRatioTags(faceRatio) : faceRatio?.ratio_tags || []).slice(0, 5)
  const ratioTips = faceRatio?.makeup_tips?.slice(0, 3) || []
  const ratioReferenceRows = useMemo(() => buildRatioReferenceRows(faceRatio), [faceRatio])
  const videoRecommendations = useMemo(
    () => buildVideoRecommendations(faceRatio, activeGuide),
    [faceRatio, activeGuide],
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
      const formData = new FormData()
      formData.append('photo', file)
      const data = await analyzeFaceRatio(formData)
      const nextRatio = data.face_ratio

      if (!data.success || !nextRatio?.ok) {
        throw new Error(data.message || nextRatio?.message || '面部比例分析失败')
      }

      setFaceRatio(nextRatio)
      showToast('已生成视频推荐方向')
    } catch (error) {
      setFaceRatioError(error.response?.data?.message || error.response?.data?.error || error.message || '面部比例分析失败')
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
    <div className="bm-screen bm-tutorial" style={pageBackground.style}>
      {toast && (
        <div className="d-toast-container">
          <div className={`d-toast d-toast-${toast.type}`}>{toast.message}</div>
        </div>
      )}

      <section className="bm-hero bm-tutorial-hero">
        <h1>教程推荐</h1>
        <p className="bm-flow-copy">拍照分析比例，再按时间预算和场景找适合今天的视频教程。</p>
      </section>

      <div className="bm-flow-content">
        <section className="bm-flow-panel">
          <div className="bm-flow-time-label">
            <Clock3 size={15} strokeWidth={1.7} />
            <span>选择可投入时间</span>
          </div>
          <div className="bm-segment">
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

          <div className="bm-flow-time-label bm-flow-scene-label">
            <Sparkles size={15} strokeWidth={1.7} />
            <span>选择使用场景</span>
          </div>
          <div className="bm-scene-grid">
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
        </section>

        <section className={`bm-face-ratio-card${faceRatio?.ok ? ' has-result' : ''}`}>
          <div className="bm-face-ratio-head">
            <span className="bm-soft-icon">
              <Sparkles size={21} strokeWidth={1.7} />
            </span>
            <div>
              <p>面部比例推荐</p>
              <h2>拍照分析三庭五眼倾向</h2>
            </div>
            {faceRatio?.ok && (
              <button type="button" onClick={handleClearFaceRatio}>
                <RotateCcw size={15} strokeWidth={1.8} />
                <span>重测</span>
              </button>
            )}
          </div>

          <div className="bm-face-ratio-body">
            <button
              type="button"
              className={`bm-face-ratio-drop${facePhotoPreview ? ' has-photo' : ''}`}
              onClick={() => faceCameraRef.current?.click()}
              disabled={analyzingFaceRatio}
            >
              {facePhotoPreview ? (
                <img src={facePhotoPreview} alt="面部比例分析预览" />
              ) : (
                <>
                  <Camera size={24} strokeWidth={1.6} />
                  <span>拍一张正面照</span>
                  <small>自动生成比例标签和视频关键词</small>
                </>
              )}
              {analyzingFaceRatio && (
                <span className="bm-face-ratio-loading">
                  <Loader2 size={20} strokeWidth={1.8} />
                  分析中
                </span>
              )}
            </button>

            <div className="bm-face-ratio-info">
              {faceRatio?.ok ? (
                <>
                  <div className="bm-face-ratio-status">
                    <span>{faceRatio.confidence === 'high' ? '照片角度可用' : '结果仅作参考'}</span>
                  </div>
                  <p className="bm-face-ratio-summary">{faceRatio.summary}</p>
                  {displayedRatioTags.length > 0 && (
                    <div className="bm-face-ratio-tags">
                      {displayedRatioTags.map(tag => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  )}
                  {ratioReferenceRows.length > 0 && (
                    <div className="bm-face-ratio-reference" aria-label="三庭五眼参考数据">
                      <div className="bm-face-ratio-reference-head">
                        <strong>参考数据</strong>
                        <span>本次值 / 常见参考</span>
                      </div>
                      <div className="bm-face-ratio-reference-grid">
                        {ratioReferenceRows.map(row => (
                          <div className="bm-face-ratio-reference-row" key={row.id}>
                            <span>{row.group}</span>
                            <strong>{row.label}</strong>
                            <b>{row.status}</b>
                            <em>{row.value}</em>
                            <small>参考 {row.reference}</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {ratioTips.length > 0 && (
                    <ul className="bm-face-ratio-tips">
                      {ratioTips.map(tip => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  <p className="bm-face-ratio-summary">
                    上传正面照后，系统会把比例倾向转换成教程关键词。没有照片时也可以先按时间预算和场景看通用方向。
                  </p>
                  {faceRatioError && <p className="bm-face-ratio-error">{faceRatioError}</p>}
                </>
              )}

              <div className="bm-face-ratio-actions">
                <button
                  type="button"
                  onClick={() => faceCameraRef.current?.click()}
                  disabled={analyzingFaceRatio}
                >
                  <Camera size={16} strokeWidth={1.7} />
                  拍照分析
                </button>
                <button
                  type="button"
                  onClick={() => faceAlbumRef.current?.click()}
                  disabled={analyzingFaceRatio}
                >
                  <ImageIcon size={16} strokeWidth={1.7} />
                  相册选择
                </button>
              </div>
              <p className="bm-face-ratio-note">三庭结果是关键点近似，不代表绝对脸型，只用于匹配教程方向。</p>
            </div>
          </div>

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

        <section className="bm-routine-card bm-flow-routine bm-flow-routine-compact">
          <div className="bm-routine-head">
            <span className="bm-soft-icon"><Icon size={21} strokeWidth={1.6} /></span>
            <div>
              <p>{activeGuide.label} · {activeGuide.focus}</p>
              <h2>{activeGuide.title}</h2>
            </div>
            <span className="bm-time-chip"><Clock3 size={14} />{activeGuide.time}</span>
          </div>

          {activeGuide.products.length > 0 && (
            <div className="bm-product-strip bm-flow-product-strip">
              <span className="bm-flow-product-label"><Package size={15} /> 可用产品</span>
              <div className="bm-flow-product-chips">
                {activeGuide.products.map(product => (
                  <span key={product}>{product}</span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className={`bm-video-match-card${faceRatio?.ok ? '' : ' is-empty'}`}>
          <div className="bm-flow-section-head">
            <div className="bm-flow-section-title">推荐视频方向</div>
            <span>{activeGuide.label} · {activeGuide.time}</span>
          </div>

          {faceRatio?.ok ? (
            <>
              <p className="bm-video-match-copy">
                按你的比例标签、时间预算和使用场景生成搜索词。后面有视频库时，这里可以直接展示对应教程。
              </p>
              <div className="bm-video-query-list">
                {videoRecommendations.map(item => (
                  <button
                    key={item.query}
                    type="button"
                    onClick={() => handleCopyVideoQuery(item.query)}
                  >
                    <Video size={17} strokeWidth={1.7} />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.query}</small>
                    </span>
                    <Copy size={15} strokeWidth={1.8} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="bm-video-empty-state">
              <Video size={23} strokeWidth={1.7} />
              <p>拍照分析后，会在这里生成 3 个视频搜索词。</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
