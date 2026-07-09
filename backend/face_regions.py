"""
面部区域定义与提取模块

基于 MediaPipe Face Mesh 的 478 个地标，将面部划分为 8 个分析区域，
并提供从原始图像中裁剪各区域 ROI 的功能。
同时包含人脸轮廓 Mask 生成，用于热力图裁切。
"""

import traceback
from io import BytesIO

import numpy as np
from PIL import Image, ImageOps, ImageDraw
from scipy.ndimage import gaussian_filter


def _load_image(image_bytes):
    """加载图片并自动校正 EXIF 旋转方向"""
    from io import BytesIO as _Bio
    img = Image.open(_Bio(image_bytes))
    img = ImageOps.exif_transpose(img)
    return img


# ============================================================
# 区域定义 — 地标索引集合
# ============================================================

REGION_DEFINITIONS = {
    '前额': {
        'indices': [
            9, 10, 67, 68, 69, 107, 108, 109, 151, 299, 337, 338,
        ],
        'label': 'Forehead',
        'description': 'T区上部 — 额头区域',
    },
    '左脸颊': {
        'indices': [
            36, 47, 100, 116, 117, 118, 119, 123, 187, 205, 206, 207, 234,
        ],
        'label': 'Left Cheek',
        'description': '左侧苹果肌区域',
    },
    '右脸颊': {
        'indices': [
            266, 277, 329, 345, 346, 347, 348, 352, 411, 425, 426, 427, 454,
        ],
        'label': 'Right Cheek',
        'description': '右侧苹果肌区域',
    },
    '鼻子': {
        'indices': [
            1, 2, 3, 4, 5, 6, 45, 46, 47, 48, 197, 198, 275, 276, 277, 278,
        ],
        'label': 'Nose',
        'description': '鼻部及鼻翼区域',
    },
    '下巴': {
        'indices': [
            148, 149, 150, 152, 172, 176, 136, 58,
        ],
        'label': 'Chin',
        'description': '下巴区域',
    },
    '左眼周': {
        'indices': [
            # 左眼下眼睑（眼袋/黑眼圈）
            33, 7, 163, 144, 145, 153, 154, 155, 133,
            # 左眉
            70, 63, 105, 66, 107, 55, 65, 52, 53, 46,
        ],
        'label': 'Left Eye Area',
        'description': '左眼袋及眉骨区域',
    },
    '右眼周': {
        'indices': [
            # 右眼下眼睑（眼袋/黑眼圈）
            263, 249, 390, 373, 374, 380, 381, 382, 362,
            # 右眉
            300, 293, 334, 296, 336, 285, 295, 282, 283, 276,
        ],
        'label': 'Right Eye Area',
        'description': '右眼袋及眉骨区域',
    },
    '唇周': {
        'indices': [
            # 外唇
            61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291,
            375, 321, 405, 314, 17, 84, 181, 91, 146,
            # 内唇
            78, 191, 80, 81, 82, 13, 312, 311, 310, 415,
            308, 324, 318, 402, 317, 14, 87, 178, 88, 95,
        ],
        'label': 'Lip Area',
        'description': '唇部及周围区域',
    },
}


def extract_region_roi(image_bytes, landmarks, region_name, image_size, padding_ratio=0.15, max_side=180, img=None):
    """
    从原始图像中裁剪出指定面部区域的 ROI。

    参数:
        image_bytes: 原始图片字节
        landmarks: MediaPipe 返回的归一化地标列表（NormalizedLandmark 对象）
        region_name: 区域名称（REGION_DEFINITIONS 的 key）
        image_size: (width, height) 原始图像尺寸
        padding_ratio: ROI 外扩比例，默认 0.15
        img: 可选，已加载的 PIL RGB Image。传入则跳过解码，大幅减少重复 IO。

    返回:
        roi_bytes: 裁剪后区域图片的 JPEG 字节，失败返回 None
    """
    if region_name not in REGION_DEFINITIONS:
        print(f'[face_regions] 未知区域: {region_name}')
        return None

    region_indices = REGION_DEFINITIONS[region_name]['indices']
    w, h = image_size

    try:
        if img is None:
            img = _load_image(image_bytes)
            img = img.convert('RGB')

        # 1. 遍历该区域的地标，找到包围盒
        min_x = 1.0
        min_y = 1.0
        max_x = 0.0
        max_y = 0.0

        for idx in region_indices:
            lm = landmarks[idx]
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

        # 对眼周和唇周额外向下/向外扩展
        extra_pad_x = 0
        extra_pad_y = 0
        if '眼周' in region_name:
            extra_pad_y = int(box_h * 0.2)  # 眼袋区域向下多扩展
        elif region_name == '唇周':
            extra_pad_x = int(box_w * 0.1)
            extra_pad_y = int(box_h * 0.15)

        left_px = max(0, left_px - pad_x - extra_pad_x)
        right_px = min(w, right_px + pad_x + extra_pad_x)
        top_px = max(0, top_px - pad_y - extra_pad_y)
        bottom_px = min(h, bottom_px + pad_y + extra_pad_y)

        # 4. 裁剪。ROI 只用于本地图像特征提取，不用于展示；限制尺寸能明显降低纹理计算耗时。
        roi_img = img.crop((left_px, top_px, right_px, bottom_px))
        if max(roi_img.size) > max_side:
            roi_img.thumbnail((max_side, max_side), Image.LANCZOS)

        # 5. 输出 JPEG
        buf = BytesIO()
        roi_img.save(buf, format='JPEG', quality=90)
        roi_bytes = buf.getvalue()

        return roi_bytes

    except Exception as e:
        print(f'[face_regions] 裁剪区域 {region_name} 失败: {e}')
        traceback.print_exc()
        return None


