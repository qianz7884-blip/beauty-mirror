import os
import uuid
import urllib.request
from io import BytesIO
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image

from config import Config
from models import db, Product, Diary, SkinAnalysis
from recognizer import recognize_product
from skin_analyzer import analyze_skin


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app)

    uri = app.config['SQLALCHEMY_DATABASE_URI']
    if uri.startswith('sqlite:///'):
        db_path = uri.replace('sqlite:///', '')
        os.makedirs(os.path.dirname(db_path), exist_ok=True)

    os.makedirs(app.config['UPLOAD_FOLDER_PRODUCTS'], exist_ok=True)
    os.makedirs(app.config['UPLOAD_FOLDER_DIARY'], exist_ok=True)
    os.makedirs(app.config['UPLOAD_FOLDER_SKIN'], exist_ok=True)

    db.init_app(app)

    with app.app_context():
        db.create_all()

    return app


app = create_app()

# ============================================================
# 常量
# ============================================================

CATEGORIES = ['全部', '面霜', '精华', '面膜', '洁面', '防晒', '其他']
MOODS = [
    ('😍', '超满意'),
    ('😊', '开心'),
    ('😐', '一般'),
    ('😢', '不满意'),
]


# ============================================================
# 工具函数
# ============================================================

def save_photo(file, folder):
    """保存上传图片，返回文件名"""
    if file and file.filename:
        ext = os.path.splitext(file.filename)[1] or '.jpg'
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(folder, filename)
        img = Image.open(file)
        img.thumbnail((800, 800))
        if img.mode == 'RGBA':
            img = img.convert('RGB')
        img.save(filepath, 'JPEG', quality=85)
        return filename
    return ''


def download_photo_from_url(url, folder):
    """从URL下载图片，保存到文件夹，返回文件名。失败返回空字符串"""
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
            content_type = resp.headers.get('Content-Type', '')

        # 判断扩展名：优先 Content-Type，其次 URL 后缀
        ext = '.jpg'
        if 'png' in content_type:
            ext = '.png'
        elif 'webp' in content_type:
            ext = '.webp'
        elif 'gif' in content_type:
            ext = '.gif'
        else:
            url_lower = url.lower()
            for e in ['.png', '.webp', '.gif', '.jpg', '.jpeg']:
                if e in url_lower:
                    ext = e if e != '.jpeg' else '.jpg'
                    break

        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(folder, filename)

        img = Image.open(BytesIO(data))
        img.thumbnail((800, 800))
        if img.mode == 'RGBA':
            img = img.convert('RGB')
        img.save(filepath, 'JPEG', quality=85)
        return filename
    except Exception:
        return ''


def delete_photo(filename, folder):
    """删除图片文件"""
    if filename:
        filepath = os.path.join(folder, filename)
        if os.path.exists(filepath):
            os.remove(filepath)


def error(msg, code=400):
    return jsonify({'error': msg}), code


# ============================================================
# Dashboard
# ============================================================

@app.route('/api/dashboard')
def dashboard():
    total_products = Product.query.count()
    total_diary = Diary.query.count()

    now = datetime.now()
    this_month = now.strftime('%Y-%m')
    monthly_products = Product.query.filter(
        Product.created_at.like(f'{this_month}%')
    ).count()

    recent_products = [p.to_dict() for p in Product.query.order_by(
        Product.created_at.desc()
    ).limit(4).all()]

    latest_diary = Diary.query.order_by(Diary.created_at.desc()).first()
    latest_diary_data = latest_diary.to_dict() if latest_diary else None

    recent_analyses = [a.to_dict() for a in SkinAnalysis.query.order_by(
        SkinAnalysis.created_at.desc()
    ).limit(5).all()]

    total_analyses = SkinAnalysis.query.count()

    return jsonify({
        'total_products': total_products,
        'total_diary': total_diary,
        'monthly_products': monthly_products,
        'total_analyses': total_analyses,
        'recent_products': recent_products,
        'latest_diary': latest_diary_data,
        'recent_analyses': recent_analyses,
    })


# ============================================================
# 产品 API
# ============================================================

@app.route('/api/products')
def product_list():
    search = request.args.get('search', '').strip()
    category = request.args.get('category', '').strip()

    query = Product.query
    if search:
        query = query.filter(
            db.or_(
                Product.name.contains(search),
                Product.brand.contains(search),
            )
        )
    if category and category != '全部':
        query = query.filter(Product.category == category)

    products = query.order_by(Product.created_at.desc()).all()
    return jsonify([p.to_dict() for p in products])


@app.route('/api/products/<int:pid>')
def product_detail(pid):
    product = db.session.get(Product, pid)
    if not product:
        return error('产品不存在', 404)
    return jsonify(product.to_dict())


