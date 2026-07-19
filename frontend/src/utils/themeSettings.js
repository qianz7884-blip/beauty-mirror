import { useEffect, useMemo, useState } from 'react'

export const THEME_SETTINGS_KEY = 'beauty_mirror_theme_settings_v1'
export const THEME_CHANGE_EVENT = 'beauty-mirror-theme-settings-change'

export const THEME_PRESETS = [
  {
    id: 'blue',
    label: '蓝色',
    primary: '#6ea6cf',
    deep: '#2f78ad',
    accent: '#7ca58d',
    wash: '#edf6fb',
  },
  {
    id: 'green',
    label: '绿色',
    primary: '#82b38b',
    deep: '#3f7f58',
    accent: '#6ea6cf',
    wash: '#eef8f0',
  },
  {
    id: 'pink',
    label: '粉色',
    primary: '#d991a6',
    deep: '#b85b75',
    accent: '#8aa6cf',
    wash: '#fff1f6',
  },
  {
    id: 'purple',
    label: '紫色',
    primary: '#a58bd6',
    deep: '#7156ae',
    accent: '#7ca58d',
    wash: '#f5f0ff',
  },
  {
    id: 'yellow',
    label: '黄色',
    primary: '#e0b95a',
    deep: '#a8781f',
    accent: '#6ea6cf',
    wash: '#fff8e7',
  },
  {
    id: 'red',
    label: '红色',
    primary: '#d97979',
    deep: '#ad464f',
    accent: '#7ca58d',
    wash: '#fff0f0',
  },
]

const DEFAULT_THEME = THEME_PRESETS[0]

function clampHex(value, fallback) {
  const next = String(value || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(next) ? next : fallback
}

function hexToRgb(hex) {
  const value = hex.replace('#', '')
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function normalizeThemeSettings(settings = {}) {
  const preset = THEME_PRESETS.find(item => item.id === settings.presetId) || DEFAULT_THEME
  return {
    presetId: settings.presetId === 'custom' ? 'custom' : preset.id,
    custom: {
      primary: clampHex(settings.custom?.primary, preset.primary),
      deep: clampHex(settings.custom?.deep, preset.deep),
      accent: clampHex(settings.custom?.accent, preset.accent),
      wash: clampHex(settings.custom?.wash, preset.wash),
    },
    customImage: typeof settings.customImage === 'string' ? settings.customImage : '',
  }
}

export function getActiveTheme(settings) {
  const normalized = normalizeThemeSettings(settings)
  if (normalized.presetId === 'custom') {
    return {
      ...DEFAULT_THEME,
      id: 'custom',
      label: '自定义',
    }
  }
  return THEME_PRESETS.find(item => item.id === normalized.presetId) || DEFAULT_THEME
}

export function readThemeSettings() {
  if (typeof localStorage === 'undefined') return normalizeThemeSettings()
  try {
    const raw = localStorage.getItem(THEME_SETTINGS_KEY)
    return normalizeThemeSettings(raw ? JSON.parse(raw) : {})
  } catch {
    return normalizeThemeSettings()
  }
}

export function saveThemeSettings(settings) {
  const normalized = normalizeThemeSettings(settings)
  localStorage.setItem(THEME_SETTINGS_KEY, JSON.stringify(normalized))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT))
  }
  return normalized
}

export function subscribeThemeSettings(listener) {
  window.addEventListener(THEME_CHANGE_EVENT, listener)
  return () => window.removeEventListener(THEME_CHANGE_EVENT, listener)
}

export function getThemeStyle(settings) {
  const normalized = normalizeThemeSettings(settings)
  const theme = getActiveTheme(settings)
  const style = {
    '--bm-blue': theme.primary,
    '--bm-blue-deep': theme.deep,
    '--bm-mint': theme.accent,
    '--bm-line': rgba(theme.primary, 0.18),
    '--bm-shadow': `0 18px 48px ${rgba(theme.deep, 0.14)}`,
    '--bm-page-base': theme.wash,
    '--bm-page-gradient': `linear-gradient(180deg, #ffffff 0%, ${theme.wash} 180px, #fbfdff 360px, transparent 580px)`,
    '--primary': theme.accent,
    '--primary-light': rgba(theme.accent, 0.20),
    '--primary-dark': theme.deep,
  }

  if (normalized.presetId === 'custom' && normalized.customImage) {
    style['--bm-page-image'] = `url(${normalized.customImage})`
  }

  return style
}

export function useThemeSettings() {
  const [settings, setSettings] = useState(readThemeSettings)

  useEffect(() => {
    const refresh = () => setSettings(readThemeSettings())
    return subscribeThemeSettings(refresh)
  }, [])

  return useMemo(() => ({
    settings,
    theme: getActiveTheme(settings),
    style: getThemeStyle(settings),
  }), [settings])
}
