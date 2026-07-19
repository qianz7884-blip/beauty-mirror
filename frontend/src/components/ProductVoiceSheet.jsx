import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Square, X } from 'lucide-react'
import { recognizeProductVoice } from '../api'

function getSupportedMimeType() {
  if (!window.MediaRecorder?.isTypeSupported) return ''
  return [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/wav',
  ].find(type => window.MediaRecorder.isTypeSupported(type)) || ''
}

function getAudioExtension(mimeType) {
  if (mimeType.includes('mp4')) return 'm4a'
  if (mimeType.includes('wav')) return 'wav'
  return 'webm'
}

export default function ProductVoiceSheet({ onClose, onResult }) {
  const [status, setStatus] = useState('idle') // idle | recording | processing
  const [errorMsg, setErrorMsg] = useState('')
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const cancelledRef = useRef(false)

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }

  useEffect(() => {
    return () => {
      cancelledRef.current = true
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop()
      }
      cleanupStream()
    }
  }, [])

  const submitAudio = async (audioBlob) => {
    if (!audioBlob.size) {
      setStatus('idle')
      setErrorMsg('没有录到声音，请再试一次')
      return
    }

    try {
      const formData = new FormData()
      const fileName = `voice-product.${getAudioExtension(audioBlob.type)}`
      formData.append('audio', audioBlob, fileName)
      const result = await recognizeProductVoice(formData)

      if (!result.recognized) {
        setStatus('idle')
        setErrorMsg(result.message || '没有听清产品信息，请再试一次')
        return
      }

      const notes = result.notes || (result.transcript ? `语音录入：${result.transcript}` : '')
      onResult({
        brand: result.brand || '',
        name: result.name || '',
        category: result.category || '其他',
        color: result.color || '',
        volume: result.volume || '',
        notes,
        ingredients: result.ingredients || '',
        efficacy: result.efficacy || '',
        suitable_skin: result.suitable_skin || '',
        usage_instructions: result.usage_instructions || '',
        usage_steps: result.usage_steps || '',
        product_features: result.product_features || '',
        suitable_regions: result.suitable_regions || '',
        suitable_scenes: result.suitable_scenes || '',
        user_feedback: result.user_feedback || '',
        source: result.source || 'voice',
      })
    } catch (error) {
      setStatus('idle')
      if (error?.code === 'ECONNABORTED') {
        setErrorMsg('语音识别超时，请缩短录音后重试')
      } else if (error?.response?.data?.message) {
        setErrorMsg(error.response.data.message)
      } else if (error?.response?.data?.error) {
        setErrorMsg(error.response.data.error)
      } else if (error?.request) {
        setErrorMsg('无法连接后端，请检查服务是否启动')
      } else {
        setErrorMsg('语音识别失败，请再试一次')
      }
    }
  }

  const startRecording = async () => {
    setErrorMsg('')
    cancelledRef.current = false
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setErrorMsg('当前浏览器不支持录音，请使用手动录入')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        if (cancelledRef.current) {
          cleanupStream()
          return
        }
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        })
        cleanupStream()
        submitAudio(blob)
      }

      recorder.start()
      setStatus('recording')
    } catch (error) {
      cleanupStream()
      setStatus('idle')
      if (error?.name === 'NotAllowedError') {
        setErrorMsg('麦克风权限被拒绝，请允许后再试')
      } else {
        setErrorMsg('无法打开麦克风，请检查浏览器权限')
      }
    }
  }

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      setStatus('processing')
      recorderRef.current.stop()
    }
  }

  const handleClose = () => {
    cancelledRef.current = true
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
    cleanupStream()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-sheet product-voice-sheet" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <h3>语音录入</h3>
          <button className="modal-close" type="button" aria-label="关闭" onClick={handleClose}>
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className={`voice-record-orb ${status}`}>
          {status === 'processing'
            ? <Loader2 size={34} strokeWidth={1.8} />
            : <Mic size={34} strokeWidth={1.8} />}
        </div>

        <p className="voice-status">
          {status === 'idle' && '说出品牌、产品名、分类和规格'}
          {status === 'recording' && '正在录音'}
          {status === 'processing' && '正在整理'}
        </p>
        <p className="voice-example">
          例如：品牌是 Vaseline，产品是特润屏障修护精华霜，分类是面霜。
        </p>

        {errorMsg && <div className="soft-error">{errorMsg}</div>}

        <div className="voice-action-row">
          {status === 'recording' ? (
            <button className="btn btn-primary btn-block voice-stop-button" type="button" onClick={stopRecording}>
              <Square size={16} strokeWidth={1.8} />
              停止并识别
            </button>
          ) : (
            <button
              className="btn btn-primary btn-block"
              type="button"
              onClick={startRecording}
              disabled={status === 'processing'}
            >
              {status === 'processing' ? <Loader2 size={16} strokeWidth={1.8} /> : <Mic size={16} strokeWidth={1.8} />}
              {status === 'processing' ? '识别中...' : '开始录音'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
