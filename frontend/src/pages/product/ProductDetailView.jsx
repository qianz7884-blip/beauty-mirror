import { ArrowLeft, CalendarDays, Check, ChevronRight, Pencil, PlusCircle, X } from 'lucide-react'

import ImageViewer from '../../components/ImageViewer'
import { formatProductPrice } from '../../utils/productCatalog'
import { RECOMMENDATION_TAG_FIELDS } from './productData'
import { parseTagText, toggleTagValue } from './productLogic'

export function ProductDetailView({
  actions,
  categories,
  detailDraft,
  detailEditing,
  detailSaving,
  detailViewData,
  photoUrl,
  placeholderImage,
  selectedProduct,
  viewImage,
}) {
  const {
    detailProfile,
    detailUsagePercent,
    expiryDate,
    knowledgeDetails,
    recommendationTags,
    selectedShade,
    shadeOptions,
    showShadeRow,
    status,
    usagePercent,
  } = detailViewData

  return (
    <>
      <section className="bm-detail-hero">
        <button
          type="button"
          className="bm-detail-back"
          onClick={actions.onBack}
          aria-label="返回产品列表"
        >
          <ArrowLeft size={22} strokeWidth={1.8} />
        </button>
        <span className="bm-detail-count">1 / 1</span>
        <button
          type="button"
          className={`bm-detail-main-photo ${photoUrl ? '' : 'is-placeholder'}`}
          style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
          onClick={actions.onImageOpen}
          aria-label="查看产品大图"
        >
          {!photoUrl && (
            <img
              className="bm-category-placeholder"
              src={placeholderImage}
              alt=""
              aria-hidden="true"
            />
          )}
        </button>
      </section>

      <section className="bm-detail-content">
        <div className="bm-detail-heading">
          <div>
            {detailEditing ? (
              <input
                className="bm-detail-title-input"
                value={detailDraft.name || ''}
                onChange={event => actions.onDraftChange('name', event.target.value)}
                placeholder="产品名称"
              />
            ) : (
              <h1>{selectedProduct.name || '未命名产品'}</h1>
            )}
            {detailEditing ? (
              <input
                className="bm-detail-subtitle-input"
                value={detailDraft.brand || ''}
                onChange={event => actions.onDraftChange('brand', event.target.value)}
                placeholder="品牌"
              />
            ) : (
              <p>{detailProfile.summary || selectedProduct.category || '未记录分类'}</p>
            )}
          </div>
          <span className={`bm-detail-status ${status === '快用完' ? 'is-low' : status === '已过期' ? 'is-expired' : ''}`}>
            {status}
          </span>
        </div>

        <div className="bm-detail-facts" aria-label="产品信息">
          <div>
            <span>品牌</span>
            {detailEditing ? (
              <input value={detailDraft.brand || ''} onChange={event => actions.onDraftChange('brand', event.target.value)} placeholder="品牌" />
            ) : (
              <strong>{selectedProduct.brand || '未记录'}</strong>
            )}
          </div>
          <div>
            <span>分类</span>
            {detailEditing ? (
              <select value={detailDraft.category || '其他'} onChange={event => actions.onDraftChange('category', event.target.value)}>
                {categories.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            ) : (
              <strong>{selectedProduct.category || '其他'}</strong>
            )}
          </div>
          <div>
            <span>规格</span>
            {detailEditing ? (
              <input value={detailDraft.volume || ''} onChange={event => actions.onDraftChange('volume', event.target.value)} placeholder="30ml" />
            ) : (
              <strong>{selectedProduct.volume || '未记录'}</strong>
            )}
          </div>
          <div>
            <span>颜色 / 色号</span>
            {detailEditing ? (
              <input value={detailDraft.color || ''} onChange={event => actions.onDraftChange('color', event.target.value)} placeholder="色号" />
            ) : (
              <strong>{selectedProduct.color || '未记录'}</strong>
            )}
          </div>
          <div>
            <span>生产日期</span>
            {detailEditing ? (
              <input type="date" value={detailDraft.production_date || ''} onChange={event => actions.onDraftChange('production_date', event.target.value)} />
            ) : (
              <strong>{selectedProduct.production_date || '未记录'}</strong>
            )}
          </div>
          <div>
            <span>保质期（月）</span>
            {detailEditing ? (
              <input type="number" min="0" max="240" step="1" value={detailDraft.shelf_life_months || ''} onChange={event => actions.onDraftChange('shelf_life_months', event.target.value)} placeholder="36" />
            ) : (
              <strong>{selectedProduct.shelf_life_months ? `${selectedProduct.shelf_life_months}个月` : '未记录'}</strong>
            )}
          </div>
          <div>
            <span>购买日期</span>
            {detailEditing ? (
              <input type="date" value={detailDraft.purchase_date || ''} onChange={event => actions.onDraftChange('purchase_date', event.target.value)} />
            ) : (
              <strong>{selectedProduct.purchase_date || '未记录'}</strong>
            )}
          </div>
          <div>
            <span>预计到期</span>
            {detailEditing ? (
              <input type="date" value={detailDraft.expiry_date || ''} onChange={event => actions.onDraftChange('expiry_date', event.target.value)} />
            ) : (
              <strong>{selectedProduct.expiry_date || expiryDate || '未记录'}</strong>
            )}
          </div>
          <div>
            <span>价格</span>
            {detailEditing ? (
              <input type="number" min="0" step="0.01" value={detailDraft.price ?? ''} onChange={event => actions.onDraftChange('price', event.target.value)} placeholder="0" />
            ) : (
              <strong>{formatProductPrice(selectedProduct.price) ? `¥${formatProductPrice(selectedProduct.price)}` : '未记录'}</strong>
            )}
          </div>
        </div>

        <div className="bm-detail-panel">
          <div className="bm-detail-panel-title">
            <strong>{detailProfile.title}</strong>
            <span>{detailProfile.value}</span>
          </div>
          {showShadeRow ? (
            <div className="bm-shade-row">
              {shadeOptions.map(shade => (
                <button
                  key={shade}
                  type="button"
                  className={`bm-shade ${selectedShade === shade ? 'active' : ''}`}
                  style={{ background: shade }}
                  onClick={() => actions.onShadeChange(shade)}
                  aria-label={`选择色号 ${shade}`}
                />
              ))}
              <label className="bm-shade-picker" aria-label="自定义色号颜色">
                <input
                  type="color"
                  value={selectedShade}
                  onChange={event => actions.onShadeChange(event.target.value)}
                />
                <span>自选</span>
              </label>
            </div>
          ) : (
            <p className="bm-detail-field-copy">{detailProfile.value}</p>
          )}
        </div>

        <div className="bm-detail-panel">
          <div className="bm-detail-panel-title">
            <strong>使用记录</strong>
            <span>手动滑动记录</span>
          </div>
          <p className="bm-usage-copy">已使用 {detailUsagePercent}%</p>
          <input
            className="bm-usage-slider"
            type="range"
            min="0"
            max="100"
            step="1"
            value={detailUsagePercent}
            style={{ '--usage-value': `${detailUsagePercent}%` }}
            onChange={event => {
              if (detailEditing) {
                actions.onDraftChange('usage_percent', event.target.value)
              } else {
                actions.onUsageChange(event.target.value)
              }
            }}
            onPointerUp={event => {
              if (!detailEditing) actions.onUsageCommit(event.currentTarget.value)
            }}
            onKeyUp={event => {
              if (!detailEditing) actions.onUsageCommit(event.currentTarget.value)
            }}
            onBlur={event => {
              if (!detailEditing) actions.onUsageCommit(event.currentTarget.value)
            }}
            aria-label="调整产品使用进度"
          />
        </div>

        <div className="bm-detail-panel">
          <div className="bm-detail-panel-title">
            <strong>产品库信息</strong>
            <span>{knowledgeDetails.length ? '随产品库一起带入' : '还未录入'}</span>
          </div>
          {knowledgeDetails.length ? (
            <div className="bm-detail-knowledge">
              {knowledgeDetails.map(item => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <p>{item.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="bm-detail-field-copy">这件产品还没有录入成分、功效或使用方法，后面补产品库表格后会一起带进来。</p>
          )}
        </div>

        <div className="bm-detail-panel">
          <div className="bm-detail-panel-title">
            <strong>推荐标签</strong>
            <span>{recommendationTags.length ? '用于镜前建议' : '还未设置'}</span>
          </div>
          {detailEditing ? (
            <div className="bm-detail-tag-edit">
              {RECOMMENDATION_TAG_FIELDS.map(({ field, label, options }) => {
                const selected = parseTagText(detailDraft[field])
                return (
                <div key={field} className="bm-detail-tag-picker">
                  <span>{label}</span>
                  <div className="product-tag-picker">
                    {options.map(option => (
                      <button
                        key={option}
                        type="button"
                        className={selected.includes(option) ? 'active' : ''}
                        onClick={() => actions.onDraftChange(field, toggleTagValue(detailDraft[field], option))}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                )
              })}
            </div>
          ) : recommendationTags.length ? (
            <div className="bm-detail-tag-groups">
              {recommendationTags.map(group => (
                <div key={group.label}>
                  <span>{group.label}</span>
                  <div>
                    {group.items.map(item => <em key={item}>{item}</em>)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="bm-detail-field-copy">编辑产品后添加步骤、特点、区域和场景，镜前建议会更容易选到它。</p>
          )}
        </div>

        <div className="bm-detail-list">
          <div>
            <CalendarDays size={17} strokeWidth={1.7} />
            <span>备注</span>
            {detailEditing ? (
              <textarea
                value={detailDraft.notes || ''}
                onChange={event => actions.onDraftChange('notes', event.target.value)}
                placeholder="使用感受、适合肤质..."
              />
            ) : (
              <p>{selectedProduct.notes || '还没有记录使用感、妆效或回购想法。'}</p>
            )}
            <button
              type="button"
              aria-label="编辑备注"
              onClick={actions.onStartEdit}
            >
              <Pencil size={16} strokeWidth={1.7} />
            </button>
          </div>
          {expiryDate && (
            <div>
              <CalendarDays size={17} strokeWidth={1.7} />
              <span>预计到期</span>
              <p>{expiryDate}</p>
              <ChevronRight size={16} strokeWidth={1.7} />
            </div>
          )}
        </div>
      </section>

      <div className="bm-detail-actions">
        {detailEditing ? (
          <>
            <button type="button" onClick={actions.onCancelEdit}>
              <X size={18} strokeWidth={1.8} />
              取消
            </button>
            <button type="button" className="primary" onClick={actions.onSaveEdit} disabled={detailSaving}>
              <Check size={18} strokeWidth={1.8} />
              {detailSaving ? '保存中' : '保存'}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={actions.onStartEdit}>
              <Pencil size={18} strokeWidth={1.8} />
              编辑
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => actions.onRecordUsage(usagePercent + 5)}
            >
              <PlusCircle size={18} strokeWidth={1.8} />
              记录使用
            </button>
          </>
        )}
      </div>

      {viewImage && (
        <ImageViewer src={viewImage} onClose={actions.onImageViewerClose} />
      )}
    </>
  )
}
