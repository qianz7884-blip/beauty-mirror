"""
肤质分析模块（MediaPipe Face Mesh + RAG 知识库 + Gemini Vision）

功能：
    1. MediaPipe Face Landmarker 面部检测
    2. 8 区域 ROI 裁剪（前额/脸颊/鼻子/下巴/眼周/唇周）
    3. ChromaDB RAG 知识检索增强分析精度
    4. Gemini Vision 多图分区肤质分析
    5. matplotlib 面部热点图生成

环境变量：
    GEMINI_API_KEY — Google AI Studio 获取的 API Key（必填）
    GEMINI_MODEL    — 模型名，默认 gemini-2.5-flash
"""

import os
import json
import re
import base64
import traceback
import time
from io import BytesIO

from PIL import Image, ImageOps
import numpy as np


def _load_image(image_bytes):
    """
    加载图片并自动校正 EXIF 旋转方向。
    手机拍照常带有 90°/180°/270° 的 EXIF Orientation 元数据，
    浏览器会自动根据 EXIF 旋转显示，但 PIL 不会。
    此函数确保后端处理的图片与前端预览方向一致。
    """
    img = Image.open(BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)
    return img


# ============================================================
# 面部检测（MediaPipe Face Landmarker — Tasks API）
# ============================================================

# 模型文件路径（避免中文路径，用 HOME 目录）
_MODEL_DIR = os.path.join(os.path.expanduser('~'), '.mediapipe')
_MODEL_PATH = os.path.join(_MODEL_DIR, 'face_landmarker.task')

_FaceLandmarker = None  # 单例缓存
ROI_FEATURE_BUDGET_MS = int(os.environ.get('ROI_FEATURE_BUDGET_MS', '500'))
ROI_FEATURE_MAX_SIDE = int(os.environ.get('ROI_FEATURE_MAX_SIDE', '180'))


def _get_detector():
    """懒加载 FaceLandmarker 实例（避免每次请求重新创建）"""
    global _FaceLandmarker
    if _FaceLandmarker is not None:
        print('[skin_analyzer] 复用已缓存的 FaceLandmarker')
        return _FaceLandmarker

    try:
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision
    except ImportError:
        raise ImportError('未安装 mediapipe')

    if not os.path.exists(_MODEL_PATH):
        # 自动下载模型文件
        print('[skin_analyzer] 正在下载面部检测模型...')
        os.makedirs(_MODEL_DIR, exist_ok=True)
        import urllib.request
        url = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'
        urllib.request.urlretrieve(url, _MODEL_PATH)
        print('[skin_analyzer] 模型下载完成')

    base_options = mp_python.BaseOptions(model_asset_path=_MODEL_PATH)
    options = vision.FaceLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.IMAGE,
        num_faces=2,
        min_face_detection_confidence=0.5,
    )
    _FaceLandmarker = vision.FaceLandmarker.create_from_options(options)
    print('[skin_analyzer] FaceLandmarker 创建成功')
    return _FaceLandmarker


def detect_face(image_bytes):
    """
    使用 MediaPipe Face Landmarker 检测照片中的人脸。

    返回：
        (True, result_dict)   — 检测到恰好 1 张人脸
            result_dict = {
                'landmarks': [...],       # 全部 478 个归一化地标 (用于 ROI 裁剪)
                'image_size': (w, h),     # 原始图像尺寸
                'face_data': {...},       # 兼容旧格式的 5 个坐标 + landmark_count
            }
        (False, "错误信息")     — 未检测到或多张人脸
    """
    try:
        detector = _get_detector()
    except ImportError:
        print('[skin_analyzer] 未安装 mediapipe')
        return False, '面部检测模块未安装，请联系管理员'
    except Exception as e:
        print(f'[skin_analyzer] 模型加载失败: {e}')
        traceback.print_exc()
        return False, f'面部检测模型加载失败: {str(e)}'

    mp_image = None
    try:
        import mediapipe as mp

        # 将 bytes 转为 numpy 数组，再构造 MediaPipe Image
        img = _load_image(image_bytes)
        img = img.convert('RGB')
        img_np = np.array(img).copy()  # 独立拷贝，避免内存共享问题

        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=img_np,
        )

        print(f'[skin_analyzer] 开始面部检测，图片尺寸: {img.size}')
        results = detector.detect(mp_image)
        print(f'[skin_analyzer] 面部检测完成，检测到 {len(results.face_landmarks) if results.face_landmarks else 0} 张人脸')

        if not results.face_landmarks:
            return False, '未检测到面部，请拍摄一张清晰的正面面部照片'

        if len(results.face_landmarks) > 1:
            return False, '检测到多张人脸，请确保照片中只有一张面部'

        # 提取全部地标（用于 ROI 裁剪）
        landmarks = results.face_landmarks[0]
        # 提取关键区域坐标（归一化 0-1），兼容旧格式
        face_data = {
            'landmark_count': len(landmarks),
            'forehead_y': round(landmarks[10].y, 3),
            'left_cheek_x': round(landmarks[234].x, 3),
            'right_cheek_x': round(landmarks[454].x, 3),
            'nose_y': round(landmarks[1].y, 3),
            'chin_y': round(landmarks[152].y, 3),
        }

        return True, {
            'landmarks': landmarks,
            'image_size': img.size,   # (width, height)
            'face_data': face_data,
        }

    except Exception as e:
        print(f'[skin_analyzer] 面部检测异常: {e}')
        traceback.print_exc()
        return False, f'面部检测失败: {str(e)}'
    finally:
        # 显式释放 MediaPipe Image 的底层 C++ 资源
        if mp_image is not None:
            try:
                mp_image.close()
            except Exception:
                pass  # 忽略 close 时的错误


