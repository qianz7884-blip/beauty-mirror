import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Clock3, Package, Sun, Briefcase, Moon, ArrowRight, Sparkles, Save, Camera, Image as ImageIcon } from 'lucide-react'
import { createDiary, fetchProducts } from '../api'
import { usePageBackground } from '../utils/backgroundSettings'

const TIME_OPTIONS = [
  { id: 'three', label: '3 分钟', minutes: 3 },
  { id: 'five', label: '5 分钟', minutes: 5 },
  { id: 'ten', label: '10 分钟', minutes: 10 },
]

const SCENES = [
  {
    id: 'commute',
    label: '通勤前',
    title: '轻整理妆前流程',
    icon: Sun,
    focus: '自然、清爽、快速出门',
    check: '收尾检查：鼻翼、唇周和眼下是否需要轻拍过渡。',
  },
  {
    id: 'office',
    label: '办公室光',
    title: '自然精致补光流程',
    icon: Briefcase,
    focus: '正面光下更干净',
    check: '收尾检查：正面光下看脸颊边界是否自然。',
  },
  {
    id: 'evening',
    label: '晚间出门',
    title: '柔雾完整流程',
    icon: Moon,
    focus: '柔和、有层次、不过度',
    check: '收尾检查：侧脸转动时高光和腮红不要抢镜。',
  },
]

function pickProductItem(products, categories, fallback) {
  const found = products.find(product => categories.includes(product.category))
  return found ? { id: found.id, name: found.name } : { id: null, name: fallback }
}

