"""
AI 识别模块（Gemini Vision）

使用 Google Gemini 读取产品照片，优先提取包装文字；文字不足时根据外观
给出保守的品类/名称兜底，方便前端进入可编辑的录入流程。

环境变量：
    GEMINI_API_KEY — Google AI Studio 获取的 API Key（必填）
    GEMINI_MODEL    — 模型名，默认 gemini-2.5-flash
"""

import os
import json
import re
from io import BytesIO

ALLOWED_CATEGORIES = [
    '洁面',
    '爽肤水',
    '精华',
    '乳液',
    '面霜',
    '眼霜',
    '防晒',
    '面膜',
    '底妆',
    '遮瑕',
    '定妆',
    '眉眼',
    '唇妆',
    '腮红修容',
    '工具',
    '香氛',
    '小样',
    '其他',
]

CATEGORY_ALIASES = {
    '化妆水': '爽肤水',
    '爽肤': '爽肤水',
    '水乳': '乳液',
    '身体乳': '乳液',
    '身体霜': '面霜',
    '润肤霜': '面霜',
    '修护霜': '面霜',
    '护手霜': '面霜',
    '乳霜': '面霜',
    '洁面乳': '洁面',
    '洗面奶': '洁面',
    '粉底': '底妆',
    '粉底液': '底妆',
    '气垫': '底妆',
    '隔离': '底妆',
    '妆前': '底妆',
    '遮瑕膏': '遮瑕',
    '散粉': '定妆',
    '粉饼': '定妆',
    '定妆喷雾': '定妆',
    '眉笔': '眉眼',
    '眼影': '眉眼',
    '眼线': '眉眼',
    '睫毛膏': '眉眼',
    '口红': '唇妆',
    '唇釉': '唇妆',
    '唇膏': '唇妆',
    '腮红': '腮红修容',
    '修容': '腮红修容',
    '高光': '腮红修容',
    '香水': '香氛',
    '刷子': '工具',
    '美妆蛋': '工具',
}


def _detect_mime(data):
    """根据文件头检测图片 MIME 类型"""
    from PIL import Image
    try:
        img = Image.open(BytesIO(data))
        fmt = img.format
        if fmt:
            return f'image/{fmt.lower()}'
    except Exception:
        pass
    return 'image/jpeg'  # 兜底


def _failure(reason, message):
    return {
        'ok': False,
        'reason': reason,
        'message': message,
        'data': None,
    }


def _success(data, message=''):
    return {
        'ok': True,
        'reason': '',
        'message': message,
        'data': data,
    }


def _clean(value, max_len=120):
    if value is None:
        return ''
    return str(value).replace('\n', ' ').strip()[:max_len]


def _as_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {'true', '1', 'yes', '是'}
    return bool(value)


def _clean_tag_text(value, max_len=160):
    if isinstance(value, list):
        value = '、'.join(_clean(item, 24) for item in value if _clean(item, 24))
    return _clean(value, max_len)


def _parse_json_object(text):
    text = (text or '').strip()
    if not text:
        return None

    text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.IGNORECASE).strip()
    text = re.sub(r'\s*```$', '', text).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r'\{.*\}', text, flags=re.DOTALL)
    if not match:
        return None

    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _normalize_category(category, name='', packaging_text=''):
    category = _clean(category, 30)
    if category in ALLOWED_CATEGORIES:
        return category

    text = f'{category} {name} {packaging_text}'
    for keyword, normalized in CATEGORY_ALIASES.items():
        if keyword in text:
            return normalized

    for allowed in ALLOWED_CATEGORIES:
        if allowed != '其他' and allowed in text:
            return allowed

    return '其他'


