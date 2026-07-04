from flask import Blueprint, current_app, jsonify, request

from models import Product, db
from recognizer import recognize_product, recognize_product_voice
from upload_utils import delete_photo, download_photo_from_url, save_photo

from .common import error

products_bp = Blueprint('products', __name__, url_prefix='/api')


def _user_products_query():
    return Product.query.filter(
        db.or_(Product.source.is_(None), Product.source != 'knowledge_base')
    )


def _normalize_user_product_source(source):
    source = (source or 'manual').strip() or 'manual'
    return 'gemini' if source == 'knowledge_base' else source


@products_bp.route('/products')
def product_list():
    search = request.args.get('search', '').strip()
    category = request.args.get('category', '').strip()

    query = _user_products_query()
    if search:
        query = query.filter(db.or_(Product.name.contains(search), Product.brand.contains(search)))
    if category and category != '全部':
        query = query.filter(Product.category == category)

    products = query.order_by(Product.created_at.desc()).all()
    return jsonify([p.to_dict() for p in products])


@products_bp.route('/products/<int:pid>')
def product_detail(pid):
    product = db.session.get(Product, pid)
    if not product or product.source == 'knowledge_base':
        return error('产品不存在', 404)
    return jsonify(product.to_dict())


@products_bp.route('/products', methods=['POST'])
def product_create():
    name = request.form.get('name', '').strip()
    if not name:
        return error('产品名称不能为空')

    try:
        price = float(request.form.get('price', 0) or 0)
    except (TypeError, ValueError):
        return error('价格格式不正确')

    try:
        product = Product(
            name=name,
            brand=request.form.get('brand', '').strip(),
            category=request.form.get('category', '其他').strip() or '其他',
            color=request.form.get('color', '').strip(),
            volume=request.form.get('volume', '').strip(),
            purchase_date=request.form.get('purchase_date', '').strip(),
            price=price,
            notes=request.form.get('notes', '').strip(),
            ingredients=request.form.get('ingredients', '').strip(),
            efficacy=request.form.get('efficacy', '').strip(),
            suitable_skin=request.form.get('suitable_skin', '').strip(),
            usage_instructions=request.form.get('usage_instructions', '').strip(),
            source=_normalize_user_product_source(request.form.get('source', 'manual')),
        )

        photo_file = request.files.get('photo')
        if photo_file and photo_file.filename:
            product.photo = save_photo(photo_file, current_app.config['UPLOAD_FOLDER_PRODUCTS'])
        else:
            photo_url = request.form.get('photo_url', '').strip()
            if photo_url:
                product.photo = download_photo_from_url(
                    photo_url,
                    current_app.config['UPLOAD_FOLDER_PRODUCTS'],
                )

        db.session.add(product)
        db.session.commit()
        return jsonify(product.to_dict()), 201
    except Exception as exc:
        db.session.rollback()
        print(f'[product_create] 添加产品失败: {exc}')
        return error('添加产品失败，请检查图片或输入内容', 500)


@products_bp.route('/products/<int:pid>', methods=['PUT'])
def product_update(pid):
    product = db.session.get(Product, pid)
    if not product or product.source == 'knowledge_base':
        return error('产品不存在', 404)

    try:
        price = float(request.form.get('price', 0) or 0)
    except (TypeError, ValueError):
        return error('价格格式不正确')

    try:
        product.name = request.form.get('name', '').strip()
        product.brand = request.form.get('brand', '').strip()
        product.category = request.form.get('category', '其他').strip() or '其他'
        product.color = request.form.get('color', '').strip()
        product.volume = request.form.get('volume', '').strip()
        product.purchase_date = request.form.get('purchase_date', '').strip()
        product.price = price
        product.notes = request.form.get('notes', '').strip()
        product.ingredients = request.form.get('ingredients', product.ingredients).strip()
        product.efficacy = request.form.get('efficacy', product.efficacy).strip()
        product.suitable_skin = request.form.get('suitable_skin', product.suitable_skin).strip()
        product.usage_instructions = request.form.get(
            'usage_instructions',
            product.usage_instructions,
        ).strip()

        photo_file = request.files.get('photo')
        if photo_file and photo_file.filename:
            delete_photo(product.photo, current_app.config['UPLOAD_FOLDER_PRODUCTS'])
            product.photo = save_photo(photo_file, current_app.config['UPLOAD_FOLDER_PRODUCTS'])
        elif not product.photo:
            photo_url = request.form.get('photo_url', '').strip()
            if photo_url:
                product.photo = download_photo_from_url(
                    photo_url,
                    current_app.config['UPLOAD_FOLDER_PRODUCTS'],
                )

        db.session.commit()
        return jsonify(product.to_dict())
    except Exception as exc:
        db.session.rollback()
        print(f'[product_update] 更新产品失败: {exc}')
        return error('保存产品失败，请检查图片或输入内容', 500)