# ============================================================
# 人脸 ROI 裁剪
# ============================================================

def extract_face_roi(image_bytes, landmarks, image_size, padding_ratio=0.2):
    """
    从全部 478 个面部地标计算人脸包围盒，裁剪出面部 ROI。

    参数:
        image_bytes: 原始图片字节
        landmarks: MediaPipe 返回的归一化地标列表（NormalizedLandmark 对象，x/y 范围 0-1）
        image_size: (width, height) 原始图像尺寸（像素）
        padding_ratio: 包围盒外扩比例，默认 0.2（即四周各扩展 20%）

    返回:
        roi_bytes: 裁剪后面部 ROI 的 JPEG 字节
    """
    try:
        img = _load_image(image_bytes)
        img = img.convert('RGB')
        w, h = image_size

        # 1. 遍历全部地标，找到归一化坐标的包围盒
        min_x = 1.0
        min_y = 1.0
        max_x = 0.0
        max_y = 0.0

        for lm in landmarks:
            if lm.x < min_x:
                min_x = lm.x
            if lm.x > max_x:
                max_x = lm.x
            if lm.y < min_y:
                min_y = lm.y
            if lm.y > max_y:
                max_y = lm.y

        # 2. 归一化坐标 → 像素坐标
        left_px = int(min_x * w)
        right_px = int(max_x * w)
        top_px = int(min_y * h)
        bottom_px = int(max_y * h)

        # 3. 外扩边距
        box_w = right_px - left_px
        box_h = bottom_px - top_px
        pad_x = int(box_w * padding_ratio)
        pad_y = int(box_h * padding_ratio)

        left_px = max(0, left_px - pad_x)
        right_px = min(w, right_px + pad_x)
        top_px = max(0, top_px - pad_y)
        bottom_px = min(h, bottom_px + pad_y)

        print(f'[skin_analyzer] ROI 原始包围盒: ({int(min_x*w)},{int(min_y*h)})-({int(max_x*w)},{int(max_y*h)}) '
              f'外扩后: ({left_px},{top_px})-({right_px},{bottom_px}) '
              f'占原图 {(right_px-left_px)*(bottom_px-top_px)/(w*h)*100:.0f}%')

        # 4. 裁剪
        roi_img = img.crop((left_px, top_px, right_px, bottom_px))

        # 5. 输出 JPEG bytes
        buf = BytesIO()
        roi_img.save(buf, format='JPEG', quality=92)
        roi_bytes = buf.getvalue()

        print(f'[skin_analyzer] ROI 裁剪完成: {roi_img.size[0]}x{roi_img.size[1]}, '
              f'{len(roi_bytes)/1024:.1f} KB')

        return roi_bytes

    except Exception as e:
        print(f'[skin_analyzer] ROI 裁剪失败: {e}')
        traceback.print_exc()
        return None  # 返回 None 表示裁剪失败，调用方应回退到全图


# ============================================================
# RAG 知识检索
# ============================================================

