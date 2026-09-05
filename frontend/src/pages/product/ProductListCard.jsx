import { Edit3, Trash2 } from 'lucide-react'

export function ProductListCard({
  displayData,
  photoUrl,
  placeholderImage,
  product,
  viewMode,
  onDelete,
  onEdit,
  onImageOpen,
  onOpen,
}) {
  const {
    priceText,
    recommendationTags,
    status,
    usagePercent,
  } = displayData

  return (
    <article className={`bm-product-card ${viewMode === 'grid' ? 'bm-product-grid-card' : ''}`}>
      <button
        type="button"
        className={`bm-product-photo ${photoUrl ? '' : 'is-placeholder'}`}
        onClick={onImageOpen}
        style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
        aria-label={photoUrl ? '查看产品图片' : `${product.category || '产品'}占位插画`}
      >
        {!photoUrl && (
          <img
            className="bm-category-placeholder"
            src={placeholderImage}
            alt=""
            aria-hidden="true"
          />
        )}
      </button>
      <button type="button" className="bm-product-info" onClick={onOpen}>
        <span className="bm-product-status">{status}</span>
        <h3>{product.name}</h3>
        <p>{product.brand || '未记录品牌'}</p>
        <div className="bm-product-tags">
          {product.volume && <span>容量 {product.volume}</span>}
          {product.color && <span>色号 {product.color}</span>}
          {usagePercent > 0 && <span>已用 {usagePercent}%</span>}
          {priceText && <span>¥{priceText}</span>}
        </div>
        {recommendationTags.length > 0 && (
          <div className="vault-product-rec-tags">
            {recommendationTags.map(tag => <span key={tag}>{tag}</span>)}
          </div>
        )}
      </button>
      <div className="bm-product-actions">
        <button
          type="button"
          aria-label="编辑"
          onClick={onEdit}
        >
          <Edit3 size={17} strokeWidth={1.7} />
        </button>
        <button type="button" aria-label="删除" onClick={onDelete}>
          <Trash2 size={17} strokeWidth={1.7} />
        </button>
      </div>
    </article>
  )
}
