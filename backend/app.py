import os

from flask import Flask
from flask_cors import CORS

from config import Config
from models import Product, db
from routes.common import DEFAULT_DEMO_USER_ID
from routes import register_routes


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app)

    _ensure_local_paths(app)
    db.init_app(app)
    register_routes(app)

    with app.app_context():
        db.create_all()
        _migrate_database()
        _seed_product_knowledge()

    return app


def _ensure_local_paths(app):
    uri = app.config['SQLALCHEMY_DATABASE_URI']
    if uri.startswith('sqlite:///'):
        db_path = uri.replace('sqlite:///', '')
        os.makedirs(os.path.dirname(db_path), exist_ok=True)

    os.makedirs(app.config['UPLOAD_FOLDER_PRODUCTS'], exist_ok=True)
    os.makedirs(app.config['UPLOAD_FOLDER_DIARY'], exist_ok=True)
    os.makedirs(app.config['UPLOAD_FOLDER_SKIN'], exist_ok=True)


def _column_names(inspector, table_name):
    try:
        return [column['name'] for column in inspector.get_columns(table_name)]
    except Exception:
        return []


def _add_column(conn, existing_columns, table_name, column_name, ddl):
    if column_name not in existing_columns:
        from sqlalchemy import text

        conn.execute(text(f'ALTER TABLE {table_name} ADD COLUMN {ddl}'))


def _migrate_database():
    """Small compatibility migrations for existing local SQLite databases."""
    try:
        from sqlalchemy import inspect, text

        inspector = inspect(db.engine)
        with db.engine.connect() as conn:
            diary_columns = _column_names(inspector, 'diaries')
            _add_column(conn, diary_columns, 'diaries', 'user_id', f"user_id VARCHAR(80) DEFAULT '{DEFAULT_DEMO_USER_ID}'")
            _add_column(conn, diary_columns, 'diaries', 'tags', "tags TEXT NOT NULL DEFAULT '[]'")
            _add_column(
                conn,
                diary_columns,
                'diaries',
                'skin_analysis_id',
                'skin_analysis_id INTEGER REFERENCES skin_analyses(id)',
            )

            product_columns = _column_names(inspector, 'products')
            _add_column(conn, product_columns, 'products', 'user_id', f"user_id VARCHAR(80) DEFAULT '{DEFAULT_DEMO_USER_ID}'")
            _add_column(conn, product_columns, 'products', 'volume', "volume VARCHAR(50) DEFAULT ''")
            _add_column(conn, product_columns, 'products', 'usage_percent', "usage_percent INTEGER DEFAULT 0")
            _add_column(conn, product_columns, 'products', 'ingredients', "ingredients TEXT DEFAULT ''")
            _add_column(conn, product_columns, 'products', 'efficacy', "efficacy TEXT DEFAULT ''")
            _add_column(
                conn,
                product_columns,
                'products',
                'suitable_skin',
                "suitable_skin VARCHAR(50) DEFAULT ''",
            )
            _add_column(
                conn,
                product_columns,
                'products',
                'usage_instructions',
                "usage_instructions TEXT DEFAULT ''",
            )
            _add_column(conn, product_columns, 'products', 'source', "source VARCHAR(20) DEFAULT 'manual'")

            analysis_columns = _column_names(inspector, 'skin_analyses')
            _add_column(conn, analysis_columns, 'skin_analyses', 'user_id', f"user_id VARCHAR(80) DEFAULT '{DEFAULT_DEMO_USER_ID}'")
            _add_column(conn, analysis_columns, 'skin_analyses', 'today_status', "today_status TEXT DEFAULT ''")
            _add_column(conn, analysis_columns, 'skin_analyses', 'observations', "observations TEXT DEFAULT '[]'")
            _add_column(conn, analysis_columns, 'skin_analyses', 'mirror_advice', "mirror_advice TEXT DEFAULT '[]'")
            _add_column(conn, analysis_columns, 'skin_analyses', 'today_routine', "today_routine TEXT DEFAULT '{}'")
            _add_column(conn, analysis_columns, 'skin_analyses', 'trend', "trend TEXT DEFAULT '{}'")

            conn.execute(
                text('UPDATE diaries SET user_id = :user_id WHERE user_id IS NULL OR user_id = ""'),
                {'user_id': DEFAULT_DEMO_USER_ID},
            )
            conn.execute(
                text('UPDATE products SET user_id = :user_id WHERE user_id IS NULL OR user_id = ""'),
                {'user_id': DEFAULT_DEMO_USER_ID},
            )
            conn.execute(
                text('UPDATE skin_analyses SET user_id = :user_id WHERE user_id IS NULL OR user_id = ""'),
                {'user_id': DEFAULT_DEMO_USER_ID},
            )

            conn.commit()
    except Exception as exc:
        print(f'[migrate] 数据库迁移失败: {exc}')


def _seed_product_knowledge():
    """Seed product knowledge when the product table is empty."""
    try:
        from product_knowledge import ProductKnowledge

        if Product.query.count() == 0:
            count = ProductKnowledge(db.session).seed_knowledge_base()
            if count > 0:
                print(f'[app] 产品知识库初始化完成: {count} 条种子数据')
    except Exception as exc:
        print(f'[app] 种子知识写入失败: {exc}')


app = create_app()


if __name__ == '__main__':
    import socket

    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname)
    port = int(os.environ.get('PORT', 5000))
    print('=' * 50)
    print('  Beauty Mirror API Started!')
    print(f'  Local:  http://127.0.0.1:{port}')
    print(f'  Mobile: http://{local_ip}:{port}')
    print('=' * 50)
    app.run(debug=True, host='0.0.0.0', port=port)