def _friendly_api_error(exc):
    raw = str(exc)
    lower = raw.lower()
    if 'winerror 10013' in lower or 'permission' in lower and 'socket' in lower:
        return 'network_blocked', '后端进程无法连接 Gemini，请用有网络权限的方式重启后端'
    if 'quota' in lower or '429' in lower or 'rate' in lower:
        return 'quota', 'Gemini 配额不足或请求过快，请稍后再试'
    if 'api key' in lower or 'permission' in lower or '401' in lower or '403' in lower:
        return 'auth', 'Gemini API Key 无效或没有权限，请检查后端环境变量'
    if 'timeout' in lower or 'deadline' in lower:
        return 'timeout', 'Gemini 响应超时，请换一张更清晰的照片后重试'
    return 'api_error', 'Gemini 暂时没有返回可用结果，请手动填写或稍后重试'


def _parse_voice_text(text):
    text = _clean(text, 260)
    result = {
        'brand': '',
        'name': '',
        'category': '其他',
        'volume': '',
        'color': '',
        'notes': f'语音录入：{text}' if text else '',
    }
    if not text:
        return result

    patterns = {
        'brand': r'品牌(?:是|叫|为)?\s*([^，,。；;]+)',
        'name': r'(?:产品|名称|名字)(?:是|叫|为)?\s*([^，,。；;]+)',
        'category': r'(?:分类|品类|类别)(?:是|叫|为)?\s*([^，,。；;]+)',
        'volume': r'(?:规格|容量)(?:是|叫|为)?\s*([^，,。；;]+)',
        'color': r'(?:色号|颜色)(?:是|叫|为)?\s*([^，,。；;]+)',
    }

    for key, pattern in patterns.items():
        match = re.search(pattern, text)
        if match:
            result[key] = _clean(match.group(1), 80)

    result['category'] = _normalize_category(result['category'], result['name'], text)

    if not result['name']:
        candidate = re.sub(r'^(帮我)?(添加|记录|新建|录入)一个?', '', text).strip()
        candidate = re.sub(r'(这个|这件)?产品$', '', candidate).strip()
        result['name'] = _clean(candidate, 100)

    return result


