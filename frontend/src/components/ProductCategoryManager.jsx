import { Plus, X } from 'lucide-react'
import { DEFAULT_CATEGORIES } from '../categories'

export default function ProductCategoryManager({
  customCategories,
  newCategory,
  onNewCategoryChange,
  onAddCategory,
  onDeleteCategory,
  onClose,
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="mirror-product-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>管理分类</h3>
          <button className="modal-close" type="button" aria-label="关闭" onClick={onClose}>
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>
        <div className="bm-category-create">
          <input
            value={newCategory}
            onChange={event => onNewCategoryChange(event.target.value)}
            placeholder="新增分类名称"
          />
          <button type="button" onClick={onAddCategory}>
            <Plus size={16} strokeWidth={1.8} />
            添加
          </button>
        </div>
        <div className="bm-category-manager">
          <p>系统分类</p>
          <div className="bm-category-chip-grid">
            {DEFAULT_CATEGORIES.map(cat => (
              <span key={cat}>{cat}</span>
            ))}
          </div>
          <p>自定义分类</p>
          {customCategories.length === 0 ? (
            <div className="bm-category-empty">还没有自定义分类</div>
          ) : (
            <div className="bm-category-custom-list">
              {customCategories.map(cat => (
                <div key={cat}>
                  <span>{cat}</span>
                  <button type="button" onClick={() => onDeleteCategory(cat)}>
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
