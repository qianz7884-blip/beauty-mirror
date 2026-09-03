import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import weatherCloudy from '../assets/illustrations/weather/weather-cloudy.png'
import weatherFog from '../assets/illustrations/weather/weather-fog.png'
import weatherPartly from '../assets/illustrations/weather/weather-partly.png'
import weatherRain from '../assets/illustrations/weather/weather-rain.png'
import weatherSnow from '../assets/illustrations/weather/weather-snow.png'
import weatherStorm from '../assets/illustrations/weather/weather-storm.png'
import weatherSunny from '../assets/illustrations/weather/weather-sunny.png'

const WEATHER_CACHE_KEY = 'beauty_mirror_today_weather_v1'
const WEATHER_CACHE_TTL = 30 * 60 * 1000
const WEATHER_RETRY_COOLDOWN = 5 * 60 * 1000
const IP_GEO_URL = 'https://ipapi.co/json/'
const DEFAULT_TODAY_WEATHER = { kind: 'sunny', label: '晴朗', temperature: null }

const WEATHER_ART = {
  sunny: weatherSunny,
  partly: weatherPartly,
  cloudy: weatherCloudy,
  fog: weatherFog,
  rain: weatherRain,
  snow: weatherSnow,
  storm: weatherStorm,
}

function hasCachedWeather() {
  if (typeof localStorage === 'undefined') return false
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || 'null')
    return !!(cached && Date.now() - cached.timestamp <= WEATHER_CACHE_TTL)
  } catch {
    return false
  }
}

function readCachedWeather() {
  if (typeof localStorage === 'undefined') return DEFAULT_TODAY_WEATHER
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || 'null')
    if (!cached || Date.now() - cached.timestamp > WEATHER_CACHE_TTL) return DEFAULT_TODAY_WEATHER
    return cached.weather || DEFAULT_TODAY_WEATHER
  } catch {
    return DEFAULT_TODAY_WEATHER
  }
}

function cacheWeather(weather) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), weather }))
  } catch {
    // Weather context is non-critical.
  }
}

