import { getPhotoUrl } from '../api'

export default function ProductCard({ product, onEdit, onDelete }) {
  return (
    <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      {/* 缩略图 */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 10,
          flexShrink: 0,
          background: product.photo
            ? `url(${getPhotoUrl(product.photo, 'products')}) center/cover`
            : 'linear-gradient(135deg, #e8f5e9, #c8e6c9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 30,
        }}
      >
        {!product.photo && '💄'}
      </div>

      {/* 信息 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{product.name}</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>
          {product.brand && <span>{product.brand}</span>}
          {product.brand && product.category && <span> · </span>}
          {product.category && <span>{product.category}</span>}
          {product.price > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--accent)', fontWeight: 500 }}>
              ¥{product.price}
            </span>
          )}
        </div>
        {product.color && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: product.color,
                border: '1px solid #ddd',
              }}
            />
            <span style={{ fontSize: 11, color: '#999' }}>{product.color}</span>
          </div>
        )}
        {product.notes && (
          <p style={{ fontSize: 12, color: '#aaa', marginTop: 4, lineHeight: 1.5 }}>
            {product.notes.slice(0, 60)}{product.notes.length > 60 ? '...' : ''}
          </p>
        )}
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <button className="btn btn-outline btn-sm" onClick={onEdit}>编辑</button>
        <button className="btn btn-danger btn-sm" onClick={onDelete}>删除</button>
      </div>
    </div>
  )
}
