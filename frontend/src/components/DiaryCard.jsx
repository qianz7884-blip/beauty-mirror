import { getPhotoUrl } from '../api'
import { Camera, Package, Sparkles } from 'lucide-react'
import { getMoodInfo } from '../utils/moods'

export default function DiaryCard({ diary, onClick }) {
  const mood = getMoodInfo(diary.mood_info?.key || diary.mood)
  const hasPhoto = !!(diary.photo)
  const photoUrl = hasPhoto ? getPhotoUrl(diary.photo, 'diary') : null
  const contentPreview = diary.content
    ? diary.content.slice(0, 80) + (diary.content.length > 80 ? '...' : '')
    : ''
  const productCount = (diary.products || diary.product_ids || []).length
  const hasSkinAnalysis = !!diary.skin_analysis
  const tags = diary.tags || []
  const displayDate = diary.created_date
    ? (() => {
        const [y, m, d] = diary.created_date.split('-')
        return `${parseInt(m)}月${parseInt(d)}日`
      })()
    : ''

  return (
    <article className="dv-card" onClick={onClick}>
      {/* Cover photo */}
      {hasPhoto ? (
        <img className="dv-cover" src={photoUrl} alt="" loading="lazy" />
      ) : (
        <div className="dv-cover-placeholder">
          <Camera size={24} strokeWidth={1.2} />
          <span className="dv-cover-placeholder-text">添加今日照片</span>
        </div>
      )}

      <div className="dv-card-body">
        {/* Date + Mood */}
        <div className="dv-card-header">
          <span className="dv-card-date">{displayDate}</span>
          <span
            className="dv-mood-badge"
            style={{ background: mood.bg, color: mood.color }}
          >
            <i className="dv-mood-dot" style={{ background: mood.color }} />
            {mood.label}
          </span>
        </div>

        {/* Content preview */}
        {contentPreview && (
          <p className="dv-content-preview">{contentPreview}</p>
        )}

        {/* Meta row: products + mirror note */}
        <div className="dv-meta-row">
          {productCount > 0 && (
            <span className="dv-meta-item">
              <Package size={12} strokeWidth={1.5} />
              {productCount} 件产品
            </span>
          )}
          {hasSkinAnalysis && (
            <span className="dv-meta-item">
              <Sparkles size={12} strokeWidth={1.5} />
              已关联镜前状态
            </span>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="dv-tags-row">
            {tags.map((tag, i) => (
              <span key={i} className="dv-tag-chip">#{tag}</span>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