def _get_rag_context(face_data, region_count=8, query_text=None):
    """
    基于本地知识 JSON 做轻量 RAG 检索。

    这里刻意不调用 ChromaDB/query_knowledge，避免每次分析为了 embedding
    额外调用一次 Gemini。当前请求只保留后面的 generate_content 作为唯一
    Gemini 调用。

    Args:
        face_data: 面部检测数据（保留兼容）
        region_count: 区域数量
        query_text: 自定义查询文本，为 None 时使用默认查询

    返回:
        str: 注入 prompt 的知识文本，如果知识库不可用则返回空字符串
    """
    try:
        if query_text is None:
            query_parts = ['面部肤质分析', f'{region_count}个区域分区评估']
            query_text = ' '.join(query_parts)

        kb_path = os.path.join(os.path.dirname(__file__), 'knowledge_base', 'skin_knowledge.json')
        with open(kb_path, 'r', encoding='utf-8') as f:
            documents = json.load(f)

        query_terms = [term for term in re.split(r'[\s、，,]+', query_text) if term]
        scored = []
        for doc in documents:
            content = f"{doc.get('category', '')} {doc.get('topic', '')} {doc.get('content', '')}"
            score = 0
            for term in query_terms:
                if term and term in content:
                    score += 3 if term in doc.get('topic', '') else 1
            if score:
                scored.append((score, doc))

        if not scored:
            scored = [(1, doc) for doc in documents[:3]]

        scored.sort(key=lambda item: item[0], reverse=True)
        results = [doc for _, doc in scored[:5]]

        lines = ['【皮肤科参考知识】']
        for r in results:
            content = r.get('content', '')
            snippet = content[:220] + ('...' if len(content) > 220 else '')
            lines.append(f"- [{r.get('category', '')}] {r.get('topic', '')}: {snippet}")

        rag_text = '\n'.join(lines)
        print(f'[skin_analyzer] 本地 RAG 检索完成: {len(results)} 条知识')
        return rag_text

    except Exception as e:
        print(f'[skin_analyzer] 本地 RAG 检索异常: {e}')
        return ''


# ============================================================
# 面部热力图生成（委托给 heatmap_generator 模块）
# ============================================================

def generate_heatmap(image_bytes, landmarks, image_size, region_scores):
    """
    生成 Apple Health 风格的面部热力图。

    委托给 heatmap_generator.generate_skin_heatmap 模块，
    该模块实现：
        - 区域中心热源 → 高斯扩散 → 连续热场
        - RdYlGn_r 科学配色映射（绿→黄→橙→红）
        - MediaPipe 人脸轮廓 Mask 裁切背景
        - 原图 + 热力图透明叠加（alpha=0.5）
        - 区域评分标签 + 颜色标尺 + 综合评分

    参数:
        image_bytes: 原始图片字节
        landmarks: MediaPipe 归一化地标列表
        image_size: (width, height)
        region_scores: {region_name: {overall: 0-100, ...}, ...}

    返回:
        str: base64 编码的 PNG 图片，"data:image/png;base64,..." 格式
    """
    try:
        from heatmap_generator import generate_skin_heatmap
        return generate_skin_heatmap(
            image_bytes=image_bytes,
            landmarks=landmarks,
            image_size=image_size,
            region_scores=region_scores,
            alpha=0.5,
            colormap_name='RdYlGn_r',
        )
    except ImportError as e:
        print(f'[skin_analyzer] heatmap_generator 模块不可用: {e}')
        traceback.print_exc()
        return None
    except Exception as e:
        print(f'[skin_analyzer] 热力图生成失败: {e}')
        traceback.print_exc()
        return None


# ============================================================
# 肤质分析（Gemini Vision）
# ============================================================

def _detect_mime(data):
    """根据文件头检测图片 MIME 类型"""
    try:
        img = Image.open(BytesIO(data))
        fmt = img.format
        if fmt:
            return f'image/{fmt.lower()}'
    except Exception:
        pass
    return 'image/jpeg'


# Gemini 客户端单例（避免每次都创建新连接）
_genai_client = None
_genai_client_api_key = None


def _get_genai_client(api_key):
    """复用 Gemini 客户端，避免每次请求都新建连接"""
    global _genai_client, _genai_client_api_key
    if _genai_client is not None and _genai_client_api_key == api_key:
        return _genai_client
    from google import genai
    _genai_client = genai.Client(api_key=api_key)
    _genai_client_api_key = api_key
    return _genai_client


def _resize_for_analysis(image_bytes, max_size=600):
    """
    压缩图片以加速上传和 AI 分析。
    将长边缩放到 max_size，保持比例，JPEG 压缩。
    """
    try:
        img = _load_image(image_bytes)
        img = img.convert('RGB')
        w, h = img.size
        if max(w, h) > max_size:
            ratio = max_size / max(w, h)
            new_size = (int(w * ratio), int(h * ratio))
            img = img.resize(new_size, Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, format='JPEG', quality=75)
        return buf.getvalue()
    except Exception:
        # 压缩失败则返回原图
        return image_bytes


