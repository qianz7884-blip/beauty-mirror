import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronRight,
  CloudSun,
  Droplets,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Sparkles,
  SunMedium,
} from 'lucide-react'
import SkinAnalysisPanel from '../components/SkinAnalysisPanel'
import { usePageBackground } from '../utils/backgroundSettings'
import weatherCloudy from '../assets/illustrations/weather/weather-cloudy.webp'
import weatherFog from '../assets/illustrations/weather/weather-fog.webp'
import weatherPartly from '../assets/illustrations/weather/weather-partly.webp'
import weatherRain from '../assets/illustrations/weather/weather-rain.webp'
import weatherSnow from '../assets/illustrations/weather/weather-snow.webp'
import weatherStorm from '../assets/illustrations/weather/weather-storm.webp'
import weatherSunny from '../assets/illustrations/weather/weather-sunny.webp'

const WEATHER_CACHE_KEY = 'beauty_mirror_today_weather_v2'
const WEATHER_CACHE_TTL = 30 * 60 * 1000
const WEATHER_RETRY_COOLDOWN = 5 * 60 * 1000
const IP_GEO_URL = 'https://ipapi.co/json/'
const DEFAULT_TODAY_WEATHER = {
  kind: 'sunny',
  label: '晴朗',
  temperature: null,
  humidity: null,
  uvIndex: null,
}

const WEATHER_ART = {
  sunny: weatherSunny,
  partly: weatherPartly,
  cloudy: weatherCloudy,
  fog: weatherFog,
  rain: weatherRain,
  snow: weatherSnow,
  storm: weatherStorm,
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

function getUvLevel(value) {
  if (!Number.isFinite(value)) return '待获取'
  if (value < 3) return '较弱'
  if (value < 6) return '中等'
  if (value < 8) return '较强'
  if (value < 11) return '很强'
  return '极强'
}

function readCachedWeather() {
  if (typeof localStorage === 'undefined') return DEFAULT_TODAY_WEATHER
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || 'null')
    if (!cached || Date.now() - cached.timestamp > WEATHER_CACHE_TTL) return DEFAULT_TODAY_WEATHER
    return { ...DEFAULT_TODAY_WEATHER, ...cached.weather }
  } catch {
    return DEFAULT_TODAY_WEATHER
  }
}

function hasCachedWeather() {
  if (typeof localStorage === 'undefined') return false
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || 'null')
    return Boolean(cached && Date.now() - cached.timestamp <= WEATHER_CACHE_TTL)
  } catch {
    return false
  }
}

function cacheWeather(weather) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), weather }))
  } catch {
    // 天气缓存失败不影响镜前建议主流程。
  }
}

function normalizeWeatherPayload(payload) {
  const current = payload?.current || payload?.current_weather || {}
  const daily = payload?.daily || {}
  const code = Number(current.weather_code ?? current.weathercode)
  const temperature = Number(current.temperature_2m ?? current.temperature)
  const humidity = Number(current.relative_humidity_2m)
  const uvIndex = Number(Array.isArray(daily.uv_index_max) ? daily.uv_index_max[0] : daily.uv_index_max)
  const kind = classifyWeatherCode(Number.isFinite(code) ? code : 0)

  return {
    kind,
    label: getWeatherLabel(kind),
    temperature: Number.isFinite(temperature) ? Math.round(temperature) : null,
    humidity: Number.isFinite(humidity) ? Math.round(humidity) : null,
    uvIndex: Number.isFinite(uvIndex) ? Math.round(uvIndex * 10) / 10 : null,
  }
}

async function tryIPGeolocation() {
  const response = await fetch(IP_GEO_URL, { signal: AbortSignal.timeout(4000) })
  if (!response.ok) return null
  const data = await response.json()
  if (data.latitude == null || data.longitude == null) return null
  return { latitude: Number(data.latitude), longitude: Number(data.longitude) }
}

async function fetchWeatherAt(latitude, longitude) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', Number(latitude).toFixed(4))
  url.searchParams.set('longitude', Number(longitude).toFixed(4))
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code')
  url.searchParams.set('daily', 'uv_index_max')
  url.searchParams.set('forecast_days', '1')
  url.searchParams.set('timezone', 'auto')

  const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) return null
  return normalizeWeatherPayload(await response.json())
}

