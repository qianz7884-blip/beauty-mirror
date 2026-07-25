import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  Camera,
  Check,
  ChevronRight,
  ChevronUp,
  Copy,
  Database,
  Download,
  MessageSquare,
  Paintbrush,
  Palette,
  RefreshCw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import {
  exportUserData,
  fetchProducts,
  fetchUserSession,
  getAnonymousUserId,
  resetAnonymousUserId,
} from '../api'
import {
  THEME_PRESETS,
  getActiveTheme,
  readThemeSettings,
  saveThemeSettings,
  subscribeThemeSettings,
} from '../utils/themeSettings'
import { buildProductReminders } from '../utils/productReminders'
import profileIpSticker from '../assets/illustrations/beauty-mirror-ip/ip-avatar-only.png'

const SKIN_TYPES = ['干性', '油性', '混合', '敏感', '中性']
const SKIN_TYPE_KEY = 'beauty_mirror_skin_type'
const PROFILE_IMAGE_KEY = 'beauty_mirror_profile_image'
const REMINDER_KEY = 'beauty_mirror_reminder'
const REMINDER_SETTINGS_KEY = 'beauty_mirror_product_reminder_settings_v1'

function formatLocalUserId(userId) {
  if (!userId) return '读取中'
  return userId.length > 14 ? `${userId.slice(0, 6)}...${userId.slice(-6)}` : userId
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

function readReminderSettings() {
  try {
    const raw = localStorage.getItem(REMINDER_SETTINGS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      expiringWithinDays: Number(parsed.expiringWithinDays || 30),
      lowRemainingPercent: Number(parsed.lowRemainingPercent || 30),
    }
  } catch {
    return {
      expiringWithinDays: 30,
      lowRemainingPercent: 30,
    }
  }
}

function saveReminderSettings(settings) {
  localStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(settings))
  return settings
}

function ReminderToggle({ checked, icon: Icon, title, desc, onChange }) {
  return (
    <label className="bm-reminder-toggle">
      <span className="bm-reminder-toggle-icon"><Icon size={17} strokeWidth={1.8} /></span>
      <span>
        <strong>{title}</strong>
        <small>{desc}</small>
      </span>
      <span className="bm-bg-toggle-control">
        <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
        <span aria-hidden="true" />
      </span>
    </label>
  )
}

function ReminderPreview({ reminders, reminderOn }) {
  if (!reminderOn) {
    return (
      <div className="bm-sms-empty">
        <MessageSquare size={18} strokeWidth={1.8} />
        <span>护理提醒已关闭，开启后这里会显示短信提醒。</span>
      </div>
    )
  }

  if (reminders.length === 0) {
    return (
      <div className="bm-sms-empty">
        <Check size={18} strokeWidth={1.8} />
        <span>当前没有临期或低余量产品。</span>
      </div>
    )
  }

  return (
    <div className="bm-sms-list" aria-label="短信形式的护肤提醒">
      {reminders.slice(0, 6).map(item => (
        <article className={`bm-sms-bubble ${item.level === 'urgent' ? 'urgent' : ''}`} key={item.id}>
          <span className="bm-sms-avatar"><Bell size={15} strokeWidth={1.8} /></span>
          <div>
            <strong>{item.title}</strong>
            <p>{item.message}</p>
          </div>
        </article>
      ))}
    </div>
  )
}

function ReminderPanel({
  reminderOn,
  reminderSettings,
  reminders,
  onReminderOnChange,
  onSettingsChange,
}) {
  return (
    <div className="bm-reminder-panel">
      <ReminderToggle
        checked={reminderOn}
        icon={Bell}
        title="开启提醒"
        desc={`临期 ${reminderSettings.expiringWithinDays} 天内、剩余低于 ${reminderSettings.lowRemainingPercent}% 时提醒`}
        onChange={onReminderOnChange}
      />

      <div className="bm-reminder-controls">
        <label>
          <span>临期天数</span>
          <input
            type="number"
            min="1"
            max="180"
            value={reminderSettings.expiringWithinDays}
            onChange={event => onSettingsChange({ expiringWithinDays: Number(event.target.value || 30) })}
          />
        </label>
        <label>
          <span>剩余提醒线</span>
          <input
            type="number"
            min="1"
            max="90"
            value={reminderSettings.lowRemainingPercent}
            onChange={event => onSettingsChange({ lowRemainingPercent: Number(event.target.value || 30) })}
          />
        </label>
      </div>

      <ReminderPreview reminders={reminders} reminderOn={reminderOn} />
    </div>
  )
}

