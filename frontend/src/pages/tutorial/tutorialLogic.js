import { CATEGORY_ALIASES, PRODUCT_PRIORITY, SCENES, TIME_OPTIONS, TIME_STAGE_BLUEPRINTS } from './tutorialData'

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

export function formatTimelineMinute(minute) {
  const value = Number(minute)
  if (!Number.isFinite(value)) return '--:--'
  return `${String(Math.max(0, Math.floor(value))).padStart(2, '0')}:00`
}

export function buildTutorialTimeline(guide, products) {
  const blueprint = TIME_STAGE_BLUEPRINTS[guide?.timeId] || TIME_STAGE_BLUEPRINTS.daily
  return blueprint.map((step, index) => ({
    ...step,
    id: `${guide?.timeId || 'daily'}-${guide?.sceneId || 'commute'}-${index}`,
    products: getProductsForCategory(products, step.category, 2),
  }))
}

export function buildProductRecommendations(guide, products) {
  const priority = PRODUCT_PRIORITY[guide?.sceneId] || PRODUCT_PRIORITY.commute
  return priority.map(category => ({
    category,
    products: getProductsForCategory(products, category, 3),
  }))
}

export function buildGuide(timeId, sceneId, products) {
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

export function getUsefulRatioTags(faceRatio) {
  const tags = faceRatio?.ratio_tags || []
  return tags.filter(tag => (
    tag
    && tag !== '面部比例整体均衡'
    && !tag.includes('均衡')
    && !tag.includes('基本均衡')
  ))
}

export function buildVideoRecommendations(faceRatio, guide) {
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

export function buildRatioReferenceRows(faceRatio) {
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

export function buildThreePartSegments(faceRatio) {
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

export function buildMirrorGuideOverlay(faceRatio, imageLayout) {
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

export function buildRatioMetricCards(faceRatio) {
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
