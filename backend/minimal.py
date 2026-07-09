"""最小 Flask 应用 — 验证 Render 管道是否正常"""
from flask import Flask, jsonify

app = Flask(__name__)


@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'msg': 'minimal test works!'})


@app.route('/')
def root():
    return jsonify({'msg': 'hello from minimal app', 'routes': [r.rule for r in app.url_map.iter_rules()]})
