export function compressPhoto(file, maxSize = 1024) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height } = img
      if (Math.max(width, height) <= maxSize) {
        resolve(file)
        return
      }
      const ratio = maxSize / Math.max(width, height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressed = new File([blob], file.name || 'photo.jpg', { type: 'image/jpeg' })
            resolve(compressed)
          } else {
            resolve(file)
          }
        },
        'image/jpeg',
        0.75,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })
}

export function buildMirrorAdviceCards(data) {
  if (!data) return []
  if (Array.isArray(data.mirror_advice) && data.mirror_advice.length > 0) {
    return data.mirror_advice.slice(0, 3).map((item) => ({
      area: item.area || item.region || item.position || '局部区域',
      product: item.product || item.recommended_product || '已有适合当前步骤的产品',
      action: item.action || item.suggestion || '少量按压，保持轻薄',
      reason: item.reason || '该区域会影响当前妆感，轻微处理即可',
    }))
  }
  const fallbackAreas = ['鼻翼两侧', '眼下区域', '唇周边缘']
  const fallbackActions = [
    '少量按压，等待 10 秒后再上底妆',
    '薄薄补一层，轻拍提亮',
    '轻薄修饰边缘，让整体更干净',
  ]
  const fallbackReasons = [
    '鼻翼区域更容易干燥，提前按压能让底妆更服帖',
    '眼周肤色略偏暗，在自然光下更明显',
    '局部肤色不够均匀，会影响整体清爽感',
  ]
  const concerns = Array.isArray(data.concerns) ? data.concerns : []
  const recommendations = Array.isArray(data.recommendations) ? data.recommendations : []
  const observations = Array.isArray(data.observations) ? data.observations : []
  const source = [...concerns, ...recommendations, ...observations].filter(Boolean)

  return (source.length > 0 ? source : ['妆前贴合度', '局部光泽', '边界自然度'])
    .slice(0, 3)
    .map((item, index) => {
      const isObject = item && typeof item === 'object'
      return {
        area: isObject ? (item.area || item.region || item.position || fallbackAreas[index]) : fallbackAreas[index],
        product: isObject
          ? (item.product || item.recommended_product || (index === 0 ? '已有保湿或舒缓产品' : '已有底妆 / 定妆产品'))
          : (index === 0 ? '已有保湿或舒缓产品' : '已有底妆 / 定妆产品'),
        action: isObject
          ? (item.action || item.suggestion || fallbackActions[index])
          : (recommendations[index] && recommendations[index].length <= 34 ? recommendations[index] : fallbackActions[index]),
        reason: isObject
          ? (item.reason || fallbackReasons[index])
          : (observations[index] && observations[index].length <= 36 ? observations[index] : fallbackReasons[index]),
      }
    })
}

export function buildStatusSummary(data) {
  if (!data) return '今天状态整体均衡，建议重点关注鼻翼、眼下和唇周细节。'
  const raw = data.today_status || data.summary || ''
  if (!raw) return '今天状态整体均衡，建议重点关注鼻翼、眼下和唇周细节。'
  return raw
    .replace(/亲爱的[，,]?\s*/g, '')
    .replace(/问题|缺陷|严重|警告|必须|扣分/g, '可轻微关注')
    .slice(0, 58)
}