def analyze_skin(image_bytes, db_session=None):
    """
    分析面部照片的肤质 — Mirror Mate「AI 护肤陪伴助手」风格。

    不输出任何数字分数、等级、评分。只提供温和的观察和建议。

    Args:
        image_bytes: 照片二进制数据
        db_session: SQLAlchemy session，传入则启用 Recommendation Engine

    返回：
        {
            'success': True,
            'skin_type': str,
            'concerns': [...],
            'today_status': str,          # 今日状态一句话
            'observations': [str, ...],   # 今日观察 2-4 条
            'today_routine': {...},       # 今日建议 AM/PM/周
            'trend': {...},               # 趋势记录（无历史则为 has_history=False）
            'summary': str,               # Gemini 生成的自然语言总结
            'recommendations': [...],
            'heatmap_base64': str,
            'feature_json': {...},        # 内部特征数据
            'face_data': {...},
        }
    """
    from google import genai

    # Step 1: 面部检测
    has_face, face_info = detect_face(image_bytes)
    if not has_face:
        return {'success': False, 'reason': 'no_face', 'message': face_info}

    face_data = face_info.get('face_data', {})
    landmarks = face_info['landmarks']
    img_size = face_info['image_size']

    # Step 1.5: ROI 本地分析（只执行一次；超出预算则不注入 Gemini prompt）
    from feature_extractor import FeatureExtractor
    extractor = FeatureExtractor()
    roi_analysis_started = time.perf_counter()
    roi_analysis_elapsed_ms = 0.0
    roi_prompt_enabled = False
    region_rois = {}
    roi_prompt_context = ''

    try:
        from face_regions import extract_all_regions
        region_rois = extract_all_regions(
            image_bytes,
            landmarks,
            img_size,
            max_side=ROI_FEATURE_MAX_SIDE,
        )
        roi_analysis_elapsed_ms = (time.perf_counter() - roi_analysis_started) * 1000

        if roi_analysis_elapsed_ms > ROI_FEATURE_BUDGET_MS:
            print(
                f'[skin_analyzer] ROI 提取超时 {roi_analysis_elapsed_ms:.0f}ms '
                f'> {ROI_FEATURE_BUDGET_MS}ms，降级为原 prompt'
            )
            feature_json = extractor._make_default_result()
        else:
            feature_json = extractor.extract_all_features(region_rois, landmarks, img_size)
            roi_analysis_elapsed_ms = (time.perf_counter() - roi_analysis_started) * 1000
            print(f'[skin_analyzer] 特征提取完成 — 肤质: {feature_json["skin_type"]}，耗时 {roi_analysis_elapsed_ms:.0f}ms')

            if roi_analysis_elapsed_ms <= ROI_FEATURE_BUDGET_MS:
                from skin_roi_prompt import build_roi_prompt_context
                roi_prompt_context = build_roi_prompt_context(feature_json)
                roi_prompt_enabled = bool(roi_prompt_context)
                if roi_prompt_enabled:
                    print('[skin_analyzer] ROI prompt 上下文已生成')
            else:
                print(
                    f'[skin_analyzer] ROI 特征分析超时 {roi_analysis_elapsed_ms:.0f}ms '
                    f'> {ROI_FEATURE_BUDGET_MS}ms，降级为原 prompt'
                )
    except ImportError:
        print('[skin_analyzer] ROI 分析模块不可用，降级为原 prompt')
        feature_json = extractor._make_default_result()
    except Exception as e:
        print(f'[skin_analyzer] ROI 分析失败，降级为原 prompt: {e}')
        feature_json = extractor._make_default_result()

    if not roi_prompt_enabled:
        roi_prompt_context = ''

    # 注意：Gemini 仍只在后续 NLG 阶段调用一次，不会按 ROI 分区调用。
    if not feature_json.get('skin_type'):
        feature_json = extractor._make_default_result()

    # Step 1.6: RAG 知识检索
    rag_query_parts = [f'{feature_json["skin_type"]}肌肤']
    if feature_json.get('concerns'):
        rag_query_parts.extend(feature_json['concerns'][:3])
    rag_query = ' '.join(rag_query_parts)
    rag_context = _get_rag_context(face_data, query_text=rag_query)

    # Step 2: 检查 API Key
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        print('[skin_analyzer] 未设置 GEMINI_API_KEY')
        return {'success': False, 'reason': 'no_api_key', 'message': 'AI 服务未配置，请设置 API Key'}

    # Step 3: 导入 Gemini SDK
    try:
        from google import genai as genai_mod
    except ImportError:
        print('[skin_analyzer] 未安装 google-genai')
        return {'success': False, 'reason': 'no_lib', 'message': 'AI 库未安装，请执行: pip install google-genai'}

    model_name = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')

    # ── Step 4: Mirror Mate 推荐引擎 ──
    engine = None
    rec_context = None
    ui_modules = None
    if db_session is not None:
        try:
            from recommendation_engine import RecommendationEngine
            engine = RecommendationEngine(db_session)
            rec_context = engine.generate_context(feature_json)
            ui_modules = engine.generate_ui_modules(feature_json)
            print('[skin_analyzer] Recommendation Engine 完成 — 4 模块已生成')
        except Exception as e:
            print(f'[skin_analyzer] Recommendation Engine 失败，降级为纯特征模式: {e}')
            traceback.print_exc()

    # ── Step 5: 构建 Gemini NLG prompt（纯自然语言生成，无分数无评级）──
    if rec_context:
        ctx_json = json.dumps(rec_context, ensure_ascii=False, indent=2)
        prompt = f"""你是一位温柔、专业的护肤陪伴顾问，叫 Mirror Mate。

你的用户刚刚拍了一张面部照片，我们通过计算机视觉分析得到了一些数据。你的任务是用温暖、自然、亲切的中文，把数据转化成一段贴心的护肤对话。

{roi_prompt_context}

【重要原则】
- 绝对不要输出任何数字分数、百分制、星级或等级
- 不要评价"好/坏"、"优秀/差"，改用温和的描述
- 不要拿用户和他人比较
- 语气像朋友在聊天，不是医生在诊断
- 肯定用户已经做对的地方，温和地指出可以关注的地方
- 用「你」来拉近距离
- 建议要具体、可执行
- 如果【分析数据】里的 product_guidance.owned_products 或 suitable 有可用产品，recommendations 和 mirror_advice 要优先自然写入这些已有产品名；没有匹配产品时再使用泛化品类名
- 不要推荐购买新产品，缺失品类只能温和提醒

【分析数据】
{ctx_json}

请严格只返回一行 JSON（不要 markdown 标记）：
{{"summary":"一段温暖的护肤总结（60-100字），像朋友聊天一样，包含今天的皮肤整体印象+核心护理方向，不使用任何数字","recommendations":["温和具体的建议1（自然融入产品名或成分，不编号）","建议2","建议3","建议4","建议5"],"mirror_advice":[{{"area":"鼻翼两侧","product":"优先使用用户已有产品名；没有合适产品时写已有保湿或舒缓产品","action":"镜前马上能做的动作，不超过20字","reason":"基于 ROI 观察、RAG 知识和产品库的简短原因"}}]}}

mirror_advice 要求：
- 只返回 1-3 条，必须来自分析数据、分区 ROI、产品库和知识参考，不要凭空添加严重结论
- 每条固定包含 area / product / action / reason
- 优先使用用户已有产品，不引导购买，不做医学诊断
- 文案克制，避免“问题、缺陷、严重、必须、警告、扣分”

注意：recommendations 中的每条建议都应该是一句完整、自然的话，像朋友分享护肤心得一样。"""
        print('[skin_analyzer] 发送 Companion 风格 prompt 给 Gemini 做 NLG...')
    else:
        # 降级：无引擎时的简化 prompt（仍然遵循无分数原则）
        feature_summary_parts = [f'肤质类型：{feature_json["skin_type"]}']

        # 定性描述各维度（不输出分数）
        fscores = feature_json['scores']
        dim_descriptions = []
        for dim, label in [('hydration', '水润度'), ('smoothness', '光滑度'),
                           ('brightness', '光泽度'), ('pores', '毛孔细腻度'), ('evenness', '均匀度')]:
            s = fscores.get(dim, 50)
            if s >= 70:
                dim_descriptions.append(f'{label}状态良好')
            elif s >= 45:
                dim_descriptions.append(f'{label}处于一般水平')
            else:
                dim_descriptions.append(f'{label}需要更多关注')
        feature_summary_parts.append('各维度：' + '，'.join(dim_descriptions))

        if feature_json.get('concerns'):
            feature_summary_parts.append(f'观察到的现象：{"、".join(feature_json["concerns"])}')

        kb_section = ''
        if rag_context:
            kb_section = f'\n\n【专业知识参考】\n{rag_context}'

        prompt = f"""你是一位温柔、专业的护肤陪伴顾问，叫 Mirror Mate。

{roi_prompt_context}

以下是通过计算机视觉分析得到的用户皮肤数据：

{chr(10).join(feature_summary_parts)}{kb_section}

请用温暖自然的语言生成护肤指导。绝对不要使用任何数字分数。
严格只返回一行 JSON：
{{"summary":"温暖的护肤总结（50-80字），像朋友聊天","recommendations":["温和具体的建议1","建议2","建议3","建议4","建议5"]}}"""
        print('[skin_analyzer] 发送纯特征 prompt（无推荐引擎）...')

    # ── Step 6: 调用 Gemini 做 NLG ──
    try:
        client = _get_genai_client(api_key)

        response = client.models.generate_content(
            model=model_name,
            contents=[prompt],
        )

        text = response.text.strip()

        # 解析 JSON
        try:
            gemini_result = json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r'\{[^{}]*"summary"[^{}]*\}', text)
            if not match:
                match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                try:
                    gemini_result = json.loads(match.group(0))
                except json.JSONDecodeError:
                    print(f'[skin_analyzer] 无法解析 JSON: {text[:300]}，降级使用本地结果')
                    raise ValueError('JSON parse failed')
            else:
                print(f'[skin_analyzer] 响应中无 JSON: {text[:300]}，降级使用本地结果')
                raise ValueError('No JSON in response')

        # ── Step 7: 生成热点图 ──
        heatmap_b64 = None
        if feature_json.get('region_scores'):
            try:
                heatmap_b64 = generate_heatmap(image_bytes, landmarks, img_size, feature_json['region_scores'])
            except Exception as e:
                print(f'[skin_analyzer] 热点图生成异常: {e}')

        # ── Step 8: 组装返回结果 ──
        result = _build_response(
            feature_json=feature_json,
            gemini_result=gemini_result,
            ui_modules=ui_modules,
            heatmap_b64=heatmap_b64,
            face_data=face_data,
            ai_degraded=False,
        )
        return result

    except Exception as e:
        print(f'[skin_analyzer] Gemini 调用失败，降级使用 Engine 本地结果: {e}')
        traceback.print_exc()

        # 生成热点图
        heatmap_b64 = None
        if feature_json.get('region_scores'):
            try:
                heatmap_b64 = generate_heatmap(image_bytes, landmarks, img_size, feature_json['region_scores'])
            except Exception as he:
                print(f'[skin_analyzer] 热点图生成异常: {he}')

        # 使用 Engine 的规则模块（或纯特征降级）
        return _build_fallback_response(
            feature_json=feature_json,
            ui_modules=ui_modules,
            heatmap_b64=heatmap_b64,
            face_data=face_data,
        )


