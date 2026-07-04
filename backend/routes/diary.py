import json
from datetime import datetime, timedelta

from flask import Blueprint, current_app, jsonify, request

from constants import MOOD_LEGACY_MAP, MOOD_MAP
from models import Diary, Product, SkinAnalysis, db
from upload_utils import delete_photo, save_photo

from .common import error, get_current_user_id

diary_bp = Blueprint('diary', __name__, url_prefix='/api')


def _user_diaries_query(user_id=None):
    return Diary.query.filter(Diary.user_id == (user_id or get_current_user_id()))


def _user_products_query(user_id=None):
    user_id = user_id or get_current_user_id()
    return Product.query.filter(
        Product.user_id == user_id,
        db.or_(Product.source.is_(None), Product.source != 'knowledge_base'),
    )


def _user_skin_analyses_query(user_id=None):
    return SkinAnalysis.query.filter(SkinAnalysis.user_id == (user_id or get_current_user_id()))


def _visible_product_ids(product_ids, user_id):
    if not product_ids:
        return []
    products = _user_products_query(user_id).filter(Product.id.in_(product_ids)).all()
    visible_ids = {product.id for product in products}
    return [pid for pid in product_ids if pid in visible_ids]


def _resolve_mood(mood_val):
    if mood_val in MOOD_MAP:
        info = MOOD_MAP[mood_val]
    elif mood_val in MOOD_LEGACY_MAP:
        info = MOOD_MAP[MOOD_LEGACY_MAP[mood_val]]
    else:
        info = MOOD_MAP['stable']
    return {'key': mood_val, **info}


@diary_bp.route('/diary')
def diary_list():
    user_id = get_current_user_id()
    diaries = _user_diaries_query(user_id).order_by(Diary.created_at.desc()).all()
    now = datetime.now()
    today_str = now.strftime('%Y-%m-%d')

    all_product_ids = set()
    for diary in diaries:
        all_product_ids.update(diary.get_product_ids())

    products_map = {}
    if all_product_ids:
        products = _user_products_query(user_id).filter(
            Product.id.in_(all_product_ids),
        ).all()
        products_map = {product.id: product.to_dict() for product in products}

    analysis_ids = [diary.skin_analysis_id for diary in diaries if diary.skin_analysis_id]
    analyses_map = {}
    if analysis_ids:
        analyses = _user_skin_analyses_query(user_id).filter(SkinAnalysis.id.in_(analysis_ids)).all()
        analyses_map = {analysis.id: analysis.to_dict() for analysis in analyses}

    diary_list_data = []
    for diary in diaries:
        entry = diary.to_dict()
        entry['products'] = [
            products_map[pid]
            for pid in diary.get_product_ids()
            if pid in products_map
        ]
        entry['mood_info'] = _resolve_mood(diary.mood)
        if diary.skin_analysis_id and diary.skin_analysis_id in analyses_map:
            analysis = analyses_map[diary.skin_analysis_id]
            entry['skin_analysis'] = {
                'id': analysis['id'],
                'overall_score': analysis['overall_score'],
                'skin_type': analysis['skin_type'],
                'created_at': analysis['created_at'],
            }
        else:
            entry['skin_analysis'] = None
        diary_list_data.append(entry)

    this_month = now.strftime('%Y-%m')
    monthly_dates = {
        diary.created_date
        for diary in diaries
        if diary.created_date and diary.created_date.startswith(this_month)
    }

    all_dates_set = {diary.created_date for diary in diaries if diary.created_date}
    consecutive_days = 0
    check = datetime.strptime(today_str, '%Y-%m-%d')
    while check.strftime('%Y-%m-%d') in all_dates_set:
        consecutive_days += 1
        check -= timedelta(days=1)

    monthly_scores = [
        analyses_map[diary.skin_analysis_id]['overall_score']
        for diary in diaries
        if diary.skin_analysis_id
        and diary.skin_analysis_id in analyses_map
        and diary.created_date
        and diary.created_date.startswith(this_month)
    ]

    return jsonify({
        'diaries': diary_list_data,
        'stats': {
            'monthly_days': len(monthly_dates),
            'consecutive_days': consecutive_days,
            'avg_skin_score': round(sum(monthly_scores) / len(monthly_scores)) if monthly_scores else None,
        },
    })


@diary_bp.route('/diary/<int:did>')
def diary_detail(did):
    user_id = get_current_user_id()
    diary = _user_diaries_query(user_id).filter(Diary.id == did).first()
    if not diary:
        return error('日记不存在', 404)
    entry = diary.to_dict()

    product_ids = diary.get_product_ids()
    if product_ids:
        products = _user_products_query(user_id).filter(
            Product.id.in_(product_ids),
        ).all()
        products_map = {product.id: product.to_dict() for product in products}
        entry['products'] = [products_map[pid] for pid in product_ids if pid in products_map]
    else:
        entry['products'] = []

    entry['mood_info'] = _resolve_mood(diary.mood)
    if diary.skin_analysis_id:
        analysis = _user_skin_analyses_query(user_id).filter(SkinAnalysis.id == diary.skin_analysis_id).first()
        entry['skin_analysis'] = analysis.to_dict() if analysis else None
    else:
        entry['skin_analysis'] = None

    return jsonify(entry)


