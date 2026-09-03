# 前端 CSS 修改边界文档

本文档用于约束 Mirror Mate 前端 CSS 的后续修改范围。每次改样式前先按本文档判断能不能改、怎么改、怎么验证；改动过程中发现新的规则、风险或惯例，也应同步补充到本文档。

## 目标

- 严格保持现有视觉效果、布局、交互和功能逻辑基本不变。
- 逐步建立统一 design tokens，减少硬编码值和重复样式。
- 降低全局样式污染，让页面级样式更容易维护。
- CSS 重构期间不修改后端接口、路由、状态逻辑、算法逻辑或 JSX DOM 结构。

## 硬边界

- 不随意重命名 `className`；如确实需要，必须同步所有引用。
- 不为了方便写 CSS 而调整 JSX DOM 结构。
- 不在 CSS 重构中修改后端文件、API 调用、路由、状态管理或算法逻辑。
- 不新增 `button`、`h1`、`h2`、`img`、`input`、`textarea` 等过宽裸全局选择器；如必须设置基础行为，应通过明确的应用或页面作用域包裹。
- 不删除疑似未使用样式，除非已经做过精确源码搜索和动态 class 检查。
- 不一次性重写整个 CSS 文件。
- 不把业务差异明显、视觉意图明确的页面样式强行抽象成公共工具类。

## 允许修改

- 将硬编码颜色、字号、间距、圆角、阴影等替换为等值 token。
- 为高频重复值补充语义化 design tokens。
- 抽取真正重复的按钮、输入框、弹层、卡片、面板等公共样式。
- 业务含义明显的页面样式可以继续保留在页面或模块 CSS 中。
- 全局搜索确认无引用后，可以删除废弃 CSS。
- 可以修复无效、重复、乱码或不可读的 CSS 注释。

## 当前 Token 来源

主 token 定义在：

- `frontend/src/styles/foundation.css`

颜色 token 当前以 `foundation.css` 中的 `--bm-*` 为唯一 canonical 来源，按三层管理：

- `--bm-palette-*`：只保存原始色值，不直接在页面样式里使用，优先用于定义语义 token 和旧 token 默认值。
- `--bm-color-*`：语义化 canonical token，页面样式和公共样式后续优先使用这一层。
- 旧 token / 页面级 token：暂时保留为 alias，不直接删除；删除前必须全局搜索确认无引用。

已有页面级别别名可以暂时保留，但后续应尽量指向统一 `--bm-color-*`：

- `app-shell.css` 中的 `--bm-*`
- `mirror-refresh.css` 中的 `--mirror-*`

历史 token 处理规则：

- `--primary`、`--primary-light`、`--primary-dark` 当前仍被主题设置逻辑动态写入，必须保留。
- `--accent`、`--accent-light`、`--bg`、`--card-bg`、`--text`、`--text-light`、`--border`、`--score-*` 暂时保留为旧 alias。
- `--bm-color-ink`、`--bm-color-muted`、`--bm-color-blue` 等早期 `--bm-color-*` 命名暂时保留为兼容 alias，新代码优先使用 `--bm-color-text-*`、`--bm-color-action-*`、`--bm-color-brand-*`。
- 页面或业务专属颜色，例如产品占位图、教程引导线、肤质状态、天气状态等，不在未确认复用前强行提升到全局 token。

颜色迁移阶段只整理颜色 token。字号、间距、圆角、阴影、模糊等类别不随颜色迁移一起调整。

圆角 token 当前以 `foundation.css` 中的 `--bm-radius-*` 为 canonical 来源：

- 常规单值圆角优先使用 `--bm-radius-xs`、`--bm-radius-sm`、`--bm-radius-base`、`--bm-radius-md`、`--bm-radius-lg`、`--bm-radius-xl`、`--bm-radius-card`、`--bm-radius-2xl`。
- 胶囊和正圆分别使用 `--bm-radius-pill`、`--bm-radius-circle`。
- 旧 token `--radius`、`--radius-sm` 暂时保留为 alias，不直接删除。
- 页面级 `--bm-radius` 暂时保留为迁移过渡；新代码不继续新增页面级 radius alias。
- 复合圆角、特殊造型圆角、插画资产内的局部 `--radius` 不强行迁移。

radius 阶段只整理 `border-radius` / radius token。颜色、字号、间距、阴影、模糊等类别不随该阶段一起调整。

字号 token 当前以 `foundation.css` 中的 `--bm-font-size-*` 为 canonical 来源：

- 只做等值映射，不为了减少字号种类而修改现有实际字号值。
- 现有 canonical token 覆盖的字号为 `9px`、`10px`、`11px`、`12px`、`13px`、`14px`、`15px`、`16px`、`18px`、`22px`，页面样式中可无损替换为对应 `--bm-font-size-*`。
- 如果硬编码字号无法无损映射到现有 canonical token，例如 `17px`、`19px`、`20px`、`21px`、`23px`、`24px`、`26px`、`28px`、`30px`、`31px`、`32px`、`34px`、`35px`、`42px` 或 `clamp()` / `calc()` 等表达式，暂时保留，不强行归并。
- 本轮不处理 `line-height`、`font-weight`、`letter-spacing`，也不借字号迁移调整排版节奏。
- JSX inline style 和插画 HTML 中的字号先不纳入 CSS token 迁移，除非后续单独确认范围。
- 如后续发现旧字号 token，先保留为 alias；删除前必须全局搜索确认无引用。

间距 token 当前以 `foundation.css` 中的 `--bm-space-*` 为 canonical 来源：

- 本阶段只处理 `margin`、`padding`、`gap`、`row-gap`、`column-gap` 及其方向属性。
- 不处理 `width`、`height`、`top`、`right`、`bottom`、`left`、`transform`、`line-height`，也不借 spacing 迁移调整布局密度。
- 只允许等值映射；不允许为了减少 token 数量、凑齐 spacing scale 或统一命名而修改实际间距值。
- `0` 不需要 token 化，除非后续出现明确需求。
- 单值间距和所有值都可明确映射的简单 shorthand 可以迁移；连续四值 shorthand、响应式规则、页面主布局和复杂卡片内部布局应保守处理。
- 负 margin、`calc()`、`clamp()`、`max()`、`min()`、百分比、viewport 单位、safe-area 相关表达式暂不迁移，只统计和记录。
- 页面或组件专属间距，例如热力图间距、绝对定位附近的补偿间距、移动端光学校正值，先保留在局部样式中。
- JSX inline style 和插画 HTML 中的 spacing 不纳入本轮 CSS token 迁移，除非后续单独确认范围。
- 页面级 spacing token 暂时保留；如其含义完全等于 canonical token，可改为 alias。删除任何旧 spacing token 前必须全局搜索确认无引用。

阴影 token 当前以 `foundation.css` 中的 `--bm-shadow-*` 为 canonical 来源：

- 本阶段只处理 `box-shadow` 和 `filter: drop-shadow(...)`。
- 只允许把与现有 canonical token 完全等值的硬编码阴影替换为 `--bm-shadow-*`，不得调整偏移、模糊、扩散、颜色或透明度来适配 token。
- `--bm-shadow-soft`、`--bm-shadow-card`、`--bm-shadow-panel`、`--bm-shadow-glass`、`--bm-shadow-sheet` 是当前全局 canonical 阴影 token。
- 旧 `--shadow`、`--shadow-hover` 暂时保留；它们的值与现有 `--bm-shadow-*` 不完全等同，不强行 alias。
- 页面级 `--bm-shadow`、`--mirror-shadow`、业务局部 `--heatmap-shadow` / `--d-shadow-*` 暂时保留，不直接删除。
- `none` / `none !important`、多层 shadow、`inset`、focus ring、描边型 shadow、品牌色或状态色 shadow、`color-mix()`、drop-shadow 插画投影先保留在局部样式中。
- JSX inline style 和插画 HTML 中的 shadow 不纳入本轮 CSS token 迁移，除非后续单独确认范围。
- 删除任何旧 shadow token 前必须全局搜索确认无引用，并确认不会改变主题设置逻辑。

优先 token 化这些高频重复值：

- 主文字色、弱化文字色
- 蓝色操作色
- 玻璃面背景和白色透明面
- 蓝灰边线
- 常用圆角：胶囊、圆形、14px、18px、22px
- 常用字号：12px、13px、14px、15px、18px、22px
- 常用间距：优先从高频且稳定的偶数刻度中选择，不为凑 scale 增加项目中不存在或语义不清的值
- 常用蓝灰阴影

