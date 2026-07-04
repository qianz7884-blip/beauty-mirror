export function getRequestErrorMessage(error, fallback = '操作失败') {
  if (error?.response?.data?.error) return error.response.data.error
  if (error?.response?.data?.message) return error.response.data.message
  if (typeof error?.response?.data === 'string' && error.response.data.trim()) {
    return error.response.data.slice(0, 120)
  }
  if (error?.response?.status) return `服务端错误 (${error.response.status})`
  if (error?.code === 'ECONNABORTED') return '请求超时，请稍后重试'
  if (error?.request) return '无法连接服务器，请检查后端是否启动'
  return error?.message || fallback
}

export function parseVoiceProduct(text = '') {
  const result = { notes: text ? `语音录入：${text}` : '' }
  const brandMatch = text.match(/品牌(?:是|叫|为)?\s*([^，,。；;]+)/)
  const nameMatch = text.match(/(?:产品|名称|名字)(?:是|叫|为)?\s*([^，,。；;]+)/)
  const categoryMatch = text.match(/分类(?:是|叫|为)?\s*([^，,。；;]+)/)

  if (brandMatch) result.brand = brandMatch[1].trim()
  if (nameMatch) result.name = nameMatch[1].trim()
  if (categoryMatch) result.category = categoryMatch[1].trim()
  if (!result.name) result.name = text.replace(/^(添加|记录|新建)一个?/, '').trim()

  return result
}

export function startProductVoiceEntry({ showToast, openManualForm, onBeforeStart }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    showToast('当前浏览器不支持语音录入，请使用手动添加', 'error')
    openManualForm()
    return
  }

  onBeforeStart?.()
  showToast('正在听，请说出品牌、产品名和分类')

  const recognition = new SpeechRecognition()
  recognition.lang = 'zh-CN'
  recognition.interimResults = false
  recognition.maxAlternatives = 1
  recognition.onresult = (event) => {
    const text = event.results?.[0]?.[0]?.transcript || ''
    openManualForm(parseVoiceProduct(text))
  }
  recognition.onerror = () => {
    showToast('语音识别失败，请改用手动添加', 'error')
    openManualForm()
  }
  recognition.start()
}
