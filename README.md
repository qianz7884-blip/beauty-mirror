# Beauty Mirror

AI 美妆与形象管理全栈应用。前端 React + Vite，后端 Flask + SQLAlchemy，集成 **Google Gemini**、**MediaPipe Face Landmarker**、**本地轻量 RAG 皮肤知识库**和**产品知识库**。

## 功能

### 产品管理
- 新增、编辑、删除、搜索和分类筛选
- 列表 / 网格双视图切换，自定义分类
- 图片上传（文件 + URL）

### AI 产品识别
- 拍照或相册选图 → **Gemini 读取包装文字**（品牌 / 名称 / 分类 / 规格 / 关键文字）
- **Product Knowledge Base** 自动去重、匹配、富化——10 款种子产品知识（成分 / 功效 / 适合肤质 / 使用方法）
- 识别结果可编辑，确认后一键入库

### AI 肤质分析
- 拍照上传面部照片，完整分析管线：
  1. **MediaPipe Face Landmarker** — 478 个面部特征点检测
  2. **ROI 提取** — 前额 / 左脸颊 / 右脸颊 / 鼻子 / 下巴 / 左眼周 / 右眼周 / 唇周，共 8 区
  3. **Feature Extraction** — 纯 numpy/scipy 数值计算，从每区提取颜色 / 纹理 / 毛孔 / 斑点 / 光泽特征，Sigmoid 映射为 0-100 评分
  4. **RAG 知识增强** — 从本地 JSON 知识库按肤质和关注点检索参考知识，不额外调用 Embedding
  5. **Gemini 自然语言生成** — 只基于 Feature JSON 生成总结和建议，**不看图不评分**
  6. **热力图** — matplotlib 高斯扩散渲染面部热力图
- 分析历史自动保存

### 三庭五眼教程推荐
- 镜前检测同步计算三庭、五眼和面部长宽比例
- 教程页优先复用最近一次检测结果，不要求重复拍照
- 按比例标签、时间预算和场景生成抖音 / 小红书教程搜索方向

### 妆容日记
- 心情选择器 + 关联产品 + 图片上传
- 详情页查看完整记录

### 首页 Dashboard
- 统计卡片（产品 / 本月新增 / 日记 / 分析次数）
- 快速入口，最近产品 + 近期肤质分析

### 个人设置
- 肤质偏好、每日提醒开关

## 页面

| Tab | 路由 | 说明 |
|-----|------|------|
| 检测 | `/` | 镜前拍照、肤质与三庭五眼分析入口 |
| 教程 | `/tutorial` | 复用最近检测结果，推荐抖音 / 小红书教程方向 |
| 产品 | `/products` | 搜索 / 筛选 / 双视图 / CRUD |
| 日记 | `/diary` | 日记列表 + 心情 + 关联产品 |
| 我的 | `/profile` | 肤质偏好 + 提醒 + 关于 |

## 快速开始

### 环境要求

- **Python** 3.10+
- **Node.js** 18+
- **npm**

### 1. 配置 API Key

在项目根目录创建 `.env`：

```env
GEMINI_API_KEY=你的_Gemini_API_Key
```