@products_bp.route('/products/<int:pid>', methods=['DELETE'])
def product_delete(pid):
    product = db.session.get(Product, pid)
    if not product or product.source == 'knowledge_base':
        return error('产品不存在', 404)

    delete_photo(product.photo, current_app.config['UPLOAD_FOLDER_PRODUCTS'])
    db.session.delete(product)
    db.session.commit()
    return jsonify({'message': '已删除'})


@products_bp.route('/product-knowledge')
def product_knowledge_query():
    category = request.args.get('category', '').strip() or None
    skin_type = request.args.get('skin_type', '').strip() or None
    keyword = request.args.get('keyword', '').strip() or None

    from product_knowledge import ProductKnowledge

    pk = ProductKnowledge(db.session)
    return jsonify({
        'results': pk.query_knowledge(category=category, skin_type=skin_type, keyword=keyword),
        'stats': pk.get_stats(),
    })


@products_bp.route('/product-knowledge/seed', methods=['POST'])
def product_knowledge_seed():
    from product_knowledge import ProductKnowledge

    pk = ProductKnowledge(db.session)
    count = pk.seed_knowledge_base(force=True)
    return jsonify({'message': f'种子知识已写入 {count} 条', 'count': count})


@products_bp.route('/recognize', methods=['POST'])
def recognize():
    photo_file = request.files.get('photo')
    if not photo_file or not photo_file.filename:
        return error('请上传一张照片')

    recognition = recognize_product(photo_file.read())
    if not recognition.get('ok'):
        return jsonify({
            'recognized': False,
            'reason': recognition.get('reason', 'unknown'),
            'message': recognition.get('message') or '未能自动识别，请手动填写',
        })

    gemini_result = recognition['data']

    from product_knowledge import ProductKnowledge

    pk = ProductKnowledge(db.session)
    enriched = pk.enrich_product(gemini_result)

    return jsonify({
        'recognized': True,
        'brand': enriched['brand'],
        'name': enriched['name'],
        'category': enriched['category'],
        'color': gemini_result.get('color', ''),
        'volume': enriched['volume'],
        'ingredients': enriched['ingredients'],
        'efficacy': enriched['efficacy'],
        'suitable_skin': enriched['suitable_skin'],
        'usage_instructions': enriched['usage_instructions'],
        'source': enriched['source'],
        'confidence': gemini_result.get('confidence', 'low'),
        'recognition_mode': gemini_result.get('recognition_mode', 'unknown'),
        'needs_review': gemini_result.get('needs_review', False),
        'message': recognition.get('message', ''),
        'existing_id': enriched['existing_id'],
        'is_duplicate': enriched['is_duplicate'],
        'similar_products': enriched['similar_products'],
    })


@products_bp.route('/recognize-voice', methods=['POST'])
def recognize_voice():
    audio_file = request.files.get('audio')
    if not audio_file or not audio_file.filename:
        return error('请录制一段语音')

    recognition = recognize_product_voice(
        audio_file.read(),
        audio_file.mimetype or 'audio/webm',
    )
    if not recognition.get('ok'):
        return jsonify({
            'recognized': False,
            'reason': recognition.get('reason', 'unknown'),
            'message': recognition.get('message') or '未能识别语音，请手动填写',
        })

    voice_result = recognition['data']

    from product_knowledge import ProductKnowledge

    pk = ProductKnowledge(db.session)
    enriched = pk.enrich_product(voice_result)
    source = enriched['source']
    if source == 'gemini':
        source = 'voice'

    return jsonify({
        'recognized': True,
        'brand': enriched['brand'],
        'name': enriched['name'],
        'category': enriched['category'],
        'color': voice_result.get('color', ''),
        'volume': enriched['volume'],
        'notes': voice_result.get('notes', ''),
        'transcript': voice_result.get('transcript', ''),
        'ingredients': enriched['ingredients'],
        'efficacy': enriched['efficacy'],
        'suitable_skin': enriched['suitable_skin'],
        'usage_instructions': enriched['usage_instructions'],
        'source': source,
        'confidence': voice_result.get('confidence', 'low'),
        'recognition_mode': voice_result.get('recognition_mode', 'voice'),
        'needs_review': voice_result.get('needs_review', False),
        'message': recognition.get('message', ''),
        'existing_id': enriched['existing_id'],
        'is_duplicate': enriched['is_duplicate'],
        'similar_products': enriched['similar_products'],
    })