@app.route('/api/products', methods=['POST'])
def product_create():
    name = request.form.get('name', '').strip()
    if not name:
        return error('产品名称不能为空')

    product = Product(
        name=name,
        brand=request.form.get('brand', '').strip(),
        category=request.form.get('category', '其他').strip(),
        color=request.form.get('color', '').strip(),
        purchase_date=request.form.get('purchase_date', '').strip(),
        price=float(request.form.get('price', 0) or 0),
        notes=request.form.get('notes', '').strip(),
    )

    photo_file = request.files.get('photo')
    if photo_file and photo_file.filename:
        product.photo = save_photo(photo_file, app.config['UPLOAD_FOLDER_PRODUCTS'])
    elif not product.photo:
        photo_url = request.form.get('photo_url', '').strip()
        if photo_url:
            product.photo = download_photo_from_url(photo_url, app.config['UPLOAD_FOLDER_PRODUCTS'])

    db.session.add(product)
    db.session.commit()
    return jsonify(product.to_dict()), 201


@app.route('/api/products/<int:pid>', methods=['PUT'])
def product_update(pid):
    product = db.session.get(Product, pid)
    if not product:
        return error('产品不存在', 404)

    product.name = request.form.get('name', '').strip()
    product.brand = request.form.get('brand', '').strip()
    product.category = request.form.get('category', '其他').strip()
    product.color = request.form.get('color', '').strip()
    product.purchase_date = request.form.get('purchase_date', '').strip()
    product.price = float(request.form.get('price', 0) or 0)
    product.notes = request.form.get('notes', '').strip()

    photo_file = request.files.get('photo')
    if photo_file and photo_file.filename:
        delete_photo(product.photo, app.config['UPLOAD_FOLDER_PRODUCTS'])
        product.photo = save_photo(photo_file, app.config['UPLOAD_FOLDER_PRODUCTS'])
    elif not product.photo:
        photo_url = request.form.get('photo_url', '').strip()
        if photo_url:
            product.photo = download_photo_from_url(photo_url, app.config['UPLOAD_FOLDER_PRODUCTS'])

    db.session.commit()
    return jsonify(product.to_dict())


@app.route('/api/products/<int:pid>', methods=['DELETE'])
def product_delete(pid):
    product = db.session.get(Product, pid)
    if not product:
        return error('产品不存在', 404)
    delete_photo(product.photo, app.config['UPLOAD_FOLDER_PRODUCTS'])
    db.session.delete(product)
    db.session.commit()
    return jsonify({'message': '已删除'})


# ============================================================
# 日记 API
# ============================================================

@app.route('/api/diary')
def diary_list():
    diaries = Diary.query.order_by(Diary.created_at.desc()).all()
    return jsonify([d.to_dict() for d in diaries])


@app.route('/api/diary/<int:did>')
def diary_detail(did):
    diary = db.session.get(Diary, did)
    if not diary:
        return error('日记不存在', 404)
    return jsonify(diary.to_dict())


@app.route('/api/diary', methods=['POST'])
def diary_create():
    title = request.form.get('title', '').strip()
    if not title:
        return error('日记标题不能为空')

    diary = Diary(
        title=title,
        content=request.form.get('content', '').strip(),
        mood=request.form.get('mood', '😊').strip(),
        created_date=request.form.get('created_date', datetime.now().strftime('%Y-%m-%d')).strip(),
    )

    product_ids = request.form.getlist('product_ids')
    diary.set_product_ids([int(pid) for pid in product_ids if pid])

    photo_file = request.files.get('photo')
    if photo_file:
        diary.photo = save_photo(photo_file, app.config['UPLOAD_FOLDER_DIARY'])

    db.session.add(diary)
    db.session.commit()
    return jsonify(diary.to_dict()), 201


@app.route('/api/diary/<int:did>', methods=['PUT'])
def diary_update(did):
    diary = db.session.get(Diary, did)
    if not diary:
        return error('日记不存在', 404)

    diary.title = request.form.get('title', '').strip()
    diary.content = request.form.get('content', '').strip()
    diary.mood = request.form.get('mood', '😊').strip()
    diary.created_date = request.form.get('created_date', '').strip()

    product_ids = request.form.getlist('product_ids')
    diary.set_product_ids([int(pid) for pid in product_ids if pid])

    photo_file = request.files.get('photo')
    if photo_file and photo_file.filename:
        delete_photo(diary.photo, app.config['UPLOAD_FOLDER_DIARY'])
        diary.photo = save_photo(photo_file, app.config['UPLOAD_FOLDER_DIARY'])

    db.session.commit()
    return jsonify(diary.to_dict())


