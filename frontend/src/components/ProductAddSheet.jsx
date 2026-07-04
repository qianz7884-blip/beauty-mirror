import { X } from 'lucide-react'
import ProductRecordActions from './ProductRecordActions'

export default function ProductAddSheet({
  title = '添加产品',
  onClose,
  onCamera,
  onVoice,
  onManual,
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="mirror-product-sheet bm-home-product-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" type="button" aria-label="关闭" onClick={onClose}>
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>
        <p className="mirror-sheet-note">选择一种记录方式，之后都可以继续修改。</p>
        <ProductRecordActions
          onCamera={onCamera}
          onVoice={onVoice}
          onManual={onManual}
        />
      </div>
    </div>
  )
}
