const CUSTOM_CAT_KEY = 'beauty_mirror_custom_categories'
const DEFAULT_CATEGORIES = ['面霜', '精华', '面膜', '洁面', '防晒', '其他']

export function loadCustomCategories() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_CAT_KEY)) || []
  } catch { return [] }
}

export function saveCustomCategories(list) {
  localStorage.setItem(CUSTOM_CAT_KEY, JSON.stringify(list))
}

export function getAllCategories() {
  return [...DEFAULT_CATEGORIES, ...loadCustomCategories()]
}

export { DEFAULT_CATEGORIES, CUSTOM_CAT_KEY }