@app.route('/api/diary/<int:did>', methods=['DELETE'])
def diary_delete(did):
    diary = db.session.get(Diary, did)
    if not diary:
        return error('日记不存在', 404)
    delete_photo(diary.photo, app.config['UPLOAD_FOLDER_DIARY'])
    db.session.delete(diary)
    db.session.commit()
    return jsonify({'message': '已删除'})


# ============================================================
# AI 识别
# ============================================================

@app.route('/api/recognize', methods=['POST'])
def recognize():
    """接收彩妆照片，返回 AI 识别结果"""
    photo_file = request.files.get('photo')
    if not photo_file or not photo_file.filename:
        return error('请上传一张照片')

    result = recognize_product(photo_file.read())
    if result:
        return jsonify({'recognized': True, **result})
    return jsonify({'recognized': False, 'message': '未能自动识别，请手动填写'})


@app.route('/api/skin-analysis', methods=['POST'])
def skin_analysis():
    """接收面部照片，返回肤质分析结果，并自动保存到历史记录"""
    photo_file = request.files.get('photo')
    if not photo_file or not photo_file.filename:
        return error('请上传一张正面面部照片')

    image_bytes = photo_file.read()
    result = analyze_skin(image_bytes)

    if not result.get('success'):
        return jsonify(result), 422 if result.get('reason') == 'no_face' else 500

    # 自动保存分析记录
    try:
        record = SkinAnalysis(
            skin_type=result.get('skin_type', ''),
            overall_score=result.get('overall_score', 0),
            summary=result.get('summary', ''),
        )
        record.set_concerns(result.get('concerns', []))
        record.set_scores(result.get('scores', {}))
        record.set_recommendations(result.get('recommendations', []))
        record.set_region_scores(result.get('region_scores', {}))
        record.heatmap_image = result.get('heatmap_base64') or ''
        face_data = result.get('face_data')
        if face_data and isinstance(face_data, dict):
            record.set_face_data(face_data)

        # 保存缩略图
        try:
            from io import BytesIO as Bio
            thumb_img = Image.open(Bio(image_bytes))
            thumb_img.thumbnail((400, 400))
            if thumb_img.mode == 'RGBA':
                thumb_img = thumb_img.convert('RGB')
            thumb_filename = f"skin_{uuid.uuid4().hex}.jpg"
            thumb_path = os.path.join(app.config['UPLOAD_FOLDER_SKIN'], thumb_filename)
            thumb_img.save(thumb_path, 'JPEG', quality=80)
            record.photo = thumb_filename
        except Exception as e:
            print(f'[app] 保存肤质照片失败: {e}')

        db.session.add(record)
        db.session.commit()
        result['id'] = record.id
        result['created_at'] = record.created_at.strftime('%Y-%m-%d %H:%M') if record.created_at else ''
    except Exception as e:
        print(f'[app] 保存肤质分析记录失败: {e}')
        # 即使保存失败，也返回分析结果

    return jsonify(result)


@app.route('/api/skin-analyses')
def skin_analyses_list():
    """肤质分析历史列表"""
    records = SkinAnalysis.query.order_by(SkinAnalysis.created_at.desc()).all()
    return jsonify([r.to_dict() for r in records])


@app.route('/api/skin-analyses/<int:sid>')
def skin_analysis_detail(sid):
    """单条肤质分析详情"""
    record = db.session.get(SkinAnalysis, sid)
    if not record:
        return error('记录不存在', 404)
    return jsonify(record.to_dict())


@app.route('/api/skin-analyses/<int:sid>', methods=['DELETE'])
def skin_analysis_delete(sid):
    """删除肤质分析记录"""
    record = db.session.get(SkinAnalysis, sid)
    if not record:
        return error('记录不存在', 404)
    delete_photo(record.photo, app.config['UPLOAD_FOLDER_SKIN'])
    db.session.delete(record)
    db.session.commit()
    return jsonify({'message': '已删除'})


# ============================================================
# 静态文件服务（上传的图片）
# ============================================================

@app.route('/uploads/<folder>/<filename>')
def uploaded_file(folder, filename):
    from flask import send_from_directory
    if folder == 'products':
        return send_from_directory(app.config['UPLOAD_FOLDER_PRODUCTS'], filename)
    elif folder == 'diary':
        return send_from_directory(app.config['UPLOAD_FOLDER_DIARY'], filename)
    elif folder == 'skin':
        return send_from_directory(app.config['UPLOAD_FOLDER_SKIN'], filename)
    return error('未知文件夹', 404)


# ============================================================
# 启动
# ============================================================

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
