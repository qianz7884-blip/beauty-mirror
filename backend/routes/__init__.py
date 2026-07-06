from .health import health_bp
from .dashboard import dashboard_bp
from .diary import diary_bp
from .products import products_bp
from .skin import skin_bp
from .uploads import uploads_bp


def register_routes(app):
    app.register_blueprint(health_bp)      # /api/health — 零依赖，优先注册
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(products_bp)
    app.register_blueprint(diary_bp)
    app.register_blueprint(skin_bp)
    app.register_blueprint(uploads_bp)