function UserDataPanel({
  session,
  userId,
  message,
  onCopy,
  onExport,
  onReset,
  onRefresh,
}) {
  const counts = session?.counts || {}
  const database = session?.database || {}

  return (
    <div className="bm-user-panel">
      <div className="bm-user-panel-head">
        <span className="bm-reminder-toggle-icon"><Database size={17} strokeWidth={1.8} /></span>
        <div>
          <strong>本地数据</strong>
          <small>{session?.last_activity_at ? `最近记录 ${session.last_activity_at}` : '当前浏览器身份'}</small>
        </div>
        <button type="button" onClick={onRefresh} aria-label="刷新本地数据">
          <RefreshCw size={16} strokeWidth={1.8} />
        </button>
      </div>

      <div className="bm-user-id-line">
        <span>当前身份</span>
        <code>{formatLocalUserId(userId)}</code>
      </div>

      <div className="bm-user-stat-grid">
        <span>
          <strong>{counts.products ?? 0}</strong>
          <small>产品</small>
        </span>
        <span>
          <strong>{counts.diaries ?? 0}</strong>
          <small>日记</small>
        </span>
        <span>
          <strong>{counts.skin_analyses ?? 0}</strong>
          <small>肤况</small>
        </span>
      </div>

      <div className={`bm-user-db ${database.writable === false ? 'warning' : 'ok'}`}>
        <Database size={16} strokeWidth={1.7} />
        <span>{database.message || '数据库状态读取中'}</span>
      </div>

      <div className="bm-user-actions">
        <button type="button" onClick={onExport}>
          <Download size={15} strokeWidth={1.8} />
          <span>备份</span>
        </button>
        <button type="button" onClick={onCopy}>
          <Copy size={15} strokeWidth={1.8} />
          <span>复制ID</span>
        </button>
        <button type="button" className="danger" onClick={onReset}>
          <RefreshCw size={15} strokeWidth={1.8} />
          <span>换新身份</span>
        </button>
      </div>

      {message ? <p className="bm-user-message">{message}</p> : null}
    </div>
  )
}

