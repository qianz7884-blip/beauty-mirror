const CUSTOM_CAT_KEY = 'beauty_mirror_custom_categories'
const DEFAULT_CATEGORIES = [
  '洁面',
  '爽肤水',
  '精华',
  '乳液',
  '面霜',
  '眼霜',
  '防晒',
  '面膜',
  '底妆',
  '遮瑕',
  '定妆',
  '眉眼',
  '唇妆',
  '腮红修容',
  '工具',
  '香氛',
  '小样',
  '其他',
]

export function loadCustomCategories() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_CAT_KEY)) || []
  } catch {
    return []
  }
}

export function saveCustomCategories(list) {
  localStorage.setItem(CUSTOM_CAT_KEY, JSON.stringify(list))
}

export function getAllCategories() {
  return [...DEFAULT_CATEGORIES, ...loadCustomCategories()]
}

export { DEFAULT_CATEGORIES, CUSTOM_CAT_KEY }
