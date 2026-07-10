"""
面部区域定义与提取模块

基于 MediaPipe Face Mesh 的 478 个地标，将面部划分为 8 个分析区域，
并提供从原始图像中裁剪各区域 ROI 的功能。
同时包含人脸轮廓 Mask 生成，用于热力图裁切。
"""

import os
import time
import traceback
from io import BytesIO

import numpy as np
from PIL import Image, ImageOps, ImageDraw
from scipy.ndimage import gaussian_filter

try:
    import cv2
except ImportError:  # 本地未安装 OpenCV 时使用 PIL/scipy 降级
    cv2 = None


# ============================================================
# ROI / Mask 可调参数
# ============================================================

# 推荐调节范围：
# - FOREHEAD_EXPAND_RATIO: 0.15~0.22。过大会进入头发，过小会漏额头。
# - SIDE_EXPAND_RATIO: 0.05~0.10。用于脸颊外侧方向性扩展。
# - CHIN_EXPAND_RATIO: 0.02~0.06。下巴只轻微下扩，避免吞入脖子。
# - MAX_SIDE_EXPAND_RATIO: 0.10~0.14。限制侧脸扩展，防止扩到耳朵/耳饰/背景。
FOREHEAD_EXPAND_RATIO = 0.18
SIDE_EXPAND_RATIO = 0.08
CHIN_EXPAND_RATIO = 0.04
MAX_SIDE_EXPAND_RATIO = 0.12

ROI_MIN_VALID_PIXELS = 120
ROI_MIN_COVERAGE_RATIO = 0.08
ROI_MAX_FACE_AREA_RATIO = 0.55
ROI_OVERLAP_WARN_RATIO = 0.45

DEBUG_ROI = os.environ.get('DEBUG_ROI', '').lower() in ('1', 'true', 'yes', 'on')
ROI_DEBUG_DIR = os.environ.get(
    'ROI_DEBUG_DIR',
    os.path.join(os.path.dirname(__file__), 'debug_roi'),
)


def load_image(image_bytes):
    """加载图片并自动校正 EXIF 旋转方向"""
    from io import BytesIO as _Bio
    img = Image.open(_Bio(image_bytes))
    img = ImageOps.exif_transpose(img)
    return img


def _landmark_xy(landmarks, idx, image_size):
    w, h = image_size
    lm = landmarks[idx]
    return np.array([lm.x * w, lm.y * h], dtype=np.float64)


def _points_from_indices(landmarks, indices, image_size):
    return np.array([_landmark_xy(landmarks, idx, image_size) for idx in indices], dtype=np.float64)


def _clip_points(points, image_size):
    w, h = image_size
    clipped = np.array(points, dtype=np.float64)
    clipped[:, 0] = np.clip(clipped[:, 0], 0, max(w - 1, 0))
    clipped[:, 1] = np.clip(clipped[:, 1], 0, max(h - 1, 0))
    return clipped


def _bbox_from_points(points, image_size, pad_px=0):
    w, h = image_size
    pts = np.array(points, dtype=np.float64)
    left = int(np.floor(np.min(pts[:, 0]) - pad_px))
    top = int(np.floor(np.min(pts[:, 1]) - pad_px))
    right = int(np.ceil(np.max(pts[:, 0]) + pad_px))
    bottom = int(np.ceil(np.max(pts[:, 1]) + pad_px))
    return [
        max(0, left),
        max(0, top),
        min(w, right),
        min(h, bottom),
    ]


def _bbox_from_mask(mask):
    ys, xs = np.where(mask > 0)
    if xs.size == 0 or ys.size == 0:
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)]


def _draw_poly(mask, points, value=255):
    pts = _clip_points(points, (mask.shape[1], mask.shape[0])).astype(np.int32)
    if len(pts) < 3:
        return mask
    if cv2 is not None:
        cv2.fillPoly(mask, [pts.reshape((-1, 1, 2))], int(value))
        return mask

    img = Image.fromarray(mask)
    draw = ImageDraw.Draw(img)
    draw.polygon([(int(x), int(y)) for x, y in pts], fill=int(value))
    return np.array(img, dtype=np.uint8)


