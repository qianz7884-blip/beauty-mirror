import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Briefcase,
  Camera,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  Heart,
  Image as ImageIcon,
  Loader2,
  Package,
  PartyPopper,
  RotateCcw,
  Sparkles,
  Sun,
  Video,
} from 'lucide-react'
import { analyzeFaceRatio, fetchProducts } from '../api'
import { usePageBackground } from '../utils/backgroundSettings'
import { compressPhoto } from '../utils/skinAnalysisView'
import tutorialRatioWitchSticker from '../assets/illustrations/beauty-mirror-ip/tutorial-ratio-witch-sticker.png'

const TIME_OPTIONS = [
  { id: 'quick', label: '5分钟救急', minutes: 5, keywords: '镜前急救 提气色 局部补救' },
  { id: 'daily', label: '15分钟日常', minutes: 15, keywords: '基础日常妆 通勤自然妆' },
  { id: 'complete', label: '30分钟完整', minutes: 30, keywords: '完整日常妆 约会拍照妆' },
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
    label: '通勤',
    title: '通勤自然妆教程',
    icon: Briefcase,
    focus: '干净、自然、耐看，减少复杂步骤',
    searchFocus: '通勤妆 自然底妆 持妆',
  },
  {
    id: 'date',
    label: '约会',
    title: '约会氛围妆教程',
    icon: Heart,
    focus: '提气色、柔和、有亲近感',
    searchFocus: '约会妆 氛围感 腮红 唇妆',
  },
  {
    id: 'party',
    label: '聚会',
    title: '聚会上镜妆教程',
    icon: PartyPopper,
    focus: '加强眼妆和轮廓，上镜不吃妆',
    searchFocus: '聚会妆 上镜 持妆 眼妆',
  },
  {
    id: 'daily',
    label: '日常',
    title: '日常基础妆教程',
    icon: Sun,
    focus: '简单稳定，适合反复练习',
    searchFocus: '日常妆 新手 基础步骤',
  },
]

const PRODUCT_PRIORITY = {
  commute: ['防晒', '底妆', '定妆', '眉眼', '唇妆'],
  date: ['底妆', '遮瑕', '腮红修容', '眉眼', '唇妆'],
  party: ['底妆', '遮瑕', '定妆', '眉眼', '腮红修容', '唇妆'],
  daily: ['防晒', '底妆', '眉眼', '唇妆'],
}

const CATEGORY_ALIASES = {
  防晒: ['防晒', '防晒霜', '隔离'],
  底妆: ['底妆', '粉底', '粉霜', '气垫', '妆前乳', '隔离'],
  遮瑕: ['遮瑕', '遮瑕膏', '遮瑕液'],
  定妆: ['定妆', '散粉', '粉饼', '定妆喷雾'],
  眉眼: ['眉眼', '眉笔', '眼影', '眼线', '睫毛', '睫毛膏'],
  腮红修容: ['腮红修容', '腮红', '修容', '高光', '阴影'],
  唇妆: ['唇妆', '口红', '唇膏', '唇釉', '唇蜜'],
}

