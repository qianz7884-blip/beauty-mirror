from datetime import datetime

from flask import Blueprint, jsonify, request

from constants import MOOD_MAP
from models import Diary, Product, SkinAnalysis, TutorialPlan, db
from tutorial_recommender import build_tutorial_context

from .common import error, get_current_user_id

tutorial_bp = Blueprint('tutorial', __name__, url_prefix='/api')


def _user_analyses_query(user_id):
    return SkinAnalysis.query.filter(SkinAnalysis.user_id == user_id)


def _user_products_query(user_id):
    return Product.query.filter(
        Product.user_id == user_id,
        db.or_(Product.source.is_(None), Product.source != 'knowledge_base'),
    )


def _user_plans_query(user_id):
    return TutorialPlan.query.filter(TutorialPlan.user_id == user_id)


def _resolve_analysis(user_id, analysis_id=None):
    query = _user_analyses_query(user_id)
    if analysis_id not in (None, ''):
        try:
            analysis_id = int(analysis_id)
        except (TypeError, ValueError):
            return None
        return query.filter(SkinAnalysis.id == analysis_id).first()
    return query.order_by(SkinAnalysis.created_at.desc()).first()


def _payload():
    value = request.get_json(silent=True) or {}
    return value if isinstance(value, dict) else {}


def _build_context(user_id, payload):
    requested_analysis_id = payload.get('analysis_id')
    analysis = _resolve_analysis(user_id, requested_analysis_id)
    if requested_analysis_id not in (None, '') and not analysis:
        return None, None, ('镜前检测记录不存在', 404)

    supplied_ratio = payload.get('face_ratio')
    face_ratio = supplied_ratio if isinstance(supplied_ratio, dict) else None
    products = _user_products_query(user_id).order_by(Product.created_at.desc()).all()
    context = build_tutorial_context(
        analysis=analysis,
        face_ratio=face_ratio,
        products=products,
        time_id=payload.get('time_id', 'daily'),
        scene_id=payload.get('scene_id', 'commute'),
        weather=payload.get('weather'),
    )
    return context, analysis, None


@tutorial_bp.route('/tutorial/recommendations', methods=['POST'])
def tutorial_recommendations():
    user_id = get_current_user_id()
    context, _analysis, build_error = _build_context(user_id, _payload())
    if build_error:
        return error(*build_error)
    return jsonify(context)


@tutorial_bp.route('/tutorial/plans/latest')
def tutorial_plan_latest():
    user_id = get_current_user_id()
    query = _user_plans_query(user_id)
    plan = (
        query.filter(TutorialPlan.status == 'planned')
        .order_by(TutorialPlan.created_at.desc())
        .first()
    )
    if not plan:
        latest = query.order_by(TutorialPlan.created_at.desc()).first()
        if latest and latest.created_at and latest.created_at.date() == datetime.now().date():
            plan = latest
    return jsonify({
        'has_plan': bool(plan),
        'plan': plan.to_dict() if plan else None,
    })


@tutorial_bp.route('/tutorial/plans', methods=['POST'])
def tutorial_plan_create():
    user_id = get_current_user_id()
    payload = _payload()
    context, analysis, build_error = _build_context(user_id, payload)
    if build_error:
        return error(*build_error)

    recommendations = context.get('recommendations') or []
    try:
        recommendation_index = int(payload.get('recommendation_index', 0))
    except (TypeError, ValueError):
        recommendation_index = 0
    recommendation_index = max(0, min(recommendation_index, len(recommendations) - 1))
    selected = recommendations[recommendation_index] if recommendations else {}
    guide = context.get('guide') or {}
    product_ids = [
        product.get('id')
        for product in context.get('matched_products', [])
        if product.get('id') is not None
    ]

    plan = TutorialPlan(
        user_id=user_id,
        skin_analysis_id=analysis.id if analysis else None,
        time_id=guide.get('id', 'daily'),
        time_minutes=int(guide.get('minutes', 15) or 15),
        scene_id=guide.get('scene_id', 'commute'),
        status='planned',
    )
    plan.set_selected_recommendation(selected)
    plan.set_context(context)
    plan.set_product_ids(product_ids)
    _user_plans_query(user_id).filter(TutorialPlan.status == 'planned').update(
        {'status': 'superseded'},
        synchronize_session=False,
    )
    db.session.add(plan)
    db.session.commit()
    return jsonify(plan.to_dict()), 201


@tutorial_bp.route('/tutorial/plans/<int:plan_id>/complete', methods=['PATCH'])
def tutorial_plan_complete(plan_id):
    user_id = get_current_user_id()
    plan = _user_plans_query(user_id).filter(TutorialPlan.id == plan_id).first()
    if not plan:
        return error('教程流程不存在', 404)

    if plan.status == 'completed' and plan.diary_id:
        diary = Diary.query.filter(
            Diary.id == plan.diary_id,
            Diary.user_id == user_id,
        ).first()
        return jsonify({
            'plan': plan.to_dict(),
            'diary': diary.to_dict() if diary else None,
            'already_completed': True,
        })

    payload = _payload()
    context = plan.get_context()
    guide = context.get('guide') or {}
    selected = plan.get_selected_recommendation()
    flow_steps = context.get('flow_steps') or []
    mood = str(payload.get('mood', 'stable') or 'stable')
    if mood not in MOOD_MAP:
        mood = 'stable'

    step_summary = '；'.join(
        f'{step.get("title", "")}：{step.get("action", "")}'
        for step in flow_steps[:5]
        if step.get('title')
    )
    diary = Diary(
        user_id=user_id,
        title=f'{guide.get("scene_label", "今日")} · {selected.get("title", "妆容教程")}',
        content=step_summary or selected.get('description', ''),
        mood=mood,
        skin_analysis_id=plan.skin_analysis_id,
        created_date=datetime.now().strftime('%Y-%m-%d'),
    )
    diary.set_product_ids(plan.get_product_ids())
    diary.set_tags([
        '教程完成',
        guide.get('scene_label', '今日妆容'),
        guide.get('label', f'{plan.time_minutes}分钟'),
    ])

    try:
        db.session.add(diary)
        db.session.flush()
        plan.status = 'completed'
        plan.completed_at = datetime.now()
        plan.diary_id = diary.id
        db.session.commit()
    except Exception:
        db.session.rollback()
        return error('保存教程完成记录失败，请稍后重试', 500)

    return jsonify({
        'plan': plan.to_dict(),
        'diary': diary.to_dict(),
        'already_completed': False,
    })