function classifyWeatherCode(code) {
  if (code === 0 || code === 1) return 'sunny'
  if (code === 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'sunny'
}

function getWeatherLabel(kind) {
  return {
    sunny: '晴朗',
    partly: '微云',
    cloudy: '多云',
    fog: '薄雾',
    rain: '下雨',
    snow: '小雪',
    storm: '雷雨',
  }[kind] || DEFAULT_TODAY_WEATHER.label
}

async function tryIPGeolocation() {
  const res = await fetch(IP_GEO_URL, { signal: AbortSignal.timeout(4000) })
  if (!res.ok) return null
  const data = await res.json()
  if (data.latitude != null && data.longitude != null) {
    return { latitude: Number(data.latitude), longitude: Number(data.longitude) }
  }
  return null
}

function normalizeWeatherPayload(payload) {
  const current = payload?.current || payload?.current_weather || {}
  const code = Number(current.weather_code ?? current.weathercode)
  const temperature = Number(current.temperature_2m ?? current.temperature)
  const kind = classifyWeatherCode(Number.isFinite(code) ? code : 0)

  return {
    kind,
    label: getWeatherLabel(kind),
    temperature: Number.isFinite(temperature) ? Math.round(temperature) : null,
  }
}

export default function WeatherContext() {
  const [todayWeather, setTodayWeather] = useState(readCachedWeather)
  const hasCache = hasCachedWeather()
  const [weatherMeta, setWeatherMeta] = useState({
    loading: !hasCache,
    source: hasCache ? 'cache' : null,
    lastRetry: 0,
  })

  const loadWeather = useCallback(async (latitude, longitude) => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}&current=temperature_2m,weather_code&timezone=auto`
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!response.ok) return false
      const nextWeather = normalizeWeatherPayload(await response.json())
      setTodayWeather(nextWeather)
      cacheWeather(nextWeather)
      return true
    } catch {
      return false
    }
  }, [])

  const attemptIPFallback = useCallback(async () => {
    setWeatherMeta(prev => ({ ...prev, loading: true }))
    try {
      const ipCoords = await tryIPGeolocation()
      if (!ipCoords) {
        setWeatherMeta(prev => ({ ...prev, loading: false, source: null }))
        return
      }
      const ok = await loadWeather(ipCoords.latitude, ipCoords.longitude)
      setWeatherMeta(prev => ({ ...prev, loading: false, source: ok ? 'ip-fallback' : null }))
    } catch {
      setWeatherMeta(prev => ({ ...prev, loading: false, source: null }))
    }
  }, [loadWeather])

  useEffect(() => {
    const noGeolocation = typeof navigator === 'undefined' || !navigator.geolocation
    let cancelled = false

    if (noGeolocation) {
      if (!hasCache) attemptIPFallback()
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const ok = await loadWeather(position.coords.latitude, position.coords.longitude)
        if (!cancelled) {
          setWeatherMeta(prev => ({ ...prev, loading: false, source: ok ? 'live' : null }))
        }
      },
      () => {
        if (!cancelled && !hasCache) attemptIPFallback()
      },
      { enableHighAccuracy: false, maximumAge: WEATHER_CACHE_TTL, timeout: 3500 },
    )

    return () => {
      cancelled = true
    }
  }, [attemptIPFallback, hasCache, loadWeather])

  const handleWeatherRetry = useCallback(() => {
    const now = Date.now()
    if (now - weatherMeta.lastRetry < WEATHER_RETRY_COOLDOWN) return

    setWeatherMeta(prev => ({ ...prev, loading: true, lastRetry: now }))

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      attemptIPFallback()
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const ok = await loadWeather(position.coords.latitude, position.coords.longitude)
        setWeatherMeta(prev => ({ ...prev, loading: false, source: ok ? 'live' : null }))
      },
      () => attemptIPFallback(),
      { enableHighAccuracy: false, maximumAge: WEATHER_CACHE_TTL, timeout: 3500 },
    )
  }, [attemptIPFallback, loadWeather, weatherMeta.lastRetry])

  const current = todayWeather || DEFAULT_TODAY_WEATHER
  const kind = current.kind || DEFAULT_TODAY_WEATHER.kind
  const label = current.label || getWeatherLabel(kind)
  const hasTemperature = current.temperature !== null && current.temperature !== undefined
  const weatherArt = WEATHER_ART[kind] || weatherSunny

  return (
    <aside className={`bm-weather-art bm-weather-kind-${kind}`} aria-label={`今日天气：${label}${hasTemperature ? `，${current.temperature} 度` : ''}`}>
      <span className="bm-weather-anim" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <img className="bm-weather-img" src={weatherArt} alt="" aria-hidden="true" />
      <span
        className={`bm-weather-chip${weatherMeta.loading ? ' bm-weather-chip-loading' : ''}${weatherMeta.source === null && !weatherMeta.loading ? ' bm-weather-chip-fallback' : ''}`}
        onClick={handleWeatherRetry}
        role="button"
        aria-label="点击重试获取天气"
      >
        <span>{label}</span>
        {hasTemperature ? (
          <strong>{current.temperature}°</strong>
        ) : weatherMeta.loading ? (
          <strong className="bm-weather-temp-placeholder">··</strong>
        ) : weatherMeta.source === null ? (
          <strong className="bm-weather-temp-placeholder">--</strong>
        ) : null}
        {weatherMeta.source === 'ip-fallback' && <i className="bm-weather-source-dot bm-weather-source-dot-ip" />}
        {weatherMeta.source === 'cache' && <i className="bm-weather-source-dot bm-weather-source-dot-cache" />}
        {weatherMeta.source === null && !weatherMeta.loading && (
          <span className="bm-weather-retry-hint" aria-hidden="true">
            <RefreshCw size={10} strokeWidth={2} />
          </span>
        )}
      </span>
    </aside>
  )
}
