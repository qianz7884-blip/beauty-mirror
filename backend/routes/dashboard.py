from datetime import datetime, timedelta

from flask import Blueprint, jsonify

from models import Diary, Product, SkinAnalysis
from models import db
from .common import get_current_user_id

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/api')


def _count_consecutive_days(date_values, today):
    dates = {value for value in date_values if value}
    count = 0
    check_date = today
    while check_date.strftime('%Y-%m-%d') in dates:
        count += 1
        check_date -= timedelta(days=1)
    return count


def _user_products_query(user_id=None):
    user_id = user_id or get_current_user_id()
    return Product.query.filter(
        Product.user_id == user_id,
        db.or_(Product.source.is_(None), Product.source != 'knowledge_base')
    )


@dashboard_bp.route('/dashboard')
def dashboard():
    user_id = get_current_user_id()
    now = datetime.now()
    today = datetime.strptime(now.strftime('%Y-%m-%d'), '%Y-%m-%d')
    this_month = now.strftime('%Y-%m')

    recent_products = [
        p.to_dict()
        for p in _user_products_query(user_id).order_by(Product.created_at.desc()).limit(4).all()
    ]
    diary_query = Diary.query.filter(Diary.user_id == user_id)
    analysis_query = SkinAnalysis.query.filter(SkinAnalysis.user_id == user_id)
    latest_diary = diary_query.order_by(Diary.created_at.desc()).first()
    recent_analyses = [
        a.to_dict()
        for a in analysis_query.order_by(SkinAnalysis.created_at.desc()).limit(5).all()
    ]

    diary_dates = [
        d.created_date
        for d in diary_query.with_entities(Diary.created_date).all()
        if d.created_date
    ]
    analysis_dates = [
        a.created_at.strftime('%Y-%m-%d')
        for a in analysis_query.with_entities(SkinAnalysis.created_at).all()
        if a.created_at
    ]

    return jsonify({
        'total_products': _user_products_query(user_id).count(),
        'total_diary': diary_query.count(),
        'monthly_products': _user_products_query(user_id).filter(Product.created_at.like(f'{this_month}%')).count(),
        'total_analyses': analysis_query.count(),
        'consecutive_diary_days': _count_consecutive_days(diary_dates, today),
        'consecutive_analysis_days': _count_consecutive_days(analysis_dates, today),
        'recent_products': recent_products,
        'latest_diary': latest_diary.to_dict() if latest_diary else None,
        'recent_analyses': recent_analyses,
        'latest_skin_status': recent_analyses[0].get('today_status', '') if recent_analyses else '',
    })
