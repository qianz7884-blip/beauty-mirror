FROM python:3.11-slim-bookworm

# ── 系统依赖：MediaPipe/OpenCV 运行时所需的 Mesa/GL 库 ──────────
# libgl1 libgles2 libegl1 → libglvnd 分发库（GL/GLES/EGL）
# libglx-mesa0 libegl-mesa0 libgl1-mesa-dri → Mesa 渲染后端（含 swrast 软件渲染器）
# libglib2.0-0 → GLib 运行时（MediaPipe 某些模块依赖）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libgles2 \
    libegl1 \
    libglx-mesa0 \
    libegl-mesa0 \
    libgl1-mesa-dri \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── 先复制依赖清单，普通代码变更可复用依赖安装层 ──────────────
COPY requirements.txt .

# ── 安装 Python 依赖 ──────────────────────────────────────────
# 关键：先装 headless OpenCV（零 GL 依赖），再装其他依赖时排除 mediapipe，
# 最后单独装 mediapipe（--no-deps 防止它拉入 GUI 版 opencv）
RUN pip install --no-cache-dir opencv-contrib-python-headless \
    && grep -v "^mediapipe" requirements.txt > /tmp/reqs_no_mp.txt \
    && pip install --no-cache-dir -r /tmp/reqs_no_mp.txt \
    && pip install --no-cache-dir --no-deps mediapipe

# ── 最后复制应用代码 ──────────────────────────────────────────
COPY . .

# ── 强制 MediaPipe 使用 CPU + 无头 EGL ─────────────────────────
ENV MEDIAPIPE_DISABLE_GPU=1 \
    EGL_PLATFORM=surfaceless

# ── 启动（--preload 让 gunicorn 在接收请求前加载 app，启动错误立即可见）─
CMD gunicorn app:app --bind 0.0.0.0:$PORT --timeout 120 --workers 1 --threads 2