# ============================================================
# 响应构建辅助函数
# ============================================================
def _normalize_mirror_advice(cards, fallback_cards=None):
    """清洗 Gemini 返回的镜前建议，保证前端拿到稳定的 1-3 张卡。"""
    fallback_cards = fallback_cards or []
    if not isinstance(cards, list):
        return fallback_cards

    cleaned = []
    seen = set()
    forbidden = ['问题', '缺陷', '严重', '必须', '警告', '扣分', '诊断', '治疗']
    for item in cards:
        if not isinstance(item, dict):
            continue
        area = str(item.get('area') or item.get('position') or item.get('region') or '').strip()
        product = str(item.get('product') or item.get('recommended_product') or '').strip()
        action = str(item.get('action') or item.get('suggestion') or '').strip()
        reason = str(item.get('reason') or '').strip()
        text = area + product + action + reason
        if not area or not product or not action or not reason:
            continue
        if any(word in text for word in forbidden):
            continue
        if area in seen:
            continue
        seen.add(area)
        cleaned.append({
            'area': area[:20],
            'product': product[:40],
            'action': action[:36],
            'reason': reason[:60],
        })
        if len(cleaned) >= 3:
            break

    return cleaned or fallback_cards


def _build_response(feature_json, gemini_result, ui_modules, heatmap_b64, face_data, ai_degraded=False):
    """构建完整的 API 响应（Gemini 成功时）"""
    result = {
        'success': True,
        'skin_type': feature_json['skin_type'],
        'concerns': feature_json['concerns'],
        'summary': gemini_result.get('summary', ''),
        'recommendations': gemini_result.get('recommendations', []),
        'heatmap_base64': heatmap_b64,
        'face_data': face_data if isinstance(face_data, dict) else None,
        'feature_json': feature_json,
        # 保留旧字段以兼容数据库存储，但前端不再使用
        'overall_score': feature_json['overall_score'],
        'scores': feature_json['scores'],
        'region_scores': feature_json['region_scores'],
    }
    if ai_degraded:
        result['ai_degraded'] = True

    # ── 注入 4 个陪伴模块 ──
    if ui_modules:
        result['today_status'] = ui_modules.get('today_status', '')
        result['observations'] = ui_modules.get('observations', [])
        result['mirror_advice'] = _normalize_mirror_advice(
            gemini_result.get('mirror_advice'),
            ui_modules.get('mirror_advice', []),
        )
        result['today_routine'] = ui_modules.get('today_routine', {})
        result['trend'] = ui_modules.get('trend', {'has_history': False})
    else:
        # 无引擎时的降级模块
        result['today_status'] = _fallback_status(feature_json)
        result['observations'] = _fallback_observations(feature_json)
        result['mirror_advice'] = _fallback_mirror_advice(feature_json)
        result['today_routine'] = _fallback_routine(feature_json)
        result['trend'] = {'has_history': False}

    return result


