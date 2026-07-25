"""
面部比例倾向分析（三庭五眼近似）

基于 MediaPipe Face Landmarker 输出的归一化关键点，计算适合妆容推荐使用的
面部比例标签。这里刻意使用「倾向」而不是绝对脸型/审美判断：

- 三庭需要真实发际线，MediaPipe 无法稳定拿到发际线，所以只做上庭近似。
- 五眼基于眼角和脸颊外缘关键点估算，照片角度、镜头畸变和表情都会影响结果。
- 输出用于妆容教程匹配，不用于身份识别、医学判断或审美打分。
"""

from math import hypot


VERSION = 'face_ratio_v1'

BROW_INDICES = [70, 63, 105, 66, 107, 300, 293, 334, 296, 336]
NOSE_BASE_INDICES = [2, 94, 97, 164, 326, 327]
MOUTH_CENTER_INDICES = [13, 14, 0, 17]

REQUIRED_INDICES = sorted(set([
    1, 10, 33, 133, 152, 172, 234, 263, 362, 397, 454,
    *BROW_INDICES,
    *NOSE_BASE_INDICES,
    *MOUTH_CENTER_INDICES,
]))


def _missing_indices(landmarks):
    if isinstance(landmarks, dict):
        return [index for index in REQUIRED_INDICES if index not in landmarks]

    try:
        count = len(landmarks)
    except TypeError:
        return REQUIRED_INDICES

    return [index for index in REQUIRED_INDICES if index >= count]


def _value(landmark, name):
    if isinstance(landmark, dict):
        return landmark.get(name)
    return getattr(landmark, name, None)


def _point(landmarks, index, image_size):
    width, height = image_size
    landmark = landmarks[index]
    x = _value(landmark, 'x')
    y = _value(landmark, 'y')
    if x is None or y is None:
        raise ValueError(f'landmark {index} missing x/y')
    return (float(x) * width, float(y) * height)


def _mean_point(landmarks, indices, image_size):
    points = [_point(landmarks, index, image_size) for index in indices]
    return (
        sum(point[0] for point in points) / len(points),
        sum(point[1] for point in points) / len(points),
    )


def _distance(a, b):
    return hypot(a[0] - b[0], a[1] - b[1])


def _horizontal(a, b):
    return abs(a[0] - b[0])


def _safe_ratio(numerator, denominator, default=0.0):
    return float(numerator) / denominator if denominator else default


def _round(value, digits=3):
    return round(float(value), digits)


def _segment_label(name, normalized):
    if normalized >= 1.12:
        return f'{name}偏长'
    if normalized <= 0.88:
        return f'{name}偏短'
    return f'{name}均衡'


def _eye_spacing_label(ratio):
    if ratio >= 1.16:
        return '眼距偏宽'
    if ratio <= 0.86:
        return '眼距偏近'
    return '眼距基本均衡'


def _five_eye_label(face_eye_count):
    if face_eye_count >= 5.55:
        return '横向留白偏多'
    if face_eye_count <= 4.45:
        return '横向比例偏紧凑'
    return '五眼比例基本均衡'


def _face_vertical_label(face_height_width_ratio):
    if face_height_width_ratio >= 1.46:
        return '面部纵向感偏强'
    if face_height_width_ratio <= 1.18:
        return '面部横向感偏强'
    return '面部长宽比例均衡'


def _jaw_label(jaw_cheek_ratio):
    if jaw_cheek_ratio >= 0.84:
        return '下颌存在感明显'
    if jaw_cheek_ratio <= 0.68:
        return '下颌线条收窄'
    return '轮廓线条较均衡'


def _feature_focus_label(feature_center_ratio):
    if feature_center_ratio <= 0.47:
        return '五官重心偏上'
    if feature_center_ratio >= 0.55:
        return '五官重心偏下'
    return '五官重心居中'


def _quality_flags(points, face_height, face_width):
    left_eye_outer = points['left_eye_outer']
    right_eye_outer = points['right_eye_outer']
    nose_tip = points['nose_tip']
    face_left = points['face_left']
    face_right = points['face_right']
    center_x = (face_left[0] + face_right[0]) / 2

    flags = []
    eye_tilt_ratio = _safe_ratio(abs(left_eye_outer[1] - right_eye_outer[1]), face_height)
    nose_offset_ratio = _safe_ratio(abs(nose_tip[0] - center_x), face_width)

    if eye_tilt_ratio >= 0.035:
        flags.append('照片头部略有倾斜，比例结果建议作为参考')
    if nose_offset_ratio >= 0.085:
        flags.append('照片可能不是完全正脸，横向比例可能有偏差')

    return flags, {
        'eye_tilt_ratio': _round(eye_tilt_ratio),
        'nose_center_offset_ratio': _round(nose_offset_ratio),
    }


