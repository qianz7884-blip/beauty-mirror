"""Deterministic tutorial recommendations for the Mirror Mate product loop.

The module connects the newest mirror analysis, facial proportions, weather,
and the user's own cabinet. It deliberately avoids beauty scores and keeps the
output structured so the frontend can explain why each tutorial was selected.
"""

from datetime import datetime


TIME_OPTIONS = {
    'quick': {
        'id': 'quick',
        'label': '5分钟',
        'minutes': 5,
        'keywords': '快速出门妆 懒人淡妆',
        'steps': ['妆前', '防晒', '底妆', '眉眼', '唇妆'],
    },
    'daily': {
        'id': 'daily',
        'label': '15分钟',
        'minutes': 15,
        'keywords': '通勤妆 自然精致妆',
        'steps': ['妆前', '防晒', '底妆', '遮瑕', '定妆', '眉眼', '腮红修容', '唇妆'],
    },
    'complete': {
        'id': 'complete',
        'label': '30分钟',
        'minutes': 30,
        'keywords': '完整妆容 约会拍照妆',
        'steps': ['妆前', '防晒', '底妆', '遮瑕', '定妆', '眉眼', '腮红修容', '唇妆'],
    },
}

SCENES = {
    'commute': {
        'id': 'commute',
        'label': '通勤',
        'title': '通勤清透妆',
        'focus': '自然干净，减少步骤',
        'keywords': ['通勤', '日常', '清透', '持妆'],
    },
    'office': {
        'id': 'office',
        'label': '约会',
        'title': '柔和约会妆',
        'focus': '柔和提气色，细节精致',
        'keywords': ['约会', '提气色', '柔和', '精致'],
    },
    'evening': {
        'id': 'evening',
        'label': '拍照',
        'title': '上镜立体妆',
        'focus': '加强轮廓，镜头下更立体',
        'keywords': ['拍照', '上镜', '立体', '晚间'],
    },
}

STEP_KEYWORDS = {
    '妆前': ['妆前', '面霜', '乳液', '精华', '喷雾', '保湿'],
    '防晒': ['防晒', '隔离'],
    '底妆': ['粉底', '气垫', 'bb', 'cc', '底妆'],
    '遮瑕': ['遮瑕', '校色'],
    '定妆': ['散粉', '粉饼', '定妆', '蜜粉'],
    '眉眼': ['眉', '眼影', '眼线', '睫毛'],
    '腮红修容': ['腮红', '修容', '高光'],
    '唇妆': ['口红', '唇釉', '润唇', '唇膏', '唇'],
}

CONCERN_TECHNIQUES = {
    '干燥脱皮': '妆前先补水，底妆少量按压，干燥处不反复叠粉',
    '面部泛红': '泛红处先薄薄校色，再少量叠加底妆',
    'T区出油': '底妆保持轻薄，定妆只重点轻压 T 区',
    '毛孔粗大': '毛孔明显处顺着纹理少量拍压，避免厚涂',
    '黑眼圈': '眼下分区少量遮瑕，边缘轻拍开',
    '肤色暗沉': '面中少量提亮，用腮红和唇妆补充气色',
    '肤色不均': '局部修色后再上薄底妆，减少全脸堆叠',
    '痘印色斑': '只在需要的位置点按遮瑕，保留整体轻薄感',
    '水油失衡': 'T 区控油、面颊保湿，按区域调整用量',
}


def _normalise_time(time_id):
    return TIME_OPTIONS.get(str(time_id or ''), TIME_OPTIONS['daily'])


def _normalise_scene(scene_id):
    return SCENES.get(str(scene_id or ''), SCENES['commute'])


def _product_text(product):
    fields = (
        'name',
        'brand',
        'category',
        'usage_steps',
        'product_features',
        'suitable_regions',
        'suitable_scenes',
        'efficacy',
    )
    return ' '.join(str(getattr(product, field, '') or '') for field in fields).lower()


def _is_product_available(product, today=None):
    if int(getattr(product, 'usage_percent', 0) or 0) >= 98:
        return False

    expiry_date = str(getattr(product, 'expiry_date', '') or '').strip()
    if not expiry_date:
        return True
    try:
        expiry = datetime.strptime(expiry_date, '%Y-%m-%d').date()
        return expiry >= (today or datetime.now().date())
    except ValueError:
        return True


