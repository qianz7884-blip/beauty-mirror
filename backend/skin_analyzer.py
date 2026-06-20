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
from io import BytesIO

from PIL import Image
import numpy as np


# ============================================================
# 面部检测（MediaPipe Face Landmarker — Tasks API）
# ============================================================

# 模型文件路径（避免中文路径，用 HOME 目录）
_MODEL_DIR = os.path.join(os.path.expanduser('~'), '.mediapipe')
_MODEL_PATH = os.path.join(_MODEL_DIR, 'face_landmarker.task')

_FaceLandmarker = None  # 单例缓存


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
        img = Image.open(BytesIO(image_bytes))
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
        img = Image.open(BytesIO(image_bytes))
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

def _get_rag_context(face_data, region_count=8):
    """
    基于面部检测结果，从 ChromaDB 知识库检索相关皮肤科知识。

    返回:
        str: 注入 prompt 的知识文本，如果知识库不可用则返回空字符串
    """
    try:
        from knowledge_base import query_knowledge, get_kb_stats

        stats = get_kb_stats()
        if stats['count'] == 0:
            print('[skin_analyzer] 知识库为空，跳过 RAG 检索')
            return ''

        # 构建查询文本：结合面部分区信息
        query_parts = ['面部肤质分析', f'{region_count}个区域分区评估']
        query_text = ' '.join(query_parts)

        results = query_knowledge(query_text, top_k=5)

        if not results:
            return ''

        # 拼接为 prompt 可用的参考文本
        lines = ['【皮肤科参考知识】']
        for r in results:
            lines.append(f"- [{r['category']}] {r['topic']}: {r['content']}")

        rag_text = '\n'.join(lines)
        print(f'[skin_analyzer] RAG 检索完成: {len(results)} 条知识')
        return rag_text

    except ImportError:
        print('[skin_analyzer] 知识库模块未安装，跳过 RAG')
        return ''
    except Exception as e:
        print(f'[skin_analyzer] RAG 检索异常: {e}')
        return ''


# ============================================================
# 面部热点图生成
# ============================================================

