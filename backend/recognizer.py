"""
彩妆 AI 识别模块（可插拔）

当前版本返回 None，表示无 AI 接入，前端将引导用户手动填写。
后续接入任意 AI（Claude Vision / GPT-4V / 本地模型），只需修改此函数。

函数签名：
    recognize_product(image_bytes: bytes) -> dict | None

返回格式：
    {
        "brand": "品牌名",
        "name": "产品名称",
        "category": "分类",
        "color": "色号",
        "confidence": 0.85,
    }
    或 None 表示未能识别
"""


def recognize_product(image_bytes):
    """
    识别彩妆产品的品牌、名称、分类、色号。

    后续接入示例（Claude Vision）:
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'])
        import base64
        img_b64 = base64.b64encode(image_bytes).decode()
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": img_b64}},
                    {"type": "text", "text": "识别这张彩妆产品照片，返回品牌、产品名、分类、色号"}
                ]
            }]
        )
        # 解析 msg.content 返回 dict

    后续接入示例（OpenAI GPT-4V）:
        import openai
        client = openai.OpenAI(api_key=os.environ['OPENAI_API_KEY'])
        ...
    """
    # TODO: 接入 AI 后替换此函数体
    return None
