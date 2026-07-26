import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  fetchDiaries,
  createDiary,
  updateDiary,
  deleteDiary,
  fetchProducts,
} from '../api'
import DiaryCard from '../components/DiaryCard'
import DiaryForm from '../components/DiaryForm'
import {
  CalendarCheck2,
  Camera,
  ChevronLeft,
  ChevronRight,
  Flame,
  Image,
  Pencil,
  Plus,
  X,
} from 'lucide-react'
import { usePageBackground } from '../utils/backgroundSettings'
import { MOOD_OPTIONS, getMoodInfo } from '../utils/moods'
import diaryEmptyIllustration from '../assets/illustrations/beauty-mirror-ip/diary-empty-resting.webp'

const HEATMAP_WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const HEATMAP_MIN_WEEKS = 24

function toDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number)
  if (!year || !month || !day) return new Date()
  return new Date(year, month - 1, day)
}

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function formatMonthTitle(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

function formatDayTitle(dateKey) {
  const date = parseDateKey(dateKey)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function formatMonthShort(date) {
  return `${date.getMonth() + 1}月`
}

function calculateCurrentStreak(diaryCountByDate) {
  const cursor = new Date()
  const todayKey = toDateKey(cursor)
  if (!diaryCountByDate[todayKey]) cursor.setDate(cursor.getDate() - 1)

  let streak = 0
  while (diaryCountByDate[toDateKey(cursor)]) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

function hexToRgba(hex, alpha) {
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

function buildHeatmapWindow(monthDate, diaryCountByDate, moodByDate) {
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

function HeatmapDayCell({ cell, selectedDate, todayKey, onSelect }) {
  const selected = cell.dateKey === selectedDate
  const isToday = cell.dateKey === todayKey
  const hasEntry = cell.count > 0 && cell.mood
  const moodStyle = hasEntry
    ? {
        '--heatmap-color': cell.mood.color,
        '--heatmap-fill': hexToRgba(cell.mood.color, 0.72),
        '--heatmap-border': hexToRgba(cell.mood.color, 0.42),
        '--heatmap-shadow': hexToRgba(cell.mood.color, 0.18),
      }
    : undefined

  return (
    <button
      type="button"
      className={[
        'dv-heatmap-cell',
        cell.inMonth ? '' : 'muted',
        hasEntry ? 'has-entry' : '',
        selected ? 'selected' : '',
        isToday ? 'today' : '',
      ].filter(Boolean).join(' ')}
      style={moodStyle}
      onClick={() => onSelect(cell.dateKey)}
      aria-label={`${formatDayTitle(cell.dateKey)}，${cell.count || 0}篇日记${cell.mood ? `，${cell.mood.label}` : ''}`}
      title={`${formatDayTitle(cell.dateKey)} · ${cell.count || 0}篇${cell.mood ? ` · ${cell.mood.label}` : ''}`}
    />
  )
}

function DiaryHeatmap({
  visibleMonth,
  heatmap,
  selectedDate,
  todayKey,
  onSelectDate,
  onMonthChange,
}) {
  const previousMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1)
  const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1)

  return (
    <section className="dv-month-panel">
      <div className="dv-month-head">
        <button type="button" onClick={() => onMonthChange(-1)} aria-label="上个月">
          <ChevronLeft size={18} strokeWidth={1.8} />
        </button>
        <span className="dv-month-side">{formatMonthShort(previousMonth)}</span>
        <strong>{formatMonthTitle(visibleMonth)}</strong>
        <span className="dv-month-side">{formatMonthShort(nextMonth)}</span>
        <button type="button" onClick={() => onMonthChange(1)} aria-label="下个月">
          <ChevronRight size={18} strokeWidth={1.8} />
        </button>
      </div>

      <div className="dv-heatmap-shell">
        <div className="dv-heatmap-week-labels" aria-hidden="true">
          {HEATMAP_WEEKDAY_LABELS.map(label => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="dv-heatmap-board">
          <div className="dv-heatmap-grid">
            {heatmap.weeks.map(week => (
              <div className="dv-heatmap-week" key={week.id}>
                {week.cells.map(cell => (
                  <HeatmapDayCell
                    key={cell.dateKey}
                    cell={cell}
                    selectedDate={selectedDate}
                    todayKey={todayKey}
                    onSelect={onSelectDate}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dv-heatmap-legend" aria-hidden="true">
        {MOOD_OPTIONS.map(mood => (
          <span key={mood.key} className="dv-heatmap-mood-key">
            <i style={{ background: mood.color }} />
            {mood.label}
          </span>
        ))}
      </div>
    </section>
  )
}

export default function MakeupDiary() {
  const pageBackground = usePageBackground('diary')
  const [data, setData] = useState(null)      // { diaries, stats }
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()))
  const [visibleMonth, setVisibleMonth] = useState(() => getMonthStart(new Date()))
  const [showForm, setShowForm] = useState(false)
  const [editingDiary, setEditingDiary] = useState(null)
  const [showCreateActions, setShowCreateActions] = useState(false)
  const [toast, setToast] = useState(null)
  const cameraRef = useRef(null)
  const albumRef = useRef(null)
  const selectedDayRef = useRef(null)
  const didInitDateRef = useRef(false)
  const navigate = useNavigate()
  const location = useLocation()

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([fetchDiaries(), fetchProducts()])
      .then(([diaryData, prodData]) => {
        setData(diaryData)
        setProducts(prodData)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (loading || didInitDateRef.current) return
    const diaries = data?.diaries || []
    const today = toDateKey(new Date())
    const initialDate = diaries.some(d => d.created_date === today)
      ? today
      : (diaries[0]?.created_date || today)

    setSelectedDate(initialDate)
    setVisibleMonth(getMonthStart(parseDateKey(initialDate)))
    didInitDateRef.current = true
  }, [loading, data])

  /* Handle edit from detail page */
  useEffect(() => {
    if (location.state?.editDiaryId && data?.diaries) {
      const d = data.diaries.find(d => d.id === location.state.editDiaryId)
      if (d) {
        setEditingDiary(d)
        setShowForm(true)
        navigate('/diary', { replace: true, state: {} })
      }
    }
  }, [location.state?.editDiaryId, data])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2000)
  }

  /* ── Create ── */
  const handleCreateText = (dateKey = selectedDate) => {
    setEditingDiary(dateKey ? { created_date: dateKey } : null)
    setShowCreateActions(false)
    setShowForm(true)
  }

  const handleCreateCamera = () => {
    setShowCreateActions(false)
    cameraRef.current?.click()
  }

  const handleCreateAlbum = () => {
    setShowCreateActions(false)
    albumRef.current?.click()
  }

  /* When a photo is captured/selected, open form with photo pre-filled */
  const handlePhotoSelected = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setEditingDiary({
      created_date: selectedDate,
      photo_file: file,
      photo_preview_url: URL.createObjectURL(file),
    })
    setShowForm(true)
    e.target.value = ''
  }

  /* ── Submit ── */
  const handleSubmit = async (formData) => {
    try {
      if (editingDiary && editingDiary.id) {
        await updateDiary(editingDiary.id, formData)
        showToast('日记已更新')
      } else {
        await createDiary(formData)
        showToast('日记发布成功！')
      }
      setShowForm(false)
      setEditingDiary(null)
      load()
    } catch (err) {
      showToast(err.response?.data?.error || '操作失败', 'error')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这篇日记吗？')) return
    try {
      await deleteDiary(id)
      showToast('日记已删除')
      load()
    } catch {
      showToast('删除失败', 'error')
    }
  }

  /* ── Render ── */
  const diaries = data?.diaries || []
  const pageStyle = pageBackground.style
  const diariesByDate = useMemo(() => {
    return diaries.reduce((acc, diary) => {
      const key = diary.created_date || toDateKey(new Date(diary.created_at || Date.now()))
      if (!acc[key]) acc[key] = []
      acc[key].push(diary)
      return acc
    }, {})
  }, [diaries])
  const diaryCountByDate = useMemo(() => {
    return diaries.reduce((acc, diary) => {
      const key = diary.created_date || toDateKey(new Date(diary.created_at || Date.now()))
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  }, [diaries])
  const moodByDate = useMemo(() => {
    return diaries.reduce((acc, diary) => {
      const key = diary.created_date || toDateKey(new Date(diary.created_at || Date.now()))
      if (!acc[key]) acc[key] = getMoodInfo(diary.mood_info?.key || diary.mood)
      return acc
    }, {})
  }, [diaries])
  const heatmap = useMemo(
    () => buildHeatmapWindow(visibleMonth, diaryCountByDate, moodByDate),
    [visibleMonth, diaryCountByDate, moodByDate],
  )
  const selectedDiaries = diariesByDate[selectedDate] || []
  const selectedDateLabel = formatDayTitle(selectedDate)
  const todayKey = toDateKey(new Date())
  const visibleMonthPrefix = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, '0')}`
  const monthRecordDays = Object.keys(diaryCountByDate).filter(key => key.startsWith(visibleMonthPrefix)).length
  const currentStreak = useMemo(() => calculateCurrentStreak(diaryCountByDate), [diaryCountByDate])

  const handleMonthChange = (offset) => {
    setVisibleMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1))
  }

  const handleSelectDate = (dateKey) => {
    setSelectedDate(dateKey)
    setVisibleMonth(getMonthStart(parseDateKey(dateKey)))
    window.setTimeout(() => {
      selectedDayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  if (loading) {
    return (
      <div className="diary-v2" style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="d-loading-spinner" />
      </div>
    )
  }

  return (
    <div className="diary-v2" style={pageStyle}>
      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}

      {/* ══ Diary Calendar ══ */}
      <header className="dv-diary-head">
        <div>
          <span className="bm-page-kicker">BEAUTY NOTES</span>
          <h1>日记</h1>
          <p>用轻量记录，看见肤况与妆容习惯的变化。</p>
        </div>
        <button
          type="button"
          className="dv-today-btn"
          onClick={() => handleSelectDate(todayKey)}
        >
          今天
        </button>
      </header>

      <DiaryHeatmap
        visibleMonth={visibleMonth}
        heatmap={heatmap}
        selectedDate={selectedDate}
        todayKey={todayKey}
        onSelectDate={handleSelectDate}
        onMonthChange={handleMonthChange}
      />

      <section className="dv-diary-summary" aria-label="日记统计">
        <span>
          <CalendarCheck2 size={20} strokeWidth={1.7} />
          <span><small>本月记录</small><strong>{monthRecordDays} 天</strong></span>
        </span>
        <i />
        <span>
          <Flame size={20} strokeWidth={1.7} />
          <span><small>连续记录</small><strong>{currentStreak} 天</strong></span>
        </span>
      </section>

      {/* ══ Feed ══ */}
      <section className="dv-day-feed" ref={selectedDayRef}>
        <div className="dv-day-feed-head">
          <div>
            <span>选中日期</span>
            <h2>{selectedDateLabel}{selectedDiaries.length ? ` · ${selectedDiaries.length}篇记录` : ''}</h2>
          </div>
          <button type="button" onClick={() => handleCreateText(selectedDate)}>
            写一篇
          </button>
        </div>

        {selectedDiaries.length > 0 ? (
          <div className="dv-feed">
            {selectedDiaries.map(d => (
              <DiaryCard
                key={d.id}
                diary={d}
                onClick={() => navigate(`/diary/${d.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="dv-day-empty">
            <img className="dv-day-empty-art" src={diaryEmptyIllustration} alt="" aria-hidden="true" />
            <strong>这一天还没有记录</strong>
            <span>可以补一篇当天的妆容、护肤或产品使用感。</span>
          </div>
        )}
      </section>

      {/* ══ Create FAB ══ */}
      {!showForm && (
        <>
          {showCreateActions ? (
            <div className="dv-form-overlay" onClick={() => setShowCreateActions(false)} style={{ background: 'rgba(0,0,0,0.25)' }}>
              <div className="dv-create-actions" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#868685' }}>创建日记</span>
                  <button
                    onClick={() => setShowCreateActions(false)}
                    style={{
                      width: 28, height: 28, borderRadius: 14,
                      border: 'none', background: 'rgba(0,0,0,0.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: '#868685',
                    }}
                  >
                    <X size={16} strokeWidth={1.8} />
                  </button>
                </div>
                <button className="dv-create-action-item" onClick={handleCreateCamera}>
                  <span className="dv-create-action-icon"><Camera size={20} strokeWidth={1.6} /></span>
                  <div>
                    <div className="dv-create-action-label">拍照创建</div>
                    <div className="dv-create-action-sub">拍摄今日妆容或护肤照片</div>
                  </div>
                </button>
                <button className="dv-create-action-item" onClick={handleCreateAlbum}>
                  <span className="dv-create-action-icon"><Image size={20} strokeWidth={1.6} /></span>
                  <div>
                    <div className="dv-create-action-label">从相册选择</div>
                    <div className="dv-create-action-sub">从手机相册选取照片</div>
                  </div>
                </button>
                <button className="dv-create-action-item" style={{ borderBottom: 'none' }} onClick={() => handleCreateText(selectedDate)}>
                  <span className="dv-create-action-icon"><Pencil size={20} strokeWidth={1.6} /></span>
                  <div>
                    <div className="dv-create-action-label">纯文字记录</div>
                    <div className="dv-create-action-sub">不添加照片，只记录心得</div>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <button
              className="fab"
              onClick={() => setShowCreateActions(true)}
              style={{
                background: 'linear-gradient(135deg, #4f8db5, #3f7298)',
                color: '#fff',
                width: 52,
                height: 52,
                borderRadius: 26,
                fontSize: 24,
                boxShadow: '0 4px 16px rgba(63,114,152,0.35)',
              }}
            >
              <Plus size={26} strokeWidth={2} />
            </button>
          )}
        </>
      )}

      {/* ══ Hidden file inputs ══ */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handlePhotoSelected}
      />
      <input
        ref={albumRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handlePhotoSelected}
      />

      {/* ══ Diary form modal ══ */}
      {showForm && (
        <DiaryForm
          diary={editingDiary}
          products={products}
          onSubmit={handleSubmit}
          onClose={() => {
            setShowForm(false)
            setEditingDiary(null)
          }}
        />
      )}
    </div>
  )
}
