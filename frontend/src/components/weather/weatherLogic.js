export const DEFAULT_TODAY_WEATHER = { kind: 'sunny', label: '晴朗', temperature: null }

export function classifyWeatherCode(code) {
  if (code === 0 || code === 1) return 'sunny'
  if (code === 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'sunny'
}

export function getWeatherLabel(kind) {
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

export function normalizeWeatherPayload(payload) {
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

export function buildWeatherDisplayData(todayWeather) {
  const current = todayWeather || DEFAULT_TODAY_WEATHER
  const kind = current.kind || DEFAULT_TODAY_WEATHER.kind
  const label = current.label || getWeatherLabel(kind)
  const hasTemperature = current.temperature !== null && current.temperature !== undefined

  return {
    current,
    kind,
    label,
    hasTemperature,
  }
}
