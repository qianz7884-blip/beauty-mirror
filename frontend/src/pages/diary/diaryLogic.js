import { getMoodInfo } from '../../utils/moods'

export const HEATMAP_WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const HEATMAP_MIN_WEEKS = 24

export function toDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number)
  if (!year || !month || !day) return new Date()
  return new Date(year, month - 1, day)
}

export function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function formatMonthTitle(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

export function formatDayTitle(dateKey) {
  const date = parseDateKey(dateKey)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function formatMonthShort(date) {
  return `${date.getMonth() + 1}月`
}

export function hexToRgba(hex, alpha) {
  const value = String(hex || '').replace('#', '')
  if (value.length !== 6) return `rgba(123,158,199,${alpha})`
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function startOfWeek(date) {
  const start = new Date(date)
  const mondayOffset = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - mondayOffset)
  return start
}

export function buildHeatmapWindow(monthDate, diaryCountByDate, moodByDate) {
  const monthStart = getMonthStart(monthDate)
  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leadingDays = (monthStart.getDay() + 6) % 7
  const weeksInMonth = Math.ceil((leadingDays + daysInMonth) / 7)
  const weekCount = Math.max(HEATMAP_MIN_WEEKS, weeksInMonth)
  const paddingWeeksBefore = Math.floor((weekCount - weeksInMonth) / 2)
  const windowStart = startOfWeek(monthStart)
  windowStart.setDate(windowStart.getDate() - paddingWeeksBefore * 7)

  const cells = Array.from({ length: weekCount * 7 }, (_, index) => {
    const date = new Date(windowStart)
    date.setDate(windowStart.getDate() + index)
    const dateKey = toDateKey(date)
    const count = diaryCountByDate[dateKey] || 0
    const mood = moodByDate[dateKey] || null
    return {
      date,
      dateKey,
      inMonth: date.getFullYear() === year && date.getMonth() === month,
      count,
      mood,
    }
  })

  const weeks = []
  for (let index = 0; index < cells.length; index += 7) {
    const weekCells = cells.slice(index, index + 7)
    weeks.push({
      id: weekCells[0].dateKey,
      cells: weekCells,
    })
  }

  return {
    weeks,
  }
}

export function getDiaryDateKey(diary, fallbackDate) {
  return diary.created_date || toDateKey(new Date(diary.created_at || fallbackDate))
}

export function buildDiaryCalendarData(diaries, fallbackDate) {
  return (Array.isArray(diaries) ? diaries : []).reduce((acc, diary) => {
    const key = getDiaryDateKey(diary, fallbackDate)
    if (!acc.diariesByDate[key]) acc.diariesByDate[key] = []
    acc.diariesByDate[key].push(diary)
    acc.diaryCountByDate[key] = (acc.diaryCountByDate[key] || 0) + 1
    if (!acc.moodByDate[key]) {
      acc.moodByDate[key] = getMoodInfo(diary.mood_info?.key || diary.mood)
    }
    return acc
  }, {
    diariesByDate: {},
    diaryCountByDate: {},
    moodByDate: {},
  })
}

export function getInitialDiaryDate(diaries, todayKey) {
  const entries = Array.isArray(diaries) ? diaries : []
  return entries.some(diary => diary.created_date === todayKey)
    ? todayKey
    : (entries[0]?.created_date || todayKey)
}
