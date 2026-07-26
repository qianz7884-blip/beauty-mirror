import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Package,
  Play,
  RotateCcw,
  ScanFace,
  Sparkles,
  Sun,
  Video,
} from 'lucide-react'
import {
  analyzeFaceRatio,
  completeTutorialPlan,
  createTutorialPlan,
  fetchLatestTutorialPlan,
  fetchLatestFaceRatio,
  fetchProducts,
  fetchSkinAnalysis,
  fetchTutorialRecommendations,
  getAnonymousUserId,
  getPhotoUrl,
} from '../api'
import { usePageBackground } from '../utils/backgroundSettings'
import { compressPhoto } from '../utils/skinAnalysisView'
import tutorialRatioWitchSticker from '../assets/illustrations/beauty-mirror-ip/tutorial-ratio-witch-sticker.webp'
import tutorialCommuteCover from '../assets/illustrations/tutorial-covers/tutorial-commute.webp'
import tutorialBrightCover from '../assets/illustrations/tutorial-covers/tutorial-bright.webp'
import tutorialEveningCover from '../assets/illustrations/tutorial-covers/tutorial-evening.webp'

const FACE_RATIO_CACHE_KEY = 'beauty_mirror_latest_face_ratio'
const WEATHER_CACHE_KEY = 'beauty_mirror_today_weather_v2'

const TIME_OPTIONS = [
  { id: 'quick', label: '5分钟', minutes: 5, keywords: '快速出门妆 懒人淡妆' },
  { id: 'daily', label: '15分钟', minutes: 15, keywords: '通勤妆 自然精致妆' },
  { id: 'complete', label: '30分钟', minutes: 30, keywords: '完整妆容 约会拍照妆' },
]

const PHOTO_CAPTURE_TIPS = [
  '脸正对镜头，鼻梁尽量在中线',
  '两只眼睛高度接近，不歪头不侧脸',
  '发际线、眉毛、下巴都要露出来',
  '用正面柔光，脸占画面六到七成',
]

const VIDEO_PLATFORMS = [
  {
    id: 'douyin',
    label: '抖音',
    buildUrl: query => `https://www.douyin.com/search/${encodeURIComponent(query)}?type=video`,
  },
  {
    id: 'xiaohongshu',
    label: '小红书',
    buildUrl: query => `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}&source=web_explore_feed`,
  },
]

const TUTORIAL_COVERS = [
  tutorialCommuteCover,
  tutorialBrightCover,
  tutorialEveningCover,
]

const SCENES = [
  {
    id: 'commute',
    label: '通勤',
    title: '通勤清透妆',
    icon: Sun,
    focus: '自然干净，减少步骤',
  },
  {
    id: 'office',
    label: '约会',
    title: '柔和约会妆',
    icon: Sparkles,
    focus: '柔和提气色，细节精致',
  },
  {
    id: 'evening',
    label: '拍照',
    title: '上镜立体妆',
    icon: Camera,
    focus: '加强轮廓，镜头下更立体',
  },
]

const PRODUCT_PRIORITY = {
  commute: ['防晒', '底妆', '眉眼', '唇妆'],
  office: ['底妆', '遮瑕', '定妆', '眉眼', '唇妆'],
  evening: ['底妆', '遮瑕', '眉眼', '腮红修容', '唇妆'],
}

function readCachedWeather() {
  if (typeof localStorage === 'undefined') return null
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || 'null')
    return cached?.weather && typeof cached.weather === 'object' ? cached.weather : null
  } catch {
    return null
  }
}