def generate_heatmap(image_bytes, landmarks, image_size, region_scores):
    """
    使用 matplotlib 在面部照片上生成肤质热点图。

    参数:
        image_bytes: 原始图片字节
        landmarks: MediaPipe 归一化地标列表
        image_size: (width, height)
        region_scores: {region_name: {overall: 0-100, ...}, ...}

    返回:
        str: base64 编码的 PNG 图片，"data:image/png;base64,..." 格式
    """
    try:
        import matplotlib
        matplotlib.use('Agg')  # 非交互后端
        import matplotlib.pyplot as plt
        from scipy.interpolate import griddata

        from face_regions import get_region_centers, REGION_DEFINITIONS

        w, h = image_size

        # 加载原图作为底图
        img = Image.open(BytesIO(image_bytes))
        img = img.convert('RGB')

        # 创建图形
        dpi = 72
        fig_w = w / dpi
        fig_h = h / dpi
        fig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=dpi)
        ax.imshow(img, extent=[0, w, h, 0])  # y 轴翻转以匹配图像坐标

        # 获取各区域中心坐标和得分
        centers = get_region_centers(landmarks, image_size)

        points = []
        values = []
        for name, (cx, cy) in centers.items():
            if name in region_scores:
                score = region_scores[name].get('overall', 50)
            else:
                score = 50  # 默认中性
            points.append([cx, h - cy])  # 翻转 y 到 matplotlib 坐标
            values.append(score)

        if len(points) < 3:
            plt.close(fig)
            return None

        points = np.array(points)
        values = np.array(values)

        # 用面部椭圆地标创建遮罩路径
        face_oval_indices = [
            10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
            397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
            172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
        ]
        mask_pts = []
        for idx in face_oval_indices:
            lm = landmarks[idx]
            mask_pts.append([lm.x * w, h - lm.y * h])
        mask_pts = np.array(mask_pts)

        # ---- 添加面部边缘锚点，帮助线性插值覆盖整个面部 ----
        # 沿面部椭圆均匀采样边缘点，赋予中性分(50)
        n_edge = 16
        edge_indices = np.linspace(0, len(mask_pts) - 1, n_edge, dtype=int)
        for ei in edge_indices:
            ex, ey = mask_pts[ei]
            # 稍微内缩，避免插值外推
            cx_avg = np.mean(points[:, 0])
            cy_avg = np.mean(points[:, 1])
            ex_inner = ex * 0.85 + cx_avg * 0.15
            ey_inner = ey * 0.85 + cy_avg * 0.15
            points = np.vstack([points, [ex_inner, ey_inner]])
            values = np.append(values, 50)

        # 生成插值网格（更细的分辨率）
        grid_res_x, grid_res_y = 120, 160
        grid_x, grid_y = np.meshgrid(
            np.linspace(0, w, grid_res_x),
            np.linspace(0, h, grid_res_y),
        )
        # 用 linear 插值（8 个区域中心 + 边缘锚点足够覆盖）
        grid_z = griddata(points, values, (grid_x, grid_y), method='linear', fill_value=np.nan)

        # 向量化遮罩：只保留面部椭圆内的像素
        from matplotlib.path import Path as MplPath
        mask_path = MplPath(mask_pts)
        flat_coords = np.column_stack([grid_x.ravel(), grid_y.ravel()])
        inside = mask_path.contains_points(flat_coords)
        inside = inside.reshape(grid_z.shape)
        grid_z[~inside] = np.nan

        # 绘制热点图（半透明叠加在原图上）
        heatmap = ax.imshow(
            grid_z,
            extent=[0, w, 0, h],
            cmap='RdYlGn',       # 红=差, 黄=中, 绿=好
            alpha=0.50,          # 半透明，让底图透出
            vmin=0,
            vmax=100,
            origin='lower',
            aspect='auto',
            interpolation='bilinear',  # 平滑渲染
        )

        # 颜色条
        cbar = plt.colorbar(heatmap, ax=ax, fraction=0.04, pad=0.02)
        cbar.set_label('肤质评分', fontsize=8)
        cbar.ax.tick_params(labelsize=7)

        # 标记区域中心圆点 + 分数
        for name, (cx, cy) in centers.items():
            score = region_scores.get(name, {}).get('overall', 50) if region_scores else 50
            if score >= 70:
                color = '#2d5016'
            elif score >= 50:
                color = '#8b6914'
            else:
                color = '#8b2500'
            ax.plot(cx, h - cy, 'o', color=color, markersize=9,
                    markeredgecolor='white', markeredgewidth=2, zorder=5)
            ax.annotate(
                str(score),
                (cx, h - cy),
                textcoords='offset points',
                xytext=(0, -15),
                fontsize=8,
                fontweight='bold',
                color=color,
                ha='center',
                zorder=6,
            )

        ax.set_xlim(0, w)
        ax.set_ylim(0, h)
        ax.axis('off')
        fig.subplots_adjust(left=0, right=1, top=1, bottom=0)

        # 输出为 base64 PNG
        buf = BytesIO()
        fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight', pad_inches=0.1)
        plt.close(fig)
        buf.seek(0)

        b64 = base64.b64encode(buf.read()).decode('utf-8')
        print(f'[skin_analyzer] 热点图生成完成: {len(b64)} 字符')
        return f'data:image/png;base64,{b64}'

    except ImportError as e:
        print(f'[skin_analyzer] 热点图依赖缺失: {e}')
        return None
    except Exception as e:
        print(f'[skin_analyzer] 热点图生成失败: {e}')
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
        img = Image.open(BytesIO(image_bytes))
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


def analyze_skin(image_bytes):
    """
    分析面部照片的肤质（含 RAG 增强 + 8 区域分区评分 + 热点图）。

    返回：
        {
            'success': True,
            'skin_type': ...,
            'overall_score': ...,
            'scores': {...},           # 全脸 5 项评分（兼容旧版）
            'region_scores': {...},    # 8 区域分区评分（新增）
            'concerns': [...],
            'recommendations': [...],
            'summary': ...,
            'heatmap_base64': ...,     # 热点图 base64（新增）
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

    # Step 1.5a: 裁剪面部 ROI（全脸）
    face_roi_bytes = None
    try:
        face_roi_bytes = extract_face_roi(image_bytes, landmarks, img_size, padding_ratio=0.2)
    except Exception as e:
        print(f'[skin_analyzer] 全脸 ROI 裁剪异常: {e}')

    if face_roi_bytes is None:
        print('[skin_analyzer] 全脸 ROI 裁剪失败，使用原图')
        face_roi_bytes = image_bytes

    # Step 1.5b: 提取 8 个分区 ROI
    region_rois = {}
    try:
        from face_regions import extract_all_regions
        region_rois = extract_all_regions(image_bytes, landmarks, img_size)
    except ImportError:
        print('[skin_analyzer] face_regions 模块不可用，跳过分区提取')
    except Exception as e:
        print(f'[skin_analyzer] 分区提取异常: {e}')

    # Step 1.5c: RAG 知识检索
    rag_context = _get_rag_context(face_data)

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

    # Step 4: 构建多图 + RAG 增强的 Prompt
    model_name = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')

    # 压缩全脸 ROI
    compressed_face = _resize_for_analysis(face_roi_bytes, max_size=600)

    # 构建 prompt 中的分区说明
    region_names = list(region_rois.keys()) if region_rois else []
    region_desc_lines = []
    for name in region_names:
        region_desc_lines.append(f"- {name}")

    region_desc = '\n'.join(region_desc_lines) if region_desc_lines else '（未启用分区分析）'

    # 构建知识库参考部分
    kb_section = ''
    if rag_context:
        kb_section = f'\n\n请参考以下皮肤科专业知识进行评估：\n{rag_context}'

    prompt = f"""你是一位资深的皮肤科医生。请分析这张面部照片及其{len(region_names)}个分区特写，给出专业肤质评估。