const TIME_STAGE_BLUEPRINTS = {
  quick: [
    { minute: 0, label: '妆前整理', category: '防晒', action: '快速保湿或防晒，压掉明显浮油' },
    { minute: 1, label: '局部底妆', category: '底妆', action: '只处理泛红、暗沉和鼻翼边界' },
    { minute: 3, label: '眉眼提神', category: '眉眼', action: '补眉尾和睫毛根部，不铺复杂眼影' },
    { minute: 4, label: '唇颊提气色', category: '唇妆', action: '唇色优先，少量带到脸颊统一气色' },
  ],
  daily: [
    { minute: 0, label: '妆前 / 防晒', category: '防晒', action: '让皮肤稳定，后续底妆更服帖' },
    { minute: 2, label: '薄底妆', category: '底妆', action: '从面中铺开，边缘少量带过' },
    { minute: 5, label: '局部遮瑕', category: '遮瑕', action: '只点压眼下、鼻翼、痘印' },
    { minute: 8, label: '眉眼定神', category: '眉眼', action: '眉毛和眼线控制在自然范围' },
    { minute: 11, label: '腮红 / 修容', category: '腮红修容', action: '少量多次调整气色和轮廓' },
    { minute: 13, label: '唇妆', category: '唇妆', action: '和腮红保持同一气色方向' },
  ],
  complete: [
    { minute: 0, label: '妆前准备', category: '防晒', action: '保湿、防晒、等待成膜' },
    { minute: 4, label: '完整底妆', category: '底妆', action: '分区上妆，控制厚度和边界' },
    { minute: 9, label: '遮瑕校正', category: '遮瑕', action: '暗沉、瑕疵、眼下分开处理' },
    { minute: 13, label: '定妆', category: '定妆', action: 'T 区和易脱妆区优先' },
    { minute: 16, label: '眉眼', category: '眉眼', action: '眼影、眼线、睫毛按场景加强' },
    { minute: 22, label: '腮红 / 修容', category: '腮红修容', action: '调整面中、颧骨和下颌线' },
    { minute: 26, label: '唇妆', category: '唇妆', action: '完成整体色彩平衡' },
  ],
}

function productMatchesCategory(product, category) {
  const aliases = CATEGORY_ALIASES[category] || [category]
  const fields = [
    product.category,
    product.name,
    product.usage_steps,
    product.product_features,
  ].filter(Boolean).map(value => String(value))

  return aliases.some(alias => (
    fields.some(field => field.includes(alias) || alias.includes(field))
  ))
}

