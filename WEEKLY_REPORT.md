# Beauty Mirror 项目周报

**时间：** 2026年6月  
**项目：** Beauty Mirror（AI美妆与形象管理助手）  
**仓库：** [GitHub](https://github.com/qianz7884-blip/beauty_mirror)

---

## 本周完成工作

### 一、项目初始化与架构搭建

1. **Flask 后端搭建**
   - 使用 Flask + SQLAlchemy 构建 RESTful API
   - 定义 Product（产品）和 Diary（日记）两个核心数据模型
   - 实现完整的 CRUD 接口：增删改查产品、增删改查日记
   - 支持图片上传，自动生成缩略图（Pillow）
   - 数据库默认使用 SQLite，支持通过环境变量切换 MySQL/PostgreSQL

2. **React 前端搭建**
   - React 18 + Vite + React Router v6 单页应用
   - 移动端优先的卡片式界面，粉色主色调
   - 底部固定 Tab 导航（首页 / 产品 / 画廊 / 日记）
   - 图片上传预览、表单弹层、搜索筛选等交互

### 二、四大核心页面

| 页面 | 路由 | 功能 |
|------|------|------|
| 首页 Dashboard | `/` | 统计卡片（产品总数/日记总数/本月新增）、最近产品、最新日记 |
| 产品管理 | `/products` | 搜索、分类筛选、增删改产品、图片上传 |
| 我的化妆品 | `/gallery` | 网格卡片浏览所有产品图片 |
| 妆容日记 | `/diary` | 记录每日妆容、心情、搭配产品，关联已有产品 |

### 三、AI 识别可插拔框架

- 新建 `backend/recognizer.py`：`recognize_product(image_bytes)` 函数，当前返回空结果，后续接入 Claude Vision / GPT-4V 只需修改这一个文件
- 新建 `POST /api/recognize` 接口
- 新建 `frontend/src/components/RecognizePanel.jsx`：拍照/相册 → 识别 → 结果编辑 → 搜索官网图 → 确认保存
- 首页快速添加区改为 📸拍照识别 / 🖼️相册识别 两个入口

### 四、部署准备

- 后端：配置 `render.yaml` + `Procfile`，支持一键部署到 Render
- 前端：配置 `vercel.json`，支持部署到 Vercel（通过 `VITE_API_BASE_URL` 环境变量连接后端）
- 后端新增 `psycopg2-binary` 依赖（PostgreSQL 支持）
- 本地可正常启动前后端联调

### 五、代码版本管理

- 本地创建 `v1-green-pink` 标签，保存粉绿版效果
- 当前默认分支保留 pink+green 主题

---

## 技术栈总览

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | React 18 + Vite | 单页应用，HMR 热更新 |
| 路由 | React Router v6 | 4 个页面 + 404 兜底 |
| HTTP | Axios | 封装 API 请求 |
| 后端框架 | Flask | RESTful API |
| ORM | Flask-SQLAlchemy | 数据模型管理 |
| 数据库 | SQLite（可切换 MySQL/PG） | 本地零配置 |
| 图片处理 | Pillow | 缩略图生成 |
| 部署 | Render + Vercel | 后端/前端分离部署 |
| CSS | 原生 CSS + CSS 变量 | 移动端优先、粉色主题 |

---

## 后续待做

- [ ] 接入真实 AI 视觉识别（改 `recognizer.py` 一个文件即可）
- [ ] 将后端部署到 Render，前端部署到 Vercel
- [ ] 推送 `v1-green-pink` 标签至 GitHub（当前网络受限）
- [ ] API 认证/用户系统
- [ ] 数据导出功能

---

## 项目结构

```
beauty_mirror/
├── backend/
│   ├── app.py              # Flask 应用 + API 路由
│   ├── models.py           # Product & Diary 数据模型
│   ├── config.py           # 数据库配置
│   ├── recognizer.py       # AI 识别（可插拔）
│   ├── requirements.txt    # Python 依赖
│   ├── Procfile            # Render 部署
│   └── uploads/            # 上传图片目录
├── frontend/
│   ├── src/
│   │   ├── App.jsx         # 路由定义
│   │   ├── api.js          # API 封装 + 图片URL工具
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx       # 首页统计
│   │   │   ├── ProductManage.jsx   # 产品管理
│   │   │   ├── MyCosmetics.jsx     # 画廊浏览
│   │   │   └── MakeupDiary.jsx     # 妆容日记
│   │   ├── components/
│   │   │   ├── Layout.jsx          # 布局+底部导航
│   │   │   ├── ProductForm.jsx     # 产品表单弹层
│   │   │   ├── DiaryForm.jsx       # 日记表单弹层
│   │   │   ├── ProductCard.jsx     # 产品卡片
│   │   │   ├── DiaryCard.jsx       # 日记卡片
│   │   │   └── RecognizePanel.jsx  # AI 识别面板
│   │   └── styles/
│   │       └── index.css           # 全局样式（679行）
│   ├── index.html
│   ├── vite.config.js
│   └── vercel.json
├── render.yaml                # Render 部署配置
├── README.md
└── WEEKLY_REPORT.md           # 本文件
```