function getFaceRatioCacheKey() {
  return `${FACE_RATIO_CACHE_KEY}:${getAnonymousUserId()}`
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
  const sceneTitle = {
    commute: '通勤清透妆',
    office: '自然精致妆',
    evening: '柔雾氛围妆',
  }[guide.id] || '日常清透妆'

  return [
    {
      title: `适合你的${sceneTitle}`,
      description: `根据${mainTag}与${guide.label}为你匹配`,
      duration: `${guide.minutes}分钟`,
      query: `${mainTag} ${guide.label} 妆容教程`,
    },
    {
      title: '自然提亮裸妆',
      description: `适合${secondTag}，步骤更精简`,
      duration: guide.minutes <= 5 ? '5分钟' : '15分钟',
      query: `${timePart} ${timeKeywords} ${guide.label} ${secondTag} 教程`,
    },
    {
      title: '柔雾感约会妆',
      description: `重点修饰${thirdTag}`,
      duration: '30分钟',
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
  if (threePart.upper?.hairline_available !== true) return []

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

function clampPercent(value, min = 0, max = 100) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.max(min, Math.min(max, number))
}

function buildPaddedPercentRange(start, end, padding, min, max, minSpan = 0) {
  const rangeStart = Number(start)
  const rangeEnd = Number(end)
  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd <= rangeStart) return null

  let nextStart = Math.max(min, rangeStart - padding)
  let nextEnd = Math.min(max, rangeEnd + padding)
  const currentSpan = nextEnd - nextStart

  if (minSpan > 0 && currentSpan < minSpan) {
    const extra = (minSpan - currentSpan) / 2
    nextStart = Math.max(min, nextStart - extra)
    nextEnd = Math.min(max, nextEnd + extra)
  }

  return [nextStart, nextEnd]
}

function mapImageYToFramePercent(point, imageLayout) {
  const yNorm = Number(point?.y_norm)
  if (!Number.isFinite(yNorm)) return null

  if (!imageLayout) {
    return clampPercent(yNorm * 100)
  }

  const yInImage = yNorm * imageLayout.naturalHeight
  return clampPercent(((imageLayout.offsetY + yInImage * imageLayout.scale) / imageLayout.height) * 100, -20, 120)
}

function mapImageXToFramePercent(point, imageLayout) {
  const xNorm = Number(point?.x_norm)
  if (!Number.isFinite(xNorm)) return null

  if (!imageLayout) {
    return clampPercent(xNorm * 100)
  }

  const xInImage = xNorm * imageLayout.naturalWidth
  return clampPercent(((imageLayout.offsetX + xInImage * imageLayout.scale) / imageLayout.width) * 100, -20, 120)
}

function buildShareBasedBoundaries(faceRatio) {
  const threePart = faceRatio?.measurements?.three_part || {}
  const upperShare = Number(threePart.upper?.share)
  const middleShare = Number(threePart.middle?.share)
  const lowerShare = Number(threePart.lower?.share)
  const shares = [upperShare, middleShare, lowerShare].every(value => Number.isFinite(value) && value > 0)
    ? [upperShare, middleShare, lowerShare]
    : [1 / 3, 1 / 3, 1 / 3]
  const top = 14
  const height = 72
  const brow = top + shares[0] * height
  const nose = brow + shares[1] * height
  return [top, brow, nose, top + height]
}

function buildFallbackFiveEyeOverlay(faceRatio) {
  const fiveEye = faceRatio?.measurements?.five_eye || {}
  const leftEye = Number(fiveEye.left_eye_width)
  const rightEye = Number(fiveEye.right_eye_width)
  const eyeGap = Number(fiveEye.inner_eye_distance)
  const faceEyeCount = Number(fiveEye.face_eye_count)
  const avgEye = Number.isFinite(leftEye) && Number.isFinite(rightEye)
    ? (leftEye + rightEye) / 2
    : 1
  const leftEyeUnits = Number.isFinite(leftEye) && avgEye > 0 ? Math.max(0.5, leftEye / avgEye) : 1
  const rightEyeUnits = Number.isFinite(rightEye) && avgEye > 0 ? Math.max(0.5, rightEye / avgEye) : 1
  const gapUnits = Number.isFinite(eyeGap) && avgEye > 0 ? Math.max(0.5, eyeGap / avgEye) : 1
  const totalUnits = Number.isFinite(faceEyeCount) && faceEyeCount > 0 ? faceEyeCount : 5
  const sideUnits = Math.max(0.45, (totalUnits - leftEyeUnits - gapUnits - rightEyeUnits) / 2)
  const units = [sideUnits, leftEyeUnits, gapUnits, rightEyeUnits, sideUnits]
  const unitTotal = units.reduce((sum, value) => sum + value, 0)
  const start = 14
  const span = 72
  const labels = ['左脸缘', '左眼外', '左眼内', '右眼内', '右眼外', '右脸缘']
  const boundaries = [{ id: 'fallback-0', label: labels[0], left: start }]
  let cursor = start

  units.forEach((unit, index) => {
    cursor += (unit / unitTotal) * span
    boundaries.push({
      id: `fallback-${index + 1}`,
      label: labels[index + 1],
      left: clampPercent(cursor, 0, 100),
    })
  })

  const segmentLabels = ['左侧', '左眼', '眼距', '右眼', '右侧']
  return {
    boundaries,
    segments: segmentLabels.map((label, index) => ({
      id: `fallback-segment-${index}`,
      label,
      left: clampPercent((boundaries[index].left + boundaries[index + 1].left) / 2, 4, 96),
    })),
  }
}

function buildFiveEyeOverlay(faceRatio, imageLayout) {
  if (!faceRatio?.ok) {
    return {
      boundaries: [],
      segments: [],
    }
  }

  const guidePoints = faceRatio.measurements?.five_eye_guides || {}
  const pointKeys = [
    ['face_left', '左脸缘'],
    ['left_eye_outer', '左眼外'],
    ['left_eye_inner', '左眼内'],
    ['right_eye_inner', '右眼内'],
    ['right_eye_outer', '右眼外'],
    ['face_right', '右脸缘'],
  ]
  const pointBoundaries = pointKeys.map(([key, fallbackLabel]) => ({
    id: key,
    label: guidePoints[key]?.label || fallbackLabel,
    left: mapImageXToFramePercent(guidePoints[key], imageLayout),
  }))
  const sortedBoundaries = pointBoundaries
    .filter(item => Number.isFinite(item.left))
    .sort((a, b) => a.left - b.left)
  const hasMappedPoints = sortedBoundaries.length === pointBoundaries.length

  if (!hasMappedPoints) {
    return buildFallbackFiveEyeOverlay(faceRatio)
  }

  const segmentDefs = [
    ['left-space', '左侧', 0, 1],
    ['left-eye', '左眼', 1, 2],
    ['eye-gap', '眼距', 2, 3],
    ['right-eye', '右眼', 3, 4],
    ['right-space', '右侧', 4, 5],
  ]

  return {
    boundaries: sortedBoundaries,
    segments: segmentDefs.map(([id, label, startIndex, endIndex]) => ({
      id,
      label,
      left: clampPercent((sortedBoundaries[startIndex].left + sortedBoundaries[endIndex].left) / 2, 4, 96),
    })),
  }
}

function buildMirrorGuideOverlay(faceRatio, imageLayout) {
  const fallbackSegments = [
    { id: 'upper', label: '上庭', percent: '参考', status: '未分析时显示三等分参考线' },
    { id: 'middle', label: '中庭', percent: '参考', status: '未分析时显示三等分参考线' },
    { id: 'lower', label: '下庭', percent: '参考', status: '未分析时显示三等分参考线' },
  ]
  const fallbackBoundaries = [14, 38, 62, 86]

  if (!faceRatio?.ok) {
    return {
      measured: false,
      approx: false,
      note: '参考分割',
      segments: fallbackSegments,
      fiveEye: {
        boundaries: [],
        segments: [],
      },
      boundaries: fallbackBoundaries.map((top, index) => ({
        id: ['top', 'brow', 'nose', 'chin'][index],
        label: ['额顶', '眉心', '鼻底', '下巴'][index],
        top,
      })),
    }
  }

  const threePart = faceRatio.measurements?.three_part || {}
  const guidePoints = faceRatio.measurements?.three_part_guides || {}
  const pointBoundaries = [
    ['forehead_top', '发际线'],
    ['brow_center', '眉心'],
    ['nose_base', '鼻底'],
    ['chin', '下巴'],
  ].map(([key, fallbackLabel]) => ({
    id: key,
    label: guidePoints[key]?.label || fallbackLabel,
    top: mapImageYToFramePercent(guidePoints[key], imageLayout),
  }))
  const hasMappedPoints = pointBoundaries.every((item, index, arr) => (
    Number.isFinite(item.top)
    && (index === 0 || item.top > arr[index - 1].top)
  ))
  const boundaryTops = hasMappedPoints
    ? pointBoundaries.map(item => item.top)
    : buildShareBasedBoundaries(faceRatio)
  const boundaries = pointBoundaries.map((item, index) => ({
    ...item,
    top: boundaryTops[index],
  }))
  const sourceMode = hasMappedPoints ? 'photo_points' : 'ratio_fallback'
  const upper = threePart.upper || {}
  const hairlineMeasured = upper.hairline_available === true
  const segmentDefs = [
    ['upper', '上庭', '上庭均衡', 0, 1],
    ['middle', '中庭', '中庭均衡', 1, 2],
    ['lower', '下庭', '下庭均衡', 2, 3],
  ]
  const segments = segmentDefs.map(([key, label, fallback, startIndex, endIndex]) => {
    const item = threePart[key] || {}
    const center = (boundaryTops[startIndex] + boundaryTops[endIndex]) / 2
    return {
      id: key,
      label: item.label || label,
      percent: formatRatioPercent(item.share),
      status: item.status || getPrimaryRatioTag(faceRatio, tag => tag.startsWith(label), fallback),
      top: clampPercent(center, 4, 96),
    }
  })
  const visibleBoundaries = hairlineMeasured
    ? boundaries
    : boundaries.filter(boundary => boundary.id !== 'forehead_top')
  const visibleSegments = hairlineMeasured
    ? segments
    : segments.filter(segment => segment.id !== 'upper')
  const fiveEye = buildFiveEyeOverlay(faceRatio, imageLayout)
  const firstEyeBoundary = fiveEye.boundaries[0]
  const lastEyeBoundary = fiveEye.boundaries[fiveEye.boundaries.length - 1]
  const horizontalRange = buildPaddedPercentRange(firstEyeBoundary?.left, lastEyeBoundary?.left, 7, 3, 97, 34) || [7, 93]
  const verticalRange = hairlineMeasured
    ? buildPaddedPercentRange(boundaryTops[0], boundaryTops[3], 7, 3, 97, 42)
    : buildPaddedPercentRange(boundaryTops[1], boundaryTops[3], 8, 3, 97, 38)
  const safeVerticalRange = verticalRange || [12, 88]
  const guideStyle = {
    '--bm-guide-left': `${horizontalRange[0]}%`,
    '--bm-guide-right': `${100 - horizontalRange[1]}%`,
    '--bm-guide-eye-top': `${safeVerticalRange[0]}%`,
    '--bm-guide-eye-bottom': `${100 - safeVerticalRange[1]}%`,
  }

  return {
    measured: true,
    approx: !hairlineMeasured || sourceMode !== 'photo_points',
    note: sourceMode === 'photo_points'
      ? (hairlineMeasured ? '按照片关键点定位' : '发际线未识别')
      : (hairlineMeasured ? '按比例回退定位' : '发际线未识别'),
    boundaries: visibleBoundaries,
    fiveEye,
    style: guideStyle,
    segments: visibleSegments,
  }
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
  const hasHairline = threePart.upper?.hairline_available === true
  const usefulTags = getUsefulRatioTags(faceRatio)
  const direction = usefulTags[0] || faceRatio.primary_tags?.[0] || '整体比例接近均衡'
  const threeValues = hasHairline
    ? [
      `上 ${formatRatioNumber(threePart.upper?.normalized)}`,
      `中 ${formatRatioNumber(threePart.middle?.normalized)}`,
      `下 ${formatRatioNumber(threePart.lower?.normalized)}`,
    ].join(' · ')
    : [
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
      helper: hasHairline ? '参考区间 0.88-1.12' : '发际线未识别，上庭未判断',
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
  const location = useLocation()
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [facePhotoPreview, setFacePhotoPreview] = useState('')
  const [faceRatio, setFaceRatio] = useState(null)
  const [analysisId, setAnalysisId] = useState(null)
  const [faceRatioSource, setFaceRatioSource] = useState('')
  const [faceRatioCreatedAt, setFaceRatioCreatedAt] = useState('')
  const [faceRatioError, setFaceRatioError] = useState('')
  const [analyzingFaceRatio, setAnalyzingFaceRatio] = useState(false)
  const [showRatioAnalyzer, setShowRatioAnalyzer] = useState(false)
  const [recommendationData, setRecommendationData] = useState(null)
  const [recommendationLoading, setRecommendationLoading] = useState(false)
  const [recommendationError, setRecommendationError] = useState('')
  const [activePlan, setActivePlan] = useState(null)
  const [planBusy, setPlanBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [timeId, setTimeId] = useState('daily')
  const [sceneId, setSceneId] = useState('commute')
  const [mirrorImageLayout, setMirrorImageLayout] = useState(null)
  const facePreviewFrameRef = useRef(null)
  const facePreviewImageRef = useRef(null)
  const faceCameraRef = useRef(null)
  const faceAlbumRef = useRef(null)
  const recommendationRequestRef = useRef(0)

  useEffect(() => {
    fetchProducts().then(setProducts).catch(() => setProducts([]))

    const restoreCachedRatio = () => {
      try {
        const cached = JSON.parse(localStorage.getItem(getFaceRatioCacheKey()) || 'null')
        if (cached?.face_ratio?.ok) {
          setFaceRatio(cached.face_ratio)
          setAnalysisId(null)
          setFaceRatioSource('tutorial_cache')
          setFaceRatioCreatedAt(cached.created_at || '')
        }
      } catch {
        // 没有可复用记录时保持初始拍照状态。
      }
    }

    const applySkinAnalysis = (data, source = 'skin_analysis') => {
      const nextRatio = data?.face_data?.face_ratio || data?.face_ratio
      if (!nextRatio?.ok) return false
      setFaceRatio(nextRatio)
      setAnalysisId(data.id || data.analysis_id || null)
      setFaceRatioSource(source)
      setFaceRatioCreatedAt(data.created_at || '')
      if (data.photo) {
        setFacePhotoPreview(getPhotoUrl(data.photo, 'skin'))
      }
      return true
    }

    const linkedAnalysisId = location.state?.analysisId
    const loadRatio = linkedAnalysisId
      ? fetchSkinAnalysis(linkedAnalysisId).then(data => {
        if (!applySkinAnalysis(data, 'mirror_link')) restoreCachedRatio()
      })
      : fetchLatestFaceRatio()
      .then((data) => {
        if (!data?.has_result || !data.face_ratio?.ok) {
          restoreCachedRatio()
          return
        }
        applySkinAnalysis(data)
      })
      .catch(restoreCachedRatio)

    loadRatio.catch(restoreCachedRatio)
    fetchLatestTutorialPlan()
      .then(data => {
        if (data?.has_plan && data.plan) setActivePlan(data.plan)
      })
      .catch(() => {})
  }, [location.state?.analysisId])

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

  useEffect(() => {
    if (!faceRatio?.ok) {
      setRecommendationData(null)
      setRecommendationError('')
      return undefined
    }

    const requestId = recommendationRequestRef.current + 1
    recommendationRequestRef.current = requestId
    const timer = window.setTimeout(async () => {
      setRecommendationLoading(true)
      setRecommendationError('')
      try {
        const data = await fetchTutorialRecommendations({
          analysis_id: analysisId || undefined,
          face_ratio: analysisId ? undefined : faceRatio,
          time_id: timeId,
          scene_id: sceneId,
          weather: readCachedWeather(),
        })
        if (recommendationRequestRef.current === requestId) {
          setRecommendationData(data)
        }
      } catch (error) {
        if (recommendationRequestRef.current === requestId) {
          setRecommendationError(
            error.response?.data?.error || '后端推荐暂时不可用，先显示基础教程方向。',
          )
        }
      } finally {
        if (recommendationRequestRef.current === requestId) {
          setRecommendationLoading(false)
        }
      }
    }, 180)

    return () => window.clearTimeout(timer)
  }, [analysisId, faceRatio, timeId, sceneId])

  const fallbackGuide = useMemo(
    () => buildGuide(timeId, sceneId, products),
    [timeId, sceneId, products],
  )
  const activeGuide = useMemo(() => {
    const backendGuide = recommendationData?.guide
    if (!backendGuide) return fallbackGuide
    return {
      ...fallbackGuide,
      ...backendGuide,
      id: backendGuide.scene_id || fallbackGuide.id,
      label: backendGuide.scene_label || fallbackGuide.label,
      time: backendGuide.label || fallbackGuide.time,
      products: (recommendationData.matched_products || []).map(product => product.name),
    }
  }, [fallbackGuide, recommendationData])
  const displayedRatioTags = (getUsefulRatioTags(faceRatio).length ? getUsefulRatioTags(faceRatio) : faceRatio?.ratio_tags || []).slice(0, 5)
  const ratioTips = faceRatio?.makeup_tips?.slice(0, 3) || []
  const ratioQualityFlags = faceRatio?.quality_flags || []
  const needsHairlineRetake = faceRatio?.measurements?.three_part?.upper?.hairline_available === false
  const ratioRetakeMessages = ratioQualityFlags.length > 0
    ? ratioQualityFlags
    : needsHairlineRetake ? ['请露出额头和发际线后重拍'] : []
  const ratioReferenceRows = useMemo(() => buildRatioReferenceRows(faceRatio), [faceRatio])
  const threePartSegments = useMemo(() => buildThreePartSegments(faceRatio), [faceRatio])
  const mirrorGuideOverlay = useMemo(() => buildMirrorGuideOverlay(faceRatio, mirrorImageLayout), [faceRatio, mirrorImageLayout])
  const ratioMetricCards = useMemo(() => buildRatioMetricCards(faceRatio), [faceRatio])
  const videoRecommendations = useMemo(() => (
    recommendationData?.recommendations?.length
      ? recommendationData.recommendations
      : buildVideoRecommendations(faceRatio, activeGuide)
  ), [recommendationData, faceRatio, activeGuide])

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
    setAnalysisId(null)
    setFaceRatioSource('')
    setFaceRatioCreatedAt('')
    setFaceRatioError('')
    setRecommendationData(null)
    setRecommendationError('')
    setAnalyzingFaceRatio(true)
    event.target.value = ''

    try {
      const analysisFile = await compressPhoto(file, 1024)
      const formData = new FormData()
      formData.append('photo', analysisFile)
      const data = await analyzeFaceRatio(formData)
      const nextRatio = data.face_ratio

      if (!data.success || !nextRatio?.ok) {
        throw new Error(data.message || nextRatio?.message || '面部比例分析失败')
      }

      setFaceRatio(nextRatio)
      setFaceRatioSource('tutorial_photo')
      const createdAt = new Date().toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
      setFaceRatioCreatedAt(createdAt)
      try {
        localStorage.setItem(getFaceRatioCacheKey(), JSON.stringify({
          face_ratio: nextRatio,
          created_at: createdAt,
        }))
      } catch {
        // 浏览器禁用本地存储时，本次结果仍可正常使用。
      }
      showToast('已生成视频推荐方向')
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        setFaceRatioError('分析超时了。请换一张更清晰的正脸照，或稍后重试；第一次加载模型会更慢。')
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
    setAnalysisId(null)
    setFaceRatioSource('')
    setFaceRatioCreatedAt('')
    setFaceRatioError('')
    setRecommendationData(null)
    setRecommendationError('')
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

  const buildRecommendationPayload = (recommendationIndex = 0) => ({
    analysis_id: analysisId || undefined,
    face_ratio: analysisId ? undefined : faceRatio,
    time_id: timeId,
    scene_id: sceneId,
    weather: readCachedWeather(),
    recommendation_index: recommendationIndex,
  })

  const handleStartTutorial = async (recommendationIndex = 0) => {
    if (!faceRatio?.ok) {
      setShowRatioAnalyzer(true)
      faceCameraRef.current?.click()
      return
    }

    setPlanBusy(true)
    try {
      const plan = await createTutorialPlan(buildRecommendationPayload(recommendationIndex))
      setActivePlan(plan)
      showToast('今天的教程流程已准备好')
    } catch (error) {
      showToast(error.response?.data?.error || '生成教程流程失败，请稍后重试', 'error')
    } finally {
      setPlanBusy(false)
    }
  }

  const handleCompleteTutorial = async () => {
    if (!activePlan?.id) return
    setPlanBusy(true)
    try {
      const data = await completeTutorialPlan(activePlan.id, { mood: 'stable' })
      setActivePlan(data.plan)
      showToast(data.already_completed ? '这套教程已经记录过了' : '已完成，并同步到妆容日记')
    } catch (error) {
      showToast(error.response?.data?.error || '保存完成记录失败，请稍后重试', 'error')
    } finally {
      setPlanBusy(false)
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
          <span className="bm-page-kicker">PERSONAL MAKEUP GUIDE</span>
          <h1>教程推荐</h1>
          <p className="bm-flow-copy">先读懂三庭五眼，再按时间和场景匹配今天适合的视频教程。</p>
        </div>
        <img className="bm-tutorial-header-ip" src={tutorialRatioWitchSticker} alt="" aria-hidden="true" />
      </section>

      <div className="bm-flow-content">
        <section className={`bm-tutorial-ratio-summary${faceRatio?.ok ? ' has-result' : ''}`}>
          <div className="bm-tutorial-ratio-copy">
            <span className="bm-flow-section-title">你的比例特点</span>
            {faceRatio?.ok ? (
              <>
                <div className="bm-tutorial-ratio-tags">
                  {(displayedRatioTags.length > 0 ? displayedRatioTags : ['比例整体均衡'])
                    .slice(0, 3)
                    .map(tag => <span key={tag}>{tag}</span>)}
                </div>
                {analysisId && (
                  <span className="bm-tutorial-link-source">
                    <CheckCircle2 size={13} strokeWidth={1.9} />
                    已联动最近一次镜前检测
                  </span>
                )}
              </>
            ) : (
              <p>拍一张清晰正脸照，生成三庭五眼标签后再匹配教程。</p>
            )}
            <button
              type="button"
              onClick={() => {
                if (faceRatio?.ok) {
                  setShowRatioAnalyzer(value => !value)
                } else {
                  setShowRatioAnalyzer(true)
                  faceCameraRef.current?.click()
                }
              }}
            >
              {faceRatio?.ok
                ? (showRatioAnalyzer ? '收起详细分析' : '查看详细比例')
                : '拍照分析'}
              <ChevronRight size={14} strokeWidth={1.8} />
            </button>
          </div>
          <button
            type="button"
            className={`bm-tutorial-ratio-portrait${facePhotoPreview ? ' has-photo' : ''}`}
            onClick={() => {
              if (faceRatio?.ok) {
                setShowRatioAnalyzer(value => !value)
              } else {
                setShowRatioAnalyzer(true)
                faceCameraRef.current?.click()
              }
            }}
            aria-label={faceRatio?.ok ? '查看详细比例分析' : '拍照分析三庭五眼'}
          >
            {facePhotoPreview
              ? <img src={facePhotoPreview} alt="" aria-hidden="true" />
              : <ScanFace size={66} strokeWidth={1.08} aria-hidden="true" />}
            <span aria-hidden="true"><i /><i /></span>
          </button>
        </section>

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

        {showRatioAnalyzer && (
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
                  onError={() => {
                    if (!facePhotoPreview.startsWith('blob:')) {
                      setFacePhotoPreview('')
                    }
                  }}
                />
              ) : (
                <span className="bm-mirror-placeholder">
                  <Camera size={26} strokeWidth={1.6} />
                  <strong>正脸平视拍一张</strong>
                  <small>鼻梁居中，露出发际线、眉毛和下巴</small>
                </span>
              )}
              <span
                className={`bm-mirror-guide-lines${mirrorGuideOverlay.measured ? ' is-measured' : ''}${mirrorGuideOverlay.approx ? ' is-approx' : ''}`}
                style={mirrorGuideOverlay.style}
                aria-hidden="true"
              >
                {mirrorGuideOverlay.boundaries.map(boundary => (
                  <i
                    className="bm-mirror-guide-boundary"
                    key={boundary.id}
                    style={{ top: `${boundary.top}%` }}
                    title={boundary.label}
                  >
                    <span>{boundary.label}</span>
                  </i>
                ))}
                {mirrorGuideOverlay.fiveEye.boundaries.map(boundary => (
                  <i
                    className="bm-mirror-eye-boundary"
                    key={boundary.id}
                    style={{ left: `${boundary.left}%` }}
                    title={boundary.label}
                  />
                ))}
                {mirrorGuideOverlay.fiveEye.segments.map(segment => (
                  <i
                    className="bm-mirror-eye-segment"
                    key={segment.id}
                    style={{ left: `${segment.left}%` }}
                  >
                    {segment.label}
                  </i>
                ))}
                {mirrorGuideOverlay.segments.map(segment => (
                  <b key={segment.id} style={{ top: `${segment.top}%` }} title={segment.status}>
                    <span>{segment.label}</span>
                    <em>{segment.percent}</em>
                  </b>
                ))}
                <small className="bm-mirror-guide-source">{mirrorGuideOverlay.note}</small>
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

          <div className="bm-photo-capture-guide" aria-label="拍照提示">
            <div>
              <strong>拍照提示</strong>
              <span>越接近正脸，三庭五眼线越准</span>
            </div>
            <ul>
              {PHOTO_CAPTURE_TIPS.map(tip => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
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
                <div className="bm-face-ratio-status">
                  <span>
                    {faceRatioSource === 'mirror_link'
                      ? '从镜前检测结果进入'
                      : faceRatioSource === 'skin_analysis'
                      ? '已读取最近一次镜前检测'
                      : faceRatioSource === 'tutorial_cache'
                        ? '已恢复上次教程分析'
                        : '本次教程页分析'}
                  </span>
                  {faceRatioCreatedAt && <span>{faceRatioCreatedAt}</span>}
                </div>
                {ratioRetakeMessages.length > 0 && (
                  <div className="bm-face-ratio-quality-alert">
                    <strong>{needsHairlineRetake ? '发际线未识别，建议重拍' : '建议重拍正脸照'}</strong>
                    {ratioRetakeMessages.map(flag => (
                      <span key={flag}>{flag}</span>
                    ))}
                    {needsHairlineRetake && (
                      <button type="button" onClick={() => faceCameraRef.current?.click()}>
                        重新拍照
                      </button>
                    )}
                  </div>
                )}
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
                <p className="bm-face-ratio-note">发际线清晰时才判断上庭；识别不到时只用中庭、下庭和五眼匹配教程方向。</p>
                {faceRatioError && <p className="bm-face-ratio-error">{faceRatioError}</p>}
              </>
            )}
          </div>

        </section>
        )}

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

        <section className={`bm-video-match-card bm-tutorial-video-section${faceRatio?.ok ? '' : ' is-empty'}`}>
          <div className="bm-flow-section-head">
            <div>
              <div className="bm-flow-section-title">为你推荐</div>
              <p>{activeGuide.label} · {activeGuide.focus}</p>
            </div>
            <span>{activeGuide.label} · {activeGuide.time}</span>
          </div>

          {recommendationLoading && (
            <div className="bm-tutorial-recommendation-state" role="status">
              <Loader2 size={15} strokeWidth={1.8} />
              正在结合镜前结果和化妆柜更新推荐…
            </div>
          )}
          {recommendationError && (
            <div className="bm-tutorial-recommendation-state is-warning">
              <AlertCircle size={15} strokeWidth={1.8} />
              {recommendationError}
            </div>
          )}

          {recommendationData?.linkage && (
            <div className="bm-tutorial-linkage" aria-label="推荐依据">
              <div>
                <strong>本次推荐依据</strong>
                <span>
                  {recommendationData.linkage.today_status
                    || recommendationData.linkage.ratio_tags?.slice(0, 2).join('、')
                    || '三庭五眼、时间与场景'}
                </span>
              </div>
              <div className="bm-tutorial-linkage-tags">
                {recommendationData.linkage.ratio_tags?.slice(0, 2).map(tag => (
                  <span key={tag}>{tag}</span>
                ))}
                {recommendationData.linkage.weather_advice?.slice(0, 1).map(tip => (
                  <span key={tip}>{tip}</span>
                ))}
              </div>
            </div>
          )}

          {faceRatio?.ok ? (
            <>
              <div className="bm-tutorial-video-grid">
                {videoRecommendations.map((item, index) => (
                  <article
                    className={`bm-tutorial-video-card${index === 0 ? ' is-featured' : ''}`}
                    key={item.query}
                  >
                    <img src={TUTORIAL_COVERS[index]} alt="" aria-hidden="true" />
                    <div className="bm-tutorial-video-overlay">
                      <span>{item.duration}</span>
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                    </div>
                    <a
                      className="bm-tutorial-video-play"
                      href={VIDEO_PLATFORMS[0].buildUrl(item.query)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`在抖音搜索${item.title}`}
                    >
                      <Play size={index === 0 ? 24 : 17} fill="currentColor" strokeWidth={1.5} />
                    </a>
                    <div className="bm-tutorial-video-actions" aria-label="打开平台搜索">
                      {VIDEO_PLATFORMS.map(platform => (
                        <a
                          key={platform.id}
                          href={platform.buildUrl(item.query)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${platform.label} 搜索 ${item.query}`}
                        >
                          {platform.label}
                          <ExternalLink size={11} strokeWidth={1.8} />
                        </a>
                      ))}
                      <button type="button" onClick={() => handleCopyVideoQuery(item.query)} aria-label="复制视频搜索词">
                        <Copy size={12} strokeWidth={1.8} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="bm-tutorial-flow-actions">
                <button
                  type="button"
                  className="bm-tutorial-start-flow"
                  onClick={() => handleStartTutorial(0)}
                  disabled={planBusy || recommendationLoading}
                >
                  {planBusy ? <Loader2 size={17} strokeWidth={1.8} /> : <Play size={17} fill="currentColor" strokeWidth={1.6} />}
                  <span>{planBusy ? '正在生成…' : '使用主推荐，生成今天流程'}</span>
                </button>
              </div>

              {activeGuide.products.length > 0 && (
                <div className="bm-tutorial-product-row">
                  <span><Package size={14} /> 可用产品</span>
                  <div>
                    {activeGuide.products.map(product => <span key={product}>{product}</span>)}
                  </div>
                </div>
              )}

              {recommendationData?.missing_steps?.length > 0 && (
                <button
                  type="button"
                  className="bm-tutorial-product-gap"
                  onClick={() => navigate('/products')}
                >
                  <span>
                    化妆柜还缺少：{recommendationData.missing_steps.slice(0, 3).join('、')}
                  </span>
                  去补充产品
                  <ChevronRight size={14} strokeWidth={1.8} />
                </button>
              )}
            </>
          ) : (
            <div className="bm-video-empty-state">
              <Video size={25} strokeWidth={1.7} />
              <p>完成三庭五眼分析后，会结合你选择的时间和场景推荐视频。</p>
              <button
                type="button"
                onClick={() => {
                  setShowRatioAnalyzer(true)
                  faceCameraRef.current?.click()
                }}
              >
                现在分析
                <ChevronRight size={15} strokeWidth={1.8} />
              </button>
            </div>
          )}

          {activePlan && (
            <div className={`bm-active-tutorial-plan${activePlan.status === 'completed' ? ' is-completed' : ''}`}>
              <div className="bm-active-tutorial-plan-head">
                <span>
                  {activePlan.status === 'completed'
                    ? <CheckCircle2 size={18} strokeWidth={1.9} />
                    : <Clock3 size={18} strokeWidth={1.8} />}
                </span>
                <div>
                  <strong>
                    {activePlan.status === 'completed' ? '今天的教程已完成' : '今天的教程流程'}
                  </strong>
                  <small>
                    {activePlan.context?.guide?.scene_label || activeGuide.label}
                    {' · '}
                    {activePlan.context?.guide?.label || `${activePlan.time_minutes}分钟`}
                  </small>
                </div>
              </div>
              {activePlan.status !== 'completed' && (
                <ol>
                  {(activePlan.context?.flow_steps || []).slice(0, 5).map(step => (
                    <li key={`${step.order}-${step.title}`}>
                      <span>{step.order}</span>
                      <div>
                        <strong>{step.title}</strong>
                        <small>
                          {step.product?.name
                            ? `使用 ${step.product.name}`
                            : step.action}
                        </small>
                      </div>
                      <em>{step.minutes} 分钟</em>
                    </li>
                  ))}
                </ol>
              )}
              <button
                type="button"
                onClick={activePlan.status === 'completed'
                  ? () => navigate('/diary')
                  : handleCompleteTutorial}
                disabled={planBusy}
              >
                {activePlan.status === 'completed' ? '查看妆容日记' : '完成并同步到日记'}
                <ChevronRight size={15} strokeWidth={1.8} />
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
