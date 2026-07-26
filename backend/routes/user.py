import os
from datetime import datetime

from flask import Blueprint, current_app, jsonify

from models import Diary, Product, SkinAnalysis, TutorialPlan, db

from .common import DEFAULT_DEMO_USER_ID, get_current_user_id

user_bp = Blueprint('user', __name__, url_prefix='/api')


def _user_products_query(user_id):
    return Product.query.filter(
        Product.user_id == user_id,
        db.or_(Product.source.is_(None), Product.source != 'knowledge_base'),
    )


def _counts_for_user(user_id):
    product_count = _user_products_query(user_id).count()
    diary_count = Diary.query.filter(Diary.user_id == user_id).count()
    analysis_count = SkinAnalysis.query.filter(SkinAnalysis.user_id == user_id).count()
    tutorial_plan_count = TutorialPlan.query.filter(TutorialPlan.user_id == user_id).count()
    return {
        'products': product_count,
        'diaries': diary_count,
        'skin_analyses': analysis_count,
        'tutorial_plans': tutorial_plan_count,
        'total_records': product_count + diary_count + analysis_count + tutorial_plan_count,
    }


def _format_dt(value):
    return value.strftime('%Y-%m-%d %H:%M') if value else ''


def _last_activity_at(user_id):
    latest_items = [
        _user_products_query(user_id).order_by(Product.created_at.desc()).first(),
        Diary.query.filter(Diary.user_id == user_id).order_by(Diary.created_at.desc()).first(),
        SkinAnalysis.query.filter(SkinAnalysis.user_id == user_id).order_by(SkinAnalysis.created_at.desc()).first(),
        TutorialPlan.query.filter(TutorialPlan.user_id == user_id).order_by(TutorialPlan.created_at.desc()).first(),
    ]
    dates = [item.created_at for item in latest_items if item and item.created_at]
    return _format_dt(max(dates)) if dates else ''


def _relative_db_path(db_path):
    try:
        project_root = os.path.abspath(os.path.join(current_app.root_path, os.pardir))
        return os.path.relpath(db_path, project_root).replace(os.sep, '/')
    except Exception:
        return os.path.basename(db_path)


def _sqlite_write_probe():
    conn = None
    try:
        with db.engine.connect() as conn:
            conn.exec_driver_sql('BEGIN')
            conn.exec_driver_sql('UPDATE diaries SET user_id = user_id WHERE 1 = 0')
            conn.exec_driver_sql('ROLLBACK')
        return True, ''
    except Exception as exc:
        if conn is not None:
            try:
                conn.exec_driver_sql('ROLLBACK')
            except Exception:
                pass
        return False, str(exc)


def _database_status():
    uri = current_app.config.get('SQLALCHEMY_DATABASE_URI', '')
    if not uri.startswith('sqlite:///'):
        return {
            'engine': 'PostgreSQL/MySQL',
            'mode': 'cloud',
            'exists': True,
            'writable': True,
            'relative_path': '',
            'size_mb': None,
            'message': '正在使用外部数据库。',
        }

    db_path = os.path.abspath(uri.replace('sqlite:///', '', 1))
    exists = os.path.exists(db_path)
    directory = os.path.dirname(db_path)
    file_writable = os.access(db_path, os.W_OK) if exists else None
    directory_writable = os.access(directory, os.W_OK)
    permission_writable = bool(file_writable if exists else directory_writable)
    writable, write_error = _sqlite_write_probe() if exists else (directory_writable, '')

    if exists and writable:
        message = f'正在使用 { _relative_db_path(db_path) }，文件可写。'
    elif exists:
        message = f'正在使用 { _relative_db_path(db_path) }，但当前进程不可写。'
    else:
        message = f'{ _relative_db_path(db_path) } 尚未生成，下一次写入会创建。'

    return {
        'engine': 'SQLite',
        'mode': 'local',
        'exists': exists,
        'writable': writable,
        'permission_writable': permission_writable,
        'write_error': write_error,
        'relative_path': _relative_db_path(db_path),
        'size_mb': round(os.path.getsize(db_path) / 1024 / 1024, 2) if exists else 0,
        'message': message,
    }


def _session_payload(user_id):
    upload_storage = current_app.config.get('UPLOAD_STORAGE', 'local_ephemeral')
    database = _database_status()
    persistence_ready = database.get('mode') == 'cloud' and upload_storage != 'local_ephemeral'

    return {
        'user_id': user_id,
        'short_user_id': user_id[-8:] if len(user_id) > 8 else user_id,
        'is_demo_user': user_id == DEFAULT_DEMO_USER_ID,
        'counts': _counts_for_user(user_id),
        'last_activity_at': _last_activity_at(user_id),
        'knowledge_base_products': Product.query.filter(Product.source == 'knowledge_base').count(),
        'database': database,
        'storage': {
            'backend': upload_storage,
            'persistent': upload_storage != 'local_ephemeral',
            'message': (
                '上传图片保存在云图片存储中。'
                if upload_storage != 'local_ephemeral'
                else '上传图片保存在服务本地目录；云端部署重启后可能丢失。'
            ),
        },
        'persistence_ready': persistence_ready,
        'scope': 'device_anonymous_profile',
    }


@user_bp.route('/user/session')
def user_session():
    return jsonify(_session_payload(get_current_user_id()))


@user_bp.route('/user/export')
def user_export():
    user_id = get_current_user_id()
    payload = {
        'schema_version': 2,
        'exported_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'user_id': user_id,
        'counts': _counts_for_user(user_id),
        'products': [item.to_dict() for item in _user_products_query(user_id).order_by(Product.created_at.desc()).all()],
        'diaries': [
            item.to_dict()
            for item in Diary.query.filter(Diary.user_id == user_id).order_by(Diary.created_at.desc()).all()
        ],
        'skin_analyses': [
            item.to_dict()
            for item in SkinAnalysis.query.filter(SkinAnalysis.user_id == user_id)
            .order_by(SkinAnalysis.created_at.desc())
            .all()
        ],
        'tutorial_plans': [
            item.to_dict()
            for item in TutorialPlan.query.filter(TutorialPlan.user_id == user_id)
            .order_by(TutorialPlan.created_at.desc())
            .all()
        ],
    }
    return jsonify(payload)