## 推荐重构顺序

CSS 重构按以下顺序小步推进：

1. design tokens
2. 公共组件样式
3. 页面或模块样式
4. 已确认废弃 CSS 清理
5. 构建与检查

避免在一次改动里混合过多阶段，导致 diff 难以审阅和回退。

## 公共样式原则

- 优先复用现有公共类：`.btn`、`.form-input`、`.modal-*`、`.card` 以及当前玻璃面板分组选择器。
- 只有当一个抽象能消除真实重复、降低维护成本时，才新增公共样式。
- 优先使用明确作用域选择器，例如 `.product-form .form-input`、`.bm-vault-tabs button`。
- `textarea.form-input`、`select.form-input` 这类带 class 限定的元素选择器可以保留。
- 保留动态 class 规则，例如天气状态、品类占位图、toast 状态、`active` / `selected` 修饰类等。

## 废弃 CSS 清理规则

删除任何选择器前，必须先做以下检查：

1. 在 `frontend/src/pages`、`frontend/src/components`、`frontend/src/utils` 中做精确源码搜索。
2. 检查是否可能由模板字符串或拼接逻辑动态生成。
3. 检查它是否只是某个更长 class 的一部分，而不是独立 class。
4. 只有确认没有直接引用和动态引用后再删除。
5. 删除后执行验证清单。

不要只依赖子串搜索。例如 `empty-state` 可能只是 `bm-video-empty-state` 的一部分，不能因此判断 `empty-state` 被直接使用。

废弃 CSS 清理应小步进行：

- 优先处理只在 CSS 中出现、语义上属于旧实现残留、且不影响当前公共组件契约的规则。
- 对基础公共类、状态类、动态 class 前缀和跨文件覆盖链，哪怕暂时没有 JSX 精确命中，也应先归入“暂不处理”。
- 清理跨文件残留时，不要为了删除一个孤立规则而顺手整理大文件；应单独开下一轮确认范围。
- 每轮删除后记录“已删除 / 保留 / 暂不处理”的原因，避免后续重复判断。

当前已确认清理记录：

- `foundation.css`：旧自定义确认弹窗 `.confirm-*`、未引用的 `.card-title`、未引用的 `.product-chips`。
- `skin.css`：旧版肤况区域卡片 `.region-*`、旧 heatmap 图例 `.heatmap-legend*` / `.heatmap-dot` / `.heatmap-low` / `.heatmap-mid` / `.heatmap-high`、旧 dashboard 历史卡片 `.skin-dashboard-*`。
- `mirror-refresh.css`：未引用的旧 heatmap 状态色 `.heatmap-low` / `.heatmap-mid` / `.heatmap-high`。
- `product-vault.css`：玻璃分组中仅指向旧 dashboard 残留的 `.skin-dashboard-card` / `.skin-dashboard-item` 入口。

## 验证清单

每次 CSS 重构至少执行：

```powershell
npm.cmd run build
git diff --check
rg -n "^\s*(button|h1|h2|h3|h4|h5|h6|img|input|textarea|select|label|p|a|ul|li)([\s\.{:#\[,]|$)" frontend\src\styles
```

删除 CSS 时，还要对被删 class 做精确搜索：

```powershell
rg -n --fixed-strings "<class-name>" frontend\src\pages frontend\src\components frontend\src\utils frontend\src\App.jsx frontend\src\main.jsx
```

如果改动影响 shared token、玻璃面板、弹层或按钮样式，应手动检查这些页面和场景：

- 首页
- 产品库
- 产品新增 / 编辑弹层
- 日记列表和日记详情
- 肤质分析弹层
- 教程页
- 我的 / 设置页

## 当前已知技术债

- `frontend/src/styles/product-vault.css` 仍然较大，应继续分区小步整理。
- 玻璃质感层目前仍有较大的 `:where(...)` 分组和 `!important`，在没有视觉回归截图前不要激进拆除。
- 项目里存在较多动态 class，删除样式前必须确认生成逻辑。
- 当前还没有自动化视觉回归基线。
- 部分业务插画、天气动画、教程页专属颜色应继续保留在局部样式中，等重复使用足够明确后再 token 化。

## 文档更新规则

后续 CSS 重构中，如果发现新的安全规则、风险点、动态 class 模式或重复样式模式，应在同一次改动中更新本文档。
