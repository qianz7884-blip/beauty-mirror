from datetime import datetime, timedelta

from flask import Blueprint, jsonify

from models import Diary, Product, SkinAnalysis

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/api')


def _count_consecutive_days(date_values, today):
    dates = {value for value in date_values if value}
    count = 0
    check_date = today
    while check_date.strftime('%Y-%m-%d') in dates:
        count += 1
        check_date -= timedelta(days=1)
    return count


@dashboard_bp.route('/dashboard')
def dashboard():
    now = datetime.now()
    today = datetime.strptime(now.strftime('%Y-%m-%d'), '%Y-%m-%d')
    this_month = now.strftime('%Y-%m')

    recent_products = [
        p.to_dict()
        for p in Product.query.order_by(Product.created_at.desc()).limit(4).all()
    ]
    latest_diary = Diary.query.order_by(Diary.created_at.desc()).first()
    recent_analyses = [
        a.to_dict()
        for a in SkinAnalysis.query.order_by(SkinAnalysis.created_at.desc()).limit(5).all()
    ]

    diary_dates = [
        d.created_date
        for d in Diary.query.with_entities(Diary.created_date).all()
        if d.created_date
    ]
    analysis_dates = [
        a.created_at.strftime('%Y-%m-%d')
        for a in SkinAnalysis.query.with_entities(SkinAnalysis.created_at).all()
        if a.created_at
    ]

    return jsonify({
        'total_products': Product.query.count(),
        'total_diary': Diary.query.count(),
        'monthly_products': Product.query.filter(Product.created_at.like(f'{this_month}%')).count(),
        'total_analyses': SkinAnalysis.query.count(),
        'consecutive_diary_days': _count_consecutive_days(diary_dates, today),
        'consecutive_analysis_days': _count_consecutive_days(analysis_dates, today),
        'recent_products': recent_products,
        'latest_diary': latest_diary.to_dict() if latest_diary else None,
        'recent_analyses': recent_analyses,
        'latest_skin_status': recent_analyses[0].get('today_status', '') if recent_analyses else '',
    })
