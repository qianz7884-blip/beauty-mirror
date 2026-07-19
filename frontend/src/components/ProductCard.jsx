import { useState } from 'react'
import { getPhotoUrl } from '../api'
import ImageViewer from './ImageViewer'
import { Edit3, Trash2 } from 'lucide-react'
import { formatProductPrice, getProductExpiryDate, getProductStatus } from '../utils/productCatalog'

function parseTagText(value) {
  return String(value || '')
    .split(/[、,，/]/)
    .map(item => item.trim())
    .filter(Boolean)
}

export default function ProductCard({ product, onEdit, onDelete }) {
  const [viewImage, setViewImage] = useState(null)

  const photoUrl = product.photo ? getPhotoUrl(product.photo, 'products') : null
  const status = getProductStatus(product)
  const expiryDate = getProductExpiryDate(product)
  const priceText = formatProductPrice(product.price)
  const recommendationTags = [
    ...parseTagText(product.product_features),
    ...parseTagText(product.suitable_regions),
    ...parseTagText(product.usage_steps),
  ].slice(0, 3)

  return (
    <>
      <div className="vault-product-card">
        <div
          className={`vault-product-photo${photoUrl ? ' clickable-thumb' : ' is-placeholder'}`}
          onClick={() => photoUrl && setViewImage(photoUrl)}
          style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
        >
        </div>

        <div className="vault-product-info">
          <div className="vault-product-topline">
            <span>{product.category || '未分类'}</span>
            <em>{status}</em>
          </div>
          <h3>{product.name}</h3>
          <p className="vault-product-brand">{product.brand || '未记录品牌'}</p>

          <div className="vault-product-meta">
            {product.color && <span>色号 {product.color}</span>}
            {product.purchase_date && <span>开封/购入 {product.purchase_date}</span>}
            {expiryDate && <span>到期 {expiryDate}</span>}
            {product.volume && <span>容量 {product.volume}</span>}
            {priceText && <span>¥{priceText}</span>}
          </div>

          {recommendationTags.length > 0 && (
            <div className="vault-product-rec-tags">
              {recommendationTags.map(tag => <span key={tag}>{tag}</span>)}
            </div>
          )}

          {product.color && (
            <span className="vault-swatch" style={{ background: product.color }} />
          )}

          {product.notes && (
            <p className="vault-product-note">
              {product.notes.slice(0, 60)}{product.notes.length > 60 ? '...' : ''}
            </p>
          )}
        </div>

        <div className="vault-product-actions">
          <button onClick={onEdit} title="编辑">
            <Edit3 size={15} strokeWidth={1.7} />
          </button>
          <button onClick={onDelete} title="删除">
            <Trash2 size={15} strokeWidth={1.7} />
          </button>
        </div>
      </div>

      {viewImage && (
        <ImageViewer src={viewImage} onClose={() => setViewImage(null)} />
      )}
    </>
  )
}
