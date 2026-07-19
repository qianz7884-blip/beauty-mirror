const DEFAULT_SHELF_LIFE_YEARS = 2

function parseDate(value) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function addYears(date, years) {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + years)
  return next
}

function diffDays(from, to) {
  const day = 24 * 60 * 60 * 1000
  return Math.ceil((to.getTime() - from.getTime()) / day)
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildProductReminders(products, options = {}) {
  const expiringWithinDays = Number(options.expiringWithinDays || 30)
  const lowRemainingPercent = Number(options.lowRemainingPercent || 30)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const lowUsageThreshold = 100 - lowRemainingPercent

  return (Array.isArray(products) ? products : [])
    .flatMap(product => {
      const reminders = []
      const name = [product.brand, product.name].filter(Boolean).join(' ') || product.name || '未命名产品'
      const usagePercent = Math.max(0, Math.min(100, Number(product.usage_percent || 0)))
      const remainingPercent = Math.max(0, 100 - usagePercent)

      if (usagePercent >= lowUsageThreshold) {
        reminders.push({
          id: `${product.id}-low`,
          type: 'low',
          level: remainingPercent <= 10 ? 'urgent' : 'warning',
          product,
          title: `${name} 剩余约 ${remainingPercent}%`,
          message: `这瓶已经用到 ${usagePercent}%，低于你设置的 ${lowRemainingPercent}% 剩余提醒线，可以安排补货。`,
        })
      }

      const exactExpiryDate = parseDate(product.expiry_date)
      const purchaseDate = parseDate(product.purchase_date)
      if (exactExpiryDate || purchaseDate) {
        const expiryDate = exactExpiryDate || addYears(purchaseDate, DEFAULT_SHELF_LIFE_YEARS)
        const daysLeft = diffDays(today, expiryDate)
        if (daysLeft <= expiringWithinDays) {
          const dateBasis = exactExpiryDate ? '按你记录的预计到期时间' : '按开封/购入日期估算'
          reminders.push({
            id: `${product.id}-expiry`,
            type: daysLeft < 0 ? 'expired' : 'expiring',
            level: daysLeft < 0 ? 'urgent' : 'warning',
            product,
            title: daysLeft < 0 ? `${name} 已过期` : `${name} 还有 ${daysLeft} 天过期`,
            message: daysLeft < 0
              ? `${dateBasis}，它在 ${formatDate(expiryDate)} 已过期，建议停止使用并清理。`
              : `${dateBasis}，它会在 ${formatDate(expiryDate)} 到期，已经进入 ${expiringWithinDays} 天临期提醒。`,
          })
        }
      }

      return reminders
    })
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === 'urgent' ? -1 : 1
      return a.title.localeCompare(b.title, 'zh-Hans-CN')
    })
}