function uniqueProductItems(list) {
  const seen = new Set()
  return list.filter(item => {
    if (!item?.name) return false
    const key = item.id ? `id:${item.id}` : `name:${item.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildGuide(timeId, sceneId, products) {
  const time = TIME_OPTIONS.find(item => item.id === timeId) || TIME_OPTIONS[0]
  const scene = SCENES.find(item => item.id === sceneId) || SCENES[0]
  const skincareItem = pickProductItem(products, ['乳液', '面霜', '精华', '爽肤水'], '保湿产品')
  const sunscreenItem = pickProductItem(products, ['防晒'], '防晒')
  const baseItem = pickProductItem(products, ['底妆'], '底妆')
  const concealerItem = pickProductItem(products, ['遮瑕', '底妆'], '遮瑕或底妆')
  const powderItem = pickProductItem(products, ['定妆'], '定妆产品')
  const eyeItem = pickProductItem(products, ['眉眼'], '眉眼产品')
  const lipItem = pickProductItem(products, ['唇妆'], '唇部产品')
  const blushItem = pickProductItem(products, ['腮红修容'], '腮红或修容')
  const skincare = skincareItem.name
  const sunscreen = sunscreenItem.name
  const base = baseItem.name
  const concealer = concealerItem.name
  const powder = powderItem.name
  const eye = eyeItem.name
  const lip = lipItem.name
  const blush = blushItem.name

  const sceneTail = {
    commute: [
      `用${sunscreen}或轻薄底妆薄薄带过面中，鼻翼少量叠加`,
      `用${eye}整理眉尾和眼尾，让精神集中在上半脸`,
      `用${lip}薄涂一层，唇周边缘轻拍干净`,
    ],
    office: [
      `用${concealer}轻拍眼下、鼻翼和唇周暗沉`,
      `用${eye}压低眼周边界，眉眼保持干净清晰`,
      `用${lip}和${blush}补气色，色调保持柔和`,
    ],
    evening: [
      `用${eye}整理眼周层次，眼尾少量加深`,
      `用${blush}把面中气色衔接到眼下`,
      `用${lip}补完整唇色，和腮红统一色调`,
    ],
  }
  const sceneTailProducts = {
    commute: [sunscreen, eye, lip],
    office: [concealer, eye, `${lip} / ${blush}`],
    evening: [eye, blush, lip],
  }

  const stepsByTime = {
    three: [
      `少量按压${skincare}，让鼻翼、眼下和唇周贴合`,
      scene.id === 'commute' ? `用${sunscreen}薄薄带过全脸` : `用${concealer}点按眼下、鼻翼和唇周`,
      `用${eye}快速整理眉尾和眼尾，再用${lip}补一点气色`,
      `用${powder}按压 T 区，检查眼下、鼻翼和唇周边界`,
    ],
    five: [
      `先用${skincare}按压鼻翼、眼下和唇周`,
      `用${base}从面中向外轻薄推开`,
      sceneTail[scene.id][0],
      sceneTail[scene.id][1],
      sceneTail[scene.id][2],
      scene.check,
    ],
    ten: [
      `用${skincare}做妆前贴合，等待 20 秒`,
      `用${base}分区上底，脸颊保留轻薄感`,
      `用${concealer}处理眼下、鼻翼和唇周边缘`,
      sceneTail[scene.id][0],
      sceneTail[scene.id][1],
      sceneTail[scene.id][2],
      `最后用${powder}定妆，并检查眼下、唇周、发际线和下颌边界`,
    ],
  }

  const stepHints = {
    three: [
      '轻按 10 秒，等膜感贴住再上下一步。',
      scene.id === 'commute' ? '从面中带到脸颊，边缘不要堆厚。' : '只点在暗沉和边界明显的位置。',
      '眼妆只做轮廓和精神，唇色点到即止。',
      '少量按压易出油处，最后看眼下和唇周有没有卡边。',
    ],
    five: [
      '先处理容易卡粉的位置，动作尽量慢。',
      '从面中开始铺开，脸颊外侧保持轻薄。',
      '优先解决暗沉和肤色不均，不追求厚度。',
      '眉眼只做清晰度，避免眼周显脏。',
      '唇颊同色系会更完整。',
      '转动脸看边界，确认没有明显分层。',
    ],
    ten: [
      '等待 20 秒，让妆前和皮肤贴合。',
      '分区上底，面中更完整，外轮廓更轻。',
      '遮瑕只放在阴影处，边缘用指腹拍开。',
      '眼周层次少量多次，先浅后深。',
      '腮红不要超过眼下太多，避免显肿。',
      '唇线边缘用指腹轻拍，和面中色彩连起来。',
      '最后检查眼下、唇周、发际线、耳前和下颌边界。',
    ],
  }

  const stepProducts = {
    three: [
      skincare,
      scene.id === 'commute' ? sunscreen : concealer,
      `${eye} / ${lip}`,
      powder,
    ],
    five: [
      skincare,
      base,
      sceneTailProducts[scene.id][0],
      sceneTailProducts[scene.id][1],
      sceneTailProducts[scene.id][2],
      '收尾检查',
    ],
    ten: [
      skincare,
      base,
      concealer,
      sceneTailProducts[scene.id][0],
      sceneTailProducts[scene.id][1],
      sceneTailProducts[scene.id][2],
      powder,
    ],
  }

  const selectedProductItems = uniqueProductItems([
    skincareItem,
    sunscreenItem,
    baseItem,
    concealerItem,
    eyeItem,
    lipItem,
    blushItem,
    powderItem,
  ]).slice(0, 8)

  return {
    ...scene,
    time: time.label,
    minutes: time.minutes,
    steps: stepsByTime[time.id],
    hints: stepHints[time.id],
    stepProducts: stepProducts[time.id],
    products: selectedProductItems.map(item => item.name),
    productIds: selectedProductItems.map(item => item.id).filter(Boolean),
  }
}

function getTodayString() {
  return new Date().toISOString().slice(0, 10)
}

function buildDiaryContent(guide) {
  const stepLines = guide.steps.map((step, index) => (
    `${index + 1}. ${step}${guide.hints[index] ? `\n   ${guide.hints[index]}` : ''}`
  ))

  return [
    `今天完成了「${guide.label} · ${guide.time}」流程。`,
    '',
    '使用产品：',
    guide.products.join(' / '),
    '',
    '使用步骤：',
    ...stepLines,
    '',
    '收尾检查：',
    guide.check,
  ].join('\n')
}

export default function Tutorial() {
  const pageBackground = usePageBackground('tutorial')
  const [products, setProducts] = useState([])
  const [savingDiary, setSavingDiary] = useState(false)
  const [finishPhoto, setFinishPhoto] = useState(null)
  const [finishPreview, setFinishPreview] = useState('')
  const [showFinishReview, setShowFinishReview] = useState(false)
  const [toast, setToast] = useState(null)
  const [timeId, setTimeId] = useState('')
  const [sceneId, setSceneId] = useState('')
  const [currentStep, setCurrentStep] = useState(0)
  const navigate = useNavigate()
  const cameraRef = useRef(null)
  const albumRef = useRef(null)
  const reviewRef = useRef(null)

  useEffect(() => {
    fetchProducts().then(setProducts).catch(() => setProducts([]))
  }, [])

  useEffect(() => {
    setFinishPhoto(null)
    setFinishPreview('')
    setShowFinishReview(false)
  }, [timeId, sceneId])

  useEffect(() => {
    return () => {
      if (finishPreview.startsWith('blob:')) {
        URL.revokeObjectURL(finishPreview)
      }
    }
  }, [finishPreview])

  const activeGuide = useMemo(
    () => (timeId && sceneId ? buildGuide(timeId, sceneId, products) : null),
    [timeId, sceneId, products],
  )
  const Icon = activeGuide?.icon

  const changeTime = (id) => {
    setTimeId(id)
    setCurrentStep(0)
  }

  const changeScene = (id) => {
    setSceneId(id)
    setCurrentStep(0)
  }

  const handleNextStep = useCallback(() => {
    if (!activeGuide) return
    if (currentStep < activeGuide.steps.length - 1) {
      setCurrentStep(prev => prev + 1)
      setShowFinishReview(false)
    }
  }, [currentStep, activeGuide])

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 2200)
  }

  const handleFinishFlow = () => {
    setShowFinishReview(true)
    window.setTimeout(() => {
      reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
  }

  const handleFinishPhotoSelected = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setFinishPhoto(file)
    setFinishPreview(URL.createObjectURL(file))
    setShowFinishReview(true)
    event.target.value = ''
  }

  const handleSkipDiary = () => {
    showToast('这次先不保存，可以继续调整后再拍')
    setShowFinishReview(false)
  }

  const handleSaveDiary = async () => {
    if (!activeGuide) {
      showToast('请先选择时间和场景', 'error')
      return
    }
    if (!finishPhoto) {
      setShowFinishReview(true)
      showToast('先拍一张或选择一张完成照，再保存到日记', 'error')
      return
    }

    setSavingDiary(true)
    try {
      const formData = new FormData()
      formData.append('title', `${activeGuide.label} · ${activeGuide.time} 妆容记录`)
      formData.append('content', buildDiaryContent(activeGuide))
      formData.append('mood', 'stable')
      formData.append('created_date', getTodayString())
      formData.append('tags', JSON.stringify(['跟镜流程', activeGuide.label]))
      activeGuide.productIds.forEach(id => formData.append('product_ids', String(id)))
      formData.append('photo', finishPhoto)
      await createDiary(formData)
      showToast('已保存到日记')
      navigate('/diary')
    } catch (error) {
      showToast(error.response?.data?.error || '保存日记失败', 'error')
    } finally {
      setSavingDiary(false)
    }
  }

  return (
    <div className="bm-screen bm-tutorial" style={pageBackground.style}>
      {toast && (
        <div className="d-toast-container">
          <div className={`d-toast d-toast-${toast.type}`}>{toast.message}</div>
        </div>
      )}

      <section className="bm-hero bm-tutorial-hero">
        <h1>跟镜流程</h1>
        <p className="bm-flow-copy">选择时间和场景，跟着步骤完成今天妆容。</p>
      </section>

      <div className="bm-flow-content">
        <section className="bm-flow-panel">
          <div className="bm-flow-time-label">
            <Clock3 size={15} strokeWidth={1.7} />
            <span>选择可用时间</span>
          </div>
          <div className="bm-segment">
            {TIME_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                className={option.id === timeId ? 'active' : ''}
                onClick={() => changeTime(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="bm-flow-time-label bm-flow-scene-label">
            <Sparkles size={15} strokeWidth={1.7} />
            <span>选择使用场景</span>
          </div>
          <div className="bm-scene-grid">
            {SCENES.map(scene => {
              const SceneIcon = scene.icon
              return (
                <button
                  key={scene.id}
                  type="button"
                  className={scene.id === sceneId ? 'active' : ''}
                  onClick={() => changeScene(scene.id)}
                >
                  <SceneIcon size={17} strokeWidth={1.7} />
                  <span>{scene.label}</span>
                </button>
              )
            })}
          </div>
        </section>

        {!activeGuide ? (
          <section className="bm-flow-empty">
            <Sparkles size={18} strokeWidth={1.7} />
            <p>选择时间和场景生成当前流程。</p>
          </section>
        ) : (
          <>
            <section className="bm-routine-card bm-flow-routine">
              <div className="bm-routine-head">
                <span className="bm-soft-icon"><Icon size={21} strokeWidth={1.6} /></span>
                <div>
                  <p>{activeGuide.label} · {activeGuide.focus}</p>
                  <h2>{activeGuide.title}</h2>
                </div>
                <span className="bm-time-chip"><Clock3 size={14} />{activeGuide.time}</span>
              </div>

              <div className="bm-product-strip">
                <span><Package size={15} /> 本次优先使用</span>
                <strong>{activeGuide.products.join(' / ')}</strong>
              </div>
            </section>

            <section className="bm-step-card bm-flow-current bm-step-no-art">
              <div className="bm-flow-current-head">
                <p className="bm-step-count">{String(currentStep + 1).padStart(2, '0')} / {String(activeGuide.steps.length).padStart(2, '0')}</p>
                <span><Sparkles size={14} strokeWidth={1.8} /> 跟镜中</span>
              </div>
              <h2>{activeGuide.steps[currentStep]}</h2>
              <p>{activeGuide.hints[currentStep] || activeGuide.check}</p>

              <div className="bm-step-product-hint">
                <Package size={15} strokeWidth={1.8} />
                <span>使用：{activeGuide.stepProducts[currentStep]}</span>
              </div>

              <div className="bm-step-actions">
                {currentStep < activeGuide.steps.length - 1 ? (
                  <button type="button" className="bm-btn-primary" onClick={handleNextStep}>
                    <span>下一步</span>
                    <ArrowRight size={17} strokeWidth={2} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="bm-btn-primary bm-btn-finish"
                    onClick={handleFinishFlow}
                  >
                    <Camera size={17} strokeWidth={2} />
                    <span>{showFinishReview ? '查看妆后照片' : '完成，拍妆后照'}</span>
                  </button>
                )}
              </div>
            </section>

            {showFinishReview && (
              <section className="bm-flow-review-card" ref={reviewRef}>
                <div className="bm-flow-review-head">
                  <span className="bm-soft-icon">
                    <Camera size={21} strokeWidth={1.7} />
                  </span>
                  <div>
                    <p>妆后检查</p>
                    <h2>拍一张完成照，再决定要不要保存</h2>
                  </div>
                </div>

                <button
                  type="button"
                  className={`bm-flow-photo-drop${finishPreview ? ' has-photo' : ''}`}
                  onClick={() => cameraRef.current?.click()}
                >
                  {finishPreview ? (
                    <img src={finishPreview} alt="妆后照片预览" />
                  ) : (
                    <>
                      <Camera size={24} strokeWidth={1.6} />
                      <span>拍摄妆后完成照</span>
                      <small>满意的话会作为日记封面保存</small>
                    </>
                  )}
                </button>

                <div className="bm-flow-photo-actions">
                  <button type="button" onClick={() => cameraRef.current?.click()}>
                    <Camera size={16} strokeWidth={1.7} />
                    拍照
                  </button>
                  <button type="button" onClick={() => albumRef.current?.click()}>
                    <ImageIcon size={16} strokeWidth={1.7} />
                    相册
                  </button>
                </div>

                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="bm-hidden-file"
                  onChange={handleFinishPhotoSelected}
                />
                <input
                  ref={albumRef}
                  type="file"
                  accept="image/*"
                  className="bm-hidden-file"
                  onChange={handleFinishPhotoSelected}
                />

                <div className="bm-flow-review-actions">
                  <button type="button" className="bm-btn-light" onClick={handleSkipDiary}>
                    先不保存
                  </button>
                  <button
                    type="button"
                    className="bm-btn-primary bm-btn-finish"
                    onClick={handleSaveDiary}
                    disabled={savingDiary || !finishPhoto}
                  >
                    <Save size={17} strokeWidth={2} />
                    <span>{savingDiary ? '保存中...' : '满意，保存到日记'}</span>
                  </button>
                </div>

                <p className="bm-flow-review-note">
                  保存后会带上本次流程、完成照和使用过的产品。
                </p>
              </section>
            )}

            <section className="bm-flow-steps-card">
              <div className="bm-flow-section-title">步骤列表</div>
              <div className="bm-step-list">
                {activeGuide.steps.map((step, index) => (
                  <button
                    key={`${step}-${index}`}
                    type="button"
                    className={[
                      index === currentStep ? 'active' : '',
                      index < currentStep ? 'done' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setCurrentStep(index)}
                  >
                    <span className="bm-step-dot">
                      {index <= currentStep && <Check size={13} strokeWidth={2.2} />}
                    </span>
                    <span className="bm-step-list-copy">
                      <strong>{index + 1}. {step}</strong>
                      <small>{activeGuide.hints[index]}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

    </div>
  )
}