def _make_tips(primary_tags):
    tips = []
    tags = set(primary_tags)

    if '中庭偏长' in tags:
        tips.extend([
            '腮红位置可以略上移，增强面中横向氛围',
            '鼻影不要一路画到底，避免进一步拉长中庭',
            '唇妆可以提高气色，把视觉重心往中下部带一点',
        ])
    if '中庭偏短' in tags:
        tips.extend([
            '鼻梁提亮可以轻轻纵向带过，让面中更舒展',
            '腮红范围不要压得太高，保留面中空间',
        ])
    if '上庭偏长' in tags:
        tips.extend([
            '眉眼存在感可以稍微加强，让上半张脸更集中',
            '额头高光保持克制，避免继续放大上庭',
        ])
    if '下庭偏长' in tags:
        tips.extend([
            '口红上唇边界可以稍微饱满一点，缩短人中观感',
            '下巴修容轻扫边缘，让下庭更收束',
        ])
    if '下庭偏短' in tags:
        tips.extend([
            '唇妆边界保持干净，不要过度上扩唇形',
            '下巴提亮可以少量点涂，增加下庭延展感',
        ])
    if '眼距偏宽' in tags:
        tips.extend([
            '眼头可以轻轻加强阴影或提亮，让双眼更聚拢',
            '眉头不要画得太浅，能改善五官分散感',
        ])
    if '眼距偏近' in tags:
        tips.extend([
            '眼尾眼线略向外拉，减少视觉拥挤',
            '眼头区域保持清透，避免加重眼距偏近的感觉',
        ])
    if '横向留白偏多' in tags:
        tips.append('腮红和修容可以横向衔接，让脸侧留白更自然')
    if '横向比例偏紧凑' in tags:
        tips.append('眼妆和腮红可以向外轻扫，增加横向舒展感')
    if '下颌存在感明显' in tags:
        tips.append('下颌角修容少量多次，边缘要晕染干净')
    if '下颌线条收窄' in tags:
        tips.append('腮红不要过低，保持脸部上半区的轻盈感')

    if not tips:
        tips = [
            '整体比例比较均衡，可以根据场景调整妆感浓淡',
            '日常妆优先保持底妆轻薄和眉眼干净',
            '拍照妆可以适度加强腮红、修容和唇色层次',
        ]

    deduped = []
    for tip in tips:
        if tip not in deduped:
            deduped.append(tip)
    return deduped[:5]


def _summary(primary_tags):
    non_balanced = [
        tag for tag in primary_tags
        if not tag.endswith('均衡') and '基本均衡' not in tag and tag != '五官重心居中'
    ]
    if not non_balanced:
        return '你的面部比例整体比较均衡，适合根据时间和场景选择妆感浓淡，日常可以走清透干净的路线。'

    focus = '、'.join(non_balanced[:3])
    return f'你的面部比例呈现{focus}的倾向，适合选择能调整视觉重心、让五官更舒展的妆容教程。'


def _confidence(quality_flags, face_height, face_width):
    if face_height <= 0 or face_width <= 0:
        return 'low'
    if len(quality_flags) >= 2:
        return 'low'
    if quality_flags:
        return 'medium'
    return 'high'


