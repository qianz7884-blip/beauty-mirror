export default function ImageViewer({ src, onClose }) {
  if (!src) return null
  return (
    <div className="image-viewer-overlay" onClick={onClose}>
      <button className="image-viewer-close" onClick={onClose}>✕</button>
      <img src={src} className="image-viewer-img" alt="查看大图" onClick={e => e.stopPropagation()} />
    </div>
  )
}