function getProductsForCategory(products, category, limit = 2) {
  const seen = new Set()
  return products
    .filter(product => productMatchesCategory(product, category))
    .filter(product => {
      const key = product.id || product.name
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}

function formatTimelineMinute(minute) {
  const value = Number(minute)
  if (!Number.isFinite(value)) return '--:--'
  return `${String(Math.max(0, Math.floor(value))).padStart(2, '0')}:00`
}

function buildTutorialTimeline(guide, products) {
  const blueprint = TIME_STAGE_BLUEPRINTS[guide?.timeId] || TIME_STAGE_BLUEPRINTS.daily
  return blueprint.map((step, index) => ({
    ...step,
    id: `${guide?.timeId || 'daily'}-${guide?.sceneId || 'commute'}-${index}`,
    products: getProductsForCategory(products, step.category, 2),
  }))
}

function buildProductRecommendations(guide, products) {
  const priority = PRODUCT_PRIORITY[guide?.sceneId] || PRODUCT_PRIORITY.commute
  return priority.map(category => ({
    category,
    products: getProductsForCategory(products, category, 3),
  }))
}

function buildGuide(timeId, sceneId, products) {
  const time = TIME_OPTIONS.find(item => item.id === timeId) || TIME_OPTIONS[1]
  const scene = SCENES.find(item => item.id === sceneId) || SCENES[0]
  const priority = PRODUCT_PRIORITY[scene.id] || PRODUCT_PRIORITY.commute
  const pickedProducts = []
  const productMatches = priority.map(category => ({
    category,
    products: getProductsForCategory(products, category, 2),
  }))

  productMatches.forEach(item => {
    item.products.forEach(product => {
      const key = product.id || product.name
      if (product && !pickedProducts.some(current => (current.id || current.name) === key)) {
        pickedProducts.push(product)
      }
    })
  })

  return {
    ...scene,
    timeId: time.id,
    sceneId: scene.id,
    time: time.label,
    minutes: time.minutes,
    timeKeywords: time.keywords,
    productMatches,
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
  if (!guide) return []

  const sourceTags = [
    ...getUsefulRatioTags(faceRatio),
    ...(faceRatio?.video_query_tags || []),
  ].filter(Boolean)
  const uniqueTags = [...new Set(sourceTags)]
  const timeKeywords = guide.timeKeywords || '日常新手妆'
  const categoryPart = (PRODUCT_PRIORITY[guide.sceneId] || PRODUCT_PRIORITY.commute).slice(0, 3).join(' ')
  const supportTags = uniqueTags.slice(0, 2)

  return [
    {
      title: '主推视频方向',
      query: `${guide.label} ${timeKeywords} ${guide.searchFocus} ${categoryPart} 化妆教程`,
      subtitle: `${guide.label} · ${guide.time} · ${guide.focus}`,
      assist: faceRatio?.ok && supportTags.length
        ? `辅助参考：${supportTags.join('、')}`
        : '辅助增强可补充三庭五眼和脸型手法',
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

        <section className="bm-tutorial-primary-card">
          <div className="bm-tutorial-primary-head">
            <span className="bm-soft-icon"><Video size={21} strokeWidth={1.6} /></span>
            <div>
              <p>{activeGuide.label} · {activeGuide.focus}</p>
              <h2>{activeGuide.title}</h2>
            </div>
            <span className="bm-time-chip"><Clock3 size={14} />{activeGuide.time}</span>
          </div>

          {primaryVideo && (
            <div className="bm-tutorial-main-video">
              <button
                type="button"
                className="bm-video-query-copy"
                onClick={() => handleCopyVideoQuery(primaryVideo.query)}
              >
                <Video size={18} strokeWidth={1.7} />
                <span>
                  <strong>{primaryVideo.title}</strong>
                  <small>{primaryVideo.query}</small>
                </span>
                <Copy size={15} strokeWidth={1.8} />
              </button>
              <div className="bm-video-platform-links" aria-label="打开平台搜索">
                {VIDEO_PLATFORMS.map(platform => (
                  <a
                    key={platform.id}
                    href={platform.buildUrl(primaryVideo.query)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${platform.label} 搜索 ${primaryVideo.query}`}
                  >
                    {platform.label}
                    <ExternalLink size={12} strokeWidth={1.8} />
                  </a>
                ))}
              </div>
              <p>{primaryVideo.assist}</p>
            </div>
          )}
        </section>

        <section className="bm-tutorial-timeline-card">
          <div className="bm-flow-section-head">
            <div className="bm-flow-section-title">时间节点</div>
            <span>{activeGuide.time}</span>
          </div>
          <ol className="bm-tutorial-timeline">
            {tutorialTimeline.map(step => (
              <li key={step.id}>
                <time>{formatTimelineMinute(step.minute)}</time>
                <div>
                  <strong>{step.label}</strong>
                  <span>{step.action}</span>
                  <small>
                    {step.products.length > 0
                      ? `产品库：${step.products.map(product => product.name).join(' / ')}`
                      : `产品库暂无${step.category}，先按教程同类产品替换`}
                  </small>
                </div>
                <em>{step.category}</em>
              </li>
            ))}
          </ol>
        </section>

        <section className="bm-tutorial-products-card">
          <div className="bm-flow-section-head">
            <div className="bm-flow-section-title">产品替换</div>
            <span>{activeGuide.label}</span>
          </div>
          <div className="bm-tutorial-product-grid">
            {productRecommendations.map(item => (
              <article className="bm-tutorial-product-match" key={item.category}>
                <span className="bm-tutorial-product-category"><Package size={15} />{item.category}</span>
                {item.products.length > 0 ? (
                  <div className="bm-tutorial-product-chips">
                    {item.products.map(product => (
                      <span key={product.id || product.name}>
                        <strong>{product.name}</strong>
                        <small>{product.category || item.category}</small>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p>暂无同类产品</p>
                )}
              </article>
            ))}
          </div>
        </section>

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
              <strong>比例增强</strong>
              <span>不拍照也能看基础教程，拍照后用发际线增强三庭判断</span>
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
                <p className="bm-face-ratio-note">比例增强需要清晰发际线；不拍照也不影响上面的基础教程推荐。</p>
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
        </details>
      </div>
    </div>
  )
}
