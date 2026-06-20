import { useState, useEffect, useRef } from 'react'
import { analyzeSkin, fetchSkinAnalyses, fetchSkinAnalysis, deleteSkinAnalysis, getPhotoUrl } from '../api'

const SCORE_LABELS = {
  hydration: '水润度',
  smoothness: '光滑度',
  brightness: '光泽度',
  pores: '毛孔',
  evenness: '均匀度',
}

const REGION_LABELS = {
  '前额': '前额',
  '左脸颊': '左脸颊',
  '右脸颊': '右脸颊',
  '鼻子': '鼻子',
  '下巴': '下巴',
  '左眼周': '左眼周',
  '右眼周': '右眼周',
  '唇周': '唇周',
}

const REGION_ICONS = {
  '前额': '🔲',
  '左脸颊': '😊',
  '右脸颊': '😊',
  '鼻子': '👃',
  '下巴': '👇',
  '左眼周': '👁',
  '右眼周': '👁',
  '唇周': '👄',
}

function scoreLevel(v) {
  if (v >= 80) return 'high'
  if (v >= 60) return 'mid'
  return 'low'
}

/**
 * 前端压缩照片 — canvas resize，大幅减少上传时间
 * 将长边缩放到 maxSize，输出 JPEG quality≈0.75
 * 移动端 5MB 照片 → ~80-150KB
 */
function compressPhoto(file, maxSize = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height } = img
      if (Math.max(width, height) <= maxSize) {
        // 原图已经够小，直接返回
        resolve(file)
        return
      }
      const ratio = maxSize / Math.max(width, height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressed = new File([blob], file.name || 'photo.jpg', { type: 'image/jpeg' })
            resolve(compressed)
          } else {
            resolve(file) // 降级：返回原图
          }
        },
        'image/jpeg',
        0.75,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file) // 降级：返回原图
    }
    img.src = url
  })
}