function buildEnvironmentAdvice(weather) {
  const tips = []
  if (Number.isFinite(weather.humidity)) {
    if (weather.humidity >= 70) tips.push('湿度偏高，底妆薄涂并做好定妆')
    else if (weather.humidity <= 40) tips.push('空气偏干，妆前先补水保湿')
    else tips.push('湿度舒适，按日常妆前护理即可')
  }

  if (Number.isFinite(weather.uvIndex)) {
    if (weather.uvIndex >= 6) tips.push('紫外线较强，注意足量防晒和补涂')
    else if (weather.uvIndex >= 3) tips.push('紫外线中等，出门前记得防晒')
    else tips.push('紫外线较弱，日常防晒即可')
  }

  return tips.length ? tips.slice(0, 2).join('；') : '天气数据获取后，会自动生成今天的妆护提醒'
}

function WeatherMetric({ icon: Icon, label, value, helper }) {
  return (
    <span className="bm-weather-metric">
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        {helper ? <em>{helper}</em> : null}
      </span>
    </span>
  )
}

function TodayWeatherCard({ weather, meta, onRetry }) {
  const current = weather || DEFAULT_TODAY_WEATHER
  const kind = current.kind || DEFAULT_TODAY_WEATHER.kind
  const weatherArt = WEATHER_ART[kind] || weatherSunny
  const temperature = Number.isFinite(current.temperature) ? `${current.temperature}°` : '--'
  const humidity = Number.isFinite(current.humidity) ? `${current.humidity}%` : '--'
  const uvValue = Number.isFinite(current.uvIndex) ? current.uvIndex : '--'

  return (
    <section className={`bm-environment-card bm-weather-kind-${kind}`} aria-label="今日环境信息">
      <div className="bm-environment-main">
        <div className="bm-environment-weather">
          <img src={weatherArt} alt="" aria-hidden="true" />
          <span>
            <small>今日天气</small>
            <strong>{temperature}</strong>
            <em>{current.label}</em>
          </span>
        </div>
        <button
          type="button"
          className={meta.loading ? 'is-loading' : ''}
          onClick={onRetry}
          aria-label="重新获取天气"
        >
          <RefreshCw size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="bm-weather-metrics">
        <WeatherMetric icon={Droplets} label="湿度" value={humidity} helper="空气状态" />
        <WeatherMetric icon={SunMedium} label="紫外线" value={uvValue} helper={getUvLevel(current.uvIndex)} />
      </div>

      <div className="bm-environment-tip">
        <CloudSun size={17} strokeWidth={1.8} aria-hidden="true" />
        <span>{buildEnvironmentAdvice(current)}</span>
      </div>
    </section>
  )
}

