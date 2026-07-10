import { useState, useEffect, useRef } from 'react'
import { analyzeSkin, fetchSkinAnalyses, fetchSkinAnalysis, deleteSkinAnalysis, getPhotoUrl, createDiary } from '../api'
import { MOOD_OPTIONS } from '../utils/moods'
import {
  CalendarDays,
  Camera,
  ClipboardList,
  Clock3,
  ChevronRight,
  History,
  Moon,
  RotateCcw,
  ScanFace,
  Sun,
} from 'lucide-react'
import { SkinHistoryGallery, SkinHistoryList } from './SkinHistoryViews'
import { buildMirrorAdviceCards, buildStatusSummary, compressPhoto } from '../utils/skinAnalysisView'

export default function SkinAnalysisPanel({ photoFile, previewUrl, onClose, viewHistoryId, forceHistoryMode, autoOpenCamera, onAnalysisComplete }) {
  const [step, setStep] = useState(viewHistoryId || forceHistoryMode ? 'loading' : (photoFile ? 'preview' : 'history'))
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState(null)
  const [historyView, setHistoryView] = useState(false)
  const [historySelectMode, setHistorySelectMode] = useState(false)
  const [selectedHistoryIds, setSelectedHistoryIds] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [currentPhotoFile, setCurrentPhotoFile] = useState(photoFile)
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState(previewUrl)
  const [loadingText, setLoadingText] = useState('正在处理照片...')
  const [viewerImage, setViewerImage] = useState(null)
  const [adviceChoice, setAdviceChoice] = useState('')
  const [feedbackMood, setFeedbackMood] = useState('')
  const [feedbackSatisfaction, setFeedbackSatisfaction] = useState('')
  const [feedbackSaving, setFeedbackSaving] = useState(false)
  const cameraRef = useRef(null)
  const [cameraKey, setCameraKey] = useState(0)

  // 自动打开相机
  useEffect(() => {
    if (autoOpenCamera) {
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
      setSelectedHistory(null)
      setHistoryView(true)
    } catch (e) {
      // ignore
    }
    setLoadingHistory(false)
    setShowHistory(true)
    setStep('result')
  }

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

  const handleInternalPhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl)
    setCurrentPhotoFile(file)
    setCurrentPreviewUrl(URL.createObjectURL(file))
    setStep('preview')
    setResult(null)
    setErrorMsg('')
    e.target.value = ''
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
      setLoadingText('正在压缩照片...')
      const compressed = await compressPhoto(currentPhotoFile, 1024)
      console.log(
        `[SkinAnalysis] 照片压缩: ${(currentPhotoFile.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB`
      )

      setLoadingText('正在上传并分析肤质...')
      const formData = new FormData()
      formData.append('photo', compressed)
      const data = await analyzeSkin(formData)

      if (data.success) {
        setResult(data)
        onAnalysisComplete?.(data)
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
    setHistoryView(false)
    setHistorySelectMode(false)
    setSelectedHistoryIds([])
    setFeedbackMood('')
    setFeedbackSatisfaction('')
  }

  const handleDeleteHistory = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm('确定删除这条分析记录吗？')) return
    try {
      await deleteSkinAnalysis(id)
      setHistory(prev => prev.filter(h => h.id !== id))
      setSelectedHistoryIds(prev => prev.filter(item => item !== id))
      if (selectedHistory?.id === id) setSelectedHistory(null)
    } catch (e) {
      // ignore
    }
  }

  const toggleHistorySelection = (id) => {
    setSelectedHistoryIds(prev => (
      prev.includes(id) ? prev.filter(item => item !== id) : prev.concat(id)
    ))
  }

  const handleBatchDeleteHistory = async () => {
    if (selectedHistoryIds.length === 0) return
    if (!window.confirm(`确定删除选中的 ${selectedHistoryIds.length} 条记录吗？`)) return
    const ids = selectedHistoryIds
    try {
      await Promise.all(ids.map(id => deleteSkinAnalysis(id)))
      setHistory(prev => prev.filter(record => !ids.includes(record.id)))
      if (selectedHistory && ids.includes(selectedHistory.id)) setSelectedHistory(null)
      setSelectedHistoryIds([])
      setHistorySelectMode(false)
    } catch (e) {
      // ignore
    }
  }

  const handleViewHistory = (record) => {
    if (historySelectMode) {
      toggleHistorySelection(record.id)
      return
    }
    setSelectedHistory(record)
    setHistoryView(false)
    setShowHistory(false)
  }

  const handleBackToHistory = () => {
    setSelectedHistory(null)
    setHistoryView(true)
    setShowHistory(true)
    setHistorySelectMode(false)
    setSelectedHistoryIds([])
  }

  const displayData = selectedHistory || result
  const mirrorAdvice = buildMirrorAdviceCards(displayData)
  const statusSummary = buildStatusSummary(displayData)
  const faceReferenceImage = displayData?.heatmap_image || result?.heatmap_base64
  const routineData = displayData?.today_routine || result?.today_routine
  const hasLongTermCare = Boolean(
    displayData?.summary
    || (displayData?.recommendations || []).length
    || (displayData?.observations || []).length
    || (displayData?.concerns || []).length
    || routineData
    || ((displayData?.trend || result?.trend)?.has_history)
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet skin-analysis-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {step === 'preview' && '确认照片'}
            {step === 'loading' && (loadingHistory ? '加载中...' : '正在生成镜前建议...')}
            {step === 'history' && '镜前建议'}
            {step === 'result' && (selectedHistory || historyView ? '历史镜前记录' : (result?.success ? '镜前建议' : '分析结果'))}
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
              <div className="skin-photo-placeholder">
                <Camera size={34} strokeWidth={1.35} />
                <span style={{ fontSize: 13, marginTop: 8 }}>请先拍照</span>
              </div>
            )}
            <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
              请拍摄清晰的面部正面照，确保光线充足
            </p>
            <div className="privacy-hint">
              面部图像默认本地处理，建议仅用于当前妆容辅助。
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => cameraRef.current?.click()}>
                <RotateCcw size={16} strokeWidth={1.7} />
                重新拍照
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAnalyze}>
                生成建议
              </button>
            </div>
            <button
              className="btn btn-outline btn-block"
              style={{ marginTop: 8 }}
              onClick={loadHistoryAndShow}
            >
              <ClipboardList size={16} strokeWidth={1.7} />
              查看历史记录
            </button>
          </div>
        )}

        {/* 步骤1b：历史入口 */}
        {step === 'history' && (
          <div className="skin-entry-panel">
            <p className="skin-entry-copy">选择镜前辅助方式，拍照生成当前建议，或回看之前的镜前状态。</p>
            <div className="skin-entry-actions">
              <button className="skin-entry-action primary" type="button" onClick={() => cameraRef.current?.click()}>
                <span className="skin-entry-action-icon">
                  <ScanFace size={22} strokeWidth={1.7} />
                </span>
                <span>
                  <strong>拍照生成建议</strong>
                  <small>根据当前状态给出镜前提醒</small>
                </span>
              </button>
              <button className="skin-entry-action" type="button" onClick={loadHistoryAndShow}>
                <span className="skin-entry-action-icon">
                  <History size={22} strokeWidth={1.7} />
                </span>
                <span>
                  <strong>查看历史记录</strong>
                  <small>回看之前的镜前状态</small>
                </span>
              </button>
            </div>
          </div>
        )}

        {/* 隐藏相机 input */}
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
              {loadingHistory ? '' : '仅用于当前妆容辅助，稍等片刻就好'}
            </p>
          </div>
        )}

        {/* 步骤3：结果报告 — 陪伴助手风格 */}
        {step === 'result' && (
          <div className="skin-result">
            {errorMsg && (
              <div className="soft-error">
                {errorMsg}
              </div>
            )}

            {selectedHistory && !viewHistoryId && (
              <button
                className="btn btn-outline btn-sm"
                style={{ marginBottom: 12, fontSize: 12 }}
                onClick={handleBackToHistory}
              >
                ← 返回历史记录
              </button>
            )}

            {historyView && !selectedHistory && !viewHistoryId && (
              <SkinHistoryGallery
                history={history}
                historySelectMode={historySelectMode}
                selectedHistoryIds={selectedHistoryIds}
                canReturnToCurrent={!forceHistoryMode && Boolean(result?.skin_type)}
                onToggleSelectMode={() => {
                  setHistorySelectMode(prev => !prev)
                  setSelectedHistoryIds([])
                }}
                onBatchDelete={handleBatchDeleteHistory}
                onReturnToCurrent={() => {
                  setHistoryView(false)
                  setShowHistory(false)
                }}
                onViewRecord={handleViewHistory}
                onDeleteRecord={handleDeleteHistory}
              />
            )}

            {!historyView && displayData && displayData.skin_type && (
              <>
                {/* 分析时间 */}
                {(displayData.created_at || result?.created_at) && (
                  <div style={{
                    textAlign: 'center', fontSize: 12, color: '#aaa', marginBottom: 16,
                  }}>
                    <Clock3 size={13} strokeWidth={1.6} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                    {displayData.created_at || result?.created_at}
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
                        已完成面部分区定位
                      </div>
                    ) : null}
                  </div>
                </div>

                <p className="mirror-result-subtitle">只给 1-3 条当前可执行建议。</p>

                <div className="companion-status-card">
                  <div className="companion-status-icon">
                    <ScanFace size={20} strokeWidth={1.5} />
                  </div>
                  <p className="companion-status-text">{statusSummary}</p>
                </div>

                {mirrorAdvice.length > 0 && (
                  <div className="companion-section">
                    <div className="companion-section-title">可轻微优化</div>
                    <div className="mirror-advice-list">
                      {mirrorAdvice.map((advice, i) => (
                        <div key={i} className="mirror-advice-card">
                          <p><span>位置</span>{advice.area}</p>
                          <p><span>产品</span>{advice.product}</p>
                          <p><span>动作</span>{advice.action}</p>
                          <p><span>原因</span>{advice.reason}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mirror-advice-actions">
                      {['采纳', '忽略', '我喜欢现在这样'].map(label => (
                        <button
                          key={label}
                          className={adviceChoice === label ? 'active' : ''}
                          onClick={() => setAdviceChoice(label)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {faceReferenceImage && (
                  <details className="mirror-detail-panel">
                    <summary>
                      查看面部分区参考
                      <ChevronRight size={16} strokeWidth={1.7} />
                    </summary>
                    <div className="skin-heatmap-container">
                      <div className="face-region-tags">
                        {['T 区', '鼻翼', '眼下', '唇周', '下颌边缘'].map(region => (
                          <span key={region}>{region}</span>
                        ))}
                      </div>
                      <img
                        src={faceReferenceImage}
                        alt="面部分区参考图"
                        className="skin-heatmap-img skin-face-reference-img clickable-thumb"
                        style={{ filter: 'none' }}
                        onClick={() => setViewerImage(faceReferenceImage)}
                      />
                      <p className="face-reference-note">分区图仅用于解释建议来源，不代表医学诊断。</p>
                    </div>
                  </details>
                )}

                {hasLongTermCare && (
                  <details className="mirror-detail-panel">
                    <summary>
                      长期护理提醒
                      <ChevronRight size={16} strokeWidth={1.7} />
                    </summary>
                    <div className="companion-routine">
                      {routineData?.weekly?.length > 0 && (
                        <div className="companion-routine-block">
                          <div className="companion-routine-time">
                            <CalendarDays size={14} strokeWidth={1.6} />
                            每周
                          </div>
                          <ul className="companion-routine-list">
                            {routineData.weekly.slice(0, 3).map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {routineData?.evening?.length > 0 && (
                        <div className="companion-routine-block">
                          <div className="companion-routine-time">
                            <Moon size={14} strokeWidth={1.6} />
                            晚间
                          </div>
                          <ul className="companion-routine-list">
                            {routineData.evening.slice(0, 3).map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {routineData?.morning?.length > 0 && (
                        <div className="companion-routine-block">
                          <div className="companion-routine-time">
                            <Sun size={14} strokeWidth={1.6} />
                            日间
                          </div>
                          <ul className="companion-routine-list">
                            {routineData.morning.slice(0, 3).map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(displayData.recommendations || []).length > 0 && (
                        <div className="skin-recommendations">
                          {(displayData.recommendations || []).slice(0, 4).map((rec, i) => (
                            <div key={i} className="skin-rec-item">
                              <span className="rec-num">{i + 1}</span>
                              <span>{rec}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {(displayData.observations || []).length > 0 && (
                        <div className="companion-observations">
                          {(displayData.observations || []).slice(0, 3).map((obs, i) => (
                            <div key={i} className="companion-obs-item">
                              <span className="companion-obs-dot" />
                              <span>{obs}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {(displayData.concerns || []).length > 0 && (
                        <div className="skin-concerns">
                          {(displayData.concerns || []).slice(0, 4).map((c, i) => (
                            <span key={i} className="skin-concern-tag">{c}</span>
                          ))}
                        </div>
                      )}
                      {(displayData.trend || result?.trend)?.has_history && (
                        <div className="companion-trend">
                          <p className="companion-trend-summary">
                            {(displayData.trend || result?.trend).summary}
                          </p>
                          {(displayData.trend || result?.trend).detail && (
                            <p className="companion-trend-detail">
                              {(displayData.trend || result?.trend).detail}
                            </p>
                          )}
                        </div>
                      )}
                      {displayData.summary && (
                        <div className="skin-summary">{displayData.summary}</div>
                      )}
                    </div>
                  </details>
                )}
              </>
            )}

            {/* 无数据时 */}
            {!historyView && !displayData?.skin_type && !errorMsg && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa' }}>
                  暂无分析记录，请先拍照分析
              </div>
            )}

            {/* ── 今日心情 + 满意度（仅新分析，非历史查看） ── */}
            {!historyView && !viewHistoryId && !forceHistoryMode && result?.success && (
              <>
                <div className="dv-form-section">
                  <p className="dv-form-section-label">今日心情</p>
                  <div className="dv-mood-selector">
                    {MOOD_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        className={`dv-mood-option${feedbackMood === opt.key ? ' dv-mood-selected' : ''}`}
                        style={feedbackMood === opt.key ? { borderColor: opt.color, background: opt.color + '0C' } : {}}
                        onClick={() => setFeedbackMood(opt.key)}
                      >
                        <span className="dv-mood-swatch" style={{ background: opt.color }} />
                        <span className="dv-mood-option-label" style={{ color: feedbackMood === opt.key ? opt.color : '#868685' }}>
                          {opt.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="dv-form-section">
                  <p className="dv-form-section-label">整体满意度</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[
                      { key: 'satisfied', label: '满意', color: '#7C9473' },
                      { key: 'unsatisfied', label: '不满意', color: '#B98791' },
                    ].map(opt => {
                      const isSel = feedbackSatisfaction === opt.key
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setFeedbackSatisfaction(opt.key)}
                          style={{
                            flex: 1,
                            padding: '12px 16px',
                            borderRadius: 12,
                            border: isSel ? `2px solid ${opt.color}` : '2px solid #e5e5e0',
                            background: isSel ? `${opt.color}0C` : '#fff',
                            fontSize: 15,
                            fontWeight: isSel ? 600 : 400,
                            color: isSel ? opt.color : '#868685',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                  {feedbackSatisfaction === 'unsatisfied' && (
                    <p style={{ fontSize: 12, color: '#B98791', marginTop: 8, textAlign: 'center' }}>
                      不满意则不保存，分析结果将丢失
                    </p>
                  )}
                </div>
              </>
            )}

            {/* 操作按钮 */}
            {!historyView && <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {!viewHistoryId && !forceHistoryMode && (
                <button
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                  onClick={handleRetry}
                  disabled={feedbackSaving}
                >
                  重新生成
                </button>
              )}
              <button
                className="btn btn-primary"
                style={{ flex: viewHistoryId || forceHistoryMode ? 2 : 1 }}
                disabled={
                  feedbackSaving ||
                  (!viewHistoryId && !forceHistoryMode && result?.success && (!feedbackMood || !feedbackSatisfaction))
                }
                onClick={async () => {
                  if (!viewHistoryId && !forceHistoryMode && result?.success && feedbackSatisfaction === 'satisfied') {
                    setFeedbackSaving(true)
                    try {
                      const formData = new FormData()
                      const analysisId = result?.id || selectedHistory?.id
                      formData.append('title', `镜前分析记录 — ${new Date().toLocaleDateString('zh-CN')}`)
                      formData.append('mood', feedbackMood)
                      formData.append('content', '')
                      formData.append('created_date', new Date().toISOString().slice(0, 10))
                      if (analysisId) formData.append('skin_analysis_id', String(analysisId))
                      await createDiary(formData)
                    } catch (e) {
                      console.error('自动保存日记失败:', e)
                    }
                    setFeedbackSaving(false)
                  }
                  onClose()
                }}
              >
                {feedbackSaving ? '保存中...' : viewHistoryId || forceHistoryMode ? '关闭' : '完成'}
              </button>
            </div>}

            {/* 历史记录列表 */}
            {!historyView && !selectedHistory && !viewHistoryId && (
              <div className="skin-history-section">
                <button
                  className="skin-history-toggle"
                  onClick={() => { setShowHistory(!showHistory); loadHistory() }}
                >
                  历史镜前记录
                  <span style={{ fontSize: 12, color: '#aaa', marginLeft: 8 }}>
                    {history.length > 0 ? `${history.length} 条记录` : ''}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, transition: 'transform 0.2s', transform: showHistory ? 'rotate(90deg)' : '' }}>▶</span>
                </button>

                {showHistory && (
                  <SkinHistoryList
                    history={history}
                    onViewRecord={handleViewHistory}
                    onDeleteRecord={handleDeleteHistory}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 图片查看器 */}
      {viewerImage && (
        <div className="image-viewer-overlay" onClick={() => setViewerImage(null)}>
          <button className="image-viewer-close" onClick={() => setViewerImage(null)}>
            ✕
          </button>
          <img
            src={viewerImage}
            alt="放大查看"
            className="image-viewer-img"
            style={{ filter: 'none' }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
