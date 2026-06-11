# Beauty Mirror

Beauty Mirror 是一个用于管理化妆品和妆容日记的全栈小项目，前端使用 React + Vite，后端使用 Flask + SQLAlchemy，支持化妆品管理、妆容日记记录、图片上传和首页统计概览。

## 功能

- 首页统计：展示化妆品总数、日记总数、本月新增数量、最近添加的产品和最新日记。
- 化妆品管理：支持新增、编辑、删除、搜索和分类筛选。
- 妆容日记：支持新增、编辑、删除，并可关联已添加的化妆品。
- 我的化妆品：按分类浏览已保存的化妆品卡片。
- 图片上传：产品和日记都支持上传图片，并在页面中展示。

## 技术栈

- 前端：React、React Router、Axios、Vite
- 后端：Flask、Flask-SQLAlchemy、Flask-CORS、Pillow
- 数据库：本地默认使用 SQLite，也支持通过环境变量切换到 MySQL 或其他数据库

## 项目结构

```text
beauty_mirror/
├─ backend/
│  ├─ app.py
│  ├─ config.py
│  ├─ models.py
│  └─ requirements.txt
├─ frontend/
│  ├─ package.json
│  ├─ vite.config.js
│  └─ src/
└─ README.md
```

## 运行环境

- Python 3.10+
- Node.js 18+
- npm

## 本地运行

项目需要同时启动后端和前端。

### 1. 启动后端

在项目根目录执行：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python backend\app.py
```

后端默认运行在：

- http://127.0.0.1:5000

首次启动时会自动创建数据库文件和上传目录。

### 2. 启动前端

另开一个终端，在项目根目录执行：

```powershell
cd frontend
npm install
npm run dev
```

前端默认运行在：

- http://127.0.0.1:3000

前端已经配置了代理，`/api` 和 `/uploads` 会转发到后端，所以本地开发时不用手动改接口地址。

## 配置说明

后端配置位于 [backend/config.py](backend/config.py)。

- 默认使用 SQLite，数据库文件会保存在 backend/instance/beauty.db
- 如果设置了 `DATABASE_URL`，会优先使用该地址
- 如果设置了 MySQL 相关环境变量，则会切换到 MySQL

可用环境变量如下：

- `DATABASE_URL`
- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DB`
- `SECRET_KEY`
- `PORT`

## 接口概览

后端主要接口包括：

- `GET /api/dashboard`
- `GET /api/products`
- `POST /api/products`
- `PUT /api/products/<id>`
- `DELETE /api/products/<id>`
- `GET /api/diary`
- `POST /api/diary`
- `PUT /api/diary/<id>`
- `DELETE /api/diary/<id>`

图片访问地址以 `/uploads/...` 形式提供。

## 说明

- 前端页面入口由 [frontend/src/App.jsx](frontend/src/App.jsx) 定义，包含首页、产品、画廊和日记四个页面。
- 数据模型定义在 [backend/models.py](backend/models.py)，产品和日记都支持图片字段。
- 如果你已经在仓库里安装过依赖，建议保留 `.gitignore` 中对 `frontend/node_modules/`、`frontend/dist/`、`backend/__pycache__/` 和 `instance/` 的忽略规则。