def recognize_product(image_bytes):
    """
    读取产品照片并返回识别状态。

    返回格式：
        {
            "ok": bool,
            "message": str,
            "reason": str,
            "data": dict | None,
        }
    """
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        print('[recognizer] 未设置 GEMINI_API_KEY，跳过识别')
        return _failure('no_api_key', 'AI 服务未配置，请设置 GEMINI_API_KEY')

    try:
        from google import genai
    except ImportError:
        print('[recognizer] 未安装 google-genai，请执行: pip install google-genai')
        return _failure('no_lib', 'AI 依赖未安装，请安装 google-genai')

    model_name = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')
    mime_type = _detect_mime(image_bytes)

    try:
        client = genai.Client(api_key=api_key)

        prompt = """你在帮助用户录入美妆/护肤产品库存。请识别照片里的产品，优先读取包装上的可见文字；如果文字不清晰，但能从外观判断大致品类，也要给出保守的初步结果，方便用户后续手动核对。

要求：
1. 品牌和具体产品名必须来自包装可见文字；看不到就留空。
2. 如果看不到具体产品名，但能判断品类，name 写成“疑似{品类}产品”，needs_review 设为 true。
3. category 必须从这些中文分类中选择一个：洁面、爽肤水、精华、乳液、面霜、眼霜、防晒、面膜、底妆、遮瑕、定妆、眉眼、唇妆、腮红修容、工具、香氛、小样、其他。
4. 彩妆如果能看到色号或颜色名，填入 color；否则留空。
5. 不做功效评价或成分推测，packaging_text 只摘录照片中能看到的关键文字。
6. 可以根据包装可见文字和品类，保守推断轻标签：usage_steps、product_features、suitable_regions、suitable_scenes。无法判断就留空，不要为了凑字段乱猜。
7. 轻标签可从这些词里选：usage_steps=护肤/妆前/底妆/遮瑕/定妆/眼妆/唇妆/补妆；product_features=保湿/清爽/控油/修护/提亮/遮瑕/持妆/舒缓；suitable_regions=T区/鼻翼/眼下/唇周/脸颊/下颌/全脸；suitable_scenes=通勤/办公室/晚间出门/拍照/干燥天气/潮湿天气。
8. confidence 只能是 high、medium、low。文字清楚且能读出品牌/品名时用 high；主要靠外观判断时用 low。
9. recognition_mode 只能是 text、visual、mixed、unknown。
10. 如果照片不是产品或完全无法判断，name 留空，category 写“其他”，recognition_mode 写“unknown”。

请严格只返回一行 JSON，不要加解释、markdown 或额外文字：
{"brand":"","name":"","category":"其他","volume":"","color":"","packaging_text":"","usage_steps":"","product_features":"","suitable_regions":"","suitable_scenes":"","recognition_mode":"unknown","confidence":"low","needs_review":true}"""

        response = client.models.generate_content(
            model=model_name,
            contents=[
                prompt,
                genai.types.Part.from_bytes(
                    data=image_bytes,
                    mime_type=mime_type,
                ),
            ],
        )

        text = (getattr(response, 'text', '') or '').strip()
        result = _parse_json_object(text)
        if not result:
            print(f'[recognizer] 响应中无可解析 JSON: {text[:200]}')
            return _failure('bad_response', 'Gemini 返回格式异常，请重新拍清楚包装正面')

        brand = _clean(result.get('brand'))
        raw_name = _clean(result.get('name'))
        packaging_text = _clean(result.get('packaging_text'), 160)
        category = _normalize_category(result.get('category'), raw_name, packaging_text)
        name = raw_name
        confidence = _clean(result.get('confidence') or 'low', 12).lower()
        recognition_mode = _clean(result.get('recognition_mode') or 'unknown', 12).lower()
        needs_review = _as_bool(result.get('needs_review'))

        if confidence not in {'high', 'medium', 'low'}:
            confidence = 'low'
        if recognition_mode not in {'text', 'visual', 'mixed', 'unknown'}:
            recognition_mode = 'unknown'

        if not name:
            if brand and packaging_text:
                name = packaging_text
                needs_review = True
            elif category != '其他':
                name = f'疑似{category}产品'
                needs_review = True
                recognition_mode = 'visual' if recognition_mode == 'unknown' else recognition_mode

        if recognition_mode == 'unknown' and any([brand, name, packaging_text]):
            recognition_mode = 'mixed'
            needs_review = True

        if not any([brand, name, packaging_text]):
            return _failure('not_enough_info', '照片里没有足够的产品信息，请拍清楚包装正面或手动填写')

        data = {
            'brand': brand,
            'name': name,
            'category': category,
            'volume': _clean(result.get('volume'), 50),
            'color': _clean(result.get('color'), 50),
            'packaging_text': packaging_text,
            'usage_steps': _clean_tag_text(result.get('usage_steps')),
            'product_features': _clean_tag_text(result.get('product_features')),
            'suitable_regions': _clean_tag_text(result.get('suitable_regions')),
            'suitable_scenes': _clean_tag_text(result.get('suitable_scenes')),
            'recognition_mode': recognition_mode,
            'confidence': confidence,
            'needs_review': needs_review or confidence == 'low' or name.startswith('疑似'),
        }

        message = ''
        if data['needs_review']:
            message = '已生成初步识别结果，请核对品牌、名称和分类'

        return _success(data, message)

    except Exception as e:
        print(f'[recognizer] 识别失败: {e}')
        reason, message = _friendly_api_error(e)
        return _failure(reason, message)


