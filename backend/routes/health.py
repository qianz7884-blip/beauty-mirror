"""健康检查端点 — 零依赖，供 Render 检测服务是否正常启动"""
from flask import Blueprint, jsonify

health_bp = Blueprint('health', __name__, url_prefix='/api')


@health_bp.route('/health')
def health():
    return jsonify({'status': 'ok'})
