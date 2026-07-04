from flask import Blueprint, current_app, jsonify, request

from models import SkinAnalysis, db
from skin_analyzer import analyze_skin
from upload_utils import delete_photo, save_photo_bytes

from .common import error, get_current_user_id

skin_bp = Blueprint('skin', __name__, url_prefix='/api')


def _user_skin_analyses_query(user_id=None):
    return SkinAnalysis.query.filter(SkinAnalysis.user_id == (user_id or get_current_user_id()))


@skin_bp.route('/skin-analysis', methods=['POST'])
def skin_analysis():
    user_id = get_current_user_id()
    photo_file = request.files.get('photo')
    if not photo_file or not photo_file.filename:
        return error('请上传一张正面面部照片')

    image_bytes = photo_file.read()
    result = analyze_skin(image_bytes, db_session=db.session, user_id=user_id)

    if not result.get('success'):
        return jsonify(result), 422 if result.get('reason') == 'no_face' else 500

    try:
        record = SkinAnalysis(
            user_id=user_id,
            skin_type=result.get('skin_type', ''),
            overall_score=result.get('overall_score', 0),
            summary=result.get('summary', ''),
            today_status=result.get('today_status', ''),
        )
        record.set_concerns(result.get('concerns', []))
        record.set_scores(result.get('scores', {}))
        record.set_recommendations(result.get('recommendations', []))
        record.set_region_scores(result.get('region_scores', {}))
        record.set_feature_json(result.get('feature_json', {}))
        record.set_observations(result.get('observations', []))
        record.set_mirror_advice(result.get('mirror_advice', []))
        record.set_today_routine(result.get('today_routine', {}))
        record.set_trend(result.get('trend', {}))
        record.heatmap_image = result.get('heatmap_base64') or ''

        face_data = result.get('face_data')
        if face_data and isinstance(face_data, dict):
            record.set_face_data(face_data)

        try:
            record.photo = save_photo_bytes(
                image_bytes,
                current_app.config['UPLOAD_FOLDER_SKIN'],
                filename_prefix='skin_',
                max_size=(400, 400),
                quality=80,
            )
        except Exception as exc:
            print(f'[skin] 保存肤质照片失败: {exc}')

        db.session.add(record)
        db.session.commit()
        result['id'] = record.id
        result['created_at'] = record.created_at.strftime('%Y-%m-%d %H:%M') if record.created_at else ''
    except Exception as exc:
        print(f'[skin] 保存肤质分析记录失败: {exc}')

    return jsonify(result)


@skin_bp.route('/skin-analyses')
def skin_analyses_list():
    records = _user_skin_analyses_query().order_by(SkinAnalysis.created_at.desc()).all()
    return jsonify([record.to_dict() for record in records])


@skin_bp.route('/skin-analyses/<int:sid>')
def skin_analysis_detail(sid):
    record = _user_skin_analyses_query().filter(SkinAnalysis.id == sid).first()
    if not record:
        return error('记录不存在', 404)
    return jsonify(record.to_dict())


@skin_bp.route('/skin-analyses/<int:sid>', methods=['DELETE'])
def skin_analysis_delete(sid):
    record = _user_skin_analyses_query().filter(SkinAnalysis.id == sid).first()
    if not record:
        return error('记录不存在', 404)

    delete_photo(record.photo, current_app.config['UPLOAD_FOLDER_SKIN'])
    db.session.delete(record)
    db.session.commit()
    return jsonify({'message': '已删除'})
