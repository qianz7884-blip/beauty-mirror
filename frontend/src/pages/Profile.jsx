import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Camera, ChevronRight, ChevronUp, ClipboardList, Clock3, HelpCircle, Minus, Palette, Plus, RotateCcw, Settings, ShieldCheck, SlidersHorizontal, Trash2, Upload } from 'lucide-react'
import { fetchDashboard } from '../api'
import {
  BACKGROUND_PAGES,
  DEFAULT_BACKGROUND_VISIBILITY,
  GLOBAL_BACKGROUND_KEY,
  getBackgroundImageRecord,
  readBackgroundSettings,
  removeBackgroundImage,
  saveBackgroundImage,
  saveBackgroundSettings,
  subscribeBackgroundSettings,
  usePageBackground,
} from '../utils/backgroundSettings'

const SKIN_TYPES = ['干性', '油性', '混合', '敏感', '中性']
const SKIN_TYPE_KEY = 'beauty_mirror_skin_type'
const PROFILE_IMAGE_KEY = 'beauty_mirror_profile_image'
const BACKGROUND_VISIBILITY_STEP = 5
const MIN_BACKGROUND_VISIBILITY = 35
const MAX_BACKGROUND_VISIBILITY = 100
const BACKGROUND_PAGE_ICONS = {
  [GLOBAL_BACKGROUND_KEY]: Palette,
  home: Clock3,
  products: Palette,
  diary: ClipboardList,
  tutorial: ShieldCheck,
  profile: Settings,
}

function MenuItem({ icon: Icon, label, desc, badge, onClick }) {
  return (
    <button className="bm-menu-row" type="button" onClick={onClick}>
      <span className="bm-menu-icon"><Icon size={18} strokeWidth={1.6} /></span>
      <span className="bm-menu-copy">
        <strong>{label}</strong>
        <small>{desc}</small>
      </span>
      {badge ? <span className="bm-menu-badge">{badge}</span> : null}
      <ChevronRight size={15} strokeWidth={1.5} />
    </button>
  )
}

