import os
import re

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'beauty-mirror-secret-key-2024')

    # 数据库：本地用 SQLite，Render 用 PostgreSQL（自动从环境变量读取）
    _db_url = os.environ.get('DATABASE_URL', '')
    if _db_url:
        # Render 提供的 URL 是 postgres:// 开头，SQLAlchemy 1.4+ 需要 postgresql://
        _db_url = re.sub(r'^postgres://', 'postgresql://', _db_url)
        SQLALCHEMY_DATABASE_URI = _db_url
    else:
        SQLALCHEMY_DATABASE_URI = f'sqlite:///{os.path.join(BASE_DIR, "instance", "beauty.db")}'

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_FOLDER_PRODUCTS = os.path.join(BASE_DIR, 'static', 'uploads', 'products')
    UPLOAD_FOLDER_DIARY = os.path.join(BASE_DIR, 'static', 'uploads', 'diary')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max upload
