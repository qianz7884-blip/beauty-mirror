"""健康检查端点 — 零依赖，供 Render 检测服务是否正常启动"""
from flask import Blueprint, jsonify

health_bp = Blueprint('health', __name__, url_prefix='/api')


@health_bp.route('/health')
def health():
    return jsonify({'status': 'ok'})


@health_bp.route('/health/face-parsing')
def face_parsing_health():
    """Diagnostic endpoint: confirms that the deployed ONNX model can be loaded."""
    try:
        from face_parsing import get_face_parsing_status

        status = get_face_parsing_status(ensure_session=True)
        return jsonify({
            'status': 'ok' if status.get('ready') else 'degraded',
            'face_parsing': {
                'enabled': status.get('enabled', False),
                'model_exists': status.get('model_exists', False),
                'model_size_bytes': status.get('model_size_bytes', 0),
                'session_ready': status.get('session_ready', False),
                'ready': status.get('ready', False),
                'error': status.get('session_error') or status.get('inference_error') or '',
            },
        })
    except Exception as exc:
        return jsonify({
            'status': 'degraded',
            'face_parsing': {
                'enabled': False,
                'model_exists': False,
                'session_ready': False,
                'ready': False,
                'error': str(exc),
            },
        })