def _score_product(product, step, scene, skin_type):
    text = _product_text(product)
    score = 0
    for keyword in STEP_KEYWORDS.get(step, [step]):
        if keyword.lower() in text:
            score += 5 if keyword in str(getattr(product, 'category', '') or '') else 3
    for keyword in scene.get('keywords', []):
        if keyword.lower() in text:
            score += 2
    suitable_skin = str(getattr(product, 'suitable_skin', '') or '')
    if skin_type and (skin_type in suitable_skin or '所有' in suitable_skin):
        score += 1
    return score


def match_products(products, steps, scene, skin_type=''):
    """Pick at most one available cabinet product for every requested step."""
    available = [product for product in products if _is_product_available(product)]
    used_ids = set()
    matched = []
    missing_steps = []

    for step in steps:
        ranked = sorted(
            (
                (_score_product(product, step, scene, skin_type), product)
                for product in available
                if getattr(product, 'id', None) not in used_ids
            ),
            key=lambda pair: pair[0],
            reverse=True,
        )
        if not ranked or ranked[0][0] <= 0:
            missing_steps.append(step)
            continue
        score, product = ranked[0]
        used_ids.add(product.id)
        matched.append({
            'id': product.id,
            'name': product.name,
            'brand': product.brand or '',
            'category': product.category or '其他',
            'step': step,
            'match_reason': (
                f'化妆柜中已有，适合{scene["label"]}的{step}步骤'
                if score >= 7
                else f'化妆柜中可用于{step}步骤'
            ),
        })

    return matched, missing_steps


def _weather_advice(weather):
    weather = weather if isinstance(weather, dict) else {}
    tips = []
    humidity = weather.get('humidity')
    uv_index = weather.get('uvIndex', weather.get('uv_index'))

    try:
        humidity = float(humidity)
        if humidity >= 70:
            tips.append('湿度偏高，底妆薄涂并重点定妆')
        elif humidity <= 40:
            tips.append('空气偏干，妆前先补水并减少散粉')
    except (TypeError, ValueError):
        pass

    try:
        uv_index = float(uv_index)
        if uv_index >= 6:
            tips.append('紫外线较强，教程流程中保留足量防晒')
        elif uv_index >= 3:
            tips.append('出门前保留日常防晒步骤')
    except (TypeError, ValueError):
        pass

    return tips[:2]


def _ratio_tags(face_ratio):
    if not isinstance(face_ratio, dict) or not face_ratio.get('ok'):
        return []
    tags = face_ratio.get('ratio_tags') or face_ratio.get('primary_tags') or []
    useful = [
        str(tag).strip()
        for tag in tags
        if tag
        and '均衡' not in str(tag)
        and str(tag).strip() != '面部比例整体均衡'
    ]
    if useful:
        return list(dict.fromkeys(useful))[:4]
    return ['面部比例整体协调']


def _skin_context(analysis):
    if not analysis:
        return {
            'analysis_id': None,
            'skin_type': '',
            'today_status': '',
            'concerns': [],
            'observations': [],
        }
    return {
        'analysis_id': analysis.id,
        'skin_type': analysis.skin_type or '',
        'today_status': analysis.today_status or '',
        'concerns': analysis.get_concerns(),
        'observations': analysis.get_observations(),
    }