def _draw_ellipse(mask, bbox, value=255):
    left, top, right, bottom = [int(v) for v in bbox]
    if right <= left or bottom <= top:
        return mask
    if cv2 is not None:
        center = ((left + right) // 2, (top + bottom) // 2)
        axes = (max((right - left) // 2, 1), max((bottom - top) // 2, 1))
        cv2.ellipse(mask, center, axes, 0, 0, 360, int(value), -1)
        return mask

    img = Image.fromarray(mask)
    draw = ImageDraw.Draw(img)
    draw.ellipse((left, top, right, bottom), fill=int(value))
    return np.array(img, dtype=np.uint8)


def _blur_and_threshold(mask, sigma=1.2, threshold=96):
    if cv2 is not None:
        k = max(3, int(round(sigma * 6)) | 1)
        blurred = cv2.GaussianBlur(mask, (k, k), sigmaX=sigma, sigmaY=sigma)
        _, out = cv2.threshold(blurred, threshold, 255, cv2.THRESH_BINARY)
        return out.astype(np.uint8)

    blurred = gaussian_filter(mask.astype(np.float64), sigma=sigma, mode='constant')
    return np.where(blurred >= threshold, 255, 0).astype(np.uint8)


def _dilate_mask(mask, radius_px=2):
    if radius_px <= 0:
        return mask
    if cv2 is not None:
        k = max(3, int(radius_px * 2 + 1))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        return cv2.dilate(mask, kernel, iterations=1).astype(np.uint8)

    from scipy.ndimage import binary_dilation
    structure = np.ones((radius_px * 2 + 1, radius_px * 2 + 1), dtype=bool)
    return (binary_dilation(mask > 0, structure=structure) * 255).astype(np.uint8)


def _resize_mask(mask, size):
    img = Image.fromarray(mask.astype(np.uint8), mode='L')
    return np.array(img.resize(size, Image.NEAREST), dtype=np.uint8)


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
            img = load_image(image_bytes)
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
    img = load_image(image_bytes).convert('RGB')
    img_np = np.array(img, dtype=np.uint8)
    debug_id = f'roi_{int(time.time() * 1000)}'

    skin_mask, mask_debug = build_improved_face_skin_mask(
        landmarks,
        image_size,
        image_rgb=img_np,
        debug=DEBUG_ROI,
        debug_prefix=debug_id,
        return_debug=True,
    )

    if skin_mask.shape != (image_size[1], image_size[0]) or skin_mask.dtype != np.uint8:
        raise ValueError(
            f'整脸 skin mask 格式异常: shape={skin_mask.shape}, dtype={skin_mask.dtype}, '
            f'image_size={image_size}'
        )

    skin_area = int(np.sum(skin_mask > 0))
    if skin_area < ROI_MIN_VALID_PIXELS * 8:
        raise ValueError(f'整脸 skin mask 面积过小: {skin_area}px')

    regions = {}
    region_masks = {}
    roi_debug_items = []

    for name in REGION_DEFINITIONS:
        payload = _extract_masked_region_payload(
            img=img,
            img_np=img_np,
            landmarks=landmarks,
            region_name=name,
            image_size=image_size,
            skin_mask=skin_mask,
            max_side=max_side,
            mask_debug=mask_debug,
        )
        regions[name] = payload

        if payload:
            region_masks[name] = payload.get('full_mask')
            roi_debug_items.append(payload)
            status = (
                f"{len(payload['roi_bytes'])/1024:.1f}KB, "
                f"valid={payload['valid_pixel_count']}, "
                f"coverage={payload['mask_coverage_ratio']:.2f}"
            )
        else:
            status = '失败'
        print(f'[face_regions] {name}: {status}')

    _warn_region_overlap(region_masks)

    if DEBUG_ROI:
        _save_roi_debug_images(
            img_np,
            mask_debug,
            roi_debug_items,
            debug_id,
        )

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


def _build_forehead_arc(landmarks, image_size, oval_pts, face_bbox, face_height):
    """
    基于左右额侧/太阳穴附近点和面部宽高，生成 7 个额头补偿点。
    MediaPipe face oval 的顶部通常偏低，这里只做保守向上补偿。
    """
    w, h = image_size
    top_y = float(np.min(oval_pts[:, 1]))
    left_top = _landmark_xy(landmarks, 109, image_size)
    right_top = _landmark_xy(landmarks, 338, image_size)

    # 使用左右额侧点约束弧线横向范围，避免覆盖到头发/耳侧。
    left_candidates = _points_from_indices(landmarks, [67, 103, 109], image_size)
    right_candidates = _points_from_indices(landmarks, [297, 332, 338], image_size)
    left_top[0] = max(np.min(left_candidates[:, 0]), face_bbox[0])
    right_top[0] = min(np.max(right_candidates[:, 0]), face_bbox[2])

    forehead_expand_px = float(face_height * FOREHEAD_EXPAND_RATIO)
    forehead_expand_px = min(forehead_expand_px, face_height * 0.22)
    forehead_expand_px = max(forehead_expand_px, face_height * 0.12)

    xs = np.linspace(left_top[0], right_top[0], 7)
    t_values = np.linspace(0.0, 1.0, 7)
    endpoint_y = min(float(left_top[1]), float(right_top[1]), top_y + face_height * 0.04)
    ys = endpoint_y - forehead_expand_px * np.sin(np.pi * t_values)

    # 保守限制：补偿点不超过图像上界，也不超过 face bbox 顶部太多。
    min_allowed_y = max(0.0, face_bbox[1] - face_height * 0.02)
    ys = np.clip(ys, min_allowed_y, h - 1)

    arc = np.stack([xs, ys], axis=1)
    return _clip_points(arc, image_size), int(round(forehead_expand_px))


def _directionally_expand_oval(landmarks, image_size, oval_pts):
    w, h = image_size
    face_bbox = _bbox_from_points(oval_pts, image_size)
    left, top, right, bottom = face_bbox
    face_width = max(float(right - left), 1.0)
    face_height = max(float(bottom - top), 1.0)
    center_x = (left + right) / 2.0

    nose_x = float(_landmark_xy(landmarks, 1, image_size)[0])
    left_width = max(nose_x - left, face_width * 0.25)
    right_width = max(right - nose_x, face_width * 0.25)
    asymmetry = np.clip((right_width - left_width) / face_width, -0.45, 0.45)

    base_side_px = face_width * SIDE_EXPAND_RATIO
    max_side_px = face_width * MAX_SIDE_EXPAND_RATIO
    left_expand_px = np.clip(base_side_px * (1.0 + max(asymmetry, 0.0) * 0.75), 0, max_side_px)
    right_expand_px = np.clip(base_side_px * (1.0 + max(-asymmetry, 0.0) * 0.75), 0, max_side_px)
    chin_expand_px = face_height * CHIN_EXPAND_RATIO

    expanded = oval_pts.astype(np.float64).copy()
    for i, (x, y) in enumerate(expanded):
        y_norm = np.clip((y - top) / face_height, 0.0, 1.0)

        # 侧脸扩展集中在脸颊中段，额头/下巴位置衰减，限制进入耳朵方向。
        side_weight = np.sin(np.pi * np.clip((y_norm - 0.12) / 0.76, 0.0, 1.0))
        side_weight = max(0.0, float(side_weight))
        if x < center_x:
            expanded[i, 0] = x - left_expand_px * side_weight
        elif x > center_x:
            expanded[i, 0] = x + right_expand_px * side_weight

        if y_norm > 0.82:
            chin_weight = (y_norm - 0.82) / 0.18
            expanded[i, 1] = y + chin_expand_px * np.clip(chin_weight, 0.0, 1.0)

    expanded = _clip_points(expanded, image_size)
    return expanded, {
        'face_bbox': face_bbox,
        'face_width': int(round(face_width)),
        'face_height': int(round(face_height)),
        'nose_x': int(round(nose_x)),
        'left_expand_px': int(round(left_expand_px)),
        'right_expand_px': int(round(right_expand_px)),
        'chin_expand_px': int(round(chin_expand_px)),
        'yaw_proxy': float((nose_x - center_x) / max(face_width / 2.0, 1.0)),
    }


def _build_exclusion_mask(landmarks, image_size, face_width):
    w, h = image_size
    exclusion = np.zeros((h, w), dtype=np.uint8)

    feature_polys = [
        # 左/右眼
        [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
        [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
        # 左/右眉毛
        [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
        [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
        # 嘴唇，只排除唇体，不排除唇周皮肤
        [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
    ]

    for indices in feature_polys:
        try:
            exclusion = _draw_poly(exclusion, _points_from_indices(landmarks, indices, image_size), 255)
        except Exception as exc:
            print(f'[face_regions] 五官排除 mask 绘制失败: {exc}')

    # 鼻孔只做小范围排除，鼻梁/鼻翼皮肤仍保留用于油脂、毛孔、纹理分析。
    nostril_radius = max(2, int(round(face_width * 0.018)))
    for idx in (98, 327):
        if idx >= len(landmarks):
            continue
        cx, cy = _landmark_xy(landmarks, idx, image_size)
        bbox = [
            int(cx - nostril_radius),
            int(cy - nostril_radius),
            int(cx + nostril_radius),
            int(cy + nostril_radius),
        ]
        exclusion = _draw_ellipse(exclusion, bbox, 255)

    exclusion = _dilate_mask(exclusion, radius_px=max(1, int(round(face_width * 0.006))))
    return exclusion


def build_improved_face_skin_mask(
        landmarks,
        image_size,
        image_rgb=None,
        debug=False,
        debug_prefix=None,
        return_debug=False):
    """
    构建改进后的整脸皮肤 mask。

    返回 mask 满足：
        shape == (height, width)
        dtype == np.uint8
        皮肤区域 255，其余 0

    该函数把 MediaPipe face oval 作为基础轮廓，但不会直接使用：
    1. 依据脸宽/脸高做方向性扩展；
    2. 使用 7 个平滑额头补偿点覆盖 face oval 常见的额头缺口；
    3. 根据鼻尖相对中心的偏移做左右侧脸非对称扩展；
    4. 从整脸 mask 中排除眼睛、眉毛、唇体和小范围鼻孔。
    """
    debug = DEBUG_ROI if debug is None else debug
    w, h = image_size
    if not landmarks or len(landmarks) < max(FACE_OVAL_INDICES) + 1:
        raise ValueError(f'关键点数量不足，无法构建 skin mask: {len(landmarks) if landmarks else 0}')

    base_oval = get_face_oval_points(landmarks, image_size).astype(np.float64)
    expanded_oval, metrics = _directionally_expand_oval(landmarks, image_size, base_oval)
    forehead_arc, forehead_expand_px = _build_forehead_arc(
        landmarks,
        image_size,
        expanded_oval,
        metrics['face_bbox'],
        metrics['face_height'],
    )

    # 按 MediaPipe face oval 顺序重组为闭合多边形：
    # 右额侧 -> 右脸 -> 下巴 -> 左脸 -> 左额侧 -> 额头补偿弧线 -> 回到右额侧。
    right_chain = expanded_oval[1:19]
    left_chain = expanded_oval[19:36]
    contour = np.vstack([right_chain, left_chain, forehead_arc])
    contour = _clip_points(contour, image_size)

    face_mask = np.zeros((h, w), dtype=np.uint8)
    face_mask = _draw_poly(face_mask, contour, 255)
    face_mask = _blur_and_threshold(face_mask, sigma=1.25, threshold=96)

    exclusion_mask = _build_exclusion_mask(
        landmarks,
        image_size,
        max(metrics['face_width'], 1),
    )
    skin_mask = np.where((face_mask > 0) & (exclusion_mask == 0), 255, 0).astype(np.uint8)

    skin_area = int(np.sum(skin_mask > 0))
    face_area = int(np.sum(face_mask > 0))
    metrics.update({
        'forehead_expand_px': int(forehead_expand_px),
        'face_mask_area': face_area,
        'skin_mask_area': skin_area,
        'skin_mask_ratio': float(skin_area / max(w * h, 1)),
    })

    print(
        '[face_regions] improved skin mask: '
        f"bbox={metrics['face_bbox']}, face=({metrics['face_width']}x{metrics['face_height']}), "
        f"forehead={metrics['forehead_expand_px']}px, "
        f"left={metrics['left_expand_px']}px, right={metrics['right_expand_px']}px, "
        f"chin={metrics['chin_expand_px']}px, area={skin_area}"
    )

    if skin_area < ROI_MIN_VALID_PIXELS * 8:
        raise ValueError(f'整脸 skin mask 面积过小: {skin_area}px')

    debug_info = {
        'base_oval': base_oval,
        'expanded_oval': expanded_oval,
        'improved_contour': contour,
        'forehead_arc': forehead_arc,
        'face_mask': face_mask,
        'exclusion_mask': exclusion_mask,
        'skin_mask': skin_mask,
        'metrics': metrics,
        'debug_prefix': debug_prefix,
    }

    if debug and image_rgb is not None:
        _save_mask_debug_images(image_rgb, debug_info, debug_prefix or f'roi_{int(time.time() * 1000)}')

    if return_debug:
        return skin_mask, debug_info
    return skin_mask


def _make_box_mask(image_size, bbox, shape='ellipse'):
    w, h = image_size
    mask = np.zeros((h, w), dtype=np.uint8)
    left, top, right, bottom = [int(v) for v in bbox]
    left, top = max(0, left), max(0, top)
    right, bottom = min(w, right), min(h, bottom)
    if right <= left or bottom <= top:
        return mask
    if shape == 'rect':
        mask[top:bottom, left:right] = 255
    else:
        mask = _draw_ellipse(mask, [left, top, right, bottom], 255)
    return mask


def _build_region_mask(region_name, landmarks, image_size, skin_mask, mask_debug):
    w, h = image_size
    metrics = mask_debug.get('metrics', {})
    face_bbox = metrics.get('face_bbox') or _bbox_from_mask(skin_mask) or [0, 0, w, h]
    face_left, face_top, face_right, face_bottom = face_bbox
    face_width = max(face_right - face_left, 1)
    face_height = max(face_bottom - face_top, 1)
    nose_x = float(_landmark_xy(landmarks, 1, image_size)[0])

    definition = REGION_DEFINITIONS.get(region_name)
    if not definition:
        return np.zeros((h, w), dtype=np.uint8)

    pts = _points_from_indices(landmarks, definition['indices'], image_size)
    base_bbox = _bbox_from_points(pts, image_size)
    left, top, right, bottom = base_bbox

    if region_name == '前额':
        brow_pts = _points_from_indices(landmarks, [70, 63, 105, 66, 107, 300, 293, 334, 296, 336], image_size)
        brow_y = float(np.mean(brow_pts[:, 1]))
        region_left = int(max(face_left, nose_x - face_width * 0.42))
        region_right = int(min(face_right, nose_x + face_width * 0.42))
        region_top = int(face_top)
        region_bottom = int(min(brow_y + face_height * 0.035, face_top + face_height * 0.34))
        poly = np.array([
            [region_left, region_top],
            [region_right, region_top],
            [region_right - face_width * 0.07, region_bottom],
            [region_left + face_width * 0.07, region_bottom],
        ])
        region_mask = np.zeros((h, w), dtype=np.uint8)
        region_mask = _draw_poly(region_mask, poly, 255)
    elif region_name == '左脸颊':
        bbox = [
            min(left - face_width * 0.08, face_left + face_width * 0.03),
            top - face_height * 0.05,
            min(max(right + face_width * 0.01, nose_x - face_width * 0.13), nose_x - face_width * 0.08),
            bottom + face_height * 0.09,
        ]
        region_mask = _make_box_mask(image_size, bbox, 'ellipse')
    elif region_name == '右脸颊':
        bbox = [
            max(min(left - face_width * 0.01, nose_x + face_width * 0.13), nose_x + face_width * 0.08),
            top - face_height * 0.05,
            max(right + face_width * 0.08, face_right - face_width * 0.03),
            bottom + face_height * 0.09,
        ]
        region_mask = _make_box_mask(image_size, bbox, 'ellipse')
    elif region_name == '鼻子':
        bbox = [
            max(left - face_width * 0.02, nose_x - face_width * 0.16),
            top + face_height * 0.01,
            min(right + face_width * 0.02, nose_x + face_width * 0.16),
            bottom + face_height * 0.05,
        ]
        region_mask = _make_box_mask(image_size, bbox, 'ellipse')
    elif region_name == '下巴':
        mouth_bottom_y = float(_landmark_xy(landmarks, 17, image_size)[1])
        bbox = [
            max(left - face_width * 0.10, nose_x - face_width * 0.28),
            max(top - face_height * 0.02, mouth_bottom_y + face_height * 0.025),
            min(right + face_width * 0.10, nose_x + face_width * 0.28),
            bottom + face_height * 0.055,
        ]
        region_mask = _make_box_mask(image_size, bbox, 'ellipse')
    elif '眼周' in region_name:
        bbox = [
            left - face_width * 0.035,
            top - face_height * 0.035,
            right + face_width * 0.035,
            bottom + face_height * 0.075,
        ]
        region_mask = _make_box_mask(image_size, bbox, 'ellipse')
    elif region_name == '唇周':
        mouth_bottom_y = float(_landmark_xy(landmarks, 17, image_size)[1])
        bbox = [
            left - face_width * 0.065,
            top - face_height * 0.055,
            right + face_width * 0.065,
            min(bottom + face_height * 0.045, mouth_bottom_y + face_height * 0.055),
        ]
        region_mask = _make_box_mask(image_size, bbox, 'ellipse')
    else:
        pad_x = face_width * 0.04
        pad_y = face_height * 0.04
        region_mask = _make_box_mask(image_size, [left - pad_x, top - pad_y, right + pad_x, bottom + pad_y], 'ellipse')

    final_mask = np.where((region_mask > 0) & (skin_mask > 0), 255, 0).astype(np.uint8)
    return final_mask


def _extract_masked_region_payload(
        img,
        img_np,
        landmarks,
        region_name,
        image_size,
        skin_mask,
        max_side,
        mask_debug):
    full_mask = _build_region_mask(region_name, landmarks, image_size, skin_mask, mask_debug)
    valid_count = int(np.sum(full_mask > 0))
    skin_area = max(int(np.sum(skin_mask > 0)), 1)
    face_ratio = float(valid_count / skin_area)

    warning = ''
    if valid_count < ROI_MIN_VALID_PIXELS:
        warning = f'有效像素过少: {valid_count}'
    elif face_ratio > ROI_MAX_FACE_AREA_RATIO:
        warning = f'ROI 面积偏大: {face_ratio:.2f} of face'
    elif face_ratio < 0.005:
        warning = f'ROI 面积偏小: {face_ratio:.3f} of face'

    if warning:
        print(f'[face_regions] 警告: {region_name} {warning}')
        if valid_count < ROI_MIN_VALID_PIXELS:
            return None

    bbox = _bbox_from_mask(full_mask)
    if not bbox:
        print(f'[face_regions] 警告: {region_name} 无有效 mask')
        return None

    left, top, right, bottom = bbox
    roi_img = img.crop((left, top, right, bottom))
    roi_mask = full_mask[top:bottom, left:right]

    if max(roi_img.size) > max_side:
        scale = max_side / float(max(roi_img.size))
        new_size = (
            max(1, int(round(roi_img.size[0] * scale))),
            max(1, int(round(roi_img.size[1] * scale))),
        )
        roi_img = roi_img.resize(new_size, Image.LANCZOS)
        roi_mask = _resize_mask(roi_mask, new_size)

    roi_valid = int(np.sum(roi_mask > 0))
    roi_area = int(roi_mask.size)
    coverage = float(roi_valid / max(roi_area, 1))
    if coverage < ROI_MIN_COVERAGE_RATIO:
        print(f'[face_regions] 警告: {region_name} mask 覆盖率低: {coverage:.2f}')

    buf = BytesIO()
    roi_img.save(buf, format='JPEG', quality=90)

    return {
        'roi_bytes': buf.getvalue(),
        'mask': roi_mask.astype(np.uint8),
        'bbox': [int(left), int(top), int(right), int(bottom)],
        'full_mask': full_mask,
        'valid_pixel_count': roi_valid,
        'roi_area': roi_area,
        'mask_coverage_ratio': coverage,
        'face_area_ratio': face_ratio,
        'valid': bool(roi_valid >= ROI_MIN_VALID_PIXELS and coverage >= ROI_MIN_COVERAGE_RATIO),
        'quality_warning': warning,
        'region_name': region_name,
    }


def _warn_region_overlap(region_masks):
    names = [name for name, mask in region_masks.items() if mask is not None]
    for i, name_a in enumerate(names):
        mask_a = region_masks[name_a] > 0
        area_a = int(np.sum(mask_a))
        if area_a == 0:
            continue
        for name_b in names[i + 1:]:
            mask_b = region_masks[name_b] > 0
            area_b = int(np.sum(mask_b))
            if area_b == 0:
                continue
            overlap = int(np.sum(mask_a & mask_b))
            ratio = overlap / max(min(area_a, area_b), 1)
            if ratio > ROI_OVERLAP_WARN_RATIO:
                print(f'[face_regions] 警告: {name_a}/{name_b} ROI 重叠偏高: {ratio:.2f}')


def _save_mask_debug_images(image_rgb, debug_info, debug_id):
    os.makedirs(ROI_DEBUG_DIR, exist_ok=True)
    base = Image.fromarray(image_rgb).convert('RGB')

    overlay = base.copy()
    draw = ImageDraw.Draw(overlay)
    for pts, color, width in [
        (debug_info['base_oval'], (255, 255, 255), 2),
        (debug_info['expanded_oval'], (0, 180, 255), 2),
        (debug_info['improved_contour'], (0, 255, 120), 3),
        (debug_info['forehead_arc'], (255, 80, 80), 4),
    ]:
        seq = [(int(x), int(y)) for x, y in pts]
        if len(seq) > 1:
            draw.line(seq + [seq[0]], fill=color, width=width)

    overlay.save(os.path.join(ROI_DEBUG_DIR, f'{debug_id}_01_contours.png'))
    Image.fromarray(debug_info['face_mask']).save(os.path.join(ROI_DEBUG_DIR, f'{debug_id}_02_face_mask.png'))
    Image.fromarray(debug_info['exclusion_mask']).save(os.path.join(ROI_DEBUG_DIR, f'{debug_id}_03_exclusion_mask.png'))
    Image.fromarray(debug_info['skin_mask']).save(os.path.join(ROI_DEBUG_DIR, f'{debug_id}_04_skin_mask.png'))


def _save_roi_debug_images(image_rgb, mask_debug, roi_items, debug_id):
    os.makedirs(ROI_DEBUG_DIR, exist_ok=True)
    base = Image.fromarray(image_rgb).convert('RGB')
    overlay = base.copy()
    draw = ImageDraw.Draw(overlay)
    colors = [
        (255, 80, 80), (80, 160, 255), (80, 220, 120), (255, 180, 80),
        (180, 100, 255), (80, 220, 220), (255, 120, 180), (220, 220, 80),
    ]

    for idx, item in enumerate(roi_items):
        color = colors[idx % len(colors)]
        bbox = item.get('bbox')
        if not bbox:
            continue
        left, top, right, bottom = bbox
        draw.rectangle((left, top, right, bottom), outline=color, width=2)
        draw.text((left, max(0, top - 14)), item.get('region_name', ''), fill=color)

        full_mask = item.get('full_mask')
        if full_mask is not None:
            mask_img = Image.fromarray(full_mask).convert('L')
            tint = Image.new('RGB', base.size, color)
            overlay = Image.composite(Image.blend(overlay, tint, 0.22), overlay, mask_img)
            draw = ImageDraw.Draw(overlay)

    overlay.save(os.path.join(ROI_DEBUG_DIR, f'{debug_id}_05_region_masks.png'))

def generate_face_mask(landmarks, image_size, feather_px=5):
    """
    根据改进后的整脸皮肤 mask 生成浮点蒙版，用于裁切热力图背景。

    流程：
        1. 通过 build_improved_face_skin_mask() 构建 uint8 skin mask
        2. 转为 numpy 浮点蒙版 (0.0 ~ 1.0)
        3. 可选：边缘高斯羽化，使热力图边缘柔和过渡

    参数：
        landmarks:   MediaPipe 归一化地标列表
        image_size:  (width, height)
        feather_px:  边缘羽化像素数，默认 5px

    返回：
        mask: (h, w) 形状的 float64 数组
              值域 [0, 1]，1=人脸内部，0=背景
    """
    skin_mask = build_improved_face_skin_mask(landmarks, image_size)
    mask = skin_mask.astype(np.float64) / 255.0

    if feather_px > 0:
        sigma = feather_px / 3.0  # 约 3σ 内羽化
        mask = gaussian_filter(mask, sigma=sigma, mode='constant')

    print(f'[face_regions] 人脸 Skin Mask 生成: '
          f'人脸占比={mask.mean()*100:.1f}%, 羽化={feather_px}px')

    return mask
