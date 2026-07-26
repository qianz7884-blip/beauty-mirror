import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronRight, ShieldCheck, Sparkles, Wand2, PackagePlus, RefreshCw } from 'lucide-react'
import { createProduct } from '../api'
import ProductAddSheet from '../components/ProductAddSheet'
import ProductForm from '../components/ProductForm'
import ProductVoiceSheet from '../components/ProductVoiceSheet'
import RecognizePanel from '../components/RecognizePanel'
import SkinAnalysisPanel from '../components/SkinAnalysisPanel'
import { getAllCategories } from '../categories'
import { usePageBackground } from '../utils/backgroundSettings'
import weatherCloudy from '../assets/illustrations/weather/weather-cloudy.webp'
import weatherFog from '../assets/illustrations/weather/weather-fog.webp'
import weatherPartly from '../assets/illustrations/weather/weather-partly.webp'
import weatherRain from '../assets/illustrations/weather/weather-rain.webp'
import weatherSnow from '../assets/illustrations/weather/weather-snow.webp'
import weatherStorm from '../assets/illustrations/weather/weather-storm.webp'
import weatherSunny from '../assets/illustrations/weather/weather-sunny.webp'
import todayAdviceIllustration from '../assets/illustrations/beauty-mirror-ip/today-advice-card-cutout.webp'

function TodayAction({ icon: Icon, title, desc, onClick, variant = 'secondary' }) {
  return (
    <button className={`bm-home-card bm-home-card-text bm-home-card-${variant}`} type="button" onClick={onClick}>
      <span className="bm-card-fallback-icon">
        <Icon size={21} strokeWidth={1.7} />
      </span>
      <span className="bm-card-copy">
        <strong>{title}</strong>
        <span>{desc}</span>
      </span>
      <span className="bm-card-arrow">
        <ChevronRight size={18} strokeWidth={1.8} />
      </span>
      <span className="bm-card-mini-stickers" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </button>
  )
}

const WEATHER_CACHE_KEY = 'beauty_mirror_today_weather_v1'
const WEATHER_CACHE_TTL = 30 * 60 * 1000
const DEFAULT_TODAY_WEATHER = { kind: 'sunny', label: '晴朗', temperature: null }
const IP_GEO_URL = 'https://ipapi.co/json/'
const WEATHER_RETRY_COOLDOWN = 5 * 60 * 1000

function hasCachedWeather() {
  if (typeof localStorage === 'undefined') return false
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || 'null')
    return !!(cached && Date.now() - cached.timestamp <= WEATHER_CACHE_TTL)
  } catch {
    return false
  }
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
    // Weather is decorative; ignore storage failures.
  }
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

function TodayWeatherArt({ weather, meta, onRetry }) {
  const current = weather || DEFAULT_TODAY_WEATHER
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
        className={`bm-weather-chip${meta?.loading ? ' bm-weather-chip-loading' : ''}${meta?.source === null && !meta?.loading ? ' bm-weather-chip-fallback' : ''}`}
        onClick={onRetry}
        role={onRetry ? 'button' : undefined}
        aria-label={onRetry ? '点击重试获取天气' : undefined}
      >
        <span>{label}</span>
        {hasTemperature ? (
          <strong>{current.temperature}°</strong>
        ) : meta?.loading ? (
          <strong className="bm-weather-temp-placeholder">··</strong>
        ) : meta?.source === null ? (
          <strong className="bm-weather-temp-placeholder">--</strong>
        ) : null}
        {meta?.source === 'ip-fallback' && <i className="bm-weather-source-dot bm-weather-source-dot-ip" />}
        {meta?.source === 'cache' && <i className="bm-weather-source-dot bm-weather-source-dot-cache" />}
        {meta?.source === null && !meta?.loading && (
          <span className="bm-weather-retry-hint" aria-hidden="true">
            <RefreshCw size={10} strokeWidth={2} />
          </span>
        )}
      </span>
    </aside>
  )
}

