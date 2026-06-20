"""
AI 识别模块（Gemini Vision）

使用 Google Gemini 识别照片中的日用品/护肤品，返回品牌、产品名、分类。

环境变量：
    GEMINI_API_KEY — Google AI Studio 获取的 API Key（必填）
    GEMINI_MODEL    — 模型名，默认 gemini-2.5-flash
    GEMINI_TIMEOUT  — API 超时秒数，默认 25
"""

import os
import json
import re
from io import BytesIO


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


def recognize_product(image_bytes):
    """
    识别照片中的日用品，返回品牌、产品名、分类。

    返回格式：
        {
            "brand": "品牌名",
            "name": "产品名称",
            "category": "分类",
        }
        或 None 表示未能识别
    """
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        print('[recognizer] 未设置 GEMINI_API_KEY，跳过识别')
        return None

    try:
        from google import genai
    except ImportError:
        print('[recognizer] 未安装 google-genai，请执行: pip install google-genai')
        return None

    model_name = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')
    timeout = int(os.environ.get('GEMINI_TIMEOUT', '25'))
    mime_type = _detect_mime(image_bytes)

    try:
        client = genai.Client(api_key=api_key)

        prompt = """识别这张照片中的物品，可能是护肤品、化妆品、日用品、食品饮料等。

请提取以下信息：
1. 品牌（如 La Mer、农夫山泉、Nike 等，没有则留空）
2. 产品名称（简洁描述即可，如"奇迹面霜 60ml"、"矿泉水 550ml"）
3. 分类（从以下选一个：面霜、精华、面膜、洁面、防晒、爽肤水、眼霜、彩妆、饮料、食品、日用品、其他）

请严格只返回一行 JSON，不要加任何解释、markdown 标记或额外文字：
{"brand":"品牌","name":"产品名","category":"分类"}"""

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

        text = response.text.strip()

        # 尝试直接解析 JSON
        try:
            result = json.loads(text)
        except json.JSONDecodeError:
            # 兜底：用正则从文本中提取 JSON 对象
            match = re.search(r'\{[^{}]*\}', text)
            if match:
                try:
                    result = json.loads(match.group(0))
                except json.JSONDecodeError:
                    print(f'[recognizer] 无法解析 JSON: {text[:200]}')
                    return None
            else:
                print(f'[recognizer] 响应中无 JSON: {text[:200]}')
                return None

        return {
            'brand': result.get('brand', ''),
            'name': result.get('name', ''),
            'category': result.get('category', '其他'),
        }

    except Exception as e:
        print(f'[recognizer] 识别失败: {e}')
        return None