export default function SkinAnalysisPanel({ photoFile, previewUrl, onClose, viewHistoryId, forceHistoryMode, autoOpenCamera }) {
  const [step, setStep] = useState(viewHistoryId || forceHistoryMode ? 'loading' : (photoFile ? 'preview' : 'history'))
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [currentPhotoFile, setCurrentPhotoFile] = useState(photoFile)
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState(previewUrl)
  const [loadingText, setLoadingText] = useState('正在处理照片...')
  const [viewerImage, setViewerImage] = useState(null)  // 点击放大的图片 src
  const cameraRef = useRef(null)
  const [cameraKey, setCameraKey] = useState(0)  // 用于强制重建 input

  // 自动打开相机
  useEffect(() => {
    if (autoOpenCamera) {
      // 延迟一下确保 modal 已 render
      const timer = setTimeout(() => {
        cameraRef.current?.click()
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [autoOpenCamera])

  // 如果传入了 viewHistoryId，自动加载该历史记录
  useEffect(() => {
    if (viewHistoryId) {
      setLoadingHistory(true)
      setStep('loading')
      fetchSkinAnalysis(viewHistoryId)
        .then(data => {
          setSelectedHistory(data)
          setStep('result')
        })
        .catch(() => {
          setErrorMsg('加载历史记录失败')
          setStep('result')
        })
        .finally(() => setLoadingHistory(false))
    }
  }, [viewHistoryId])

  // forceHistoryMode：直接显示历史列表
  useEffect(() => {
    if (forceHistoryMode && !viewHistoryId) {
      loadHistoryAndShow()
    }
  }, [forceHistoryMode])

  const loadHistoryAndShow = async () => {
    setStep('loading')
    setLoadingHistory(true)
    try {
      const data = await fetchSkinAnalyses()
      setHistory(data)
      if (data.length > 0) {
        setSelectedHistory(data[0])
      }
    } catch (e) {
      // ignore
    }
    setLoadingHistory(false)
    setShowHistory(true)
    setStep('result')
  }

  // 加载历史记录
  const loadHistory = async () => {
    try {
      const data = await fetchSkinAnalyses()
      setHistory(data)
    } catch (e) {
      // ignore
    }
  }

  useEffect(() => {
    if (step === 'result' && result?.success) {
      loadHistory()
    }
  }, [step, result])

  // 拍照（从内部相机）
  const handleInternalPhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    // 释放旧 URL
    if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl)
    setCurrentPhotoFile(file)
    setCurrentPreviewUrl(URL.createObjectURL(file))
    setStep('preview')
    setResult(null)
    setErrorMsg('')
    e.target.value = ''
    // 强制重建 input（避免移动端第二次点击同一 input 不触发相机）
    setCameraKey(k => k + 1)
  }

  const handleAnalyze = async () => {
    if (!currentPhotoFile) {
      setErrorMsg('请先拍照选择照片')
      return
    }
    setStep('loading')
    setErrorMsg('')

    try {
      // 阶段1：压缩照片（减少上传时间）
      setLoadingText('正在压缩照片...')
      const compressed = await compressPhoto(currentPhotoFile, 1024)
      console.log(
        `[SkinAnalysis] 照片压缩: ${(currentPhotoFile.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB`
      )

      // 阶段2：上传并分析
      setLoadingText('正在上传并分析肤质...')
      const formData = new FormData()
      formData.append('photo', compressed)
      const data = await analyzeSkin(formData)

      if (data.success) {
        setResult(data)
      } else {
        setErrorMsg(data.message || '分析失败，请重试')
      }
    } catch (e) {
      if (e.code === 'ECONNABORTED') {
        setErrorMsg('分析超时，请检查网络后重试')
      } else if (e.response) {
        const msg = e.response.data?.message || e.response.data?.error
        setErrorMsg(msg || `服务器错误 (${e.response.status})，请稍后重试`)
      } else if (e.request) {
        setErrorMsg('无法连接服务器，请检查后端是否启动')
      } else {
        setErrorMsg('分析失败，请重试')
      }
    }
    setStep('result')
  }

  const handleRetry = () => {
    setStep('preview')
    setResult(null)
    setErrorMsg('')
    setShowHistory(false)
    setSelectedHistory(null)
  }

  const handleDeleteHistory = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm('确定删除这条分析记录吗？')) return
    try {
      await deleteSkinAnalysis(id)
      setHistory(prev => prev.filter(h => h.id !== id))
      if (selectedHistory?.id === id) setSelectedHistory(null)
    } catch (e) {
      // ignore
    }
  }

  const handleViewHistory = (record) => {
    setSelectedHistory(record)
    setShowHistory(false)
  }

  // 用于展示的分析数据（当前结果 或 选中的历史记录）
  const displayData = selectedHistory || result

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {step === 'preview' && '确认照片'}
            {step === 'loading' && (loadingHistory ? '加载中...' : '正在分析肤质...')}
            {step === 'history' && '肤质分析'}
            {step === 'result' && (selectedHistory ? '📋 历史分析报告' : (result?.success ? '肤质分析报告' : '分析结果'))}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* 步骤1：预览照片 */}
        {step === 'preview' && (
          <div style={{ textAlign: 'center' }}>
            {currentPreviewUrl ? (
              <img
                src={currentPreviewUrl}
                alt="面部照片"
                style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 12, marginBottom: 20 }}
              />
            ) : (
              <div style={{
                width: '100%', height: 200, borderRadius: 12, marginBottom: 20,
                background: 'linear-gradient(135deg, #f0f4ed, #e3ece0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', color: '#999',
              }}>
                <span style={{ fontSize: 40 }}>📷</span>
                <span style={{ fontSize: 13, marginTop: 8 }}>请先拍照</span>
              </div>
            )}
            <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
              📷 请拍摄清晰的面部正面照，确保光线充足
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => cameraRef.current?.click()}>
                📸 重新拍照
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAnalyze}>
                🔬 开始分析
              </button>
            </div>
            <button
              className="btn btn-outline btn-block"
              style={{ marginTop: 8 }}
              onClick={loadHistoryAndShow}
            >
              📋 查看历史报告
            </button>
          </div>
        )}

        {/* 步骤1b：历史入口（直接进入时） */}
        {step === 'history' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <span style={{ fontSize: 48 }}>🔬</span>
            <p style={{ fontSize: 14, color: '#666', margin: '12px 0' }}>选择操作</p>
            <button className="btn btn-primary btn-block" onClick={() => cameraRef.current?.click()}>
              📸 拍照分析
            </button>
            <button
              className="btn btn-outline btn-block"
              style={{ marginTop: 8 }}
              onClick={loadHistoryAndShow}
            >
              📋 查看历史报告
            </button>
          </div>
        )}

        {/* 隐藏相机 input（key 用于强制重建，确保移动端每次都能触发相机） */}
        <input
          key={cameraKey}
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleInternalPhoto}
        />

        {/* 步骤2：加载中 */}
        {step === 'loading' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div className="recognize-spinner" />
            <p style={{ marginTop: 20, color: '#888', fontSize: 14 }}>
              {loadingHistory ? '正在加载历史记录...' : loadingText}
            </p>
            <p style={{ color: '#bbb', fontSize: 12, marginTop: 4 }}>
              {loadingHistory ? '' : '首次分析约需 8-15 秒，请耐心等待'}
            </p>
          </div>
        )}

        {/* 步骤3：结果报告 */}
        {step === 'result' && (
          <div className="skin-result">
            {/* 错误提示 */}
            {errorMsg && (
              <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, border: '1px solid #fecaca' }}>
                {errorMsg}
              </div>
            )}

            {/* 选中历史记录时的返回按钮（仅在非历史查看模式下显示） */}
            {selectedHistory && !viewHistoryId && !forceHistoryMode && (
              <button
                className="btn btn-outline btn-sm"
                style={{ marginBottom: 12, fontSize: 12 }}
                onClick={() => setSelectedHistory(null)}
              >
                ← 回到当前报告
              </button>
            )}

            {displayData && displayData.skin_type && (
              <>
                {/* 分析时间 */}
                {(displayData.created_at || result?.created_at) && (
                  <div style={{
                    textAlign: 'center',
                    fontSize: 12,
                    color: '#aaa',
                    marginBottom: 12,
                  }}>
                    🕐 分析时间：{displayData.created_at || result?.created_at}
                  </div>
                )}

                {/* 照片缩略图 + 皮肤类型 */}
                <div className="skin-summary-row">
                  {selectedHistory && selectedHistory.photo ? (
                    <img
                      src={getPhotoUrl(selectedHistory.photo, 'skin')}
                      alt="面部（点击放大）"
                      className="clickable-thumb"
                      style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
                      onClick={() => setViewerImage(getPhotoUrl(selectedHistory.photo, 'skin'))}
                    />
                  ) : currentPreviewUrl ? (
                    <img
                      src={currentPreviewUrl}
                      alt="面部（点击放大）"
                      className="clickable-thumb"
                      style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
                      onClick={() => setViewerImage(currentPreviewUrl)}
                    />
                  ) : null}
                  <div>
                    <span className="skin-type-badge">{displayData.skin_type}</span>
                    {(displayData.face_data && displayData.face_data.landmark_count) ? (
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
                        已检测 {displayData.face_data.landmark_count} 个面部特征点
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* 热点图 */}
                {(displayData.heatmap_image || result?.heatmap_base64) && (
                  <div className="skin-heatmap-container">
                    <div className="section-label">🗺 面部分区热点图（点击放大）</div>
                    <img
                      src={displayData.heatmap_image || result?.heatmap_base64}
                      alt="面部分区热点图"
                      className="skin-heatmap-img clickable-thumb"
                      onClick={() => setViewerImage(displayData.heatmap_image || result?.heatmap_base64)}
                    />
                    <div className="heatmap-legend">
                      <span className="heatmap-legend-item"><span className="heatmap-dot heatmap-low" /> 需改善</span>
                      <span className="heatmap-legend-item"><span className="heatmap-dot heatmap-mid" /> 一般</span>
                      <span className="heatmap-legend-item"><span className="heatmap-dot heatmap-high" /> 良好</span>
                    </div>
                  </div>
                )}

                {/* 综合评分 */}
                <div className="skin-overall-score">
                  <div className="score-number">{displayData.overall_score}</div>
                  <div className="score-label">综合肤质评分</div>
                </div>

                {/* 各项指标（全脸） */}
                <div className="section-label" style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>📊 全脸综合指标</div>
                <div className="skin-scores">
                  {Object.entries(displayData.scores || {}).map(([key, val]) => (
                    <div key={key} className="skin-score-item">
                      <div className="skin-score-header">
                        <span className="score-name">{SCORE_LABELS[key] || key}</span>
                        <span className="score-value">{val}分</span>
                      </div>
                      <div className="skin-score-bar">
                        <div
                          className={`skin-score-fill ${scoreLevel(val)}`}
                          style={{ width: `${val}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* 分区评分 */}
                {(displayData.region_scores || result?.region_scores) && Object.keys(displayData.region_scores || result?.region_scores || {}).length > 0 && (
                  <div className="skin-region-scores">
                    <div className="section-label" style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>📍 分区详细评分</div>
                    {Object.entries(displayData.region_scores || result?.region_scores || {}).map(([region, scores]) => (
                      <div key={region} className="region-card">
                        <div className="region-card-header">
                          <span className="region-icon">{REGION_ICONS[region] || '📍'}</span>
                          <span className="region-name">{REGION_LABELS[region] || region}</span>
                          <span className={`region-overall ${scoreLevel(scores.overall)}`}>{scores.overall}分</span>
                        </div>
                        <div className="region-bars">
                          {Object.entries(scores).filter(([k]) => k !== 'overall').map(([key, val]) => (
                            <div key={key} className="region-bar-item">
                              <span className="region-bar-label">{SCORE_LABELS[key] || key}</span>
                              <div className="skin-score-bar region-bar">
                                <div
                                  className={`skin-score-fill ${scoreLevel(val)}`}
                                  style={{ width: `${val}%` }}
                                />
                              </div>
                              <span className="region-bar-val">{val}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 主要问题 */}
                {(displayData.concerns || []).length > 0 && (
                  <div className="skin-concerns">
                    {(displayData.concerns || []).map((c, i) => (
                      <span key={i} className="skin-concern-tag">{c}</span>
                    ))}
                  </div>
                )}

                {/* AI 评估 */}
                {displayData.summary && (
                  <div className="skin-summary">{displayData.summary}</div>
                )}

                {/* 护理建议 */}
                {(displayData.recommendations || []).length > 0 && (
                  <div className="skin-recommendations">
                    <div className="section-label">💡 护理建议</div>
                    {(displayData.recommendations || []).map((rec, i) => (
                      <div key={i} className="skin-rec-item">
                        <span className="rec-num">{i + 1}</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* 无数据时（纯历史浏览模式） */}
            {!displayData?.skin_type && !errorMsg && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa' }}>
                暂无分析记录，请先拍照分析
              </div>
            )}

            {/* 操作按钮 */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {!viewHistoryId && !forceHistoryMode && (
                <button
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                  onClick={handleRetry}
                >
                  🔄 重新分析
                </button>
              )}
              <button
                className="btn btn-primary"
                style={{ flex: viewHistoryId || forceHistoryMode ? 2 : 1 }}
                onClick={onClose}
              >
                ✓ {viewHistoryId || forceHistoryMode ? '关闭' : '完成'}
              </button>
            </div>

            {/* 历史记录列表 */}
            {!selectedHistory && !viewHistoryId && (
              <div className="skin-history-section">
                <button
                  className="skin-history-toggle"
                  onClick={() => { setShowHistory(!showHistory); loadHistory() }}
                >
                  📋 历史分析报告
                  <span style={{ fontSize: 12, color: '#aaa', marginLeft: 8 }}>
                    {history.length > 0 ? `${history.length} 条记录` : ''}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, transition: 'transform 0.2s', transform: showHistory ? 'rotate(90deg)' : '' }}>▶</span>
                </button>

                {showHistory && (
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
                          onClick={() => handleViewHistory(record)}
                        >
                          <div className="skin-history-thumb">
                            {record.photo ? (
                              <img src={getPhotoUrl(record.photo, 'skin')} alt="" />
                            ) : (
                              <div className="skin-history-placeholder">🔬</div>
                            )}
                          </div>
                          <div className="skin-history-info">
                            <div className="skin-history-type">{record.skin_type}</div>
                            <div className="skin-history-meta">
                              <span className="skin-history-score">综合 {record.overall_score} 分</span>
                              <span className="skin-history-time">{record.created_at}</span>
                            </div>
                            {record.summary && (
                              <div className="skin-history-summary">{record.summary}</div>
                            )}
                          </div>
                          <button
                            className="skin-history-delete"
                            onClick={(e) => handleDeleteHistory(record.id, e)}
                            title="删除"
                          >
                            🗑
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 图片查看器（点击放大） */}
      {viewerImage && (
        <div className="image-viewer-overlay" onClick={() => setViewerImage(null)}>
          <button className="image-viewer-close" onClick={() => setViewerImage(null)}>
            ✕
          </button>
          <img
            src={viewerImage}
            alt="放大查看"
            className="image-viewer-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
