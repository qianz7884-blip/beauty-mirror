export function formatLocalUserId(userId) {
  if (!userId) return '读取中'
  return userId.length > 14 ? `${userId.slice(0, 6)}...${userId.slice(-6)}` : userId
}

export function formatReminderSettingsDescription(reminderSettings) {
  return `临期 ${reminderSettings.expiringWithinDays} 天内、剩余低于 ${reminderSettings.lowRemainingPercent}% 时提醒`
}

export function getReminderHighlightValue(reminderOn, reminderCount) {
  return reminderOn ? `${reminderCount} 条` : '已关'
}

export function getReminderMenuBadge(reminderOn, reminderCount) {
  return reminderOn ? `${reminderCount} 条` : '已关闭'
}

export function getPreferenceStatus(value, fallback) {
  return value || fallback
}

export function getProfileImageStatus(profileImage) {
  return profileImage ? '已设' : '未设'
}
