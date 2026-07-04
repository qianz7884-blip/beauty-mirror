export const MOOD_OPTIONS = [
  { key: 'excellent', label: '状态极佳', color: '#2f78ad', bg: 'rgba(47,120,173,0.10)' },
  { key: 'happy', label: '开心', color: '#D4929A', bg: 'rgba(212,146,154,0.10)' },
  { key: 'stable', label: '状态稳定', color: '#7B9EC7', bg: 'rgba(123,158,199,0.10)' },
  { key: 'normal', label: '一般', color: '#A0A0A0', bg: 'rgba(160,160,160,0.10)' },
  { key: 'low', label: '需要慢一点', color: '#B98791', bg: 'rgba(185,135,145,0.12)' },
]

export const MOOD_MAP = MOOD_OPTIONS.reduce((acc, mood) => {
  acc[mood.key] = mood
  return acc
}, {})

export const LEGACY_MOOD_MAP = {
  '😍': 'excellent',
  '😊': 'happy',
  '😐': 'normal',
  '😢': 'low',
}

export function getMoodInfo(moodVal) {
  if (MOOD_MAP[moodVal]) return MOOD_MAP[moodVal]
  const key = LEGACY_MOOD_MAP[moodVal]
  return key ? MOOD_MAP[key] : MOOD_MAP.stable
}
