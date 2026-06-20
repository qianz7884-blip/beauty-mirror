import os
import re
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'beauty-mirror-secret-key-2024')

    # 数据库：优先 DATABASE_URL 环境变量（部署用），
    # 其次 MySQL 环境变量，最后 fallback 到本地 SQLite
    _db_url = os.environ.get('DATABASE_URL', '')
    if _db_url:
        _db_url = re.sub(r'^postgres://', 'postgresql://', _db_url)
        SQLALCHEMY_DATABASE_URI = _db_url
    elif os.environ.get('MYSQL_HOST'):
        MYSQL_HOST = os.environ['MYSQL_HOST']
        MYSQL_PORT = os.environ.get('MYSQL_PORT', '3306')
        MYSQL_USER = os.environ.get('MYSQL_USER', 'root')
        MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD', '')
        MYSQL_DB = os.environ.get('MYSQL_DB', 'beauty_mirror')
        SQLALCHEMY_DATABASE_URI = (
            f'mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@'
            f'{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}?charset=utf8mb4'
        )
    else:
        # 本地开发用 SQLite
        SQLALCHEMY_DATABASE_URI = f'sqlite:///{os.path.join(BASE_DIR, "instance", "beauty.db")}'

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_FOLDER_PRODUCTS = os.path.join(BASE_DIR, 'uploads', 'products')
    UPLOAD_FOLDER_DIARY = os.path.join(BASE_DIR, 'uploads', 'diary')
    UPLOAD_FOLDER_SKIN = os.path.join(BASE_DIR, 'uploads', 'skin')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB
