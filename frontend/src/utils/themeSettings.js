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

function rgbToString({ r, g, b }) {
  return `${r}, ${g}, ${b}`
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function rgbaRgb(rgb, alpha) {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

function mixHex(baseHex, topHex, baseWeight = 0.5) {
  const base = hexToRgb(baseHex)
  const top = hexToRgb(topHex)
  const topWeight = 1 - baseWeight
  const next = {
    r: Math.round(base.r * baseWeight + top.r * topWeight),
    g: Math.round(base.g * baseWeight + top.g * topWeight),
    b: Math.round(base.b * baseWeight + top.b * topWeight),
  }

  return `#${[next.r, next.g, next.b]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')}`
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
      id: 'custom',
      label: '自定义',
      ...normalized.custom,
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
  const primaryRgb = hexToRgb(theme.primary)
  const deepRgb = hexToRgb(theme.deep)
  const accentRgb = hexToRgb(theme.accent)
  const washRgb = hexToRgb(theme.wash)
  const pageStart = mixHex(theme.wash, '#ffffff', 0.58)
  const pageMid = mixHex(theme.wash, theme.primary, 0.88)
  const pageEnd = mixHex(theme.wash, '#ffffff', 0.72)
  const surfaceRgb = hexToRgb(mixHex(theme.wash, '#ffffff', 0.70))
  const surfaceSoftRgb = hexToRgb(mixHex(theme.wash, theme.primary, 0.90))
  const surfaceRaisedRgb = hexToRgb(mixHex(theme.wash, '#ffffff', 0.50))
  const cardRgb = hexToRgb(mixHex(theme.wash, '#ffffff', 0.62))
  const cardSoftRgb = hexToRgb(mixHex(theme.wash, theme.primary, 0.88))
  const style = {
    '--bm-blue': theme.primary,
    '--bm-blue-deep': theme.deep,
    '--bm-mint': theme.accent,
    '--bm-theme-primary-rgb': rgbToString(primaryRgb),
    '--bm-theme-deep-rgb': rgbToString(deepRgb),
    '--bm-theme-accent-rgb': rgbToString(accentRgb),
    '--bm-theme-wash-rgb': rgbToString(washRgb),
    '--bm-rgb-line': rgbToString(primaryRgb),
    '--bm-rgb-shadow': rgbToString(deepRgb),
    '--bm-rgb-sheet-shadow': rgbToString(deepRgb),
    '--bm-line': rgba(theme.primary, 0.18),
    '--bm-shadow': `0 18px 48px ${rgbaRgb(deepRgb, 0.14)}`,
    '--bm-page-base': theme.wash,
    '--bm-page-bg': theme.wash,
    '--bm-page-bg-secondary': pageEnd,
    '--bm-page-bg-tint': pageMid,
    '--bm-page-gradient': `linear-gradient(180deg, ${pageStart} 0%, ${theme.wash} 180px, ${pageEnd} 360px, transparent 580px)`,
    '--bm-surface': rgbaRgb(surfaceRgb, 0.76),
    '--bm-surface-soft': rgbaRgb(surfaceSoftRgb, 0.58),
    '--bm-surface-raised': rgbaRgb(surfaceRaisedRgb, 0.88),
    '--bm-surface-glass': rgbaRgb(surfaceRgb, 0.64),
    '--bm-card-bg': rgbaRgb(cardRgb, 0.82),
    '--bm-card-bg-soft': rgbaRgb(cardSoftRgb, 0.58),
    '--bm-card-bg-raised': rgbaRgb(surfaceRaisedRgb, 0.92),
    '--bm-card-border': rgbaRgb(primaryRgb, 0.18),
    '--bm-card-border-strong': rgbaRgb(primaryRgb, 0.26),
    '--bm-nav-bg': rgbaRgb(surfaceRaisedRgb, 0.90),
    '--bm-modal-bg': rgbaRgb(surfaceRaisedRgb, 0.94),
    '--bm-input-bg': rgbaRgb(cardRgb, 0.82),
    '--bm-chip-bg': rgbaRgb(primaryRgb, 0.11),
    '--bm-chip-bg-active': rgbaRgb(primaryRgb, 0.19),
    '--bm-accent': theme.primary,
    '--bm-accent-soft': rgbaRgb(primaryRgb, 0.13),
    '--bm-text-primary': 'var(--bm-color-text-primary)',
    '--bm-text-secondary': 'var(--bm-color-text-muted-mid)',
    '--bm-text-muted': 'var(--bm-color-text-muted)',
    '--bm-divider': rgbaRgb(deepRgb, 0.12),
    '--bm-shadow-soft': `0 8px 18px ${rgbaRgb(deepRgb, 0.08)}`,
    '--bm-shadow-card': `0 12px 28px ${rgbaRgb(deepRgb, 0.09)}`,
    '--bm-shadow-panel': `0 18px 46px ${rgbaRgb(deepRgb, 0.12)}`,
    '--bm-shadow-glass': `0 16px 40px ${rgbaRgb(deepRgb, 0.10)}`,
    '--bm-shadow-sheet': `0 -18px 48px ${rgbaRgb(deepRgb, 0.16)}`,
    '--bm-glass': 'var(--bm-surface-glass)',
    '--bm-glass-strong': 'var(--bm-surface-raised)',
    '--bm-glass-surface': 'var(--bm-surface)',
    '--bm-glass-surface-soft': 'var(--bm-surface-soft)',
    '--bm-glass-surface-strong': 'var(--bm-surface-raised)',
    '--bm-glass-surface-muted': 'var(--bm-card-bg-soft)',
    '--bm-line-blue': 'var(--bm-card-border)',
    '--bm-line-blue-soft': 'var(--bm-divider)',
    '--bm-line-blue-mid': 'var(--bm-card-border-strong)',
    '--bm-color-page': 'var(--bm-page-bg)',
    '--bm-color-page-soft': 'var(--bm-page-bg-secondary)',
    '--bm-color-page-tint': 'var(--bm-page-bg-tint)',
    '--card-bg': 'var(--bm-card-bg)',
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