def _build_fallback_response(feature_json, ui_modules, heatmap_b64, face_data):
    """构建降级响应（Gemini 不可用时，使用 Engine 规则生成）"""
    if ui_modules:
        today_status = ui_modules.get('today_status', '')
        observations = ui_modules.get('observations', [])
        mirror_advice = ui_modules.get('mirror_advice', [])
        today_routine = ui_modules.get('today_routine', {})
        trend = ui_modules.get('trend', {'has_history': False})

        # 从 observations 和 routine 生成自然语言 summary
        obs_text = '；'.join(observations[:2]) if observations else '皮肤状态稳定'
        routine_morning = today_routine.get('morning', [])
        summary = f"今天{obs_text}。建议早晨{'，'.join(routine_morning[:2]) if routine_morning else '保持日常护理'}。"
        recommendations = _routine_to_recommendations(today_routine, observations)
    else:
        today_status = _fallback_status(feature_json)
        observations = _fallback_observations(feature_json)
        mirror_advice = _fallback_mirror_advice(feature_json)
        today_routine = _fallback_routine(feature_json)
        trend = {'has_history': False}
        summary = today_status
        recommendations = [
            '早晚做好温和清洁和保湿，这是护肤的基础',
            '出门记得涂防晒，帮助皮肤抵御紫外线',
            '每周敷1-2次保湿面膜，给皮肤补充水分',
            '如果皮肤感到不适，减少功能性产品，先做好基础护理',
            '保持良好的作息和饮水习惯，皮肤会越来越好',
        ]

    return {
        'success': True,
        'skin_type': feature_json['skin_type'],
        'concerns': feature_json['concerns'],
        'today_status': today_status,
        'observations': observations,
        'mirror_advice': mirror_advice,
        'today_routine': today_routine,
        'trend': trend,
        'summary': summary,
        'recommendations': recommendations,
        'heatmap_base64': heatmap_b64,
        'face_data': face_data if isinstance(face_data, dict) else None,
        'feature_json': feature_json,
        'overall_score': feature_json['overall_score'],
        'scores': feature_json['scores'],
        'region_scores': feature_json['region_scores'],
        'ai_degraded': True,
    }