export default function Dashboard() {
  const pageBackground = usePageBackground('home')
  const [recognizePhoto, setRecognizePhoto] = useState(null)
  const [showManualForm, setShowManualForm] = useState(false)
  const [showProductActions, setShowProductActions] = useState(false)
  const [showVoiceEntry, setShowVoiceEntry] = useState(false)
  const [initialValues, setInitialValues] = useState({})
  const [toast, setToast] = useState(null)
  const [skinPanelProps, setSkinPanelProps] = useState(null)
  const [todayWeather, setTodayWeather] = useState(readCachedWeather)
  const hasCache = hasCachedWeather()
  const [weatherMeta, setWeatherMeta] = useState({
    loading: !hasCache,
    source: hasCache ? 'cache' : null,
    lastRetry: 0,
  })
  const cameraInputRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (location.state?.openSkinAnalysis) {
      setSkinPanelProps({})
      navigate('.', { replace: true, state: {} })
    }
  }, [location.state])

  useEffect(() => {
    const openHistory = () => setSkinPanelProps({ forceHistoryMode: true })
    window.addEventListener('open-skin-history', openHistory)
    return () => window.removeEventListener('open-skin-history', openHistory)
  }, [])

  useEffect(() => {
    const noGeolocation = typeof navigator === 'undefined' || !navigator.geolocation
    let cancelled = false

    const loadWeather = async (latitude, longitude) => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}&current=temperature_2m,weather_code&timezone=auto`
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (!response.ok) return
        const nextWeather = normalizeWeatherPayload(await response.json())
        if (cancelled) return
        setTodayWeather(nextWeather)
        cacheWeather(nextWeather)
        return true
      } catch {
        return false
      }
    }

    const attemptIPFallback = async () => {
      if (cancelled) return
      setWeatherMeta(prev => ({ ...prev, loading: true }))
      try {
        const ipCoords = await tryIPGeolocation()
        if (!ipCoords || cancelled) {
          setWeatherMeta(prev => ({ ...prev, loading: false }))
          return
        }
        const ok = await loadWeather(ipCoords.latitude, ipCoords.longitude)
        if (!cancelled) {
          setWeatherMeta(prev => ({ ...prev, loading: false, source: ok ? 'ip-fallback' : null }))
        }
      } catch {
        if (!cancelled) setWeatherMeta(prev => ({ ...prev, loading: false }))
      }
    }

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
      () => attemptIPFallback(),
      { enableHighAccuracy: false, maximumAge: WEATHER_CACHE_TTL, timeout: 3500 },
    )

    return () => {
      cancelled = true
    }
  }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    window.setTimeout(() => setToast(null), 2000)
  }

  const handleWeatherRetry = useCallback(() => {
    const now = Date.now()
    if (now - weatherMeta.lastRetry < WEATHER_RETRY_COOLDOWN) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) return

    setWeatherMeta(prev => ({ ...prev, loading: true, lastRetry: now }))

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const ok = await (async (latitude, longitude) => {
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
        })(position.coords.latitude, position.coords.longitude)
        setWeatherMeta(prev => ({ ...prev, loading: false, source: ok ? 'live' : null }))
      },
      async () => {
        try {
          const ipCoords = await tryIPGeolocation()
          if (!ipCoords) {
            setWeatherMeta(prev => ({ ...prev, loading: false, source: null }))
            return
          }
          const ok = await (async (latitude, longitude) => {
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
          })(ipCoords.latitude, ipCoords.longitude)
          setWeatherMeta(prev => ({ ...prev, loading: false, source: ok ? 'ip-fallback' : null }))
        } catch {
          setWeatherMeta(prev => ({ ...prev, loading: false, source: null }))
        }
      },
      { enableHighAccuracy: false, maximumAge: WEATHER_CACHE_TTL, timeout: 3500 },
    )
  }, [weatherMeta.lastRetry])

  const handlePhotoCapture = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setRecognizePhoto({ file, previewUrl: URL.createObjectURL(file) })
    setShowProductActions(false)
    e.target.value = ''
  }

  const handleRecognizeSaved = () => {
    setRecognizePhoto(null)
    showToast('已收进美妆柜')
  }

  const openManualForm = (values = {}) => {
    setInitialValues(values)
    setShowProductActions(false)
    setShowManualForm(true)
  }

  const startVoiceEntry = () => {
    setShowProductActions(false)
    setShowVoiceEntry(true)
  }

  const handleVoiceResult = (values) => {
    setShowVoiceEntry(false)
    openManualForm(values)
  }

  const handleManualSubmit = async (formData) => {
    try {
      await createProduct(formData)
      setShowManualForm(false)
      setShowProductActions(false)
      setInitialValues({})
      showToast('产品已记录')
    } catch (err) {
      showToast(err.response?.data?.error || '暂时没有记录成功', 'error')
    }
  }

  const today = new Date()
  const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日 ${today.toLocaleDateString('zh-CN', { weekday: 'short' })}`

  return (
    <div className="bm-screen bm-home" style={pageBackground.style}>
      {toast && (
        <div className="d-toast-container">
          <div className={`d-toast d-toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}

      <section className="bm-hero bm-home-hero">
        <TodayWeatherArt weather={todayWeather} meta={weatherMeta} onRetry={handleWeatherRetry} />
        <div className="bm-home-advice-figure" aria-hidden="true">
          <img src={todayAdviceIllustration} alt="" />
        </div>
        <span className="bm-home-sparkle bm-home-sparkle-a" aria-hidden="true" />
        <span className="bm-home-sparkle bm-home-sparkle-b" aria-hidden="true" />
        <p className="bm-date">{todayLabel}</p>
        <h1>今天要去哪？</h1>
        <div className="bm-privacy">
          <ShieldCheck size={15} strokeWidth={1.8} />
          <span>照片上传后端分析 · 原图不发送给 Gemini</span>
        </div>
      </section>

      <section className="bm-home-list" aria-label="今日核心入口">
        <TodayAction
          icon={Sparkles}
          title="开始镜前建议"
          desc="拍当前状态，给 1-3 条建议。"
          variant="primary"
          onClick={() => setSkinPanelProps({})}
        />
        <div className="bm-home-secondary-grid">
          <TodayAction
            icon={Wand2}
            title="找今天教程"
            desc="按比例、场景和时间预算推荐视频。"
            onClick={() => navigate('/tutorial')}
          />
          <TodayAction
            icon={PackagePlus}
            title="快速记录产品"
            desc="拍照、语音或手动录入。"
            onClick={() => navigate('/products')}
          />
        </div>
      </section>

      <input ref={cameraInputRef} type="file" accept="image/*" hidden onChange={handlePhotoCapture} />

      {showProductActions && (
        <ProductAddSheet
          title="快速记录产品"
          onClose={() => setShowProductActions(false)}
          onCamera={() => cameraInputRef.current?.click()}
          onVoice={startVoiceEntry}
          onManual={() => openManualForm()}
        />
      )}

      {showVoiceEntry && (
        <ProductVoiceSheet
          onClose={() => setShowVoiceEntry(false)}
          onResult={handleVoiceResult}
        />
      )}

      {recognizePhoto && (
        <RecognizePanel
          photoFile={recognizePhoto.file}
          previewUrl={recognizePhoto.previewUrl}
          categories={getAllCategories()}
          onSaved={handleRecognizeSaved}
          onClose={() => setRecognizePhoto(null)}
        />
      )}

      {skinPanelProps && (
        <SkinAnalysisPanel
          photoFile={skinPanelProps.photoFile}
          previewUrl={skinPanelProps.previewUrl}
          viewHistoryId={skinPanelProps.viewHistoryId}
          forceHistoryMode={skinPanelProps.forceHistoryMode}
          autoOpenCamera={skinPanelProps.autoOpenCamera}
          onClose={() => {
            setSkinPanelProps(null)
          }}
        />
      )}

      {showManualForm && (
        <ProductForm
          mode="quick"
          categories={getAllCategories()}
          initialValues={initialValues}
          onSubmit={handleManualSubmit}
          onClose={() => {
            setShowManualForm(false)
            setInitialValues({})
          }}
        />
      )}
    </div>
  )
}
