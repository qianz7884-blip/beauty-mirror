export function TutorialMirrorOverlay({ mirrorGuideOverlay }) {
  return (
    <span
      className={`bm-mirror-guide-lines${mirrorGuideOverlay.measured ? ' is-measured' : ''}${mirrorGuideOverlay.approx ? ' is-approx' : ''}`}
      style={mirrorGuideOverlay.style}
      aria-hidden="true"
    >
      {mirrorGuideOverlay.boundaries.map(boundary => (
        <i
          className="bm-mirror-guide-boundary"
          key={boundary.id}
          style={{ top: `${boundary.top}%` }}
          title={boundary.label}
        >
          <span>{boundary.label}</span>
        </i>
      ))}
      {mirrorGuideOverlay.fiveEye.boundaries.map(boundary => (
        <i
          className="bm-mirror-eye-boundary"
          key={boundary.id}
          style={{ left: `${boundary.left}%` }}
          title={boundary.label}
        />
      ))}
      {mirrorGuideOverlay.fiveEye.segments.map(segment => (
        <i
          className="bm-mirror-eye-segment"
          key={segment.id}
          style={{ left: `${segment.left}%` }}
        >
          {segment.label}
        </i>
      ))}
      {mirrorGuideOverlay.segments.map(segment => (
        <b key={segment.id} style={{ top: `${segment.top}%` }} title={segment.status}>
          <span>{segment.label}</span>
          <em>{segment.percent}</em>
        </b>
      ))}
      <small className="bm-mirror-guide-source">{mirrorGuideOverlay.note}</small>
    </span>
  )
}

export function TutorialRatioMetrics({ ratioMetricCards }) {
  return (
    <div className="bm-ratio-metric-strip" aria-label="面部比例参考数据">
      {ratioMetricCards.map((item, index) => (
        <div className="bm-ratio-metric" key={item.id}>
          <span>{item.icon || (index === 0 ? '↻' : index === 1 ? '◉' : '⌄')}</span>
          <div>
            <strong>{item.label}</strong>
            <em>{item.value}</em>
            <small>{item.helper}</small>
          </div>
        </div>
      ))}
    </div>
  )
}

export function TutorialRatioResultInfo({
  displayedRatioTags,
  faceRatio,
  faceRatioError,
  needsHairlineRetake,
  ratioReferenceRows,
  ratioRetakeMessages,
  ratioTips,
  threePartSegments,
  onRetake,
}) {
  return (
    <div className="bm-face-ratio-info bm-mirror-result-info">
      {faceRatio?.ok ? (
        <>
          {ratioRetakeMessages.length > 0 && (
            <div className="bm-face-ratio-quality-alert">
              <strong>{needsHairlineRetake ? '发际线未识别，建议重拍' : '建议重拍正脸照'}</strong>
              {ratioRetakeMessages.map(flag => (
                <span key={flag}>{flag}</span>
              ))}
              {needsHairlineRetake && (
                <button type="button" onClick={onRetake}>
                  重新拍照
                </button>
              )}
            </div>
          )}
          <p className="bm-face-ratio-summary">{faceRatio.summary}</p>
          {displayedRatioTags.length > 0 && (
            <div className="bm-face-ratio-tags">
              {displayedRatioTags.map(tag => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          )}
          {ratioReferenceRows.length > 0 && (
            <div className="bm-face-ratio-reference bm-ratio-reference-compact" aria-label="三庭五眼参考数据">
              <div className="bm-face-ratio-reference-head">
                <strong>参考依据</strong>
                <span>本次值 / 常见范围</span>
              </div>
              {threePartSegments.length > 0 && (
                <div className="bm-three-part-meter" aria-label="三庭占比">
                  {threePartSegments.map(segment => (
                    <span key={segment.id} style={{ flexBasis: segment.width }} title={segment.status}>
                      <b>{segment.label}</b>
                      <em>{segment.percent}</em>
                      <small>{segment.normalized}</small>
                    </span>
                  ))}
                </div>
              )}
              <div className="bm-ratio-reference-pills">
                {ratioReferenceRows.filter(row => !row.id.startsWith('three-')).map(row => (
                  <span key={row.id} title={row.status}>
                    <b>{row.label}</b>
                    <em>{row.value}</em>
                    <small>参考 {row.reference}</small>
                  </span>
                ))}
              </div>
            </div>
          )}
          {ratioTips.length > 0 && (
            <ul className="bm-face-ratio-tips">
              {ratioTips.map(tip => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="bm-face-ratio-note">比例增强需要清晰发际线；不拍照也不影响上面的基础教程推荐。</p>
          {faceRatioError && <p className="bm-face-ratio-error">{faceRatioError}</p>}
        </>
      )}
    </div>
  )
}
