import { Copy, Database, Download, RefreshCw } from 'lucide-react'

import { formatLocalUserId } from './profileLogic'

export function ProfileUserDataPanel({
  session,
  userId,
  message,
  onCopy,
  onExport,
  onReset,
  onRefresh,
}) {
  const counts = session?.counts || {}
  const database = session?.database || {}

  return (
    <div className="bm-user-panel">
      <div className="bm-user-panel-head">
        <span className="bm-reminder-toggle-icon"><Database size={17} strokeWidth={1.8} /></span>
        <div>
          <strong>本地数据</strong>
          <small>{session?.last_activity_at ? `最近记录 ${session.last_activity_at}` : '当前浏览器身份'}</small>
        </div>
        <button type="button" onClick={onRefresh} aria-label="刷新本地数据">
          <RefreshCw size={16} strokeWidth={1.8} />
        </button>
      </div>

      <div className="bm-user-id-line">
        <span>当前身份</span>
        <code>{formatLocalUserId(userId)}</code>
      </div>

      <div className="bm-user-stat-grid">
        <span>
          <strong>{counts.products ?? 0}</strong>
          <small>产品</small>
        </span>
        <span>
          <strong>{counts.diaries ?? 0}</strong>
          <small>日记</small>
        </span>
        <span>
          <strong>{counts.skin_analyses ?? 0}</strong>
          <small>肤况</small>
        </span>
      </div>

      <div className={`bm-user-db ${database.writable === false ? 'warning' : 'ok'}`}>
        <Database size={16} strokeWidth={1.7} />
        <span>{database.message || '数据库状态读取中'}</span>
      </div>

      <div className="bm-user-actions">
        <button type="button" onClick={onExport}>
          <Download size={15} strokeWidth={1.8} />
          <span>备份</span>
        </button>
        <button type="button" onClick={onCopy}>
          <Copy size={15} strokeWidth={1.8} />
          <span>复制ID</span>
        </button>
        <button type="button" className="danger" onClick={onReset}>
          <RefreshCw size={15} strokeWidth={1.8} />
          <span>换新身份</span>
        </button>
      </div>

      {message ? <p className="bm-user-message">{message}</p> : null}
    </div>
  )
}