def extract_all_regions(image_bytes, landmarks, image_size, max_side=180):
    """
    一次性提取所有 8 个面部区域。

    参数:
        image_bytes: 原始图片字节
        landmarks: MediaPipe 返回的归一化地标列表
        image_size: (width, height) 原始图像尺寸

    返回:
        dict: {region_name: roi_bytes, ...}，提取失败的区域为 None
    """
    # 只加载一次图片，8 个区域共用，避免重复解码
    img = _load_image(image_bytes)
    img = img.convert('RGB')

    regions = {}
    for name in REGION_DEFINITIONS:
        roi = extract_region_roi(image_bytes, landmarks, name, image_size, max_side=max_side, img=img)
        regions[name] = roi
        status = f'{len(roi)/1024:.1f}KB' if roi else '失败'
        print(f'[face_regions] {name}: {status}')
    return regions


def get_region_centers(landmarks, image_size):
    """
    获取每个区域的中心坐标（用于热点图）。

    返回:
        dict: {region_name: (x_px, y_px), ...}
    """
    w, h = image_size
    centers = {}

    for name, definition in REGION_DEFINITIONS.items():
        indices = definition['indices']
        sum_x = sum_y = 0.0
        count = len(indices)

        for idx in indices:
            lm = landmarks[idx]
            sum_x += lm.x
            sum_y += lm.y

        center_x = int((sum_x / count) * w)
        center_y = int((sum_y / count) * h)
        centers[name] = (center_x, center_y)

    return centers


# ============================================================
# 人脸轮廓 & Mask 生成（用于热力图裁切）
# ============================================================

# MediaPipe Face Mesh 人脸轮廓（Face Oval）地标索引
# 这些点沿面部外轮廓分布：额头 → 左脸颊 → 下巴 → 右脸颊 → 回到额头
FACE_OVAL_INDICES = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
]


def get_face_oval_points(landmarks, image_size):
    """
    从 MediaPipe 地标中提取人脸轮廓的像素坐标。

    参数：
        landmarks:  MediaPipe 归一化地标列表
        image_size: (width, height)

    返回：
        ndarray: (N, 2) 形状的像素坐标数组 [x, y]
    """
    w, h = image_size
    pts = []

    for idx in FACE_OVAL_INDICES:
        lm = landmarks[idx]
        px = int(lm.x * w)
        py = int(lm.y * h)
        pts.append([px, py])

    return np.array(pts)


def generate_face_mask(landmarks, image_size, feather_px=5):
    """
    根据 MediaPipe 人脸轮廓生成二值蒙版，用于裁切热力图背景。

    流程：
        1. 从 Face Oval 地标提取轮廓点
        2. 用 PIL 绘制填充多边形
        3. 转为 numpy 浮点蒙版 (0.0 ~ 1.0)
        4. 可选：边缘高斯羽化，使热力图边缘柔和过渡

    参数：
        landmarks:   MediaPipe 归一化地标列表
        image_size:  (width, height)
        feather_px:  边缘羽化像素数，默认 5px

    返回：
        mask: (h, w) 形状的 float64 数组
              值域 [0, 1]，1=人脸内部，0=背景
    """
    w, h = image_size

    # 1. 获取轮廓点
    oval_pts = get_face_oval_points(landmarks, image_size)

    # 2. 用 PIL 绘制填充多边形
    mask_img = Image.new('L', (w, h), 0)  # 黑色背景
    draw = ImageDraw.Draw(mask_img)

    # 将点转为 tuple 列表
    polygon = [(int(p[0]), int(p[1])) for p in oval_pts]
    draw.polygon(polygon, fill=255)

    # 3. 转为 numpy float
    mask = np.array(mask_img, dtype=np.float64) / 255.0

    # 4. 边缘羽化（可选）
    if feather_px > 0:
        sigma = feather_px / 3.0  # 约 3σ 内羽化
        mask = gaussian_filter(mask, sigma=sigma, mode='constant')

    print(f'[face_regions] 人脸 Mask 生成: 轮廓点={len(oval_pts)}, '
          f'人脸占比={mask.mean()*100:.1f}%, 羽化={feather_px}px')

    return mask
