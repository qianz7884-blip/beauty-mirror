import { DEFAULT_TODAY_WEATHER, normalizeWeatherPayload } from './weatherLogic'

export const WEATHER_CACHE_KEY = 'beauty_mirror_today_weather_v1'
export const WEATHER_CACHE_TTL = 30 * 60 * 1000
export const WEATHER_RETRY_COOLDOWN = 5 * 60 * 1000

const IP_GEO_URL = 'https://ipapi.co/json/'

export function hasCachedWeather() {
  if (typeof localStorage === 'undefined') return false
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || 'null')
    return !!(cached && Date.now() - cached.timestamp <= WEATHER_CACHE_TTL)
  } catch {
    return false
  }
}

export function readCachedWeather() {
  if (typeof localStorage === 'undefined') return DEFAULT_TODAY_WEATHER
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || 'null')
    if (!cached || Date.now() - cached.timestamp > WEATHER_CACHE_TTL) return DEFAULT_TODAY_WEATHER
    return cached.weather || DEFAULT_TODAY_WEATHER
  } catch {
    return DEFAULT_TODAY_WEATHER
  }
}

export function cacheWeather(weather) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), weather }))
  } catch {
    // Weather context is non-critical.
  }
}

export async function tryIPGeolocation() {
  const res = await fetch(IP_GEO_URL, { signal: AbortSignal.timeout(4000) })
  if (!res.ok) return null
  const data = await res.json()
  if (data.latitude != null && data.longitude != null) {
    return { latitude: Number(data.latitude), longitude: Number(data.longitude) }
  }
  return null
}

export async function fetchWeatherByCoords(latitude, longitude) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}&current=temperature_2m,weather_code&timezone=auto`
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return null
    return normalizeWeatherPayload(await response.json())
  } catch {
    return null
  }
}