export default function Profile() {
  const [skinType, setSkinType] = useState(() => localStorage.getItem(SKIN_TYPE_KEY) || '')
  const [reminderOn, setReminderOn] = useState(() => localStorage.getItem(REMINDER_KEY) === 'true')
  const [reminderSettings, setReminderSettings] = useState(readReminderSettings)
  const [profileImage, setProfileImage] = useState(() => localStorage.getItem(PROFILE_IMAGE_KEY) || '')
  const [themeSettings, setThemeSettings] = useState(readThemeSettings)
  const [products, setProducts] = useState([])
  const [userId, setUserId] = useState(() => getAnonymousUserId())
  const [userSession, setUserSession] = useState(null)
  const [userMessage, setUserMessage] = useState('')
  const [showSkinPicker, setShowSkinPicker] = useState(false)
  const [showReminderPanel, setShowReminderPanel] = useState(false)
  const [showUserPanel, setShowUserPanel] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const activeTheme = getActiveTheme(themeSettings)

  const refreshUserSession = () => {
    const currentUserId = getAnonymousUserId()
    setUserId(currentUserId)
    return fetchUserSession()
      .then(data => {
        setUserSession(data)
        setUserId(data?.user_id || currentUserId)
        return data
      })
      .catch(() => {
        setUserMessage('本地数据状态读取失败，请确认后端服务正在运行')
        return null
      })
  }

  useEffect(() => {
    let cancelled = false
    fetchProducts()
      .then(data => {
        if (!cancelled) setProducts(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setProducts([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const currentUserId = getAnonymousUserId()
    setUserId(currentUserId)
    fetchUserSession()
      .then(data => {
        if (!cancelled) {
          setUserSession(data)
          setUserId(data?.user_id || currentUserId)
        }
      })
      .catch(() => {
        if (!cancelled) setUserMessage('本地数据状态读取失败，请确认后端服务正在运行')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const refresh = () => setThemeSettings(readThemeSettings())
    return subscribeThemeSettings(refresh)
  }, [])

  const activeReminders = useMemo(() => {
    if (!reminderOn) return []
    return buildProductReminders(products, reminderSettings)
  }, [products, reminderSettings])

  const handleSkinChange = (type) => {
    setSkinType(type)
    localStorage.setItem(SKIN_TYPE_KEY, type)
    setShowSkinPicker(false)
  }

  const handleReminderOnChange = (checked) => {
    setReminderOn(checked)
    localStorage.setItem(REMINDER_KEY, String(checked))
  }

  const updateReminderSettings = (patch) => {
    setReminderSettings(prev => saveReminderSettings({ ...prev, ...patch }))
  }

  const updateThemeSettings = (next) => {
    setThemeSettings(saveThemeSettings(next))
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

  const handleThemeImageChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      updateThemeSettings({
        ...themeSettings,
        presetId: 'custom',
        customImage: String(reader.result || ''),
      })
    }
    reader.readAsDataURL(file)
  }

  const handleThemeImageRemove = () => {
    updateThemeSettings({
      ...themeSettings,
      presetId: 'blue',
      customImage: '',
    })
  }

  const handleCopyUserId = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(userId)
        .then(() => setUserMessage('当前本地身份 ID 已复制'))
        .catch(() => setUserMessage('复制失败，可以手动长按 ID 复制'))
      return
    }
    setUserMessage('当前浏览器不支持自动复制')
  }

  const handleExportUserData = () => {
    setUserMessage('正在准备当前本地身份的数据备份')
    exportUserData()
      .then(data => {
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json;charset=utf-8',
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        const date = new Date().toISOString().slice(0, 10)
        link.href = url
        link.download = `mirror-mate-${data.user_id || userId}-${date}.json`
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
        setUserMessage('已导出当前本地身份的数据备份')
      })
      .catch(() => {
        setUserMessage('导出失败，请确认后端服务正在运行')
      })
  }

  const handleResetUserId = () => {
    const confirmed = window.confirm('切换后会进入一个新的空白本地身份，旧数据不会删除。建议先备份当前数据，再确认切换。')
    if (!confirmed) return

    const nextUserId = resetAnonymousUserId()
    setUserId(nextUserId)
    setUserSession(null)
    setUserMessage('已切换到新的本地身份，旧数据仍保留在数据库里')
    fetchProducts()
      .then(data => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]))
    refreshUserSession()
  }

  const handleRefreshUserSession = () => {
    setUserMessage('')
    refreshUserSession().then(data => {
      if (data) setUserMessage('本地数据状态已刷新')
    })
  }

  const profileHighlights = [
    { icon: SlidersHorizontal, label: '肤质', value: skinType || '未设' },
    { icon: Bell, label: '提醒', value: reminderOn ? `${activeReminders.length} 条` : '已关' },
    { icon: Camera, label: '头像', value: profileImage ? '已设' : '未设' },
    { icon: Palette, label: '主题', value: activeTheme.label },
    { icon: ShieldCheck, label: '隐私', value: '本地' },
  ]

  return (
    <div className="bm-screen bm-profile">
      <section className="bm-hero bm-profile-hero">
        <div className="bm-profile-hero-main">
          <div>
            <h1>我的</h1>
            <p className="bm-subtitle">管理肤质、提醒、主题和本地偏好。</p>
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
        <div className="bm-profile-id-card" aria-label="个人状态卡片">
          <span className="bm-profile-id-stitch" aria-hidden="true" />
          <div className="bm-profile-avatar-wrap">
            <label className={`bm-profile-avatar bm-profile-avatar-card ${profileImage ? 'has-image' : ''}`} aria-label="上传个人头像">
              {profileImage ? (
                <img src={profileImage} alt="个人头像" />
              ) : (
                <Camera size={28} strokeWidth={1.8} />
              )}
              <input type="file" accept="image/*" onChange={handleProfileImageChange} />
            </label>
            <img className="bm-profile-ip-sticker" src={profileIpSticker} alt="" aria-hidden="true" />
            <span className="bm-profile-avatar-star" aria-hidden="true" />
          </div>
          <div className="bm-profile-id-copy">
            <div className="bm-profile-id-title">
              <span>记录 · 管理 · 遇见更好的自己</span>
              <ChevronRight size={17} strokeWidth={1.7} aria-hidden="true" />
            </div>
            <div className="bm-profile-highlight-row">
              {profileHighlights.map(({ icon: Icon, label, value }) => (
                <span className="bm-profile-highlight" key={label}>
                  <Icon size={15} strokeWidth={1.6} aria-hidden="true" />
                  <small>{label}</small>
                  <strong>{value}</strong>
                </span>
              ))}
            </div>
          </div>
        </div>

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
            icon={SlidersHorizontal}
            label="肤质偏好"
            desc="设置个人肤质偏好"
            badge={skinType || '未设置'}
            onClick={() => setShowSkinPicker(!showSkinPicker)}
          />
          <MenuItem
            icon={Bell}
            label="护理提醒"
            desc="临期、低余量产品提醒"
            badge={reminderOn ? `${activeReminders.length} 条` : '已关闭'}
            onClick={() => setShowReminderPanel(!showReminderPanel)}
          />
          {showReminderPanel && (
            <ReminderPanel
              reminderOn={reminderOn}
              reminderSettings={reminderSettings}
              reminders={activeReminders}
              onReminderOnChange={handleReminderOnChange}
              onSettingsChange={updateReminderSettings}
            />
          )}
          <MenuItem
            icon={Database}
            label="本地数据"
            desc="查看当前身份、数据库状态和备份"
            badge={`${userSession?.counts?.total_records ?? 0} 条`}
            onClick={() => setShowUserPanel(!showUserPanel)}
          />
          {showUserPanel && (
            <UserDataPanel
              session={userSession}
              userId={userId}
              message={userMessage}
              onCopy={handleCopyUserId}
              onExport={handleExportUserData}
              onReset={handleResetUserId}
              onRefresh={handleRefreshUserSession}
            />
          )}
          <MenuItem
            icon={Settings}
            label="设置"
            desc="个人资料与主题"
            badge={activeTheme.label}
            onClick={() => setShowSettings(!showSettings)}
          />

          {showSettings && (
            <div className="bm-settings-panel">
              <div className="bm-settings-sheet">
                <span className="bm-settings-grabber" aria-hidden="true" />
                <div className="bm-settings-sheet-head">
                  <div>
                    <h2>设置</h2>
                    <p>个人资料和主题。</p>
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
                    <span className="bm-setting-group-icon"><Paintbrush size={18} strokeWidth={1.8} /></span>
                    <div>
                      <strong>主题</strong>
                      <small>统一五个页面的色调和玻璃模块透明度</small>
                    </div>
                  </div>

                  <div className="bm-theme-grid" role="listbox" aria-label="主题颜色">
                    {THEME_PRESETS.map(theme => (
                      <button
                        key={theme.id}
                        type="button"
                        className={themeSettings.presetId === theme.id ? 'active' : ''}
                        onClick={() => updateThemeSettings({ ...themeSettings, presetId: theme.id })}
                      >
                        <span className="bm-theme-swatch" style={{ background: theme.primary }} />
                        <strong>{theme.label}</strong>
                      </button>
                    ))}
                    <button
                      type="button"
                      className={themeSettings.presetId === 'custom' ? 'active' : ''}
                      onClick={() => updateThemeSettings({ ...themeSettings, presetId: 'custom' })}
                    >
                      <span
                        className={`bm-theme-swatch custom ${themeSettings.customImage ? 'has-image' : ''}`}
                        style={themeSettings.customImage ? { backgroundImage: `url(${themeSettings.customImage})` } : undefined}
                      />
                      <strong>自定义</strong>
                    </button>
                  </div>

                  <div className="bm-custom-theme-row">
                    {[
                      ['primary', '主色'],
                      ['deep', '深色'],
                      ['accent', '辅助'],
                      ['wash', '底色'],
                    ].map(([key, label]) => (
                      <label key={key}>
                        <span>{label}</span>
                        <input
                          type="color"
                          value={themeSettings.custom[key]}
                          onChange={event => updateThemeSettings({
                            ...themeSettings,
                            presetId: 'custom',
                            custom: {
                              ...themeSettings.custom,
                              [key]: event.target.value,
                            },
                          })}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="bm-custom-theme-upload">
                    <div
                      className={`bm-theme-image-preview ${themeSettings.customImage ? 'has-image' : ''}`}
                      style={themeSettings.customImage ? { backgroundImage: `url(${themeSettings.customImage})` } : undefined}
                    >
                      {themeSettings.customImage ? null : <Camera size={20} strokeWidth={1.7} />}
                    </div>
                    <div className="bm-theme-upload-copy">
                      <strong>自定义背景图</strong>
                      <small>上传后作为五个页面的统一主题背景。</small>
                    </div>
                    <div className="bm-settings-actions">
                      <label className="bm-settings-action">
                        <Camera size={15} strokeWidth={1.8} />
                        <span>{themeSettings.customImage ? '更换' : '上传'}</span>
                        <input type="file" accept="image/*" onChange={handleThemeImageChange} />
                      </label>
                      {themeSettings.customImage ? (
                        <button type="button" className="bm-settings-action danger" onClick={handleThemeImageRemove}>
                          <Trash2 size={15} strokeWidth={1.8} />
                          <span>移除</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}

          <MenuItem
            icon={ShieldCheck}
            label="隐私设置"
            desc="查看图像使用说明"
            onClick={() => alert('面部图像默认本地处理；产品、日记和头像偏好只保存在当前设备或你的本地后端。')}
          />
        </div>
      </section>
    </div>
  )
}
