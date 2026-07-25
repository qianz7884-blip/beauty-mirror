import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Loader2, PlusCircle, Search, X } from 'lucide-react'
import { addCatalogProductToCabinet, fetchCatalogProducts, getPhotoUrl } from '../api'
import ProductRecordActions from './ProductRecordActions'

const ALL_CATEGORY = '全部'
const DETAIL_FIELDS = [
  ['核心成分', 'ingredients'],
  ['功效说明', 'efficacy'],
  ['使用方法', 'usage_instructions'],
  ['适合肤质', 'suitable_skin'],
  ['适合区域', 'suitable_regions'],
  ['适合场景', 'suitable_scenes'],
]
const DEFAULT_USAGE_PERCENT = 100

function normalizeKey(product) {
  return `${product?.brand || ''}::${product?.name || ''}`
    .replace(/\s+/g, '')
    .toLowerCase()
}

function todayDateKey() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseTags(value) {
  return String(value || '')
    .split(/[、,，/]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function getProductTags(product) {
  return [
    product.category,
    ...parseTags(product.product_features),
    ...parseTags(product.suitable_skin),
    ...parseTags(product.usage_steps),
  ].filter(Boolean).slice(0, 4)
}

function getTaobaoUrl(product) {
  const directUrl = product?.source_url || String(product?.notes || '').match(/https?:\/\/[^\s，。；;）)]+/i)?.[0]
  if (directUrl) return directUrl
  const keyword = [product?.brand, product?.name].filter(Boolean).join(' ').trim()
  return keyword ? `https://s.taobao.com/search?q=${encodeURIComponent(keyword)}` : ''
}

function getDetailFields(product) {
  return DETAIL_FIELDS
    .map(([label, field]) => [label, product?.[field]])
    .filter(([, value]) => String(value || '').trim())
}

function normalizePriceInput(price) {
  const value = Number(price)
  if (!Number.isFinite(value) || value <= 0) return ''
  return String(value)
}

function getCatalogDetailDraft(product) {
  return {
    color: product?.color || '',
    volume: product?.volume || '',
    purchase_date: todayDateKey(),
    expiry_date: product?.expiry_date || '',
    price: normalizePriceInput(product?.price),
    notes: '',
    usage_percent: DEFAULT_USAGE_PERCENT,
    user_feedback: '',
  }
}

export default function ProductCatalogSheet({
  categories = [],
  cabinetProducts = [],
  getPlaceholderImage,
  onAdded,
  onCamera,
  onClose,
  onManual,
  onVoice,
}) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(ALL_CATEGORY)
  const [catalogProducts, setCatalogProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addingId, setAddingId] = useState(null)
  const [addedIds, setAddedIds] = useState([])
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState(null)
  const [detailDraft, setDetailDraft] = useState(getCatalogDetailDraft())

  const cabinetKeys = useMemo(() => (
    new Set(cabinetProducts.map(product => normalizeKey(product)))
  ), [cabinetProducts])

  useEffect(() => {
    let ignore = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      fetchCatalogProducts({
        search: search.trim() || undefined,
        category: category === ALL_CATEGORY ? undefined : category,
      })
        .then(data => {
          if (ignore) return
          setCatalogProducts(Array.isArray(data?.results) ? data.results : [])
        })
        .catch(() => {
          if (ignore) return
          setError('产品库加载失败，请检查后端是否启动')
        })
        .finally(() => {
          if (!ignore) setLoading(false)
        })
    }, 180)

    return () => {
      ignore = true
      window.clearTimeout(timer)
    }
  }, [search, category])

  const handleAdd = async (product, payload) => {
    if (!product?.id || addingId) return
    setAddingId(product.id)
    try {
      const result = await addCatalogProductToCabinet(product.id, payload || {
        purchase_date: todayDateKey(),
        usage_percent: DEFAULT_USAGE_PERCENT,
      })
      setAddedIds(prev => [...prev, product.id])
      onAdded?.(result?.product)
    } catch {
      setError('加入化妆柜失败，请稍后重试')
    } finally {
      setAddingId(null)
    }
  }

  const fallbackCategories = [ALL_CATEGORY, ...categories]
  const isProductInCabinet = (product) => (
    cabinetKeys.has(normalizeKey(product)) || addedIds.includes(product.id)
  )

  const handleOpenDetail = (product) => {
    setSelectedCatalogProduct(product)
    setDetailDraft(getCatalogDetailDraft(product))
  }

  const handleCardKeyDown = (event, product) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handleOpenDetail(product)
  }

  const updateDetailDraft = (field, value) => {
    setDetailDraft(prev => ({ ...prev, [field]: value }))
  }

  const buildDetailAddPayload = () => ({
    color: detailDraft.color || '',
    volume: detailDraft.volume || '',
    purchase_date: detailDraft.purchase_date || '',
    expiry_date: detailDraft.expiry_date || '',
    price: detailDraft.price || 0,
    notes: detailDraft.notes || '',
    usage_percent: Math.max(0, Math.min(100, Number(detailDraft.usage_percent) || 0)),
    user_feedback: detailDraft.user_feedback || '',
  })

  const renderTaobaoLink = (product, variant = 'icon') => {
    const taobaoUrl = getTaobaoUrl(product)
    if (!taobaoUrl) return null
    return (
      <a
        className={variant === 'button' ? 'bm-catalog-buy-link' : 'bm-catalog-source-link'}
        href={taobaoUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="去淘宝查看"
        title="去淘宝查看"
        onClick={event => event.stopPropagation()}
      >
        <span className="bm-taobao-icon" aria-hidden="true">淘</span>
        {variant === 'button' && <span>淘宝查看</span>}
      </a>
    )
  }

  const renderCatalogDetail = (product) => {
    const alreadyInCabinet = isProductInCabinet(product)
    const photoUrl = product.photo ? getPhotoUrl(product.photo, 'products') : ''
    const tags = getProductTags(product)
    const fields = getDetailFields(product)
    const detailUsagePercent = Math.max(0, Math.min(100, Number(detailDraft.usage_percent) || 0))

    return (
      <div className="bm-catalog-detail bm-catalog-cabinet-detail">
        <button
          type="button"
          className="bm-catalog-detail-back"
          onClick={() => setSelectedCatalogProduct(null)}
        >
          <ArrowLeft size={17} strokeWidth={1.9} />
          返回搜索结果
        </button>

        <div className="bm-catalog-detail-hero">
          <div
            className={`bm-catalog-detail-photo ${photoUrl ? '' : 'is-placeholder'}`}
            style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
            aria-hidden="true"
          >
            {!photoUrl && getPlaceholderImage && (
              <img src={getPlaceholderImage(product.category)} alt="" />
            )}
          </div>
          <div className="bm-catalog-detail-copy">
            <span>{product.brand || '未记录品牌'}</span>
            <h4>{product.name || '未命名产品'}</h4>
            <p>{product.efficacy || product.usage_instructions || '暂无详细说明，加入后可以继续补充自己的使用记录。'}</p>
            {tags.length > 0 && (
              <div className="bm-catalog-detail-tags">
                {tags.map(tag => <em key={tag}>{tag}</em>)}
              </div>
            )}
          </div>
        </div>

        <div className="bm-catalog-detail-facts bm-catalog-base-facts" aria-label="产品库信息">
          <div>
            <span>品牌</span>
            <strong>{product.brand || '未记录'}</strong>
          </div>
          <div>
            <span>分类</span>
            <strong>{product.category || '其他'}</strong>
          </div>
          <div>
            <span>规格</span>
            <strong>{product.volume || '待补充'}</strong>
          </div>
          <div>
            <span>色号</span>
            <strong>{product.color || '待补充'}</strong>
          </div>
        </div>

        <div className="bm-detail-facts bm-catalog-personal-facts" aria-label="加入化妆柜前补充">
          <div>
            <span>规格</span>
            <input
              value={detailDraft.volume || ''}
              onChange={event => updateDetailDraft('volume', event.target.value)}
              placeholder="如 30ml"
              disabled={alreadyInCabinet}
            />
          </div>
          <div>
            <span>颜色 / 色号</span>
            <input
              value={detailDraft.color || ''}
              onChange={event => updateDetailDraft('color', event.target.value)}
              placeholder="如 EM05"
              disabled={alreadyInCabinet}
            />
          </div>
          <div>
            <span>购买日期</span>
            <input
              type="date"
              value={detailDraft.purchase_date || ''}
              onChange={event => updateDetailDraft('purchase_date', event.target.value)}
              disabled={alreadyInCabinet}
            />
          </div>
          <div>
            <span>预计到期</span>
            <input
              type="date"
              value={detailDraft.expiry_date || ''}
              onChange={event => updateDetailDraft('expiry_date', event.target.value)}
              disabled={alreadyInCabinet}
            />
          </div>
          <div>
            <span>价格</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={detailDraft.price ?? ''}
              onChange={event => updateDetailDraft('price', event.target.value)}
              placeholder="0"
              disabled={alreadyInCabinet}
            />
          </div>
          <div>
            <span>状态</span>
            <strong>{alreadyInCabinet ? '已加入' : '待加入'}</strong>
          </div>
        </div>

        <div className="bm-detail-panel bm-catalog-detail-panel">
          <div className="bm-detail-panel-title">
            <strong>使用记录</strong>
            <span>加入后会带到化妆柜</span>
          </div>
          <p className="bm-usage-copy">剩余约 {detailUsagePercent}%</p>
          <input
            className="bm-usage-slider"
            type="range"
            min="0"
            max="100"
            step="1"
            value={detailUsagePercent}
            style={{ '--usage-value': `${detailUsagePercent}%` }}
            disabled={alreadyInCabinet}
            onChange={event => updateDetailDraft('usage_percent', event.target.value)}
            aria-label="设置加入化妆柜时的剩余量"
          />
        </div>

        <div className="bm-detail-panel bm-catalog-detail-panel">
          <div className="bm-detail-panel-title">
            <strong>我的补充</strong>
            <span>使用感、购买渠道或提醒</span>
          </div>
          <textarea
            className="bm-catalog-detail-textarea"
            value={detailDraft.notes || ''}
            onChange={event => updateDetailDraft('notes', event.target.value)}
            placeholder="可以先写购买渠道、开封日期、使用感..."
            disabled={alreadyInCabinet}
          />
        </div>

        <div className="bm-catalog-detail-sections">
          {fields.length > 0 ? fields.map(([label, value]) => (
            <section key={label}>
              <span>{label}</span>
              <p>{value}</p>
            </section>
          )) : (
            <section>
              <span>产品说明</span>
              <p>这个产品还没有补充完整信息，后面导入产品库时可以继续完善成分、功效和适用场景。</p>
            </section>
          )}
        </div>

        <div className="bm-catalog-detail-actions">
          {renderTaobaoLink(product, 'button')}
          <button
            type="button"
            className={alreadyInCabinet ? 'bm-catalog-detail-add added' : 'bm-catalog-detail-add'}
            disabled={alreadyInCabinet || addingId === product.id}
            onClick={() => handleAdd(product, buildDetailAddPayload())}
          >
            {alreadyInCabinet ? <Check size={17} strokeWidth={2} /> : <PlusCircle size={17} strokeWidth={1.9} />}
            {alreadyInCabinet ? '已在柜中' : addingId === product.id ? '加入中' : '加入化妆柜'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay bm-catalog-overlay" onClick={onClose}>
      <div className="modal-sheet bm-catalog-sheet" onClick={event => event.stopPropagation()}>
        <div className="modal-header bm-catalog-header">
          <div>
            <span className="bm-catalog-eyebrow">官方整理库</span>
            <h3>{selectedCatalogProduct ? '产品详情' : '从产品库添加'}</h3>
            <p>
              {selectedCatalogProduct
                ? '确认适合后再加入你的化妆柜。'
                : '搜索品牌或产品名，找到后直接加入化妆柜。'}
            </p>
          </div>
          <button className="modal-close" type="button" aria-label="关闭" onClick={onClose}>
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className="bm-catalog-control">
          <label className="bm-catalog-search">
            <Search size={18} strokeWidth={1.8} />
            <input
              value={search}
              onChange={event => {
                setSearch(event.target.value)
                setSelectedCatalogProduct(null)
              }}
              placeholder="搜索品牌、产品名或功效"
            />
          </label>
          <div className="bm-catalog-summary">
            <span>{category === ALL_CATEGORY ? '全部分类' : category}</span>
            <strong>{loading ? '查找中' : `${catalogProducts.length} 件`}</strong>
          </div>
        </div>

        <div className="bm-catalog-tabs" role="tablist" aria-label="产品库分类">
          {fallbackCategories.map(item => (
            <button
              key={item}
              type="button"
              className={category === item ? 'active' : ''}
              onClick={() => {
                setCategory(item)
                setSelectedCatalogProduct(null)
              }}
            >
              {item}
            </button>
          ))}
        </div>

        {error && <div className="soft-error bm-catalog-error">{error}</div>}

        <div className="bm-catalog-results" aria-live="polite">
          {selectedCatalogProduct ? (
            renderCatalogDetail(selectedCatalogProduct)
          ) : loading ? (
            <div className="bm-catalog-state">
              <Loader2 size={22} strokeWidth={1.8} />
              <span>正在查找产品</span>
            </div>
          ) : catalogProducts.length === 0 ? (
            <div className="bm-catalog-state">
              <strong>没有找到匹配产品</strong>
              <span>可以换个关键词，或者用下面的拍照/手动录入。</span>
            </div>
          ) : (
            catalogProducts.map(product => {
              const alreadyInCabinet = isProductInCabinet(product)
              const photoUrl = product.photo ? getPhotoUrl(product.photo, 'products') : ''
              const tags = getProductTags(product)
              return (
                <article
                  className="bm-catalog-card"
                  key={product.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`查看 ${product.name || '产品'} 详情`}
                  onClick={() => handleOpenDetail(product)}
                  onKeyDown={event => handleCardKeyDown(event, product)}
                >
                  <div
                    className={`bm-catalog-photo ${photoUrl ? '' : 'is-placeholder'}`}
                    style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
                    aria-hidden="true"
                  >
                    {!photoUrl && getPlaceholderImage && (
                      <img src={getPlaceholderImage(product.category)} alt="" />
                    )}
                  </div>
                  <div className="bm-catalog-info">
                    <div className="bm-catalog-brand-row">
                      <span>{product.brand || '未记录品牌'}</span>
                      {product.volume && <em>{product.volume}</em>}
                    </div>
                    <strong>{product.name}</strong>
                    <p>{product.efficacy || product.usage_instructions || '暂无功效说明，添加后可以继续补充。'}</p>
                    <div className="bm-catalog-meta-row">
                      <div className="bm-catalog-tags">
                        {tags.map(tag => <em key={tag}>{tag}</em>)}
                      </div>
                    </div>
                  </div>
                  <div className="bm-catalog-card-actions">
                    {renderTaobaoLink(product)}
                    <button
                      type="button"
                      className={alreadyInCabinet ? 'bm-catalog-add added' : 'bm-catalog-add'}
                      disabled={alreadyInCabinet || addingId === product.id}
                      onClick={event => {
                        event.stopPropagation()
                        handleAdd(product)
                      }}
                    >
                      {alreadyInCabinet ? <Check size={16} strokeWidth={2} /> : <PlusCircle size={16} strokeWidth={1.8} />}
                      {alreadyInCabinet ? '已在柜中' : addingId === product.id ? '加入中' : '加入'}
                    </button>
                  </div>
                </article>
              )
            })
          )}
        </div>

        {!selectedCatalogProduct && (
          <div className="bm-catalog-fallback">
            <div className="bm-catalog-fallback-copy">
              <strong>搜不到产品时</strong>
              <span>换一种方式录入到化妆柜</span>
            </div>
            <ProductRecordActions
              className="bm-catalog-fallback-actions"
              onCamera={onCamera}
              onVoice={onVoice}
              onManual={onManual}
            />
          </div>
        )}
      </div>
    </div>
  )
}