def recognize_product_voice(audio_bytes, mime_type='audio/webm'):
    """从语音录入中解析产品字段，返回与图片识别一致的状态结构。"""
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        print('[recognizer] 未设置 GEMINI_API_KEY，跳过语音识别')
        return _failure('no_api_key', 'AI 服务未配置，请设置 GEMINI_API_KEY')

    try:
        from google import genai
    except ImportError:
        print('[recognizer] 未安装 google-genai，请执行: pip install google-genai')
        return _failure('no_lib', 'AI 依赖未安装，请安装 google-genai')

    model_name = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')
    mime_type = (mime_type or 'audio/webm').split(';', 1)[0]

    try:
        client = genai.Client(api_key=api_key)
        prompt = """你会收到一段中文语音，内容是用户在录入美妆/护肤产品。请先转写用户原话，再从原话中提取字段。

字段要求：
1. brand：品牌，如 Vaseline、兰蔻、花西子；没说就留空。
2. name：产品名；没说清楚时，用用户说到的核心产品描述。
3. category：必须从这些分类中选择一个：洁面、爽肤水、精华、乳液、面霜、眼霜、防晒、面膜、底妆、遮瑕、定妆、眉眼、唇妆、腮红修容、工具、香氛、小样、其他。
4. volume：规格容量，如 30ml、50g；没说就留空。
5. color：色号或颜色；没说就留空。
6. notes：适合放进备注的补充信息；没有就留空。
7. transcript：完整转写原话。
8. usage_steps / product_features / suitable_regions / suitable_scenes：如果用户提到用途、特点、区域或场景，按这些轻标签提取；没说就留空。可用标签同照片识别。
9. confidence：high、medium、low。
10. needs_review：如果字段不完整或可能听错，设为 true。

请严格只返回一行 JSON：
{"brand":"","name":"","category":"其他","volume":"","color":"","notes":"","usage_steps":"","product_features":"","suitable_regions":"","suitable_scenes":"","transcript":"","confidence":"low","needs_review":true}"""

        response = client.models.generate_content(
            model=model_name,
            contents=[
                prompt,
                genai.types.Part.from_bytes(
                    data=audio_bytes,
                    mime_type=mime_type,
                ),
            ],
        )

        text = (getattr(response, 'text', '') or '').strip()
        parsed = _parse_json_object(text)
        if not parsed:
            print(f'[recognizer] 语音响应中无可解析 JSON: {text[:200]}')
            return _failure('bad_response', '语音识别返回格式异常，请重试或手动填写')

        transcript = _clean(parsed.get('transcript'), 260)
        fallback = _parse_voice_text(transcript)
        brand = _clean(parsed.get('brand')) or fallback['brand']
        name = _clean(parsed.get('name')) or fallback['name']
        packaging_text = transcript
        category = _normalize_category(parsed.get('category'), name, packaging_text)
        if category == '其他':
            category = fallback['category']

        if not name and category != '其他':
            name = f'语音记录的{category}产品'

        if not name and not brand and category == '其他':
            return _failure('not_enough_info', '没有听清产品信息，请靠近麦克风再说一次')

        confidence = _clean(parsed.get('confidence') or 'low', 12).lower()
        if confidence not in {'high', 'medium', 'low'}:
            confidence = 'low'

        notes = _clean(parsed.get('notes'), 260) or fallback['notes']
        data = {
            'brand': brand,
            'name': name,
            'category': category,
            'volume': _clean(parsed.get('volume'), 50) or fallback['volume'],
            'color': _clean(parsed.get('color'), 50) or fallback['color'],
            'notes': notes,
            'usage_steps': _clean_tag_text(parsed.get('usage_steps')),
            'product_features': _clean_tag_text(parsed.get('product_features')),
            'suitable_regions': _clean_tag_text(parsed.get('suitable_regions')),
            'suitable_scenes': _clean_tag_text(parsed.get('suitable_scenes')),
            'transcript': transcript,
            'recognition_mode': 'voice',
            'confidence': confidence,
            'needs_review': _as_bool(parsed.get('needs_review')) or confidence != 'high',
        }

        message = ''
        if data['needs_review']:
            message = '已根据语音生成初步结果，请核对后保存'

        return _success(data, message)
    except Exception as e:
        print(f'[recognizer] 语音识别失败: {e}')
        reason, message = _friendly_api_error(e)
        return _failure(reason, message)
