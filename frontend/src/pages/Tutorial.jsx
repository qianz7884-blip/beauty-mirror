import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Briefcase,
  Camera,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Moon,
  Package,
  RotateCcw,
  Sparkles,
  Sun,
  Video,
} from 'lucide-react'
import {
  analyzeFaceRatio,
  fetchLatestFaceRatio,
  fetchProducts,
  getPhotoUrl,
} from '../api'
import { usePageBackground } from '../utils/backgroundSettings'
import { compressPhoto } from '../utils/skinAnalysisView'
import tutorialRatioWitchSticker from '../assets/illustrations/beauty-mirror-ip/tutorial-ratio-witch-sticker.webp'

const FACE_RATIO_CACHE_KEY = 'beauty_mirror_latest_face_ratio'

const TIME_OPTIONS = [
  { id: 'quick', label: '5分钟救急', minutes: 5, keywords: '快速出门妆 懒人淡妆' },
  { id: 'daily', label: '15分钟日常', minutes: 15, keywords: '通勤妆 自然精致妆' },
  { id: 'complete', label: '30分钟完整', minutes: 30, keywords: '完整妆容 约会拍照妆' },
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
  const [products, setProducts] = useState([])
  const [facePhotoPreview, setFacePhotoPreview] = useState('')
  const [faceRatio, setFaceRatio] = useState(null)
  const [faceRatioSource, setFaceRatioSource] = useState('')
  const [faceRatioCreatedAt, setFaceRatioCreatedAt] = useState('')
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

    const restoreCachedRatio = () => {
      try {
        const cached = JSON.parse(localStorage.getItem(FACE_RATIO_CACHE_KEY) || 'null')
        if (cached?.face_ratio?.ok) {
          setFaceRatio(cached.face_ratio)
          setFaceRatioSource('tutorial_cache')
          setFaceRatioCreatedAt(cached.created_at || '')
        }
      } catch {
        // 没有可复用记录时保持初始拍照状态。
      }
    }

    fetchLatestFaceRatio()
      .then((data) => {
        if (!data?.has_result || !data.face_ratio?.ok) {
          restoreCachedRatio()
          return
        }
        setFaceRatio(data.face_ratio)
        setFaceRatioSource('skin_analysis')
        setFaceRatioCreatedAt(data.created_at || '')
        if (data.photo) {
          setFacePhotoPreview(getPhotoUrl(data.photo, 'skin'))
        }
      })
      .catch(restoreCachedRatio)
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
  const Icon = activeGuide.icon
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
    setFaceRatioSource('')
    setFaceRatioCreatedAt('')
    setFaceRatioError('')
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
        localStorage.setItem(FACE_RATIO_CACHE_KEY, JSON.stringify({
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
    setFaceRatioSource('')
    setFaceRatioCreatedAt('')
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
          <span className="bm-page-kicker">PERSONAL MAKEUP GUIDE</span>
          <h1>教程推荐</h1>
          <p className="bm-flow-copy">先读懂三庭五眼，再按时间和场景匹配今天适合的视频教程。</p>
        </div>
        <span className="bm-tutorial-brand-mark" aria-hidden="true">✦</span>
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
                    {faceRatioSource === 'skin_analysis'
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
                  <div className="bm-video-query-card" key={item.query}>
                    <button
                      type="button"
                      className="bm-video-query-copy"
                      onClick={() => handleCopyVideoQuery(item.query)}
                    >
                      <Video size={17} strokeWidth={1.7} />
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.query}</small>
                      </span>
                      <Copy size={15} strokeWidth={1.8} />
                    </button>
                    <div className="bm-video-platform-links" aria-label="打开平台搜索">
                      {VIDEO_PLATFORMS.map(platform => (
                        <a
                          key={platform.id}
                          href={platform.buildUrl(item.query)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${platform.label} 搜索 ${item.query}`}
                        >
                          {platform.label}
                          <ExternalLink size={12} strokeWidth={1.8} />
                        </a>
                      ))}
                    </div>
                  </div>
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
