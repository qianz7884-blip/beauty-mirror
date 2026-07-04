import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchDiary, deleteDiary, getPhotoUrl } from '../api'
import SkinAnalysisPanel from '../components/SkinAnalysisPanel'
import {
  ChevronLeft,
  Pencil,
  Trash2,
  Sparkles,
} from 'lucide-react'
import { usePageBackground } from '../utils/backgroundSettings'
import { getMoodInfo } from '../utils/moods'

export default function DiaryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const pageBackground = usePageBackground('diary')
  const [diary, setDiary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [skinPanelProps, setSkinPanelProps] = useState(null)
  const pageStyle = pageBackground.style

  useEffect(() => {
    fetchDiary(id)
      .then(setDiary)
      .catch(() => navigate('/diary', { replace: true }))
      .finally(() => setLoading(false))
  }, [id])

  const handleDelete = async () => {
    if (!window.confirm('确定要删除这篇日记吗？')) return
    try {
      await deleteDiary(id)
      navigate('/diary', { replace: true })
    } catch {
      alert('删除失败')
    }
  }

  const handleEdit = () => {
    navigate('/diary', { state: { editDiaryId: Number(id) } })
  }

  if (loading) {
    return (
      <div className="dv-detail" style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="d-loading-spinner" />
      </div>
    )
  }

  if (!diary) return null

  const moodInfo = getMoodInfo(diary.mood_info?.key || diary.mood)
  const hasPhoto = !!(diary.photo)
  const photoUrl = hasPhoto ? getPhotoUrl(diary.photo, 'diary') : null
  const products = diary.products || []
  const tags = diary.tags || []
  const skinAnalysis = diary.skin_analysis

  const displayDate = diary.created_date
    ? (() => {
        const parts = diary.created_date.split('-')
        return `${parseInt(parts[1])}月${parseInt(parts[2])}日 · ${parts[0]}`
      })()
    : ''

  return (
    <div className="dv-detail" style={pageStyle}>
      {/* Top bar */}
      <div className="dv-detail-topbar">
        <button className="dv-detail-back" onClick={() => navigate('/diary')}>
          <ChevronLeft size={20} strokeWidth={1.8} />
          返回
        </button>
        <div className="dv-detail-actions">
          <button className="dv-detail-action-btn" onClick={handleEdit}>
            <Pencil size={17} strokeWidth={1.6} />
          </button>
          <button className="dv-detail-action-btn" onClick={handleDelete}>
            <Trash2 size={17} strokeWidth={1.6} color="#C97A7A" />
          </button>
        </div>
      </div>

      {/* Cover photo */}
      {hasPhoto ? (
        <img className="dv-detail-cover" src={photoUrl} alt="" />
      ) : (
        <div style={{
          width: '100%',
          height: 180,
          background: 'linear-gradient(135deg, #eef6fb, #e5f0f7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#a0b8c8',
          fontSize: 13,
        }}>
          暂无封面照片
        </div>
      )}

      {/* Content body */}
      <div className="dv-detail-body">
        {/* Mood badge */}
        <span
          className="dv-detail-mood"
          style={{ background: moodInfo.bg, color: moodInfo.color }}
        >
          <i className="dv-mood-dot" style={{ background: moodInfo.color }} />
          {moodInfo.label}
        </span>

        {/* Date */}
        <p className="dv-detail-date">{displayDate}</p>

        {/* Title */}
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1f2933', margin: '0 0 12px' }}>
          {diary.title}
        </h2>

        {/* Content */}
        {diary.content && (
          <p className="dv-detail-content">{diary.content}</p>
        )}

        {/* Products section */}
        {products.length > 0 && (
          <div className="dv-detail-section">
            <h4 className="dv-detail-section-title">今日使用产品</h4>
            <div className="dv-detail-products">
              {products.map(p => (
                <button
                  key={p.id}
                  className="dv-detail-product-chip"
                  onClick={() => navigate('/products')}
                >
                  <div
                    className="dv-detail-product-thumb"
                    style={{
                      backgroundImage: p.photo
                        ? `url(${getPhotoUrl(p.photo, 'products')})`
                        : 'linear-gradient(135deg, #e6eef4, #dde8f0)',
                    }}
                  />
                  <span className="dv-detail-product-name">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Skin analysis section */}
        {skinAnalysis && (
          <div className="dv-detail-section">
            <h4 className="dv-detail-section-title">今日镜前状态</h4>
            <div className="dv-detail-analysis-card">
              <span className="dv-detail-analysis-score"><Sparkles size={22} strokeWidth={1.5} /></span>
              <div className="dv-detail-analysis-meta">
                <p className="dv-detail-analysis-type">{skinAnalysis.skin_type || '未知'}</p>
                <p className="dv-detail-analysis-date">{skinAnalysis.created_at?.slice(0, 10)}</p>
              </div>
            </div>
            <div className="dv-detail-analysis-btns">
              <button
                className="dv-detail-analysis-btn"
                onClick={() => setSkinPanelProps({ viewHistoryId: skinAnalysis.id })}
              >
                查看镜前建议
              </button>
            </div>
          </div>
        )}

        {/* Tags section */}
        {tags.length > 0 && (
          <div className="dv-detail-section">
            <h4 className="dv-detail-section-title">标签</h4>
            <div className="dv-tags-row">
              {tags.map((tag, i) => (
                <span key={i} className="dv-tag-chip">#{tag}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Skin analysis panel modal */}
      {skinPanelProps && (
        <SkinAnalysisPanel
          viewHistoryId={skinPanelProps.viewHistoryId}
          forceHistoryMode={true}
          onClose={() => setSkinPanelProps(null)}
        />
      )}
    </div>
  )
}
