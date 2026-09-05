import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  Camera,
  ChevronRight,
  ChevronUp,
  Database,
  Paintbrush,
  Palette,
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
import {
  PROFILE_SKIN_TYPES,
  readProfileImagePreference,
  readReminderEnabledPreference,
  readReminderSettings,
  readSkinTypePreference,
  removeProfileImagePreference,
  saveProfileImagePreference,
  saveReminderEnabledPreference,
  saveReminderSettings,
  saveSkinTypePreference,
} from './profile/profilePreferences'
import {
  getPreferenceStatus,
  getProfileImageStatus,
  getReminderHighlightValue,
  getReminderMenuBadge,
} from './profile/profileLogic'
import { ProfileReminderPanel } from './profile/ProfileReminderPanel'
import { ProfileUserDataPanel } from './profile/ProfileUserDataPanel'

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

export default function Profile() {
  const [skinType, setSkinType] = useState(readSkinTypePreference)
  const [reminderOn, setReminderOn] = useState(readReminderEnabledPreference)
  const [reminderSettings, setReminderSettings] = useState(readReminderSettings)
  const [profileImage, setProfileImage] = useState(readProfileImagePreference)
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
    saveSkinTypePreference(type)
    setShowSkinPicker(false)
  }

  const handleReminderOnChange = (checked) => {
    setReminderOn(checked)
    saveReminderEnabledPreference(checked)
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
      saveProfileImagePreference(image)
    }
    reader.readAsDataURL(file)
  }

  const handleProfileImageRemove = () => {
    setProfileImage('')
    removeProfileImagePreference()
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
    { icon: SlidersHorizontal, label: '肤质', value: getPreferenceStatus(skinType, '未设') },
    { icon: Bell, label: '提醒', value: getReminderHighlightValue(reminderOn, activeReminders.length) },
    { icon: Camera, label: '头像', value: getProfileImageStatus(profileImage) },
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
            {PROFILE_SKIN_TYPES.map(type => (
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
            badge={getReminderMenuBadge(reminderOn, activeReminders.length)}
            onClick={() => setShowReminderPanel(!showReminderPanel)}
          />
          {showReminderPanel && (
            <ProfileReminderPanel
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
            <ProfileUserDataPanel
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