function formatFileSize(size) {
  if (!size) return ''
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function clampBackgroundVisibility(value) {
  return Math.max(MIN_BACKGROUND_VISIBILITY, Math.min(MAX_BACKGROUND_VISIBILITY, Math.round(value)))
}

function BackgroundSettingRow({ page, preview, visibility, onUpload, onVisibilityChange, onReset }) {
  const Icon = BACKGROUND_PAGE_ICONS[page.id] || Palette
  const previewLabel = preview?.name ? `${preview.name}${preview.size ? ` · ${formatFileSize(preview.size)}` : ''}` : '未设置背景'
  const decreaseVisibility = () => {
    onVisibilityChange(clampBackgroundVisibility(visibility - BACKGROUND_VISIBILITY_STEP))
  }
  const increaseVisibility = () => {
    onVisibilityChange(clampBackgroundVisibility(visibility + BACKGROUND_VISIBILITY_STEP))
  }

  return (
    <div className="bm-bg-setting-row">
      <div className="bm-bg-setting-label">
        <span className="bm-bg-setting-icon"><Icon size={18} strokeWidth={1.7} /></span>
        <strong>{page.label}</strong>
      </div>
      <div
        className={`bm-bg-preview ${preview?.url ? 'has-image' : ''}`}
        style={preview?.url ? { backgroundImage: `url(${preview.url})` } : undefined}
        title={previewLabel}
        aria-label={previewLabel}
      >
        {!preview?.url ? <span>默认</span> : null}
      </div>
      <div className="bm-bg-visibility-stepper" aria-label={`${page.label}背景可见度`}>
        <button
          type="button"
          onClick={decreaseVisibility}
          disabled={visibility <= MIN_BACKGROUND_VISIBILITY}
          aria-label={`降低${page.label}背景可见度`}
        >
          <Minus size={15} strokeWidth={1.8} />
        </button>
        <strong>{visibility}%</strong>
        <button
          type="button"
          onClick={increaseVisibility}
          disabled={visibility >= MAX_BACKGROUND_VISIBILITY}
          aria-label={`提高${page.label}背景可见度`}
        >
          <Plus size={15} strokeWidth={1.8} />
        </button>
      </div>
      <label className="bm-bg-setting-action">
        <Upload size={18} strokeWidth={1.7} />
        <span>上传</span>
        <input type="file" accept="image/*" onChange={event => onUpload(event)} />
      </label>
      <button type="button" className="bm-bg-setting-action" onClick={onReset}>
        <RotateCcw size={18} strokeWidth={1.7} />
        <span>重置</span>
      </button>
      <input
        className="bm-bg-row-range"
        type="range"
        min={MIN_BACKGROUND_VISIBILITY}
        max={MAX_BACKGROUND_VISIBILITY}
        step="1"
        value={visibility}
        aria-label={`${page.label}背景可见度滑块`}
        onChange={event => onVisibilityChange(Number(event.target.value))}
      />
    </div>
  )
}

function BackgroundRows({
  useGlobalImage,
  backgroundSettings,
  backgroundPreviews,
  onUpload,
  onGlobalVisibilityChange,
  onPageVisibilityChange,
  onReset,
}) {
  if (useGlobalImage) {
    return (
      <div className="bm-bg-setting-list compact">
        <BackgroundSettingRow
          page={{ id: GLOBAL_BACKGROUND_KEY, label: '全部页面' }}
          preview={backgroundPreviews[GLOBAL_BACKGROUND_KEY]}
          visibility={backgroundSettings.globalVisibility}
          onUpload={event => onUpload(GLOBAL_BACKGROUND_KEY, event)}
          onVisibilityChange={onGlobalVisibilityChange}
          onReset={() => onReset(GLOBAL_BACKGROUND_KEY)}
        />
      </div>
    )
  }

  return (
    <div className="bm-bg-setting-list">
      {BACKGROUND_PAGES.map(page => (
        <BackgroundSettingRow
          key={page.id}
          page={page}
          preview={backgroundPreviews[page.id]}
          visibility={backgroundSettings.pageVisibility[page.id] ?? DEFAULT_BACKGROUND_VISIBILITY}
          onUpload={event => onUpload(page.id, event)}
          onVisibilityChange={value => onPageVisibilityChange(page.id, value)}
          onReset={() => onReset(page.id)}
        />
      ))}
    </div>
  )
}

export default function Profile() {
  const pageBackground = usePageBackground('profile')
  const [data, setData] = useState(null)
  const [skinType, setSkinType] = useState(() => localStorage.getItem(SKIN_TYPE_KEY) || '')
  const [reminderOn, setReminderOn] = useState(() => localStorage.getItem('beauty_mirror_reminder') === 'true')
  const [profileImage, setProfileImage] = useState(() => localStorage.getItem(PROFILE_IMAGE_KEY) || '')
  const [backgroundSettings, setBackgroundSettings] = useState(readBackgroundSettings)
  const [backgroundPreviews, setBackgroundPreviews] = useState({})
  const [showSkinPicker, setShowSkinPicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const backgroundPreviewUrlsRef = useRef({})
  const navigate = useNavigate()

  useEffect(() => {
    fetchDashboard().then(setData).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false

    const revokePreviews = () => {
      Object.values(backgroundPreviewUrlsRef.current).forEach(item => {
        if (item?.url) URL.revokeObjectURL(item.url)
      })
    }

    const refreshBackgroundPanel = async () => {
      const settings = readBackgroundSettings()
      const keys = [GLOBAL_BACKGROUND_KEY, ...BACKGROUND_PAGES.map(page => page.id)]
      const entries = await Promise.all(keys.map(async key => {
        try {
          const record = await getBackgroundImageRecord(key)
          return [key, record]
        } catch {
          return [key, null]
        }
      }))

      if (cancelled) return

      const previews = {}
      entries.forEach(([key, record]) => {
        if (record?.blob) {
          previews[key] = {
            name: record.name,
            size: record.size,
            url: URL.createObjectURL(record.blob),
          }
        }
      })

      revokePreviews()
      backgroundPreviewUrlsRef.current = previews
      setBackgroundSettings(settings)
      setBackgroundPreviews(previews)
    }

    refreshBackgroundPanel()
    const unsubscribe = subscribeBackgroundSettings(refreshBackgroundPanel)

    return () => {
      cancelled = true
      unsubscribe()
      revokePreviews()
      backgroundPreviewUrlsRef.current = {}
    }
  }, [])

  const handleSkinChange = (type) => {
    setSkinType(type)
    localStorage.setItem(SKIN_TYPE_KEY, type)
    setShowSkinPicker(false)
  }

  const handleReminderToggle = () => {
    const next = !reminderOn
    setReminderOn(next)
    localStorage.setItem('beauty_mirror_reminder', String(next))
  }

  const handleProfileImageChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const image = String(reader.result || '')
      setProfileImage(image)
      localStorage.setItem(PROFILE_IMAGE_KEY, image)
    }
    reader.readAsDataURL(file)
  }

  const handleProfileImageRemove = () => {
    setProfileImage('')
    localStorage.removeItem(PROFILE_IMAGE_KEY)
  }

  const updateBackgroundSettings = (next) => {
    setBackgroundSettings(saveBackgroundSettings(next))
  }

  const handleBackgroundUpload = async (key, event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }
    await saveBackgroundImage(key, file)
  }

  const handleGlobalVisibilityChange = (visibility) => {
    updateBackgroundSettings({
      ...backgroundSettings,
      globalVisibility: visibility,
    })
  }

  const handlePageVisibilityChange = (pageId, visibility) => {
    updateBackgroundSettings({
      ...backgroundSettings,
      pageVisibility: {
        ...backgroundSettings.pageVisibility,
        [pageId]: visibility,
      },
    })
  }

  const resetBackgroundRow = async (key) => {
    await removeBackgroundImage(key)
    if (key === GLOBAL_BACKGROUND_KEY) {
      handleGlobalVisibilityChange(DEFAULT_BACKGROUND_VISIBILITY)
      return
    }
    handlePageVisibilityChange(key, DEFAULT_BACKGROUND_VISIBILITY)
  }

  const latestAnalysis = data?.recent_analyses?.[0]
  const analysisCount = data?.total_analyses || data?.recent_analyses?.length || 0

  return (
    <div className="bm-screen bm-profile" style={pageBackground.style}>
      <section className="bm-hero bm-profile-hero">
        <div className="bm-profile-hero-main">
          <div>
            <h1>我的</h1>
            <p className="bm-subtitle">管理状态、偏好和隐私。</p>
          </div>
          <div className="bm-profile-avatar-wrap">
            <div className={`bm-profile-avatar bm-profile-avatar-static ${profileImage ? 'has-image' : ''}`} aria-label="个人头像">
              {profileImage ? (
                <img src={profileImage} alt="个人头像" />
              ) : (
                <Camera size={22} strokeWidth={1.7} />
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="bm-section bm-section-first">
        {showSkinPicker && (
          <div className="bm-skin-picker">
            {SKIN_TYPES.map(type => (
              <button
                key={type}
                type="button"
                className={skinType === type ? 'active' : ''}
                onClick={() => handleSkinChange(type)}
              >
                {type}
              </button>
            ))}
          </div>
        )}
        <div className="bm-menu-card">
          <MenuItem
            icon={ClipboardList}
            label="肤质档案"
            desc="查看当前肌肤状态"
            badge={latestAnalysis ? '已生成' : ''}
            onClick={() => {
              navigate('/')
              window.setTimeout(() => window.dispatchEvent(new CustomEvent('open-skin-history')), 100)
            }}
          />
          <MenuItem
            icon={Clock3}
            label="分析历史"
            desc="查看过往记录"
            badge={analysisCount ? `${analysisCount} 次` : ''}
            onClick={() => {
              navigate('/')
              window.setTimeout(() => window.dispatchEvent(new CustomEvent('open-skin-history')), 100)
            }}
          />
          <MenuItem
            icon={SlidersHorizontal}
            label="肤质偏好"
            desc="设置个人偏好"
            badge={skinType || '未设置'}
            onClick={() => setShowSkinPicker(!showSkinPicker)}
          />
          <MenuItem
            icon={Bell}
            label="护理提醒"
            desc="管理提醒开关"
            badge={reminderOn ? '已开启' : '已关闭'}
            onClick={handleReminderToggle}
          />
          <MenuItem
            icon={Settings}
            label="设置"
            desc="账号与偏好设置"
            onClick={() => setShowSettings(!showSettings)}
          />
          {showSettings && (
            <div className="bm-settings-panel">
              <div className="bm-settings-sheet">
                <span className="bm-settings-grabber" aria-hidden="true" />
                <div className="bm-settings-sheet-head">
                  <div>
                    <h2>设置</h2>
                    <p>账号与外观偏好</p>
                  </div>
                  <button type="button" className="bm-settings-collapse" onClick={() => setShowSettings(false)} aria-label="收起设置">
                    <ChevronUp size={20} strokeWidth={1.8} />
                  </button>
                </div>

                <section className="bm-setting-group">
                  <div className="bm-setting-group-head">
                    <span className="bm-setting-group-icon"><Camera size={18} strokeWidth={1.8} /></span>
                    <div>
                      <strong>个人资料</strong>
                      <small>只保存在本机</small>
                    </div>
                  </div>

                  <div className="bm-avatar-setting-row">
                    <div className={`bm-settings-avatar-preview ${profileImage ? 'has-image' : ''}`}>
                      {profileImage ? (
                        <img src={profileImage} alt="个人头像预览" />
                      ) : (
                        <Camera size={20} strokeWidth={1.7} />
                      )}
                    </div>
                    <div className="bm-avatar-setting-copy">
                      <strong>头像</strong>
                      <small>用于“我的”页面展示</small>
                    </div>
                    <div className="bm-settings-actions">
                      <label className="bm-settings-action">
                        <Camera size={15} strokeWidth={1.8} />
                        <span>{profileImage ? '更换' : '上传'}</span>
                        <input type="file" accept="image/*" onChange={handleProfileImageChange} />
                      </label>
                      {profileImage ? (
                        <button type="button" className="bm-settings-action danger" onClick={handleProfileImageRemove}>
                          <Trash2 size={15} strokeWidth={1.8} />
                          <span>移除</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section className="bm-setting-group">
                  <div className="bm-setting-group-head">
                    <span className="bm-setting-group-icon"><Palette size={18} strokeWidth={1.8} /></span>
                    <div>
                      <strong>页面外观</strong>
                      <small>背景与可见度</small>
                    </div>
                  </div>

                  <label className="bm-bg-toggle-card">
                    <span className="bm-bg-toggle-copy">
                      <strong>使用同一张背景</strong>
                      <HelpCircle size={16} strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <span className="bm-bg-toggle-control">
                      <input
                        type="checkbox"
                        checked={backgroundSettings.useGlobalImage}
                        onChange={event => updateBackgroundSettings({
                          ...backgroundSettings,
                          useGlobalImage: event.target.checked,
                        })}
                      />
                      <span aria-hidden="true" />
                    </span>
                  </label>
                  <BackgroundRows
                    useGlobalImage={backgroundSettings.useGlobalImage}
                    backgroundSettings={backgroundSettings}
                    backgroundPreviews={backgroundPreviews}
                    onUpload={handleBackgroundUpload}
                    onGlobalVisibilityChange={handleGlobalVisibilityChange}
                    onPageVisibilityChange={handlePageVisibilityChange}
                    onReset={resetBackgroundRow}
                  />
                </section>
              </div>
            </div>
          )}
          <MenuItem
            icon={ShieldCheck}
            label="隐私设置"
            desc="查看图像使用说明"
            onClick={() => alert('面部图像默认本地处理，建议仅用于当前妆容辅助。')}
          />
        </div>
      </section>
    </div>
  )
}
