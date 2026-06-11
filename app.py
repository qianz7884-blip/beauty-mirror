import os
import json
import uuid
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from PIL import Image

from config import Config
from models import db, Product, Diary


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # ensure instance folder exists
    os.makedirs(os.path.dirname(app.config['SQLALCHEMY_DATABASE_URI'].replace('sqlite:///', '')),
                exist_ok=True)
    os.makedirs(app.config['UPLOAD_FOLDER_PRODUCTS'], exist_ok=True)
    os.makedirs(app.config['UPLOAD_FOLDER_DIARY'], exist_ok=True)

    db.init_app(app)

    with app.app_context():
        db.create_all()

    return app


app = create_app()

# ============================================================
# 工具函数
# ============================================================

CATEGORIES = ['全部', '口红', '眼影', '粉底', '腮红', '其他']
MOODS = [
    ('😍', '超满意'),
    ('😊', '开心'),
    ('😐', '一般'),
    ('😢', '不满意'),
]


def save_photo(file, folder):
    """保存上传图片，返回文件名"""
    if file and file.filename:
        ext = os.path.splitext(file.filename)[1] or '.jpg'
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(folder, filename)
        img = Image.open(file)
        img.thumbnail((800, 800))
        # convert RGBA to RGB if necessary
        if img.mode == 'RGBA':
            img = img.convert('RGB')
        img.save(filepath, 'JPEG', quality=85)
        return filename
    return ''


def delete_photo(filename, folder):
    """删除图片文件"""
    if filename:
        filepath = os.path.join(folder, filename)
        if os.path.exists(filepath):
            os.remove(filepath)


# ============================================================
# 首页 Dashboard
# ============================================================

@app.route('/')
def home():
    total_products = Product.query.count()
    total_diary = Diary.query.count()

    # 本月新增产品
    now = datetime.now()
    this_month = now.strftime('%Y-%m')
    monthly_products = Product.query.filter(
        Product.created_at.like(f'{this_month}%')
    ).count()

    # 最近添加的 4 个产品
    recent_products = Product.query.order_by(
        Product.created_at.desc()
    ).limit(4).all()

    # 最新一篇日记
    latest_diary = Diary.query.order_by(
        Diary.created_date.desc()
    ).first()

    return render_template('home.html',
                           now=now,
                           total_products=total_products,
                           total_diary=total_diary,
                           monthly_products=monthly_products,
                           recent_products=recent_products,
                           latest_diary=latest_diary)


# ============================================================
# 产品管理
# ============================================================

@app.route('/products/manage')
def product_manage():
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
    return render_template('product_manage.html',
                           products=products,
                           categories=CATEGORIES,
                           search=search,
                           current_category=category)


@app.route('/products/add', methods=['POST'])
def product_add():
    name = request.form.get('name', '').strip()
    if not name:
        flash('产品名称不能为空', 'danger')
        return redirect(url_for('product_manage'))

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
    if photo_file:
        product.photo = save_photo(photo_file, app.config['UPLOAD_FOLDER_PRODUCTS'])

    db.session.add(product)
    db.session.commit()
    flash('产品添加成功！', 'success')
    return redirect(url_for('product_manage'))


@app.route('/products/<int:pid>/edit', methods=['POST'])
def product_edit(pid):
    product = db.session.get(Product, pid)
    if not product:
        flash('产品不存在', 'danger')
        return redirect(url_for('product_manage'))

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

    db.session.commit()
    flash('产品更新成功！', 'success')
    return redirect(url_for('product_manage'))


@app.route('/products/<int:pid>/delete', methods=['POST'])
def product_delete(pid):
    product = db.session.get(Product, pid)
    if product:
        delete_photo(product.photo, app.config['UPLOAD_FOLDER_PRODUCTS'])
        db.session.delete(product)
        db.session.commit()
        flash('产品已删除', 'info')
    return redirect(url_for('product_manage'))


# ============================================================
# 我的彩妆（卡片画廊）
# ============================================================

@app.route('/products/gallery')
def my_cosmetics():
    category = request.args.get('category', '全部').strip()
    query = Product.query
    if category and category != '全部':
        query = query.filter(Product.category == category)

    products = query.order_by(Product.created_at.desc()).all()
    return render_template('my_cosmetics.html',
                           products=products,
                           categories=CATEGORIES,
                           current_category=category)


# ============================================================
# 妆容日记
# ============================================================

@app.route('/diary')
def makeup_diary():
    diaries = Diary.query.order_by(Diary.created_date.desc()).all()
    # 预加载关联产品信息
    product_map = {p.id: p for p in Product.query.all()}
    return render_template('makeup_diary.html',
                           diaries=diaries,
                           product_map=product_map,
                           moods=MOODS)


@app.route('/diary/add', methods=['POST'])
def diary_add():
    title = request.form.get('title', '').strip()
    if not title:
        flash('日记标题不能为空', 'danger')
        return redirect(url_for('makeup_diary'))

    diary = Diary(
        title=title,
        content=request.form.get('content', '').strip(),
        mood=request.form.get('mood', '😊').strip(),
        created_date=request.form.get('created_date', datetime.now().strftime('%Y-%m-%d')).strip(),
    )

    # 关联产品
    product_ids = request.form.getlist('product_ids')
    diary.set_product_ids([int(pid) for pid in product_ids if pid])

    photo_file = request.files.get('photo')
    if photo_file:
        diary.photo = save_photo(photo_file, app.config['UPLOAD_FOLDER_DIARY'])

    db.session.add(diary)
    db.session.commit()
    flash('日记发布成功！', 'success')
    return redirect(url_for('makeup_diary'))


@app.route('/diary/<int:did>/edit', methods=['POST'])
def diary_edit(did):
    diary = db.session.get(Diary, did)
    if not diary:
        flash('日记不存在', 'danger')
        return redirect(url_for('makeup_diary'))

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
    flash('日记更新成功！', 'success')
    return redirect(url_for('makeup_diary'))


@app.route('/diary/<int:did>/delete', methods=['POST'])
def diary_delete(did):
    diary = db.session.get(Diary, did)
    if diary:
        delete_photo(diary.photo, app.config['UPLOAD_FOLDER_DIARY'])
        db.session.delete(diary)
        db.session.commit()
        flash('日记已删除', 'info')
    return redirect(url_for('makeup_diary'))


# ============================================================
# 启动
# ============================================================

if __name__ == '__main__':
    import socket, os
    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname)
    port = int(os.environ.get('PORT', 5000))
    print('=' * 50)
    print('  Beauty Mirror Started!')
    print(f'  Local:  http://127.0.0.1:{port}')
    print(f'  Mobile: http://{local_ip}:{port}')
    print('  (Phone and PC must be on same WiFi)')
    print('=' * 50)
    app.run(debug=True, host='0.0.0.0', port=port)
