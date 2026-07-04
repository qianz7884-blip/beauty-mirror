import { Trash2 } from 'lucide-react'
import { getPhotoUrl } from '../api'

export function SkinHistoryGallery({
  history,
  historySelectMode,
  selectedHistoryIds,
  canReturnToCurrent,
  onToggleSelectMode,
  onBatchDelete,
  onReturnToCurrent,
  onViewRecord,
  onDeleteRecord,
}) {
  return (
    <div className="skin-history-gallery">
      <div className="skin-history-gallery-head">
        <div>
          <strong>历史镜前记录</strong>
          <span>
            {historySelectMode
              ? `已选择 ${selectedHistoryIds.length} 条`
              : (history.length > 0 ? `${history.length} 条记录` : '暂无记录')}
          </span>
        </div>
        <div className="skin-history-gallery-actions">
          {history.length > 0 && (
            <button type="button" onClick={onToggleSelectMode}>
              {historySelectMode ? '取消' : '选择'}
            </button>
          )}
          {historySelectMode && (
            <button
              type="button"
              className="danger"
              disabled={selectedHistoryIds.length === 0}
              onClick={onBatchDelete}
            >
              删除所选
            </button>
          )}
          {!historySelectMode && canReturnToCurrent && (
            <button type="button" onClick={onReturnToCurrent}>
              回到当前报告
            </button>
          )}
        </div>
      </div>

      {history.length === 0 ? (
        <div className="skin-history-empty">暂无历史记录，完成分析后会自动保存。</div>
      ) : (
        <div className="skin-history-grid">
          {history.map(record => {
            const image = record.photo ? getPhotoUrl(record.photo, 'skin') : ''
            const selected = selectedHistoryIds.includes(record.id)
            return (
              <button
                key={record.id}
                className={selected ? 'skin-history-tile selected' : 'skin-history-tile'}
                type="button"
                onClick={() => onViewRecord(record)}
              >
                {image ? (
                  <img src={image} alt="" />
                ) : (
                  <span className="skin-history-tile-placeholder" aria-hidden="true" />
                )}
                {historySelectMode && (
                  <span className="skin-history-check" aria-hidden="true">
                    {selected ? '✓' : ''}
                  </span>
                )}
                <span className="skin-history-tile-meta">
                  <strong>{record.skin_type || '镜前记录'}</strong>
                  <small>{record.created_at}</small>
                </span>
                <span className="skin-history-tile-copy">
                  {record.today_status || record.summary || '点击查看详情'}
                </span>
                {!historySelectMode && (
                  <span
                    className="skin-history-tile-delete"
                    role="button"
                    tabIndex={0}
                    onClick={(event) => onDeleteRecord(record.id, event)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') onDeleteRecord(record.id, event)
                    }}
                    title="删除"
                  >
                    <Trash2 size={14} strokeWidth={1.8} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function SkinHistoryList({ history, onViewRecord, onDeleteRecord }) {
  return (
    <div className="skin-history-list">
      {history.length === 0 ? (
        <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
          暂无历史记录，完成分析后自动保存
        </p>
      ) : (
        history.map(record => (
          <div
            key={record.id}
            className="skin-history-item"
            onClick={() => onViewRecord(record)}
          >
            <div className="skin-history-thumb">
              {record.photo ? (
                <img src={getPhotoUrl(record.photo, 'skin')} alt="" />
              ) : (
                <span className="skin-history-placeholder" aria-hidden="true" />
              )}
            </div>
            <div className="skin-history-info">
              <div className="skin-history-type">{record.skin_type}</div>
              <div className="skin-history-meta">
                <span className="skin-history-time">{record.created_at}</span>
              </div>
              {record.today_status && (
                <div className="skin-history-summary">{record.today_status}</div>
              )}
              {!record.today_status && record.summary && (
                <div className="skin-history-summary">{record.summary}</div>
              )}
            </div>
            <button
              className="skin-history-delete"
              onClick={(event) => onDeleteRecord(record.id, event)}
              title="删除"
            >
              <Trash2 size={15} strokeWidth={1.7} />
            </button>
          </div>
        ))
      )}
    </div>
  )
}
