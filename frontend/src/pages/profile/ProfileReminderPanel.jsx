import { Bell, Check, MessageSquare } from 'lucide-react'

import { formatReminderSettingsDescription } from './profileLogic'

function ReminderToggle({ checked, icon: Icon, title, desc, onChange }) {
  return (
    <label className="bm-reminder-toggle">
      <span className="bm-reminder-toggle-icon"><Icon size={17} strokeWidth={1.8} /></span>
      <span>
        <strong>{title}</strong>
        <small>{desc}</small>
      </span>
      <span className="bm-bg-toggle-control">
        <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
        <span aria-hidden="true" />
      </span>
    </label>
  )
}

function ReminderPreview({ reminders, reminderOn }) {
  if (!reminderOn) {
    return (
      <div className="bm-sms-empty">
        <MessageSquare size={18} strokeWidth={1.8} />
        <span>护理提醒已关闭，开启后这里会显示短信提醒。</span>
      </div>
    )
  }

  if (reminders.length === 0) {
    return (
      <div className="bm-sms-empty">
        <Check size={18} strokeWidth={1.8} />
        <span>当前没有临期或低余量产品。</span>
      </div>
    )
  }

  return (
    <div className="bm-sms-list" aria-label="短信形式的护肤提醒">
      {reminders.slice(0, 6).map(item => (
        <article className={`bm-sms-bubble ${item.level === 'urgent' ? 'urgent' : ''}`} key={item.id}>
          <span className="bm-sms-avatar"><Bell size={15} strokeWidth={1.8} /></span>
          <div>
            <strong>{item.title}</strong>
            <p>{item.message}</p>
          </div>
        </article>
      ))}
    </div>
  )
}

export function ProfileReminderPanel({
  reminderOn,
  reminderSettings,
  reminders,
  onReminderOnChange,
  onSettingsChange,
}) {
  return (
    <div className="bm-reminder-panel">
      <ReminderToggle
        checked={reminderOn}
        icon={Bell}
        title="开启提醒"
        desc={formatReminderSettingsDescription(reminderSettings)}
        onChange={onReminderOnChange}
      />

      <div className="bm-reminder-controls">
        <label>
          <span>临期天数</span>
          <input
            type="number"
            min="1"
            max="180"
            value={reminderSettings.expiringWithinDays}
            onChange={event => onSettingsChange({ expiringWithinDays: Number(event.target.value || 30) })}
          />
        </label>
        <label>
          <span>剩余提醒线</span>
          <input
            type="number"
            min="1"
            max="90"
            value={reminderSettings.lowRemainingPercent}
            onChange={event => onSettingsChange({ lowRemainingPercent: Number(event.target.value || 30) })}
          />
        </label>
      </div>

      <ReminderPreview reminders={reminders} reminderOn={reminderOn} />
    </div>
  )
}
