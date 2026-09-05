import { Clock3, Copy, ExternalLink, Package, Video } from 'lucide-react'

import { VIDEO_PLATFORMS } from './tutorialData'
import { formatTimelineMinute } from './tutorialLogic'

export function TutorialPrimaryVideoCard({ activeGuide, primaryVideo, onCopyVideoQuery }) {
  return (
    <section className="bm-tutorial-primary-card">
      <div className="bm-tutorial-primary-head">
        <span className="bm-soft-icon"><Video size={21} strokeWidth={1.6} /></span>
        <div>
          <p>{activeGuide.label} · {activeGuide.focus}</p>
          <h2>{activeGuide.title}</h2>
        </div>
        <span className="bm-time-chip"><Clock3 size={14} />{activeGuide.time}</span>
      </div>

      {primaryVideo && (
        <div className="bm-tutorial-main-video">
          <button
            type="button"
            className="bm-video-query-copy"
            onClick={() => onCopyVideoQuery(primaryVideo.query)}
          >
            <Video size={18} strokeWidth={1.7} />
            <span>
              <strong>{primaryVideo.title}</strong>
              <small>{primaryVideo.query}</small>
            </span>
            <Copy size={15} strokeWidth={1.8} />
          </button>
          <div className="bm-video-platform-links" aria-label="打开平台搜索">
            {VIDEO_PLATFORMS.map(platform => (
              <a
                key={platform.id}
                href={platform.buildUrl(primaryVideo.query)}
                target="_blank"
                rel="noreferrer"
                aria-label={`${platform.label} 搜索 ${primaryVideo.query}`}
              >
                {platform.label}
                <ExternalLink size={12} strokeWidth={1.8} />
              </a>
            ))}
          </div>
          <p>{primaryVideo.assist}</p>
        </div>
      )}
    </section>
  )
}

export function TutorialTimelineCard({ activeGuide, tutorialTimeline }) {
  return (
    <section className="bm-tutorial-timeline-card">
      <div className="bm-flow-section-head">
        <div className="bm-flow-section-title">时间节点</div>
        <span>{activeGuide.time}</span>
      </div>
      <ol className="bm-tutorial-timeline">
        {tutorialTimeline.map(step => (
          <li key={step.id}>
            <time>{formatTimelineMinute(step.minute)}</time>
            <div>
              <strong>{step.label}</strong>
              <span>{step.action}</span>
              <small>
                {step.products.length > 0
                  ? `产品库：${step.products.map(product => product.name).join(' / ')}`
                  : `产品库暂无${step.category}，先按教程同类产品替换`}
              </small>
            </div>
            <em>{step.category}</em>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function TutorialProductMatchesCard({ activeGuide, productRecommendations }) {
  return (
    <section className="bm-tutorial-products-card">
      <div className="bm-flow-section-head">
        <div className="bm-flow-section-title">产品替换</div>
        <span>{activeGuide.label}</span>
      </div>
      <div className="bm-tutorial-product-grid">
        {productRecommendations.map(item => (
          <article className="bm-tutorial-product-match" key={item.category}>
            <span className="bm-tutorial-product-category"><Package size={15} />{item.category}</span>
            {item.products.length > 0 ? (
              <div className="bm-tutorial-product-chips">
                {item.products.map(product => (
                  <span key={product.id || product.name}>
                    <strong>{product.name}</strong>
                    <small>{product.category || item.category}</small>
                  </span>
                ))}
              </div>
            ) : (
              <p>暂无同类产品</p>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
