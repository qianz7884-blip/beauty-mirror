import { useEffect, useMemo, useState } from 'react'

export const BACKGROUND_PAGES = [
  { id: 'home', label: '今日' },
  { id: 'products', label: '产品' },
  { id: 'diary', label: '日记' },
  { id: 'tutorial', label: '流程' },
  { id: 'profile', label: '我的' },
]

export const GLOBAL_BACKGROUND_KEY = 'global'
export const DEFAULT_BACKGROUND_VISIBILITY = 76

const DB_NAME = 'beauty_mirror_backgrounds'
const DB_VERSION = 1
const STORE_NAME = 'images'
const SETTINGS_KEY = 'beauty_mirror_background_settings_v1'
const CHANGE_EVENT = 'beauty-mirror-background-settings-change'

function clampVisibility(value, fallback = DEFAULT_BACKGROUND_VISIBILITY) {
  const next = Number(value)
  if (!Number.isFinite(next)) return fallback
  return Math.max(35, Math.min(100, Math.round(next)))
}

function getDefaultPageVisibility() {
  return BACKGROUND_PAGES.reduce((acc, page) => {
    acc[page.id] = DEFAULT_BACKGROUND_VISIBILITY
    return acc
  }, {})
}

function normalizeSettings(settings = {}) {
  return {
    useGlobalImage: Boolean(settings.useGlobalImage),
    globalVisibility: clampVisibility(settings.globalVisibility),
    pageVisibility: {
      ...getDefaultPageVisibility(),
      ...(settings.pageVisibility || {}),
    },
  }
}

function emitChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function runStore(mode, action) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const store = tx.objectStore(STORE_NAME)
    let result

    tx.oncomplete = () => {
      db.close()
      resolve(result)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }

    try {
      action(store, value => {
        result = value
      })
    } catch (error) {
      db.close()
      reject(error)
    }
  })
}

export function readBackgroundSettings() {
  if (typeof localStorage === 'undefined') return normalizeSettings()
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return normalizeSettings(raw ? JSON.parse(raw) : {})
  } catch {
    return normalizeSettings()
  }
}

export function saveBackgroundSettings(settings) {
  const normalized = normalizeSettings(settings)
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized))
  emitChange()
  return normalized
}

export function subscribeBackgroundSettings(listener) {
  window.addEventListener(CHANGE_EVENT, listener)
  return () => window.removeEventListener(CHANGE_EVENT, listener)
}

export function getBackgroundImageKey(settings, pageId) {
  return settings.useGlobalImage ? GLOBAL_BACKGROUND_KEY : pageId
}

export function getPageBackgroundVisibility(settings, pageId) {
  const normalized = normalizeSettings(settings)
  return normalized.useGlobalImage
    ? normalized.globalVisibility
    : clampVisibility(normalized.pageVisibility[pageId])
}

export function getBackgroundOverlayVars(visibility) {
  const veil = (100 - clampVisibility(visibility)) / 100
  return {
    '--bm-page-overlay-top': Math.min(0.35, veil * 0.42).toFixed(3),
    '--bm-page-overlay-mid': Math.min(0.58, veil * 0.75).toFixed(3),
    '--bm-page-overlay-bottom': Math.min(0.82, veil * 1.65).toFixed(3),
  }
}

export async function getBackgroundImageRecord(key) {
  return runStore('readonly', (store, setResult) => {
    const request = store.get(key)
    request.onsuccess = () => setResult(request.result || null)
  })
}

export async function saveBackgroundImage(key, file) {
  const record = {
    key,
    blob: file,
    name: file.name,
    type: file.type,
    size: file.size,
    updatedAt: Date.now(),
  }

  await runStore('readwrite', (store) => {
    store.put(record)
  })
  emitChange()
  return record
}

export async function removeBackgroundImage(key) {
  await runStore('readwrite', (store) => {
    store.delete(key)
  })
  emitChange()
}

export function usePageBackground(pageId) {
  const [state, setState] = useState(() => ({
    settings: readBackgroundSettings(),
    imageUrl: '',
  }))

  useEffect(() => {
    let cancelled = false
    let activeUrl = ''

    const load = async () => {
      const settings = readBackgroundSettings()
      const imageKey = getBackgroundImageKey(settings, pageId)
      let nextUrl = ''

      try {
        const record = await getBackgroundImageRecord(imageKey)
        if (record?.blob) nextUrl = URL.createObjectURL(record.blob)
      } catch {
        nextUrl = ''
      }

      if (cancelled) {
        if (nextUrl) URL.revokeObjectURL(nextUrl)
        return
      }

      if (activeUrl) URL.revokeObjectURL(activeUrl)
      activeUrl = nextUrl
      setState({ settings, imageUrl: nextUrl })
    }

    load()
    const unsubscribe = subscribeBackgroundSettings(load)

    return () => {
      cancelled = true
      unsubscribe()
      if (activeUrl) URL.revokeObjectURL(activeUrl)
    }
  }, [pageId])

  const visibility = getPageBackgroundVisibility(state.settings, pageId)

  return useMemo(() => {
    const style = {
      ...getBackgroundOverlayVars(visibility),
    }
    if (state.imageUrl) {
      style['--bm-page-image'] = `url("${state.imageUrl}")`
    }
    return {
      style,
      hasImage: Boolean(state.imageUrl),
      visibility,
    }
  }, [state.imageUrl, visibility])
}