export default function Dashboard() {
  const pageBackground = usePageBackground('home')
  const [skinPanelProps, setSkinPanelProps] = useState(null)
  const [todayWeather, setTodayWeather] = useState(readCachedWeather)
  const cacheAvailable = hasCachedWeather()
  const [weatherMeta, setWeatherMeta] = useState({
    loading: !cacheAvailable,
    source: cacheAvailable ? 'cache' : null,
    lastRetry: 0,
  })
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!location.state?.openSkinAnalysis) return
    setSkinPanelProps({})
    navigate('.', { replace: true, state: {} })
  }, [location.state, navigate])

  useEffect(() => {
    const openHistory = () => setSkinPanelProps({ forceHistoryMode: true })
    window.addEventListener('open-skin-history', openHistory)
    return () => window.removeEventListener('open-skin-history', openHistory)
  }, [])

  useEffect(() => {
    let cancelled = false

    const saveWeather = (weather, source) => {
      if (cancelled || !weather) return false
      setTodayWeather(weather)
      cacheWeather(weather)
      setWeatherMeta(prev => ({ ...prev, loading: false, source }))
      return true
    }

    const loadFromIP = async () => {
      try {
        const coords = await tryIPGeolocation()
        if (!coords || cancelled) return false
        return saveWeather(await fetchWeatherAt(coords.latitude, coords.longitude), 'ip-fallback')
      } catch {
        return false
      }
    }

    const finishWithoutWeather = () => {
      if (!cancelled) setWeatherMeta(prev => ({ ...prev, loading: false }))
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (!cacheAvailable) loadFromIP().then(ok => { if (!ok) finishWithoutWeather() })
      return () => { cancelled = true }
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const weather = await fetchWeatherAt(coords.latitude, coords.longitude)
          if (!saveWeather(weather, 'live')) finishWithoutWeather()
        } catch {
          const ok = await loadFromIP()
          if (!ok) finishWithoutWeather()
        }
      },
      async () => {
        const ok = await loadFromIP()
        if (!ok) finishWithoutWeather()
      },
      { enableHighAccuracy: false, maximumAge: WEATHER_CACHE_TTL, timeout: 3500 },
    )

    return () => { cancelled = true }
  }, [])

  const handleWeatherRetry = useCallback(() => {
    const now = Date.now()
    if (now - weatherMeta.lastRetry < WEATHER_RETRY_COOLDOWN) return
    setWeatherMeta(prev => ({ ...prev, loading: true, lastRetry: now }))

    const update = async (latitude, longitude, source) => {
      try {
        const weather = await fetchWeatherAt(latitude, longitude)
        if (!weather) return false
        setTodayWeather(weather)
        cacheWeather(weather)
        setWeatherMeta(prev => ({ ...prev, loading: false, source }))
        return true
      } catch {
        return false
      }
    }

    const useIP = async () => {
      try {
        const coords = await tryIPGeolocation()
        if (!coords || !(await update(coords.latitude, coords.longitude, 'ip-fallback'))) {
          setWeatherMeta(prev => ({ ...prev, loading: false, source: null }))
        }
      } catch {
        setWeatherMeta(prev => ({ ...prev, loading: false, source: null }))
      }
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      useIP()
      return
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => update(coords.latitude, coords.longitude, 'live').then(ok => { if (!ok) useIP() }),
      useIP,
      { enableHighAccuracy: false, maximumAge: 0, timeout: 3500 },
    )
  }, [weatherMeta.lastRetry])

  const today = new Date()
  const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日 · ${today.toLocaleDateString('zh-CN', { weekday: 'long' })}`

  return (
    <div className="bm-screen bm-home bm-home-redesign" style={pageBackground.style}>
      <header className="bm-home-heading">
        <span className="bm-home-brand"><Sparkles size={15} strokeWidth={1.8} /> Mirror Mate</span>
        <p>{todayLabel}</p>
        <h1>镜前建议</h1>
        <span>根据今天的环境和面部状态，给你简单、可执行的妆护提醒。</span>
      </header>

      <TodayWeatherCard weather={todayWeather} meta={weatherMeta} onRetry={handleWeatherRetry} />

      <section className="bm-mirror-start-card">
        <div className="bm-mirror-visual" aria-hidden="true">
          <span className="bm-mirror-orbit"><i /><i /><i /></span>
          <span className="bm-mirror-disc">
            <ScanFace size={50} strokeWidth={1.25} />
          </span>
        </div>
        <div className="bm-mirror-start-copy">
          <span>今日检测</span>
          <h2>拍一张，获得今天的镜前建议</h2>
          <p>分析肤质状态、面部比例与环境影响，只展示最需要关注的重点。</p>
        </div>
        <button type="button" className="bm-mirror-primary-action" onClick={() => setSkinPanelProps({ autoOpenCamera: true })}>
          <ScanFace size={20} strokeWidth={1.8} />
          <span>开始镜前建议</span>
          <ChevronRight size={18} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          className="bm-mirror-history-link"
          onClick={() => setSkinPanelProps({ forceHistoryMode: true })}
        >
          查看上次结果
          <ChevronRight size={15} strokeWidth={1.8} />
        </button>
      </section>

      <div className="bm-home-privacy">
        <ShieldCheck size={15} strokeWidth={1.8} />
        <span>照片仅用于后端面部分析，原图不发送给 Gemini</span>
      </div>

      {skinPanelProps && (
        <SkinAnalysisPanel
          photoFile={skinPanelProps.photoFile}
          previewUrl={skinPanelProps.previewUrl}
          viewHistoryId={skinPanelProps.viewHistoryId}
          forceHistoryMode={skinPanelProps.forceHistoryMode}
          autoOpenCamera={skinPanelProps.autoOpenCamera}
          onClose={() => setSkinPanelProps(null)}
        />
      )}
    </div>
  )
}
