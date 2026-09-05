export const PROFILE_SKIN_TYPES = ['干性', '油性', '混合', '敏感', '中性']

export const PROFILE_STORAGE_KEYS = {
  skinType: 'beauty_mirror_skin_type',
  profileImage: 'beauty_mirror_profile_image',
  reminderOn: 'beauty_mirror_reminder',
  reminderSettings: 'beauty_mirror_product_reminder_settings_v1',
}

export const DEFAULT_REMINDER_SETTINGS = {
  expiringWithinDays: 30,
  lowRemainingPercent: 30,
}

export function normalizeReminderSettings(settings = {}) {
  return {
    expiringWithinDays: Number(settings.expiringWithinDays || DEFAULT_REMINDER_SETTINGS.expiringWithinDays),
    lowRemainingPercent: Number(settings.lowRemainingPercent || DEFAULT_REMINDER_SETTINGS.lowRemainingPercent),
  }
}

export function readSkinTypePreference() {
  return localStorage.getItem(PROFILE_STORAGE_KEYS.skinType) || ''
}

export function saveSkinTypePreference(type) {
  localStorage.setItem(PROFILE_STORAGE_KEYS.skinType, type)
  return type
}

export function readReminderEnabledPreference() {
  return localStorage.getItem(PROFILE_STORAGE_KEYS.reminderOn) === 'true'
}

export function saveReminderEnabledPreference(checked) {
  localStorage.setItem(PROFILE_STORAGE_KEYS.reminderOn, String(checked))
  return checked
}

export function readReminderSettings() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEYS.reminderSettings)
    const parsed = raw ? JSON.parse(raw) : {}
    return normalizeReminderSettings(parsed)
  } catch {
    return { ...DEFAULT_REMINDER_SETTINGS }
  }
}

export function saveReminderSettings(settings) {
  localStorage.setItem(PROFILE_STORAGE_KEYS.reminderSettings, JSON.stringify(settings))
  return settings
}

export function readProfileImagePreference() {
  return localStorage.getItem(PROFILE_STORAGE_KEYS.profileImage) || ''
}

export function saveProfileImagePreference(image) {
  localStorage.setItem(PROFILE_STORAGE_KEYS.profileImage, image)
  return image
}

export function removeProfileImagePreference() {
  localStorage.removeItem(PROFILE_STORAGE_KEYS.profileImage)
}
