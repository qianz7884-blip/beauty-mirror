"""最小测试应用 — 验证 Docker + gunicorn 路由是否正常"""
from flask import Flask, jsonify

app = Flask(__name__)


@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'msg': 'minimal test app works!'})


@app.route('/api/dashboard')
def dashboard():
    return jsonify({'test': True, 'msg': 'dashboard route works'})


# Catch-all: 证明所有请求都能到达 Flask
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    return jsonify({'msg': f'catch-all: /{path}', 'routes': [r.rule for r in app.url_map.iter_rules()]})
