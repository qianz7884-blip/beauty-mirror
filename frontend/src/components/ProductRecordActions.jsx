import { Camera, Mic, Pencil } from 'lucide-react'

const DEFAULT_ACTIONS = [
  {
    key: 'camera',
    icon: Camera,
    title: '拍照识别',
    desc: '拍照或选相册',
  },
  {
    key: 'voice',
    icon: Mic,
    title: '语音录入',
    desc: '说出品牌和品类',
  },
  {
    key: 'manual',
    icon: Pencil,
    title: '手动录入',
    desc: '填写色号与进度',
  },
]

export default function ProductRecordActions({ onCamera, onVoice, onManual, className = '' }) {
  const handlers = {
    camera: onCamera,
    voice: onVoice,
    manual: onManual,
  }

  return (
    <div className={['product-record-actions', className].filter(Boolean).join(' ')}>
      {DEFAULT_ACTIONS.map(action => {
        const Icon = action.icon
        return (
          <button
            key={action.key}
            className="product-record-card"
            type="button"
            onClick={handlers[action.key]}
          >
            <Icon size={24} strokeWidth={1.7} />
            <strong>{action.title}</strong>
            <span>{action.desc}</span>
          </button>
        )
      })}
    </div>
  )
}