@diary_bp.route('/diary', methods=['POST'])
def diary_create():
    user_id = get_current_user_id()
    title = request.form.get('title', '').strip()
    if not title:
        return error('日记标题不能为空')

    mood_val = request.form.get('mood', 'stable').strip()
    if mood_val not in MOOD_MAP:
        mood_val = MOOD_LEGACY_MAP.get(mood_val, 'stable')

    diary = Diary(
        user_id=user_id,
        title=title,
        content=request.form.get('content', '').strip(),
        mood=mood_val,
        created_date=request.form.get('created_date', datetime.now().strftime('%Y-%m-%d')).strip(),
    )

    product_ids = [int(pid) for pid in request.form.getlist('product_ids') if pid]
    diary.set_product_ids(_visible_product_ids(product_ids, user_id))

    try:
        tags_raw = request.form.get('tags', '[]')
        tags_list = json.loads(tags_raw) if isinstance(tags_raw, str) else tags_raw
        diary.set_tags(tags_list if isinstance(tags_list, list) else [])
    except (json.JSONDecodeError, TypeError):
        diary.set_tags([])

    skin_analysis_id = request.form.get('skin_analysis_id', '').strip()
    if skin_analysis_id:
        try:
            requested_analysis_id = int(skin_analysis_id)
            analysis = _user_skin_analyses_query(user_id).filter(SkinAnalysis.id == requested_analysis_id).first()
            diary.skin_analysis_id = analysis.id if analysis else None
        except (ValueError, TypeError):
            diary.skin_analysis_id = None

    photo_file = request.files.get('photo')
    if photo_file and photo_file.filename:
        diary.photo = save_photo(photo_file, current_app.config['UPLOAD_FOLDER_DIARY'])

    db.session.add(diary)
    db.session.commit()
    return jsonify(diary.to_dict()), 201


@diary_bp.route('/diary/<int:did>', methods=['PUT'])
def diary_update(did):
    user_id = get_current_user_id()
    diary = _user_diaries_query(user_id).filter(Diary.id == did).first()
    if not diary:
        return error('日记不存在', 404)

    diary.title = request.form.get('title', '').strip()
    diary.content = request.form.get('content', '').strip()

    mood_val = request.form.get('mood', '').strip()
    if mood_val:
        if mood_val in MOOD_MAP:
            diary.mood = mood_val
        elif mood_val in MOOD_LEGACY_MAP:
            diary.mood = MOOD_LEGACY_MAP[mood_val]

    diary.created_date = request.form.get('created_date', '').strip()
    product_ids = [int(pid) for pid in request.form.getlist('product_ids') if pid]
    diary.set_product_ids(_visible_product_ids(product_ids, user_id))

    tags_raw = request.form.get('tags', None)
    if tags_raw is not None:
        try:
            tags_list = json.loads(tags_raw) if isinstance(tags_raw, str) else tags_raw
            diary.set_tags(tags_list if isinstance(tags_list, list) else [])
        except (json.JSONDecodeError, TypeError):
            pass

    skin_analysis_id = request.form.get('skin_analysis_id', None)
    if skin_analysis_id is not None:
        try:
            requested_analysis_id = int(skin_analysis_id) if str(skin_analysis_id).strip() else None
            if requested_analysis_id:
                analysis = _user_skin_analyses_query(user_id).filter(SkinAnalysis.id == requested_analysis_id).first()
                diary.skin_analysis_id = analysis.id if analysis else None
            else:
                diary.skin_analysis_id = None
        except (ValueError, TypeError):
            pass

    photo_file = request.files.get('photo')
    if photo_file and photo_file.filename:
        delete_photo(diary.photo, current_app.config['UPLOAD_FOLDER_DIARY'])
        diary.photo = save_photo(photo_file, current_app.config['UPLOAD_FOLDER_DIARY'])

    db.session.commit()
    return jsonify(diary.to_dict())


@diary_bp.route('/diary/<int:did>', methods=['DELETE'])
def diary_delete(did):
    diary = _user_diaries_query().filter(Diary.id == did).first()
    if not diary:
        return error('日记不存在', 404)

    delete_photo(diary.photo, current_app.config['UPLOAD_FOLDER_DIARY'])
    db.session.delete(diary)
    db.session.commit()
    return jsonify({'message': '已删除'})


@diary_bp.route('/moods')
def moods():
    return jsonify(MOOD_MAP)