def _routine_to_recommendations(routine, observations):
    """将 routine 转为自然语言建议列表"""
    recs = []
    morning = routine.get('morning', [])
    evening = routine.get('evening', [])
    weekly = routine.get('weekly', [])

    if morning:
        recs.append('早晨：' + '，'.join(morning[:3]))
    if evening:
        recs.append('晚上：' + '，'.join(evening[:3]))
    if weekly:
        recs.append('每周：' + '，'.join(weekly[:2]))

    # 补齐到 5 条
    defaults = [
        '坚持每日防晒，这是保护皮肤很有效的习惯',
        '保持规律作息和充足饮水，皮肤会感受到的',
    ]
    while len(recs) < 5:
        recs.append(defaults[len(recs) - len(recs) if len(recs) >= 3 else 0] if len(recs) < 5 else defaults[-1])
        if len(recs) >= 5:
            break
        if len(defaults) > len(recs) - (3 if len(recs) >= 3 else 0):
            recs.append(defaults[min(len(recs) - (3 if len(recs) >= 3 else 0), len(defaults) - 1)])

    return recs[:5]


def _fallback_status(feature_json):
    """无引擎时的降级状态文案"""
    skin_type = feature_json.get('skin_type', '')
    concerns = feature_json.get('concerns', [])
    status_map = {
        '油性': '今天皮肤油脂分泌偏旺盛，注意温和清洁和控油',
        '干性': '今天皮肤偏干燥，记得多给皮肤补充水分和油分',
        '混合性': '今天皮肤呈现混合性特征，分区护理会更有效',
        '中性': '今天皮肤状态比较均衡，保持日常护理节奏就好',
        '敏感性': '今天皮肤需要温和对待，精简护理、避免刺激',
    }
    base = status_map.get(skin_type, '今天皮肤状态基本稳定，适合保持日常护理')
    if concerns:
        base += f'，注意到{"、".join(concerns[:2])}'
    return base + '。'


