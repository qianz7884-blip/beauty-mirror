import { getPhotoUrl } from '../api'

export default function DiaryCard({ diary, productMap, onEdit, onDelete }) {
  const linkedProducts = (diary.product_ids || [])
    .map(id => productMap[id])
    .filter(Boolean)

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <span style={{ fontSize: 32 }}>{diary.mood}</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{diary.title}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{diary.created_date}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn btn-outline btn-sm" onClick={onEdit}>编辑</button>
          <button className="btn btn-danger btn-sm" onClick={onDelete}>删除</button>
        </div>
      </div>

      {diary.content && (
        <p style={{ fontSize: 14, color: '#555', marginTop: 10, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {diary.content}
        </p>
      )}

      {diary.photo && (
        <img
          src={getPhotoUrl(diary.photo, 'diary')}
          alt="护肤照片"
          style={{
            width: '100%',
            maxHeight: 300,
            objectFit: 'cover',
            borderRadius: 8,
            marginTop: 10,
          }}
        />
      )}

      {linkedProducts.length > 0 && (
        <div className="product-chips">
          <span style={{ fontSize: 12, color: '#999' }}>使用产品：</span>
          {linkedProducts.map(p => (
            <span key={p.id} className="tag">{p.name}</span>
          ))}
        </div>
      )}
    </div>
  )
}
