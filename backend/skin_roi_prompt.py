"""
ROI feature prompt context for mirror advice.

This module converts internal MediaPipe ROI image features into short,
human-readable Chinese observations for Gemini. It does not define or change
the Gemini response schema.
"""

ROI_REGION_MAP = {
    'forehead': ['前额'],
    'nose': ['鼻子'],
    'left_cheek': ['左脸颊'],
    'right_cheek': ['右脸颊'],
    'eye_area': ['左眼周', '右眼周'],
    'chin': ['下巴'],
}

ROI_LABELS = {
    'forehead': '额头',
    'nose': '鼻子',
    'left_cheek': '左脸颊',
    'right_cheek': '右脸颊',
    'eye_area': '眼周',
    'chin': '下巴',
}


def _clamp(value, low=0.0, high=1.0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return low
    return max(low, min(high, number))


def _mean(values, default=0.0):
    values = [float(value) for value in values if value is not None]
    if not values:
        return default
    return sum(values) / len(values)


def _region_feature(region):
    color = region.get('color', {})
    texture = region.get('texture', {})
    spots = region.get('spots', {})
    shine = region.get('shine', {})

    hsv_mean = color.get('hsv_mean') or [0, 0, 0.52]
    brightness = _clamp(hsv_mean[2] if len(hsv_mean) > 2 else 0.52)
    redness = _clamp(color.get('erythema_index', 0))
    shine_score = _clamp(shine.get('gloss_score', 0))
    texture_score = _clamp(texture.get('roughness', 0))
    uneven_tone = _clamp(spots.get('color_variance', 0))
    melanin = _clamp(color.get('melanin_estimate', 0))
    spot_density = _clamp(spots.get('spot_density', 0) * 120)

    return {
        'brightness': brightness,
        'redness_score': redness,
        'shine_score': shine_score,
        'texture_score': texture_score,
        'uneven_tone_score': uneven_tone,
        'darkness_score': _clamp((1.0 - brightness) * 0.72 + melanin * 0.28),
        'acne_or_redness_risk': _clamp(redness * 0.62 + spot_density * 0.25 + texture_score * 0.13),
    }


def _average_regions(region_features, names):
    collected = []
    for name in names:
        region = region_features.get(name)
        if region:
            collected.append(_region_feature(region))

    if not collected:
        return None

    keys = collected[0].keys()
    return {key: _mean([item.get(key) for item in collected]) for key in keys}


def _brightness_text(value):
    if value < 0.42:
        return '亮度偏低'
    if value < 0.58:
        return '亮度中等'
    if value < 0.74:
        return '亮度较好'
    return '亮度偏高'


def _redness_text(value):
    if value < 0.08:
        return '泛红较低'
    if value < 0.16:
        return '轻微泛红'
    if value < 0.26:
        return '泛红略明显'
    return '泛红较明显'


def _shine_text(value):
    if value < 0.28:
        return '油光较低'
    if value < 0.42:
        return '油光轻微'
    if value < 0.58:
        return '油光轻微偏高'
    return '油光较明显'


def _texture_text(value):
    if value < 0.18:
        return '纹理较平滑'
    if value < 0.32:
        return '纹理轻微起伏'
    if value < 0.48:
        return '纹理略粗糙'
    return '纹理较粗糙'


def _uneven_text(value):
    if value < 0.06:
        return '肤色较均匀'
    if value < 0.11:
        return '肤色轻微不均'
    if value < 0.18:
        return '肤色略不均'
    return '肤色不均较明显'


def _darkness_text(value):
    if value < 0.30:
        return '暗沉不明显'
    if value < 0.46:
        return '有轻微暗沉'
    if value < 0.62:
        return '暗沉略明显'
    return '暗沉较明显'


def _risk_text(value):
    if value < 0.20:
        return '局部不稳定风险较低'
    if value < 0.38:
        return '存在轻微局部不稳定倾向'
    if value < 0.56:
        return '局部不稳定倾向略明显'
    return '局部泛红或不稳定倾向较明显'


def _describe_roi(key, feature):
    if not feature:
        return f'{ROI_LABELS[key]} ROI 提取不足，建议参考整体状态'

    parts = [
        _brightness_text(feature['brightness']),
        _shine_text(feature['shine_score']),
        _redness_text(feature['redness_score']),
    ]

    if key in ('left_cheek', 'right_cheek'):
        parts = [
            _texture_text(feature['texture_score']),
            _uneven_text(feature['uneven_tone_score']),
            _redness_text(feature['redness_score']),
        ]
    elif key == 'eye_area':
        parts = [
            _brightness_text(feature['brightness']),
            _darkness_text(feature['darkness_score']),
            _uneven_text(feature['uneven_tone_score']),
        ]
    elif key in ('chin', 'nose'):
        parts.append(_risk_text(feature['acne_or_redness_risk']))

    return '，'.join(parts)


def _overall_text(features):
    forehead = features.get('forehead') or {}
    nose = features.get('nose') or {}
    left_cheek = features.get('left_cheek') or {}
    right_cheek = features.get('right_cheek') or {}
    eye = features.get('eye_area') or {}
    chin = features.get('chin') or {}

    t_shine = _mean([forehead.get('shine_score'), nose.get('shine_score')], 0)
    cheek_texture = _mean([left_cheek.get('texture_score'), right_cheek.get('texture_score')], 0)
    cheek_brightness = _mean([left_cheek.get('brightness'), right_cheek.get('brightness')], 0.55)
    redness = _mean([
        forehead.get('redness_score'),
        nose.get('redness_score'),
        left_cheek.get('redness_score'),
        right_cheek.get('redness_score'),
        chin.get('redness_score'),
    ], 0)

    parts = []
    if t_shine >= 0.48:
        parts.append('T区油光偏明显')
    elif t_shine >= 0.36:
        parts.append('T区油光轻微偏高')
    else:
        parts.append('T区油光不明显')

    if cheek_texture >= 0.34 or cheek_brightness < 0.48:
        parts.append('两颊略显干燥或纹理起伏')
    else:
        parts.append('两颊状态相对平稳')

    if redness >= 0.16:
        parts.append('局部有轻微泛红')
    else:
        parts.append('泛红整体较低')

    if eye.get('darkness_score', 0) >= 0.42:
        parts.append('眼周有轻微暗沉')

    if chin.get('acne_or_redness_risk', 0) >= 0.38 or nose.get('acne_or_redness_risk', 0) >= 0.38:
        parts.append('鼻子或下巴存在局部不稳定倾向')

    return '，'.join(parts)


def build_roi_prompt_context(feature_json):
    """
    Build a human-readable ROI context block for Gemini prompt injection.

    The returned text intentionally avoids raw numeric dumps and does not define
    any output fields.
    """
    region_features = feature_json.get('region_features') or {}
    if not region_features:
        return ''

    roi_features = {
        key: _average_regions(region_features, names)
        for key, names in ROI_REGION_MAP.items()
    }
    roi_text = {
        key: _describe_roi(key, feature)
        for key, feature in roi_features.items()
    }
    overall = _overall_text(roi_features)

    lines = [
        '以下是系统通过 MediaPipe Face Mesh 和 ROI 图像特征提取得到的肤质分析结果，请你优先基于这些结构化结果生成妆前护理建议，不要声称自己直接诊断了图片。',
        '',
        '【机器视觉分析结果】',
        f'- 额头：{roi_text["forehead"]}',
        f'- 鼻子：{roi_text["nose"]}',
        f'- 左脸颊：{roi_text["left_cheek"]}',
        f'- 右脸颊：{roi_text["right_cheek"]}',
        f'- 眼周：{roi_text["eye_area"]}',
        f'- 下巴：{roi_text["chin"]}',
        f'- 整体判断：{overall}',
        '',
        '【用户目标】',
        '妆前护理建议',
        '',
        '【输出要求】',
        '请严格保持原有输出结构，不要新增字段，不要删除字段，不要改变字段名。',
    ]
    return '\n'.join(lines)