【分区域说明】
以下面部区域的特写照片已提供：
{region_desc}

请针对全脸和每个区域分别评分。{kb_section}

请按以下格式严格返回一行JSON（不要markdown标记或额外文字）：
{{"skin_type":"肤质类型(油性/干性/混合性/中性/敏感性肌肤)","concerns":["问题1","问题2","问题3"],"scores":{{"hydration":全脸水润度0-100,"smoothness":全脸光滑度0-100,"brightness":全脸光泽度0-100,"pores":全脸毛孔细腻度0-100,"evenness":全脸均匀度0-100}},"overall_score":全脸综合分0-100,"region_scores":{{"""

    # 动态生成 region_scores 模板
    region_templates = []
    for name in region_names:
        region_templates.append(
            f'"{name}":{{"overall":0-100,"hydration":0-100,"smoothness":0-100,"brightness":0-100,"pores":0-100,"evenness":0-100}}'
        )
    prompt += ','.join(region_templates)

    prompt += """},"recommendations":["建议1","建议2","建议3"],"summary":"一句话总结"}"""

    print(f'[skin_analyzer] 准备发送 {1 + len(region_rois)} 张图片给 Gemini...')

    try:
        client = _get_genai_client(api_key)

        # 构建多图内容：全脸 + 各分区
        contents = [prompt]

        # 全脸图
        contents.append(
            genai_mod.types.Part.from_bytes(
                data=compressed_face,
                mime_type='image/jpeg',
            )
        )

        # 各分区图
        for name in region_names:
            roi = region_rois.get(name)
            if roi:
                compressed = _resize_for_analysis(roi, max_size=400)
                contents.append(
                    genai_mod.types.Part.from_bytes(
                        data=compressed,
                        mime_type='image/jpeg',
                    )
                )
                print(f'[skin_analyzer]   + {name}: {len(compressed)/1024:.1f}KB')

        response = client.models.generate_content(
            model=model_name,
            contents=contents,
        )

        text = response.text.strip()

        # 尝试直接解析 JSON
        try:
            result = json.loads(text)
        except json.JSONDecodeError:
            # 兜底：用正则从文本中提取 JSON 对象
            match = re.search(r'\{[^{}]*"skin_type"[^{}]*\}', text)
            if not match:
                # 更宽松的匹配：找最外层大括号
                match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                try:
                    result = json.loads(match.group(0))
                except json.JSONDecodeError:
                    print(f'[skin_analyzer] 无法解析 JSON: {text[:300]}')
                    return {'success': False, 'reason': 'parse_error', 'message': 'AI 返回格式异常，请重试'}
            else:
                print(f'[skin_analyzer] 响应中无 JSON: {text[:300]}')
                return {'success': False, 'reason': 'parse_error', 'message': 'AI 返回格式异常，请重试'}

        # 验证必填字段
        scores = result.get('scores', {})
        region_scores = result.get('region_scores', {})

        # Step 5: 生成热点图
        heatmap_b64 = None
        if region_scores:
            try:
                heatmap_b64 = generate_heatmap(image_bytes, landmarks, img_size, region_scores)
            except Exception as e:
                print(f'[skin_analyzer] 热点图生成异常: {e}')

        return {
            'success': True,
            'skin_type': result.get('skin_type', '未知'),
            'concerns': result.get('concerns', []),
            'scores': {
                'hydration': scores.get('hydration', 0),
                'smoothness': scores.get('smoothness', 0),
                'brightness': scores.get('brightness', 0),
                'pores': scores.get('pores', 0),
                'evenness': scores.get('evenness', 0),
            },
            'overall_score': result.get('overall_score', 0),
            'region_scores': region_scores,
            'recommendations': result.get('recommendations', []),
            'summary': result.get('summary', ''),
            'heatmap_base64': heatmap_b64,
            # 面部检测数据
            'face_data': face_data if isinstance(face_data, dict) else None,
        }

    except Exception as e:
        print(f'[skin_analyzer] 分析失败: {e}')
        traceback.print_exc()
        return {'success': False, 'reason': 'api_error', 'message': f'AI 分析失败，请稍后重试'}