def _allocate_step_minutes(steps, total_minutes):
    if not steps:
        return []
    base = max(1, total_minutes // len(steps))
    remainder = max(0, total_minutes - base * len(steps))
    return [base + (1 if index < remainder else 0) for index in range(len(steps))]


def build_tutorial_context(
        *,
        analysis=None,
        face_ratio=None,
        products=None,
        time_id='daily',
        scene_id='commute',
        weather=None):
    time_option = _normalise_time(time_id)
    scene = _normalise_scene(scene_id)
    skin = _skin_context(analysis)
    if not face_ratio and analysis:
        face_ratio = analysis.get_face_data().get('face_ratio')
    face_ratio = face_ratio if isinstance(face_ratio, dict) else {}
    ratio_tags = _ratio_tags(face_ratio)
    matched_products, missing_steps = match_products(
        products or [],
        time_option['steps'],
        scene,
        skin.get('skin_type', ''),
    )
    product_by_step = {item['step']: item for item in matched_products}
    weather_tips = _weather_advice(weather)
    concern_tips = [
        CONCERN_TECHNIQUES[concern]
        for concern in skin.get('concerns', [])
        if concern in CONCERN_TECHNIQUES
    ][:2]
    ratio_tips = [
        str(tip).strip()
        for tip in (face_ratio.get('makeup_tips') or [])
        if str(tip).strip()
    ][:2]

    step_minutes = _allocate_step_minutes(time_option['steps'], time_option['minutes'])
    flow_steps = []
    for index, step in enumerate(time_option['steps']):
        product = product_by_step.get(step)
        action = {
            '妆前': concern_tips[0] if concern_tips else '做好基础保湿，让后续底妆更服帖',
            '防晒': weather_tips[-1] if weather_tips else '出门前完成日常防晒',
            '底妆': '从面中向外少量拍开，保留自然皮肤质感',
            '遮瑕': concern_tips[-1] if concern_tips else '只在需要的位置少量点按',
            '定妆': weather_tips[0] if weather_tips else '容易出油的位置轻压定妆',
            '眉眼': ratio_tips[0] if ratio_tips else '眉眼边界保持干净，按场景调整存在感',
            '腮红修容': ratio_tips[-1] if ratio_tips else '轻量调整面部重心，避免大面积堆色',
            '唇妆': '用唇色补充气色，和整体妆面保持协调',
        }.get(step, f'完成{step}步骤')
        flow_steps.append({
            'order': index + 1,
            'title': step,
            'minutes': step_minutes[index],
            'action': action,
            'product': product,
        })

    main_tag = ratio_tags[0] if ratio_tags else '自然比例修饰'
    second_tag = ratio_tags[1] if len(ratio_tags) > 1 else '新手友好'
    third_tag = ratio_tags[2] if len(ratio_tags) > 2 else '面部比例修饰'
    common_reasons = [
        reason
        for reason in (
            f'参考最近一次镜前检测：{skin["today_status"]}' if skin.get('today_status') else '',
            f'三庭五眼方向：{"、".join(ratio_tags[:2])}' if ratio_tags else '',
            f'已匹配化妆柜中的 {len(matched_products)} 件产品' if matched_products else '',
            '；'.join(weather_tips) if weather_tips else '',
        )
        if reason
    ]

    recommendations = [
        {
            'title': f'适合你的{scene["title"]}',
            'description': f'根据{main_tag}和{scene["label"]}场景匹配',
            'duration': time_option['label'],
            'query': f'{main_tag} {scene["label"]} {time_option["keywords"]} 教程',
            'reasons': common_reasons[:3],
        },
        {
            'title': '自然提亮裸妆',
            'description': f'兼顾{second_tag}与当前肤质状态',
            'duration': '5分钟' if time_option['minutes'] <= 5 else '15分钟',
            'query': f'{time_option["label"]} {scene["label"]} {second_tag} 自然裸妆 教程',
            'reasons': (concern_tips + common_reasons)[:3],
        },
        {
            'title': '局部比例修饰妆',
            'description': f'重点处理{third_tag}',
            'duration': '30分钟',
            'query': f'{third_tag} 腮红 修容 眼妆 教程',
            'reasons': (ratio_tips + common_reasons)[:3],
        },
    ]

    return {
        'guide': {
            **time_option,
            'scene_id': scene['id'],
            'scene_label': scene['label'],
            'title': scene['title'],
            'focus': scene['focus'],
        },
        'linkage': {
            'analysis_id': skin.get('analysis_id'),
            'analysis_source': 'mirror_analysis' if skin.get('analysis_id') else (
                'tutorial_photo' if face_ratio.get('ok') else 'generic'
            ),
            'skin_type': skin.get('skin_type', ''),
            'today_status': skin.get('today_status', ''),
            'concerns': skin.get('concerns', [])[:4],
            'observations': skin.get('observations', [])[:3],
            'ratio_tags': ratio_tags,
            'weather_advice': weather_tips,
        },
        'matched_products': matched_products,
        'missing_steps': missing_steps,
        'flow_steps': flow_steps,
        'recommendations': recommendations,
    }