def analyze_face_ratios(landmarks, image_size):
    """
    分析面部比例倾向。

    Args:
        landmarks: MediaPipe Face Landmarker 的单张脸 landmarks。
                   支持 NormalizedLandmark 对象或 {'x': ..., 'y': ...} 字典。
        image_size: (width, height)

    Returns:
        dict: {
            ok: bool,
            ratio_tags: [...],
            summary: str,
            makeup_tips: [...],
            measurements: {...},
            quality_flags: [...],
            confidence: high|medium|low,
        }
    """
    if not landmarks:
        return {'ok': False, 'reason': 'no_landmarks', 'message': '未获得面部关键点'}
    missing_indices = _missing_indices(landmarks)
    if missing_indices:
        return {
            'ok': False,
            'reason': 'insufficient_landmarks',
            'message': f'面部关键点数量不足，缺少 {len(missing_indices)} 个必要关键点',
        }

    width, height = image_size
    if width <= 0 or height <= 0:
        return {'ok': False, 'reason': 'invalid_image_size', 'message': '图片尺寸无效'}

    try:
        points = {
            'forehead_top': _point(landmarks, 10, image_size),
            'chin': _point(landmarks, 152, image_size),
            'face_left': _point(landmarks, 234, image_size),
            'face_right': _point(landmarks, 454, image_size),
            'jaw_left': _point(landmarks, 172, image_size),
            'jaw_right': _point(landmarks, 397, image_size),
            'left_eye_outer': _point(landmarks, 33, image_size),
            'left_eye_inner': _point(landmarks, 133, image_size),
            'right_eye_inner': _point(landmarks, 362, image_size),
            'right_eye_outer': _point(landmarks, 263, image_size),
            'nose_tip': _point(landmarks, 1, image_size),
            'brow_center': _mean_point(landmarks, BROW_INDICES, image_size),
            'nose_base': _mean_point(landmarks, NOSE_BASE_INDICES, image_size),
            'mouth_center': _mean_point(landmarks, MOUTH_CENTER_INDICES, image_size),
        }

        face_height = abs(points['chin'][1] - points['forehead_top'][1])
        face_width = _horizontal(points['face_left'], points['face_right'])
        if face_height <= 1 or face_width <= 1:
            return {'ok': False, 'reason': 'invalid_face_geometry', 'message': '面部几何尺寸无效'}

        upper = points['brow_center'][1] - points['forehead_top'][1]
        middle = points['nose_base'][1] - points['brow_center'][1]
        lower = points['chin'][1] - points['nose_base'][1]
        if min(upper, middle, lower) <= 0:
            return {'ok': False, 'reason': 'invalid_three_part_geometry', 'message': '三庭近似比例无法稳定计算'}

        three_total = upper + middle + lower
        three_avg = three_total / 3
        upper_norm = _safe_ratio(upper, three_avg)
        middle_norm = _safe_ratio(middle, three_avg)
        lower_norm = _safe_ratio(lower, three_avg)

        left_eye_width = _horizontal(points['left_eye_outer'], points['left_eye_inner'])
        right_eye_width = _horizontal(points['right_eye_outer'], points['right_eye_inner'])
        avg_eye_width = (left_eye_width + right_eye_width) / 2
        inner_eye_distance = _horizontal(points['left_eye_inner'], points['right_eye_inner'])
        eye_spacing_ratio = _safe_ratio(inner_eye_distance, avg_eye_width)
        face_eye_count = _safe_ratio(face_width, avg_eye_width)

        jaw_width = _horizontal(points['jaw_left'], points['jaw_right'])
        jaw_cheek_ratio = _safe_ratio(jaw_width, face_width)
        face_height_width_ratio = _safe_ratio(face_height, face_width)

        feature_center_y = (
            (points['left_eye_inner'][1] + points['right_eye_inner'][1]) / 2
            + points['nose_tip'][1]
            + points['mouth_center'][1]
        ) / 3
        feature_center_ratio = _safe_ratio(
            feature_center_y - points['forehead_top'][1],
            face_height,
        )

        primary_tags = [
            _segment_label('上庭', upper_norm),
            _segment_label('中庭', middle_norm),
            _segment_label('下庭', lower_norm),
            _eye_spacing_label(eye_spacing_ratio),
            _five_eye_label(face_eye_count),
            _face_vertical_label(face_height_width_ratio),
            _jaw_label(jaw_cheek_ratio),
            _feature_focus_label(feature_center_ratio),
        ]
        ratio_tags = [
            tag for tag in primary_tags
            if not tag.endswith('均衡') and '基本均衡' not in tag and tag != '五官重心居中'
        ] or ['面部比例整体均衡']

        quality_flags, pose_metrics = _quality_flags(points, face_height, face_width)
        makeup_tips = _make_tips(primary_tags)

        technique_tags = []
        for tip in makeup_tips:
            if '腮红' in tip:
                technique_tags.append('腮红调整')
            if '鼻影' in tip or '鼻梁' in tip:
                technique_tags.append('鼻影调整')
            if '唇' in tip or '人中' in tip:
                technique_tags.append('唇妆调整')
            if '眼' in tip or '眉' in tip:
                technique_tags.append('眉眼调整')
            if '修容' in tip or '下颌' in tip:
                technique_tags.append('轮廓修饰')

        video_query_tags = []
        for tag in [*ratio_tags, *technique_tags]:
            if tag not in video_query_tags:
                video_query_tags.append(tag)

        return {
            'ok': True,
            'version': VERSION,
            'ratio_tags': ratio_tags,
            'primary_tags': primary_tags,
            'summary': _summary(primary_tags),
            'makeup_tips': makeup_tips,
            'video_query_tags': video_query_tags,
            'confidence': _confidence(quality_flags, face_height, face_width),
            'quality_flags': quality_flags,
            'measurement_notes': [
                '三庭为 MediaPipe 关键点近似结果，无法真实识别发际线',
                '结果适合用于妆容教程推荐，不代表绝对脸型或审美评价',
            ],
            'measurements': {
                'three_part': {
                    'upper': {
                        'label': '上庭近似',
                        'pixels': _round(upper, 1),
                        'share': _round(_safe_ratio(upper, three_total)),
                        'normalized': _round(upper_norm),
                    },
                    'middle': {
                        'label': '中庭近似',
                        'pixels': _round(middle, 1),
                        'share': _round(_safe_ratio(middle, three_total)),
                        'normalized': _round(middle_norm),
                    },
                    'lower': {
                        'label': '下庭近似',
                        'pixels': _round(lower, 1),
                        'share': _round(_safe_ratio(lower, three_total)),
                        'normalized': _round(lower_norm),
                    },
                },
                'five_eye': {
                    'left_eye_width': _round(left_eye_width, 1),
                    'right_eye_width': _round(right_eye_width, 1),
                    'inner_eye_distance': _round(inner_eye_distance, 1),
                    'eye_spacing_ratio': _round(eye_spacing_ratio),
                    'face_eye_count': _round(face_eye_count),
                },
                'contour': {
                    'face_height_width_ratio': _round(face_height_width_ratio),
                    'jaw_cheek_ratio': _round(jaw_cheek_ratio),
                    'feature_center_ratio': _round(feature_center_ratio),
                },
                'pose': pose_metrics,
            },
        }
    except Exception as exc:
        return {
            'ok': False,
            'reason': 'analysis_failed',
            'message': f'面部比例分析失败: {exc}',
        }
