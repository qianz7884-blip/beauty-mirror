import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Briefcase,
  Camera,
  ChevronRight,
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
import tutorialRatioWitchSticker from '../assets/illustrations/beauty-mirror-ip/tutorial-ratio-witch-sticker.png'

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
    const isUsable = item.usable_for_ratio !== false
    return {
      id: `three-${key}`,
      group: '三庭',
      label: item.label || label,
      value: `${formatRatioPercent(item.share)} · ${formatRatioNumber(item.normalized)}x`,
      reference: isUsable ? '约 33.3% · 0.88-1.12x' : '需清晰发际线',
      status: item.status || getPrimaryRatioTag(faceRatio, tag => tag.startsWith(label), fallback),
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

function buildThreePartSegments(faceRatio) {
  if (!faceRatio?.ok) return []

  const threePart = faceRatio.measurements?.three_part || {}
  return [
    ['upper', '上庭', '上庭均衡'],
    ['middle', '中庭', '中庭均衡'],
    ['lower', '下庭', '下庭均衡'],
  ].map(([key, label, fallback]) => {
    const item = threePart[key] || {}
    const share = Number(item.share)
    const sharePercent = Number.isFinite(share) ? Math.max(20, Math.min(46, share * 100)) : 33.3
    return {
      id: key,
      label: item.label || label,
      percent: formatRatioPercent(item.share),
      normalized: `${formatRatioNumber(item.normalized)}x`,
      status: item.status || getPrimaryRatioTag(faceRatio, tag => tag.startsWith(label), fallback),
      width: `${sharePercent}%`,
    }
  })
}

function buildRatioMetricCards(faceRatio) {
  if (!faceRatio?.ok) {
    return [
      { id: 'direction', icon: '✦', label: '比例方向', value: '等待正面照', helper: '上传后自动生成教程关键词' },
      { id: 'three', icon: '三', label: '三庭', value: '待分析', helper: '上 / 中 / 下庭' },
      { id: 'five', icon: '五', label: '五眼', value: '待分析', helper: '眼距与脸宽参考' },
    ]
  }

  const measurements = faceRatio.measurements || {}
  const threePart = measurements.three_part || {}
  const fiveEye = measurements.five_eye || {}
  const usefulTags = getUsefulRatioTags(faceRatio)
  const direction = usefulTags[0] || faceRatio.primary_tags?.[0] || '整体比例接近均衡'
  const threeValues = [
    `上 ${formatRatioNumber(threePart.upper?.normalized)}`,
    `中 ${formatRatioNumber(threePart.middle?.normalized)}`,
    `下 ${formatRatioNumber(threePart.lower?.normalized)}`,
  ].join(' · ')
  const eyeSpacingRatio = formatRatioNumber(fiveEye.eye_spacing_ratio)
  const faceEyeCount = formatRatioNumber(fiveEye.face_eye_count)

  return [
    {
      id: 'direction',
      icon: '✦',
      label: '比例方向',
      value: direction,
      helper: '先按这个方向筛教程',
    },
    {
      id: 'three',
      icon: '三',
      label: '三庭',
      value: threeValues.includes('--') ? '参考已生成' : threeValues,
      helper: '参考区间 0.88-1.12',
    },
    {
      id: 'five',
      icon: '五',
      label: '五眼',
      value: eyeSpacingRatio !== '--' ? `眼距 ${eyeSpacingRatio}x` : `${faceEyeCount} 个眼宽`,
      helper: faceEyeCount !== '--' ? `脸宽约 ${faceEyeCount} 个眼宽` : '横向比例参考',
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
  const threePartSegments = useMemo(() => buildThreePartSegments(faceRatio), [faceRatio])
  const ratioMetricCards = useMemo(() => buildRatioMetricCards(faceRatio), [faceRatio])
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
    <div className="bm-screen bm-tutorial bm-tutorial-mirror" style={pageBackground.style}>
      {toast && (
        <div className="d-toast-container">
          <div className={`d-toast d-toast-${toast.type}`}>{toast.message}</div>
        </div>
      )}

      <section className="bm-hero bm-tutorial-hero">
        <div>
          <h1>教程推荐</h1>
          <p className="bm-flow-copy">按时间、场景和面部比例找到今天适合的教程</p>
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

        <section className={`bm-face-ratio-card bm-mirror-analysis-card${faceRatio?.ok ? ' has-result' : ''}`}>
          <div className="bm-mirror-stage">
            <span className="bm-mirror-note" aria-hidden="true">
              <span>你的比例</span>
              <small>{analyzingFaceRatio ? '正在分析中...' : faceRatio?.ok ? '已生成教程方向' : '等待正面照'}</small>
            </span>
            <img className="bm-mirror-ip-sticker" src={tutorialRatioWitchSticker} alt="" aria-hidden="true" />
            <button
              type="button"
              className={`bm-face-ratio-drop bm-mirror-photo${facePhotoPreview ? ' has-photo' : ''}`}
              onClick={() => faceCameraRef.current?.click()}
              disabled={analyzingFaceRatio}
            >
              {facePhotoPreview ? (
                <img src={facePhotoPreview} alt="面部比例分析预览" />
              ) : (
                <span className="bm-mirror-placeholder">
                  <Camera size={26} strokeWidth={1.6} />
                  <strong>拍一张正面照</strong>
                  <small>自动生成比例标签和视频关键词</small>
                </span>
              )}
              <span className="bm-mirror-guide-lines" aria-hidden="true">
                <b>上庭</b>
                <b>中庭</b>
                <b>下庭</b>
              </span>
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

          <div className="bm-ratio-metric-strip" aria-label="面部比例参考数据">
            {ratioMetricCards.map((item, index) => (
              <div className="bm-ratio-metric" key={item.id}>
                <span>{item.icon || (index === 0 ? '↻' : index === 1 ? '◉' : '⌄')}</span>
                <div>
                  <strong>{item.label}</strong>
                  <em>{item.value}</em>
                  <small>{item.helper}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="bm-face-ratio-info bm-mirror-result-info">
            {faceRatio?.ok ? (
              <>
                <p className="bm-face-ratio-summary">{faceRatio.summary}</p>
                {displayedRatioTags.length > 0 && (
                  <div className="bm-face-ratio-tags">
                    {displayedRatioTags.map(tag => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                )}
                {ratioReferenceRows.length > 0 && (
                  <div className="bm-face-ratio-reference bm-ratio-reference-compact" aria-label="三庭五眼参考数据">
                    <div className="bm-face-ratio-reference-head">
                      <strong>参考依据</strong>
                      <span>本次值 / 常见范围</span>
                    </div>
                    {threePartSegments.length > 0 && (
                      <div className="bm-three-part-meter" aria-label="三庭占比">
                        {threePartSegments.map(segment => (
                          <span key={segment.id} style={{ flexBasis: segment.width }} title={segment.status}>
                            <b>{segment.label}</b>
                            <em>{segment.percent}</em>
                            <small>{segment.normalized}</small>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="bm-ratio-reference-pills">
                      {ratioReferenceRows.filter(row => !row.id.startsWith('three-')).map(row => (
                        <span key={row.id} title={row.status}>
                          <b>{row.label}</b>
                          <em>{row.value}</em>
                          <small>参考 {row.reference}</small>
                        </span>
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
                <p className="bm-face-ratio-note">三庭结果是关键点近似，不代表绝对脸型，只用于匹配教程方向。</p>
                {faceRatioError && <p className="bm-face-ratio-error">{faceRatioError}</p>}
              </>
            )}
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
              <button type="button" onClick={() => faceCameraRef.current?.click()}>
                现在分析
                <ChevronRight size={15} strokeWidth={1.8} />
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