def _fallback_observations(feature_json):
    """无引擎时的降级观察"""
    obs = []
    concerns = feature_json.get('concerns', [])
    skin_type = feature_json.get('skin_type', '')

    concern_obs = {
        'T区出油': 'T区（前额和鼻子）油脂分泌较活跃，属于常见状态',
        '毛孔粗大': 'T区毛孔比较明显，定期清洁护理可以帮助改善',
        '肤色不均': '面部肤色存在局部差异，坚持防晒和护理会慢慢改善',
        '黑眼圈': '眼周肤色偏暗，充足的睡眠和眼霜护理很重要',
        '干燥脱皮': '皮肤有些干燥起皮，需要加强保湿和修护',
        '面部泛红': '面部有轻微泛红，温和精简的护理更适合当前状态',
        '肤色暗沉': '整体肤色略显暗沉，防晒和规律作息会有所帮助',
        '痘印色斑': '面部有一些色素沉淀，代谢需要时间和耐心',
        '水油失衡': 'T区和面颊状态差异较大，建议试试分区护理',
    }

    for c in concerns[:3]:
        if c in concern_obs:
            obs.append(concern_obs[c])

    if not obs:
        obs.append('今天各区域皮肤状态都比较稳定')
    if len(obs) < 2:
        obs.append('保持日常护理习惯，皮肤会越来越好')

    return obs[:4]


def _fallback_mirror_advice(feature_json):
    """无推荐引擎时的镜前建议兜底。"""
    concerns = feature_json.get('concerns', [])
    cards = []

    if any(c in concerns for c in ['干燥脱皮', '水油失衡', '面部泛红']):
        cards.append({
            'area': '鼻翼两侧',
            'product': '已有保湿或舒缓产品',
            'action': '少量按压，等待 10 秒后再上底妆',
            'reason': '鼻翼区域更容易干燥，提前按压能让底妆更服帖',
        })

    if '黑眼圈' in concerns:
        cards.append({
            'area': '眼下区域',
            'product': '已有底妆 / 定妆产品',
            'action': '薄薄补一层，轻拍提亮',
            'reason': '眼周肤色略偏暗时，轻薄叠加更自然',
        })

    if '肤色不均' in concerns:
        cards.append({
            'area': '唇周边缘',
            'product': '已有底妆 / 定妆产品',
            'action': '轻薄修饰边缘，让整体更干净',
            'reason': '局部肤色不够均匀，会影响整体清爽感',
        })

    if not cards:
        cards.append({
            'area': '鼻翼两侧',
            'product': '已有保湿或舒缓产品',
            'action': '少量按压，等待 10 秒后再上底妆',
            'reason': '局部先做轻微保湿，后续底妆更容易贴合',
        })

    return cards[:3]


def _fallback_routine(feature_json):
    """无引擎时的降级护理建议"""
    skin_type = feature_json.get('skin_type', '')
    concerns = feature_json.get('concerns', [])

    morning = ['温和洁面', '爽肤水补水', '保湿精华']
    evening = ['卸妆（如有化妆或防晒）', '温和洁面', '爽肤水', '精华', '面霜锁水']

    if skin_type in ('干性', '敏感性'):
        morning = ['清水或极温和洁面', '保湿精华', '面霜锁水']
    elif skin_type == '油性':
        morning = ['温和控油洁面', '清爽爽肤水', '轻薄保湿']

    if any(c in concerns for c in ['T区出油', '毛孔粗大']):
        evening.insert(2, '控油棉片轻擦T区')

    morning.append('防晒（护肤中很重要的一步 ✨）')

    weekly = ['保湿面膜 1-2次']
    if any(c in concerns for c in ['T区出油', '毛孔粗大']):
        weekly = ['清洁泥膜 1次（T区重点）', '保湿面膜 1-2次']

    return {'morning': morning, 'evening': evening, 'weekly': weekly}
