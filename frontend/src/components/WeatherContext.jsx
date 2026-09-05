import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import weatherCloudy from '../assets/illustrations/weather/weather-cloudy.png'
import weatherFog from '../assets/illustrations/weather/weather-fog.png'
import weatherPartly from '../assets/illustrations/weather/weather-partly.png'
import weatherRain from '../assets/illustrations/weather/weather-rain.png'
import weatherSnow from '../assets/illustrations/weather/weather-snow.png'
import weatherStorm from '../assets/illustrations/weather/weather-storm.png'
import weatherSunny from '../assets/illustrations/weather/weather-sunny.png'
import { buildWeatherDisplayData } from './weather/weatherLogic'
import {
  WEATHER_CACHE_TTL,
  WEATHER_RETRY_COOLDOWN,
  cacheWeather,
  fetchWeatherByCoords,
  hasCachedWeather,
  readCachedWeather,
  tryIPGeolocation,
} from './weather/weatherService'

const WEATHER_ART = {
  sunny: weatherSunny,
  partly: weatherPartly,
  cloudy: weatherCloudy,
  fog: weatherFog,
  rain: weatherRain,
  snow: weatherSnow,
  storm: weatherStorm,
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
    const nextWeather = await fetchWeatherByCoords(latitude, longitude)
    if (!nextWeather) return false
    setTodayWeather(nextWeather)
    cacheWeather(nextWeather)
    return true
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

  const { current, kind, label, hasTemperature } = buildWeatherDisplayData(todayWeather)
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