> 免费申请：[Google AI Studio](https://aistudio.google.com/apikey)

### 2. 启动后端

```bash
# 安装依赖
pip install -r backend/requirements.txt

# 启动后端
python backend/app.py
```

后端运行在 `http://127.0.0.1:5000`。首次启动自动创建数据库、上传目录，并初始化产品种子知识库；皮肤参考知识直接读取本地 JSON。

### 固定图片校准

肤质数值是照片视觉特征的代理指标，不是医疗检测。修改评分公式后，将同一组正脸照片放入 `backend/calibration_images/`，运行：

```bash
cd backend
python calibrate_skin_scores.py calibration_images --repeat 3
```

脚本不调用 Gemini，会输出各图的 ROI 有效区域、评分、耗时和重复运行波动。建议固定保留 20～30 张不同光线、肤色和设备来源的测试图片；同一图片的各项分数波动应不超过 2 分。

### 3. 启动前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端运行在 `http://127.0.0.1:3000`。Vite 已配置代理——`/api` 和 `/uploads` 请求自动转发到后端 `5000` 端口。

### 打开浏览器

访问 **http://127.0.0.1:3000** 即可使用。

---

## 项目结构

```text
beauty_mirror/
├── .env
├── README.md
├── render.yaml
│
├── backend/
│   ├── app.py                    # Flask 入口 + 应用工厂 + 路由注册
│   ├── models.py                 # Product / Diary / SkinAnalysis 模型
│   ├── config.py                 # 数据库配置
│   ├── constants.py              # 共享分类 / 心情常量
│   ├── upload_utils.py           # 上传图片保存 / 下载 / 删除工具
│   ├── routes/                   # API Blueprint 路由
│   │   ├── dashboard.py
│   │   ├── products.py
│   │   ├── diary.py
│   │   ├── skin.py
│   │   └── uploads.py
│   │
│   ├── recognizer.py             # AI 产品识别（Gemini → 包装文字 OCR）
│   ├── product_knowledge.py      # 产品知识层（去重 / 匹配 / 富化 / 种子库）
│   │
│   ├── skin_analyzer.py          # 肤质分析管线（编排层）
│   ├── feature_extractor.py      # 皮肤特征提取（numpy/scipy 数值计算）
│   ├── face_regions.py           # MediaPipe → 8 区域定义 + ROI 裁剪
│   ├── heatmap_generator.py      # 面部热力图渲染（matplotlib 高斯扩散）
│   │
│   ├── knowledge_base/
│   │   ├── __init__.py
│   │   ├── vector_store.py       # 旧版可选向量检索模块（当前主流程不调用）
│   │   ├── skin_knowledge.json   # 皮肤科种子知识
│   │
│   ├── requirements.txt
│   ├── Procfile
│   ├── test_heatmap.py           # 热力图独立测试
│   ├── models/
│   │   └── face_landmarker.task  # MediaPipe 模型 (3.7MB)
│   └── uploads/
│       ├── products/
│       ├── diary/
│       └── skin/
│
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js            # 端口 3000，代理 → 5000
    ├── vercel.json
    └── src/
        ├── main.jsx
        ├── App.jsx               # 路由定义
        ├── api.js                # Axios 封装
        ├── categories.js         # 自定义分类管理
        ├── pages/
        │   ├── Dashboard.jsx
        │   ├── ProductManage.jsx
        │   ├── MakeupDiary.jsx
        │   ├── DiaryDetail.jsx
        │   ├── Tutorial.jsx
        │   └── Profile.jsx
        ├── components/
        │   ├── Layout.jsx
        │   ├── ProductAddSheet.jsx
        │   ├── ProductCard.jsx
        │   ├── ProductCategoryManager.jsx
        │   ├── ProductForm.jsx
        │   ├── ProductRecordActions.jsx
        │   ├── DiaryCard.jsx
        │   ├── DiaryForm.jsx
        │   ├── RecognizePanel.jsx
        │   ├── SkinAnalysisPanel.jsx
        │   ├── SkinHistoryViews.jsx
        │   └── ImageViewer.jsx
        ├── utils/
        │   ├── productCatalog.js
        │   ├── productEntry.js
        │   └── skinAnalysisView.js
        └── styles/
            ├── index.css          # 样式入口，仅维护导入顺序
            ├── foundation.css     # 基础变量 / 通用布局 / 通用组件
            ├── skin.css           # 肤质分析与历史记录样式
            ├── diary.css          # 日记列表 / 详情 / 表单样式
            ├── mirror-refresh.css # 镜前助手视觉刷新覆盖层
            ├── app-shell.css      # Aqua 主题壳层 / 首页 / 教程 / 我的
            └── product-vault.css  # 产品库 / 产品详情样式
```

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 18 + Vite 5 + React Router v6 | SPA，移动端优先 |
| HTTP | Axios | API 调用 |
| 后端 | Flask 3 | RESTful API |
| ORM | Flask-SQLAlchemy | 3 个数据模型 |
| 数据库 | SQLite（默认，支持 MySQL / PostgreSQL） | |
| AI 视觉 | Google Gemini (`gemini-2.5-flash`) | 产品包装文字识别 + 肤质自然语言生成 |
| 面部检测 | MediaPipe Face Landmarker | 478 点 |
| 特征提取 | numpy + scipy + Pillow | GLCM 纹理 / Lab & HSV 颜色 / 毛孔 / 斑点 / 光泽 |
| 轻量 RAG | 本地 JSON 关键词检索 | 单次分析不增加 Embedding 调用 |
| 图片存储 | 本地目录 / Cloudinary | 云部署推荐配置 Cloudinary |
| 热力图 | matplotlib + scipy | 高斯扩散面部热力图 |
| 部署 | Render + Vercel | 前后端分离 |

## 架构

### 肤质分析管线

```
拍照 → MediaPipe Face Mesh (478点)
     → ROI 提取 (8区域)
     → Feature Extraction (numpy/scipy 数值特征)
     → Feature JSON (每区域5维0-100评分 + 肤质分类 + 问题检测)
     → 本地知识检索 (JSON, 特征驱动查询)
     → Gemini 纯文本生成 (只看 Feature JSON, 不看图, 不评分)
     → 热力图渲染
     → 返回完整结果
```

### 产品识别管线

```
拍照 → Gemini 读取包装文字 (品牌/名称/分类/规格/关键文字)
     → Product JSON
     → Product Knowledge Base 去重 + 匹配 + 富化
     → 返回含知识的产品信息
     → 用户确认 → 入库
```

## API

### 产品

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/products` | 列表 (`?search=&category=`) |
| GET | `/api/products/<id>` | 详情 |
| POST | `/api/products` | 新增（multipart） |
| PUT | `/api/products/<id>` | 编辑 |
| DELETE | `/api/products/<id>` | 删除 |

### AI 识别

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/recognize` | Gemini 识别 → 知识库富化 |

### 产品知识库

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/product-knowledge` | 查询 (`?category=&skin_type=&keyword=`) |
| POST | `/api/product-knowledge/seed` | 手动写入种子知识 |

### 肤质分析

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/skin-analysis` | 提交照片进行分析 |
| GET | `/api/skin-analyses` | 分析历史列表 |
| GET | `/api/skin-analyses/<id>` | 单次分析详情 |
| DELETE | `/api/skin-analyses/<id>` | 删除 |

### 日记

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/diary` | 列表 |
| POST | `/api/diary` | 新增 |
| PUT | `/api/diary/<id>` | 编辑 |
| DELETE | `/api/diary/<id>` | 删除 |

### 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/dashboard` | 首页统计数据 |
| GET | `/uploads/<folder>/<filename>` | 静态资源 |

## 部署

### 展示版最快路径

展示版建议先用 **Render 部署后端 + Vercel 部署前端**：

1. 先把当前仓库推到 GitHub。
2. 在 Render 新建 Blueprint，选择本仓库，使用根目录的 `render.yaml`。
3. Render 后台填写 `GEMINI_API_KEY`，部署完成后记下后端地址，例如 `https://beauty-mirror-api.onrender.com`。
4. 在 Vercel 导入同一个仓库，Root Directory 选择 `frontend`。
5. Vercel 环境变量填写 `VITE_API_BASE_URL = https://你的后端.onrender.com`。
6. Vercel 部署完成后，用前端域名打开展示版。

本地开发默认使用 SQLite 和本地上传目录。Render 等云服务的文件系统是临时的，线上部署必须同时配置：

- `DATABASE_URL`：PostgreSQL 连接地址，用于产品、日记和分析记录。
- `CLOUDINARY_URL`：Cloudinary 连接地址，用于产品、日记和面部缩略图。

缺少任意一项时，“我的 → 设备身份数据”会明确显示持久化风险。Render 免费 PostgreSQL 适合短期演示，但有到期限制；长期运行请使用可持续的 PostgreSQL 实例。

### 后端 → Render

`render.yaml` 已配置：

- **Root Directory**: `backend`
- **Build**: `pip install -r requirements.txt`
- **Start**: `gunicorn app:app --bind 0.0.0.0:$PORT --timeout 120`
- **Python**: 3.11.9
- **Health Check**: `/api/health`

Render 需要配置：

- `GEMINI_API_KEY`：必填，用于产品识别、语音识别和镜前检测建议
- `SECRET_KEY`：`render.yaml` 会自动生成
- `GEMINI_MODEL`：默认 `gemini-2.5-flash`
- `DATABASE_URL`：线上必填，使用 PostgreSQL 保存结构化记录
- `CLOUDINARY_URL`：线上必填，使用 Cloudinary 保存上传图片

### 前端 → Vercel

1. 导入仓库，Root Directory 选 `frontend`
2. Build: `npm run build`，Output: `dist`
3. 环境变量 `VITE_API_BASE_URL = https://你的后端.onrender.com`

前端会自动把后端地址转换为 `/api` 请求，所以 `VITE_API_BASE_URL` 填 `https://你的后端.onrender.com` 或 `https://你的后端.onrender.com/api` 都可以。

## 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `GEMINI_API_KEY` | Google Gemini API Key | ✅ |
| `GEMINI_MODEL` | 模型名（默认 `gemini-2.5-flash`） | |
| `GEMINI_TIMEOUT` | API 超时秒数（默认 60） | |
| `DATABASE_URL` | 数据库连接地址（本地默认 SQLite，线上必填） | 线上 ✅ |
| `CLOUDINARY_URL` | 云图片存储连接地址（线上持久化上传图片） | 线上 ✅ |
| `SECRET_KEY` | Flask 密钥 | |
| `PORT` | 后端端口（云部署自动注入） | |
