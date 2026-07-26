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
DEBUG_ROI_ALIGNMENT = (
    os.environ.get('DEBUG_ROI_ALIGNMENT', '').lower() in ('1', 'true', 'yes', 'on')
)
DEBUG_MEMORY = os.environ.get('DEBUG_MEMORY', '').lower() in ('1', 'true', 'yes', 'on')
ROI_DEBUG_DIR = os.environ.get(
    'ROI_DEBUG_DIR',
    os.path.join(os.path.dirname(__file__), 'debug_roi'),
)
ROI_UNRELIABLE_WARNING = '该区域 ROI 无法可靠生成'
_FACE_PARSE_UNSET = object()


def _log_array_memory(label, arr):
    if not DEBUG_MEMORY or arr is None:
        return
    try:
        np_arr = np.asarray(arr)
        print(
            f'[memory] {label}: shape={np_arr.shape}, dtype={np_arr.dtype}, '
            f'nbytes={np_arr.nbytes} ({np_arr.nbytes / 1024 / 1024:.2f}MB)'
        )
    except Exception as exc:
        print(f'[memory] {label}: log failed: {exc}')


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


def _mask_center(mask):
    ys, xs = np.where(mask > 0)
    if xs.size == 0 or ys.size == 0:
        return None
    return [int(np.median(xs)), int(np.median(ys))]


def _has_landmarks(landmarks, indices):
    return bool(landmarks) and max(indices, default=-1) < len(landmarks)


def _scale_points(points, center, scale_x=1.0, scale_y=1.0):
    pts = np.asarray(points, dtype=np.float64)
    ctr = np.asarray(center, dtype=np.float64)
    out = pts.copy()
    out[:, 0] = ctr[0] + (out[:, 0] - ctr[0]) * scale_x
    out[:, 1] = ctr[1] + (out[:, 1] - ctr[1]) * scale_y
    return out


def _smooth_closed_contour(points, image_size, iterations=2, compensation=1.004):
    pts = np.asarray(points, dtype=np.float64)
    if pts.ndim != 2 or pts.shape[0] < 4:
        return _clip_points(pts, image_size)

    center = np.mean(pts, axis=0)
    for _ in range(max(int(iterations), 0)):
        nxt = np.roll(pts, -1, axis=0)
        q = 0.76 * pts + 0.24 * nxt
        r = 0.24 * pts + 0.76 * nxt
        smoothed = np.empty((pts.shape[0] * 2, 2), dtype=np.float64)
        smoothed[0::2] = q
        smoothed[1::2] = r
        pts = center + (smoothed - center) * compensation

    return _clip_points(pts, image_size)


def _convex_hull_points(points):
    pts = np.asarray(points, dtype=np.float64)
    pts = pts[np.isfinite(pts).all(axis=1)]
    if pts.shape[0] < 3:
        return pts

    if cv2 is not None:
        hull = cv2.convexHull(pts.astype(np.float32)).reshape(-1, 2)
        return hull.astype(np.float64)

    pts_sorted = sorted(set((float(x), float(y)) for x, y in pts))
    if len(pts_sorted) <= 1:
        return np.array(pts_sorted, dtype=np.float64)

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for p in pts_sorted:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)

    upper = []
    for p in reversed(pts_sorted):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)

    return np.array(lower[:-1] + upper[:-1], dtype=np.float64)


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


def _clip_bbox(bbox, image_size):
    w, h = image_size
    left, top, right, bottom = [int(round(v)) for v in bbox]
    left = max(0, min(left, w))
    top = max(0, min(top, h))
    right = max(left, min(right, w))
    bottom = max(top, min(bottom, h))
    return [left, top, right, bottom]


def _pad_bbox(bbox, image_size, pad_px):
    left, top, right, bottom = bbox
    return _clip_bbox(
        [left - pad_px, top - pad_px, right + pad_px, bottom + pad_px],
        image_size,
    )


def _work_bbox_from_mask(mask, image_size, pad_ratio=0.025):
    bbox = _bbox_from_mask(mask)
    if not bbox:
        return [0, 0, image_size[0], image_size[1]]
    left, top, right, bottom = bbox
    pad_px = int(round(max(right - left, bottom - top) * pad_ratio))
    return _pad_bbox(bbox, image_size, max(pad_px, 2))


def _empty_mask(image_size, work_bbox=None):
    if work_bbox is not None:
        left, top, right, bottom = work_bbox
        return np.zeros((max(bottom - top, 0), max(right - left, 0)), dtype=np.uint8)
    return np.zeros((image_size[1], image_size[0]), dtype=np.uint8)


def _points_for_work_bbox(points, work_bbox):
    pts = np.asarray(points, dtype=np.float64)
    if work_bbox is None:
        return pts
    left, top, _, _ = work_bbox
    return pts - np.array([left, top], dtype=np.float64)


def _offset_point(point, origin):
    if point is None:
        return None
    return (int(point[0] + origin[0]), int(point[1] + origin[1]))


def _offset_bbox(bbox, origin):
    if not bbox:
        return bbox
    return [
        int(bbox[0] + origin[0]),
        int(bbox[1] + origin[1]),
        int(bbox[2] + origin[0]),
        int(bbox[3] + origin[1]),
    ]


def _paste_local_mask(local_mask, image_size, work_bbox):
    full = np.zeros((image_size[1], image_size[0]), dtype=np.uint8)
    if local_mask is None or work_bbox is None:
        return full
    left, top, right, bottom = work_bbox
    local = np.asarray(local_mask, dtype=np.uint8)
    full[top:bottom, left:right] = local[:max(bottom - top, 0), :max(right - left, 0)]
    return full


def _draw_smooth_poly(image_size, points, sigma=0.8, threshold=96, work_bbox=None):
    if work_bbox is not None:
        left, top, right, bottom = work_bbox
        w, h = max(right - left, 0), max(bottom - top, 0)
        pts = _points_for_work_bbox(points, work_bbox)
    else:
        w, h = image_size
        pts = np.asarray(points, dtype=np.float64)
    mask = np.zeros((h, w), dtype=np.uint8)
    if pts.ndim != 2 or pts.shape[0] < 3:
        return mask
    mask = _draw_poly(mask, pts, 255)
    if int(np.sum(mask > 0)) == 0:
        return mask
    return _blur_and_threshold(mask, sigma=sigma, threshold=threshold)


def _subtract_masks(base_mask, masks):
    result = np.asarray(base_mask, dtype=np.uint8).copy()
    for mask in masks:
        if mask is None:
            continue
        result = np.where((result > 0) & (np.asarray(mask) == 0), 255, 0).astype(np.uint8)
    return result


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

LEFT_UNDER_EYE_INDICES = [33, 7, 163, 144, 145, 153, 154, 155, 133]
RIGHT_UNDER_EYE_INDICES = [263, 249, 390, 373, 374, 380, 381, 382, 362]

OUTER_LIP_INDICES = [
    61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291,
    375, 321, 405, 314, 17, 84, 181, 91, 146,
]
LOWER_LIP_VISUAL_INDICES = [
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
    308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78,
]

NOSE_REGION_INDICES = [
    168, 6, 197, 195, 5, 4, 1, 2,
    45, 220, 115, 48, 64, 98, 97,
    275, 440, 344, 278, 294, 327, 326,
]

LEFT_CHEEK_DEBUG_INDICES = [33, 7, 133, 48, 64, 98, 61, 172, 58, 132, 93, 234, 127]
RIGHT_CHEEK_DEBUG_INDICES = [263, 249, 362, 278, 294, 327, 291, 397, 288, 361, 323, 454, 356]
CHIN_DEBUG_INDICES = [84, 17, 314, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172]


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


def extract_all_regions(
        image_bytes,
        landmarks,
        image_size,
        max_side=180,
        image_rgb=None,
        face_parse=_FACE_PARSE_UNSET):
    """
    一次性提取所有 8 个面部区域。

    参数:
        image_bytes: 原始图片字节
        landmarks: MediaPipe 返回的归一化地标列表
        image_size: (width, height) 原始图像尺寸

    返回:
        dict: {region_name: roi_bytes, ...}，提取失败的区域为 None
    """
    if image_rgb is None:
        img = load_image(image_bytes).convert('RGB')
        img_np = np.array(img, dtype=np.uint8)
    else:
        img_np = np.asarray(image_rgb, dtype=np.uint8)
        if img_np.ndim != 3 or img_np.shape[2] < 3:
            raise ValueError(f'ROI image_rgb 格式异常: shape={img_np.shape}')
        img_np = np.ascontiguousarray(img_np[:, :, :3])
        img = Image.fromarray(img_np, mode='RGB')
    _log_array_memory('roi.input_rgb', img_np)
    debug_id = f'roi_{int(time.time() * 1000)}'

    skin_mask, mask_debug = build_improved_face_skin_mask(
        landmarks,
        image_size,
        image_rgb=img_np,
        face_parse=face_parse,
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
    _log_array_memory('roi.skin_mask.full', skin_mask)

    work_bbox = _work_bbox_from_mask(skin_mask, image_size)
    work_left, work_top, work_right, work_bottom = work_bbox
    skin_mask_work = skin_mask[work_top:work_bottom, work_left:work_right]
    _log_array_memory('roi.skin_mask.work', skin_mask_work)
    print(
        f'[face_regions] ROI work bbox={work_bbox}, '
        f'work_shape={skin_mask_work.shape}, skin_area={skin_area}'
    )

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
            skin_mask=skin_mask_work,
            max_side=max_side,
            mask_debug=mask_debug,
            work_bbox=work_bbox,
            skin_area=skin_area,
        )
        regions[name] = payload

        if payload:
            roi_debug_items.append(payload)
            if payload.get('valid') and payload.get('roi_bytes'):
                region_masks[name] = payload.get('full_mask')
                status = (
                    f"{len(payload['roi_bytes'])/1024:.1f}KB, "
                    f"valid={payload['valid_pixel_count']}, "
                    f"center={payload.get('center')}, "
                    f"coverage={payload['mask_coverage_ratio']:.2f}"
                )
            else:
                status = (
                    f"invalid, valid={payload.get('valid_pixel_count', 0)}, "
                    f"center={payload.get('center')}, "
                    f"warning={payload.get('quality_warning')}"
                )
        else:
            status = '失败'
        print(f'[face_regions] {name}: {status}')

    if DEBUG_ROI or DEBUG_ROI_ALIGNMENT:
        _warn_region_overlap(region_masks)

    if DEBUG_ROI or DEBUG_ROI_ALIGNMENT:
        _save_roi_debug_images(
            img_np,
            mask_debug,
            roi_debug_items,
            debug_id,
        )

    return regions


def get_region_heatmap_masks(landmarks, image_size, skin_mask=None, mask_debug=None):
    """Return local ROI masks plus global centers for heatmap rendering."""
    region_info = {}

    try:
        if skin_mask is None or mask_debug is None:
            skin_mask, mask_debug = build_improved_face_skin_mask(
                landmarks,
                image_size,
                return_debug=True,
            )

        work_bbox = _work_bbox_from_mask(skin_mask, image_size)
        work_left, work_top, work_right, work_bottom = work_bbox
        skin_mask_work = skin_mask[work_top:work_bottom, work_left:work_right]
        _log_array_memory('roi.heatmap.skin_mask.work', skin_mask_work)

        for name in REGION_DEFINITIONS:
            try:
                final_mask = _build_region_mask(
                    name,
                    landmarks,
                    image_size,
                    skin_mask_work,
                    mask_debug,
                    work_bbox=work_bbox,
                )
                valid_count = int(np.sum(final_mask > 0))
                if valid_count < ROI_MIN_VALID_PIXELS:
                    print(f'[face_regions] {name} heatmap mask skipped: valid={valid_count}')
                    continue
                center = _offset_point(_mask_center(final_mask), (work_left, work_top))
                if center is None:
                    continue
                bbox = _offset_bbox(_bbox_from_mask(final_mask), (work_left, work_top))
                region_info[name] = {
                    'center': (center[0], center[1]),
                    'mask': final_mask,
                    'mask_origin': [int(work_left), int(work_top)],
                    'bbox': bbox,
                    'valid_pixel_count': valid_count,
                }
                print(f'[face_regions] {name} mask center=({center[0]},{center[1]}), valid={valid_count}')
            except Exception as exc:
                print(f'[face_regions] {name} heatmap mask calculation failed: {exc}')
                continue
    except Exception as exc:
        print(f'[face_regions] ROI heatmap masks calculation failed: {exc}')

    return region_info


def get_region_centers(landmarks, image_size, skin_mask=None, mask_debug=None):
    """
    获取每个区域的中心坐标（用于热点图）。

    中心统一来自最终 final_mask 的有效像素中位数，而不是 bbox 或
    landmark 平均点，确保热图峰值、等高线中心和标签锚点与真实 ROI 对齐。

    返回:
        dict: {region_name: (x_px, y_px), ...}
    """
    centers = {}

    try:
        if skin_mask is None or mask_debug is None:
            skin_mask, mask_debug = build_improved_face_skin_mask(
                landmarks,
                image_size,
                return_debug=True,
            )

        work_bbox = _work_bbox_from_mask(skin_mask, image_size)
        work_left, work_top, work_right, work_bottom = work_bbox
        skin_mask_work = skin_mask[work_top:work_bottom, work_left:work_right]
        _log_array_memory('roi.centers.skin_mask.work', skin_mask_work)

        for name in REGION_DEFINITIONS:
            try:
                final_mask = _build_region_mask(
                    name,
                    landmarks,
                    image_size,
                    skin_mask_work,
                    mask_debug,
                    work_bbox=work_bbox,
                )
                valid_count = int(np.sum(final_mask > 0))
                if valid_count < ROI_MIN_VALID_PIXELS:
                    print(f'[face_regions] {name} center skipped: valid={valid_count}')
                    continue
                center = _offset_point(_mask_center(final_mask), (work_left, work_top))
                if center is None:
                    continue
                centers[name] = (center[0], center[1])
                print(f'[face_regions] {name} mask center=({center[0]},{center[1]}), valid={valid_count}')
            except Exception as exc:
                print(f'[face_regions] {name} center 计算失败: {exc}')
                continue
    except Exception as exc:
        print(f'[face_regions] ROI mask centers 计算失败: {exc}')

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
    face_left, face_top, face_right, _ = face_bbox
    face_width = max(float(face_right - face_left), 1.0)
    left_top = _landmark_xy(landmarks, 109, image_size)
    right_top = _landmark_xy(landmarks, 338, image_size)

    # 使用左右额侧点约束弧线横向范围，避免覆盖到头发/耳侧。
    left_candidates = _points_from_indices(landmarks, [67, 103, 109], image_size)
    right_candidates = _points_from_indices(landmarks, [297, 332, 338], image_size)
    left_x = max(np.min(left_candidates[:, 0]) - face_width * 0.024, face_left + face_width * 0.024)
    right_x = min(np.max(right_candidates[:, 0]) + face_width * 0.024, face_right - face_width * 0.024)

    forehead_expand_px = float(np.clip(
        face_height * FOREHEAD_EXPAND_RATIO,
        face_height * 0.15,
        face_height * 0.22,
    ))

    point_count = 13
    xs = np.linspace(left_x, right_x, point_count)
    t_values = np.linspace(0.0, 1.0, point_count)
    endpoint_y = min(float(left_top[1]), float(right_top[1]), top_y + face_height * 0.035)
    arc_weight = np.sin(np.pi * t_values) ** 1.08
    side_lift = face_height * 0.010 * np.sin(np.pi * t_values)
    ys = endpoint_y - forehead_expand_px * arc_weight - side_lift

    # 保守限制：补偿点不超过图像上界，也不超过 face bbox 顶部太多。
    min_allowed_y = max(0.0, face_top - face_height * 0.16)
    ys = np.clip(ys, min_allowed_y, h - 1)

    arc_core = np.stack([xs, ys], axis=1)
    left_temple = oval_pts[-1]
    right_temple = oval_pts[1]

    # Add two soft transition points on each temple side. This keeps the
    # forehead compensation wide enough while avoiding sharp "gourd" shoulders.
    left_transition = np.vstack([
        left_temple * 0.78 + arc_core[0] * 0.22,
        left_temple * 0.42 + arc_core[1] * 0.58,
    ])
    right_transition = np.vstack([
        right_temple * 0.42 + arc_core[-2] * 0.58,
        right_temple * 0.78 + arc_core[-1] * 0.22,
    ])
    arc = np.vstack([left_transition, arc_core[2:-2], right_transition])
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
        face_parse=_FACE_PARSE_UNSET,
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
    raw_contour = _clip_points(contour, image_size)
    contour = _smooth_closed_contour(raw_contour, image_size, iterations=2, compensation=1.004)

    face_mask = np.zeros((h, w), dtype=np.uint8)
    face_mask = _draw_poly(face_mask, contour, 255)
    face_mask = _blur_and_threshold(face_mask, sigma=1.25, threshold=96)
    geometry_face_mask = face_mask.copy()

    exclusion_mask = _build_exclusion_mask(
        landmarks,
        image_size,
        max(metrics['face_width'], 1),
    )
    skin_mask_source = 'mediapipe_geometry'
    semantic_skin_mask = None
    semantic_hair_mask = None
    hairline_info = None

    if image_rgb is not None or face_parse is not _FACE_PARSE_UNSET:
        try:
            from face_parsing import estimate_hairline, parse_face

            if face_parse is _FACE_PARSE_UNSET:
                face_parse = parse_face(image_rgb)
            if face_parse and face_parse.get('ok'):
                raw_skin = np.asarray(face_parse.get('skin_mask'), dtype=np.uint8)
                raw_hair = np.asarray(face_parse.get('hair_mask'), dtype=np.uint8)
                if raw_skin.shape == (h, w):
                    face_left, face_top, face_right, face_bottom = metrics['face_bbox']
                    face_width = max(float(face_right - face_left), 1.0)
                    face_height = max(float(face_bottom - face_top), 1.0)
                    support_left = int(max(0, face_left - face_width * 0.18))
                    support_right = int(min(w, face_right + face_width * 0.18))
                    support_top = int(max(0, face_top - face_height * 0.45))
                    support_bottom = int(min(h, face_bottom + face_height * 0.05))
                    support_mask = np.zeros((h, w), dtype=np.uint8)
                    support_mask[support_top:support_bottom, support_left:support_right] = 255

                    semantic_skin = np.where((raw_skin > 0) & (support_mask > 0), 255, 0).astype(np.uint8)
                    semantic_skin = _dilate_mask(semantic_skin, radius_px=1)
                    semantic_skin = _blur_and_threshold(semantic_skin, sigma=0.55, threshold=96)
                    semantic_skin = np.where((semantic_skin > 0) & (exclusion_mask == 0), 255, 0).astype(np.uint8)

                    semantic_area = int(np.sum(semantic_skin > 0))
                    semantic_bbox = _bbox_from_mask(semantic_skin)
                    if semantic_area >= ROI_MIN_VALID_PIXELS * 8 and semantic_bbox:
                        skin_mask = semantic_skin
                        face_mask = semantic_skin.copy()
                        semantic_skin_mask = semantic_skin
                        semantic_hair_mask = raw_hair if raw_hair.shape == (h, w) else None
                        skin_mask_source = face_parse.get('source') or 'face_parsing'
                        metrics['face_bbox'] = semantic_bbox
                        metrics['semantic_face_bbox'] = semantic_bbox
                        metrics['semantic_skin_area'] = semantic_area
                        metrics['semantic_hair_area'] = int(np.sum(raw_hair > 0)) if raw_hair.shape == (h, w) else 0
                        metrics['semantic_model_path'] = face_parse.get('model_path', '')
                        hairline_info = estimate_hairline(
                            landmarks,
                            image_size,
                            image_rgb=image_rgb,
                            face_parse=face_parse,
                        )
                        metrics['hairline'] = hairline_info
                        print(
                            '[face_regions] semantic skin mask enabled: '
                            f'bbox={semantic_bbox}, area={semantic_area}, '
                            f'hairline={hairline_info.get("available") if isinstance(hairline_info, dict) else None}'
                        )
                    else:
                        metrics['semantic_fallback_reason'] = 'semantic_skin_area_too_small'
                else:
                    metrics['semantic_fallback_reason'] = 'semantic_mask_shape_mismatch'
            else:
                metrics['semantic_fallback_reason'] = 'face_parsing_unavailable'
        except Exception as exc:
            metrics['semantic_fallback_reason'] = f'face_parsing_error: {exc}'
            print(f'[face_regions] semantic face parsing unavailable, using geometry mask: {exc}')

    if skin_mask_source == 'mediapipe_geometry':
        skin_mask = np.where((face_mask > 0) & (exclusion_mask == 0), 255, 0).astype(np.uint8)

    skin_area = int(np.sum(skin_mask > 0))
    face_area = int(np.sum(face_mask > 0))
    metrics.update({
        'forehead_expand_px': int(forehead_expand_px),
        'contour_point_count': int(contour.shape[0]),
        'face_mask_area': face_area,
        'skin_mask_area': skin_area,
        'skin_mask_ratio': float(skin_area / max(w * h, 1)),
        'skin_mask_source': skin_mask_source,
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
        'raw_contour': raw_contour,
        'improved_contour': contour,
        'forehead_arc': forehead_arc,
        'face_mask': face_mask,
        'geometry_face_mask': geometry_face_mask,
        'exclusion_mask': exclusion_mask,
        'skin_mask': skin_mask,
        'semantic_skin_mask': semantic_skin_mask,
        'semantic_hair_mask': semantic_hair_mask,
        'hairline': hairline_info,
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


def _lip_body_mask(landmarks, image_size, face_width, dilate=True, work_bbox=None):
    if not _has_landmarks(landmarks, OUTER_LIP_INDICES):
        return _empty_mask(image_size, work_bbox)
    lip = _draw_smooth_poly(
        image_size,
        _points_from_indices(landmarks, OUTER_LIP_INDICES, image_size),
        sigma=0.45,
        threshold=72,
        work_bbox=work_bbox,
    )
    if dilate:
        lip = _dilate_mask(lip, radius_px=max(1, int(round(face_width * 0.010))))
    return lip


def build_lower_lip_visual_mask(landmarks, image_size):
    """Build a lower-lip-only visual mask. It is not used for skin feature extraction."""
    if not _has_landmarks(landmarks, LOWER_LIP_VISUAL_INDICES):
        return np.zeros((image_size[1], image_size[0]), dtype=np.uint8)
    lower_lip = _points_from_indices(landmarks, LOWER_LIP_VISUAL_INDICES, image_size)
    mask = _draw_smooth_poly(image_size, lower_lip, sigma=0.42, threshold=72)
    return _dilate_mask(mask, radius_px=1)


def _build_under_eye_region_mask(region_name, landmarks, image_size, face_height, work_bbox=None):
    indices = LEFT_UNDER_EYE_INDICES if region_name == '左眼周' else RIGHT_UNDER_EYE_INDICES
    if not _has_landmarks(landmarks, indices):
        return _empty_mask(image_size, work_bbox), np.empty((0, 2))

    lower_lid = _points_from_indices(landmarks, indices, image_size)
    top_offset = max(face_height * 0.003, 0.75)
    band_height = np.clip(face_height * 0.050, 9.0, face_height * 0.068)
    top_edge = lower_lid + np.array([0.0, top_offset])
    bottom_edge = lower_lid + np.array([0.0, band_height])
    poly = np.vstack([top_edge, bottom_edge[::-1]])
    return _draw_smooth_poly(image_size, poly, sigma=0.55, threshold=88, work_bbox=work_bbox), poly


def _build_lip_ring_region_mask(landmarks, image_size, face_width, work_bbox=None):
    if not _has_landmarks(landmarks, OUTER_LIP_INDICES):
        return _empty_mask(image_size, work_bbox), np.empty((0, 2))

    outer_lip = _points_from_indices(landmarks, OUTER_LIP_INDICES, image_size)
    center = np.mean(outer_lip, axis=0)
    outer_ring = outer_lip.copy()
    outer_ring[:, 0] = center[0] + (outer_ring[:, 0] - center[0]) * 1.28
    dy = outer_ring[:, 1] - center[1]
    y_scale = np.where(dy < 0, 1.50, 1.28)
    outer_ring[:, 1] = center[1] + dy * y_scale - face_width * 0.006
    outer_mask = _draw_smooth_poly(image_size, outer_ring, sigma=0.65, threshold=82, work_bbox=work_bbox)
    lip_mask = _lip_body_mask(landmarks, image_size, face_width, dilate=True, work_bbox=work_bbox)
    ring = _subtract_masks(outer_mask, [lip_mask])
    return ring, np.vstack([outer_ring, outer_lip])


def _cached_region_shape(mask_debug, cache_key, builder):
    if not isinstance(mask_debug, dict):
        return builder()
    cache = mask_debug.setdefault('region_shape_cache', {})
    if cache_key not in cache:
        cache[cache_key] = builder()
    return cache[cache_key]


def _build_nose_region_mask(landmarks, image_size, face_height, work_bbox=None):
    if not _has_landmarks(landmarks, NOSE_REGION_INDICES + [13]):
        return _empty_mask(image_size, work_bbox), np.empty((0, 2))

    pts = _points_from_indices(landmarks, NOSE_REGION_INDICES, image_size)
    center = _landmark_xy(landmarks, 1, image_size)
    pts = _scale_points(pts, center, scale_x=1.05, scale_y=1.04)

    mouth_top_y = float(_landmark_xy(landmarks, 13, image_size)[1])
    max_nose_y = mouth_top_y - face_height * 0.030
    pts[:, 1] = np.minimum(pts[:, 1], max_nose_y)
    hull = _convex_hull_points(pts)
    return _draw_smooth_poly(image_size, hull, sigma=0.55, threshold=88, work_bbox=work_bbox), pts


def _build_chin_region_mask(landmarks, image_size, face_width, face_height, nose_x, work_bbox=None):
    required = CHIN_DEBUG_INDICES + [17]
    if not _has_landmarks(landmarks, required):
        return _empty_mask(image_size, work_bbox), np.empty((0, 2))

    mouth_bottom = _landmark_xy(landmarks, 17, image_size)
    top_y = float(mouth_bottom[1] + face_height * 0.030)
    left_top_x = float(np.mean(_points_from_indices(landmarks, [84, 181, 91], image_size)[:, 0]) - face_width * 0.035)
    right_top_x = float(np.mean(_points_from_indices(landmarks, [314, 405, 321], image_size)[:, 0]) + face_width * 0.035)
    left_limit = nose_x - face_width * 0.30
    right_limit = nose_x + face_width * 0.30
    left_top_x = float(np.clip(left_top_x, left_limit, nose_x - face_width * 0.06))
    right_top_x = float(np.clip(right_top_x, nose_x + face_width * 0.06, right_limit))

    poly = np.array([
        [left_top_x, top_y],
        [right_top_x, top_y],
        _landmark_xy(landmarks, 397, image_size),
        _landmark_xy(landmarks, 365, image_size),
        _landmark_xy(landmarks, 379, image_size),
        _landmark_xy(landmarks, 400, image_size),
        _landmark_xy(landmarks, 377, image_size),
        _landmark_xy(landmarks, 152, image_size),
        _landmark_xy(landmarks, 148, image_size),
        _landmark_xy(landmarks, 176, image_size),
        _landmark_xy(landmarks, 149, image_size),
        _landmark_xy(landmarks, 150, image_size),
        _landmark_xy(landmarks, 136, image_size),
        _landmark_xy(landmarks, 172, image_size),
    ], dtype=np.float64)
    poly[:, 0] = np.clip(poly[:, 0], left_limit, right_limit)
    poly[:, 1] = np.maximum(poly[:, 1], top_y)

    chin = _draw_smooth_poly(image_size, poly, sigma=0.65, threshold=88, work_bbox=work_bbox)
    lip_mask = _lip_body_mask(landmarks, image_size, face_width, dilate=True, work_bbox=work_bbox)
    return _subtract_masks(chin, [lip_mask]), poly


def _build_cheek_region_mask(region_name, landmarks, image_size, face_width, face_height, mask_debug=None, work_bbox=None):
    if region_name == '左脸颊':
        required = LEFT_CHEEK_DEBUG_INDICES
        if not _has_landmarks(landmarks, required):
            return _empty_mask(image_size, work_bbox), np.empty((0, 2))
        p = lambda idx: _landmark_xy(landmarks, idx, image_size)
        top_outer = (p(33) * 0.55 + p(7) * 0.45) + np.array([0.0, face_height * 0.070])
        top_inner = (p(133) * 0.55 + p(155) * 0.45) + np.array([-face_width * 0.015, face_height * 0.090])
        poly = np.array([
            top_outer,
            top_inner,
            p(48),
            p(64),
            p(98),
            p(61) + np.array([-face_width * 0.010, face_height * 0.035]),
            p(172),
            p(58),
            p(132),
            p(93),
            p(234),
            p(127),
        ], dtype=np.float64)
    else:
        required = RIGHT_CHEEK_DEBUG_INDICES
        if not _has_landmarks(landmarks, required):
            return _empty_mask(image_size, work_bbox), np.empty((0, 2))
        p = lambda idx: _landmark_xy(landmarks, idx, image_size)
        top_outer = (p(263) * 0.55 + p(249) * 0.45) + np.array([0.0, face_height * 0.070])
        top_inner = (p(362) * 0.55 + p(382) * 0.45) + np.array([face_width * 0.015, face_height * 0.090])
        poly = np.array([
            top_outer,
            top_inner,
            p(278),
            p(294),
            p(327),
            p(291) + np.array([face_width * 0.010, face_height * 0.035]),
            p(397),
            p(288),
            p(361),
            p(323),
            p(454),
            p(356),
        ], dtype=np.float64)

    cheek = _draw_smooth_poly(image_size, poly, sigma=0.70, threshold=90, work_bbox=work_bbox)
    nose_mask, _ = _cached_region_shape(
        mask_debug,
        ('shape:鼻子', tuple(work_bbox) if work_bbox is not None else None),
        lambda: _build_nose_region_mask(landmarks, image_size, face_height, work_bbox=work_bbox),
    )
    lip_ring, _ = _cached_region_shape(
        mask_debug,
        ('shape:唇周', tuple(work_bbox) if work_bbox is not None else None),
        lambda: _build_lip_ring_region_mask(landmarks, image_size, face_width, work_bbox=work_bbox),
    )
    chin_mask, _ = _cached_region_shape(
        mask_debug,
        ('shape:下巴', tuple(work_bbox) if work_bbox is not None else None),
        lambda: _build_chin_region_mask(
            landmarks,
            image_size,
            face_width,
            face_height,
            float(_landmark_xy(landmarks, 1, image_size)[0]),
            work_bbox=work_bbox,
        ),
    )
    eye_region = '左眼周' if region_name == '左脸颊' else '右眼周'
    eye_mask, _ = _cached_region_shape(
        mask_debug,
        (f'shape:{eye_region}', tuple(work_bbox) if work_bbox is not None else None),
        lambda: _build_under_eye_region_mask(
            eye_region,
            landmarks,
            image_size,
            face_height,
            work_bbox=work_bbox,
        ),
    )
    exclusions = [
        _dilate_mask(nose_mask, radius_px=max(1, int(round(face_width * 0.006)))),
        _dilate_mask(lip_ring, radius_px=max(1, int(round(face_width * 0.004)))),
        _dilate_mask(chin_mask, radius_px=max(1, int(round(face_width * 0.004)))),
        _dilate_mask(eye_mask, radius_px=max(1, int(round(face_width * 0.004)))),
    ]
    return _subtract_masks(cheek, exclusions), poly


def _record_region_debug(mask_debug, region_name, debug_points, region_mask, final_mask, warning='', mask_origin=(0, 0)):
    if not isinstance(mask_debug, dict) or not (DEBUG_ROI or DEBUG_ROI_ALIGNMENT):
        return
    region_debug = mask_debug.setdefault('region_debug', {})
    region_debug[region_name] = {
        'points': np.asarray(debug_points, dtype=np.float64),
        'region_mask': np.asarray(region_mask, dtype=np.uint8),
        'final_mask': np.asarray(final_mask, dtype=np.uint8),
        'mask_origin': [int(mask_origin[0]), int(mask_origin[1])],
        'center': _offset_point(_mask_center(final_mask), mask_origin),
        'valid_pixel_count': int(np.sum(final_mask > 0)),
        'quality_warning': warning,
    }


def _build_region_mask(region_name, landmarks, image_size, skin_mask, mask_debug, work_bbox=None):
    final_cache = mask_debug.setdefault('final_region_mask_cache', {}) if isinstance(mask_debug, dict) else None
    cache_key = (region_name, tuple(work_bbox) if work_bbox is not None else None)
    if final_cache is not None and cache_key in final_cache:
        return final_cache[cache_key]

    w, h = image_size
    mask_origin = (int(work_bbox[0]), int(work_bbox[1])) if work_bbox is not None else (0, 0)
    metrics = mask_debug.get('metrics', {}) if isinstance(mask_debug, dict) else {}
    face_bbox = metrics.get('face_bbox') or _bbox_from_mask(skin_mask) or [0, 0, w, h]
    face_left, face_top, face_right, face_bottom = face_bbox
    face_width = max(face_right - face_left, 1)
    face_height = max(face_bottom - face_top, 1)
    nose_x = float(_landmark_xy(landmarks, 1, image_size)[0])

    definition = REGION_DEFINITIONS.get(region_name)
    if not definition:
        return np.zeros_like(skin_mask, dtype=np.uint8)

    debug_points = np.empty((0, 2), dtype=np.float64)

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
        debug_points = poly
        region_mask = _draw_smooth_poly(image_size, poly, sigma=0.75, threshold=88, work_bbox=work_bbox)
    elif region_name in ('左眼周', '右眼周'):
        region_mask, debug_points = _cached_region_shape(
            mask_debug,
            (f'shape:{region_name}', tuple(work_bbox) if work_bbox is not None else None),
            lambda: _build_under_eye_region_mask(
                region_name,
                landmarks,
                image_size,
                face_height,
                work_bbox=work_bbox,
            ),
        )
    elif region_name == '唇周':
        region_mask, debug_points = _cached_region_shape(
            mask_debug,
            ('shape:唇周', tuple(work_bbox) if work_bbox is not None else None),
            lambda: _build_lip_ring_region_mask(
                landmarks,
                image_size,
                face_width,
                work_bbox=work_bbox,
            ),
        )
    elif region_name == '鼻子':
        region_mask, debug_points = _cached_region_shape(
            mask_debug,
            ('shape:鼻子', tuple(work_bbox) if work_bbox is not None else None),
            lambda: _build_nose_region_mask(
                landmarks,
                image_size,
                face_height,
                work_bbox=work_bbox,
            ),
        )
    elif region_name == '下巴':
        region_mask, debug_points = _cached_region_shape(
            mask_debug,
            ('shape:下巴', tuple(work_bbox) if work_bbox is not None else None),
            lambda: _build_chin_region_mask(
                landmarks,
                image_size,
                face_width,
                face_height,
                nose_x,
                work_bbox=work_bbox,
            ),
        )
    elif region_name in ('左脸颊', '右脸颊'):
        region_mask, debug_points = _build_cheek_region_mask(
            region_name,
            landmarks,
            image_size,
            face_width,
            face_height,
            mask_debug=mask_debug,
            work_bbox=work_bbox,
        )
    else:
        region_mask = np.zeros_like(skin_mask, dtype=np.uint8)

    final_mask = np.where((region_mask > 0) & (skin_mask > 0), 255, 0).astype(np.uint8)
    warning = ROI_UNRELIABLE_WARNING if int(np.sum(region_mask > 0)) == 0 or int(np.sum(final_mask > 0)) == 0 else ''
    _record_region_debug(mask_debug, region_name, debug_points, region_mask, final_mask, warning, mask_origin=mask_origin)
    if final_cache is not None:
        final_cache[cache_key] = final_mask
    return final_mask


def _invalid_region_payload(region_name, full_mask, skin_area, detail, mask_origin=(0, 0)):
    full_mask = np.asarray(full_mask, dtype=np.uint8)
    valid_count = int(np.sum(full_mask > 0))
    bbox = _offset_bbox(_bbox_from_mask(full_mask), mask_origin)
    roi_area = 0
    if bbox:
        left, top, right, bottom = bbox
        roi_area = max(int(right - left), 0) * max(int(bottom - top), 0)
    return {
        'roi_bytes': None,
        'mask': None,
        'bbox': bbox,
        'full_mask': full_mask,
        'mask_origin': [int(mask_origin[0]), int(mask_origin[1])],
        'center': _offset_point(_mask_center(full_mask), mask_origin),
        'valid_pixel_count': valid_count,
        'roi_area': int(roi_area),
        'mask_coverage_ratio': 0.0,
        'face_area_ratio': float(valid_count / max(int(skin_area), 1)),
        'valid': False,
        'quality_warning': ROI_UNRELIABLE_WARNING,
        'quality_detail': detail,
        'region_name': region_name,
    }


def _extract_masked_region_payload(
        img,
        img_np,
        landmarks,
        region_name,
        image_size,
        skin_mask,
        max_side,
        mask_debug,
        work_bbox=None,
        skin_area=None):
    mask_origin = (int(work_bbox[0]), int(work_bbox[1])) if work_bbox is not None else (0, 0)
    full_mask = _build_region_mask(region_name, landmarks, image_size, skin_mask, mask_debug, work_bbox=work_bbox)
    _log_array_memory(f'roi.region_mask.{region_name}', full_mask)
    valid_count = int(np.sum(full_mask > 0))
    skin_area = max(int(skin_area if skin_area is not None else np.sum(skin_mask > 0)), 1)
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
            return _invalid_region_payload(region_name, full_mask, skin_area, warning, mask_origin=mask_origin)

    local_bbox = _bbox_from_mask(full_mask)
    if not local_bbox:
        print(f'[face_regions] 警告: {region_name} 无有效 mask')
        return _invalid_region_payload(region_name, full_mask, skin_area, '无有效 mask', mask_origin=mask_origin)

    bbox = _offset_bbox(local_bbox, mask_origin)
    left, top, right, bottom = bbox
    roi_img = img.crop((left, top, right, bottom))
    local_left, local_top, local_right, local_bottom = local_bbox
    roi_mask = full_mask[local_top:local_bottom, local_left:local_right]

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
        'mask_origin': [int(mask_origin[0]), int(mask_origin[1])],
        'center': _offset_point(_mask_center(full_mask), mask_origin),
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
        (debug_info.get('raw_contour', []), (120, 210, 255), 2),
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


def _draw_mask_boundary(draw, mask, color, width=2, offset=(0, 0)):
    if mask is None:
        return
    mask_u8 = np.asarray(mask, dtype=np.uint8)
    if int(np.sum(mask_u8 > 0)) == 0:
        return
    off_x, off_y = int(offset[0]), int(offset[1])
    if cv2 is not None:
        contours, _ = cv2.findContours(mask_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            pts = contour.reshape(-1, 2)
            if pts.shape[0] < 2:
                continue
            seq = [(int(x + off_x), int(y + off_y)) for x, y in pts]
            draw.line(seq + [seq[0]], fill=color, width=width)
        return

    bbox = _bbox_from_mask(mask_u8)
    if bbox:
        draw.rectangle(tuple(_offset_bbox(bbox, (off_x, off_y))), outline=color, width=width)


def _save_roi_debug_images(image_rgb, mask_debug, roi_items, debug_id):
    os.makedirs(ROI_DEBUG_DIR, exist_ok=True)
    base = Image.fromarray(image_rgb).convert('RGB')
    overlay = base.copy()
    draw = ImageDraw.Draw(overlay)
    colors = [
        (255, 80, 80), (80, 160, 255), (80, 220, 120), (255, 180, 80),
        (180, 100, 255), (80, 220, 220), (255, 120, 180), (220, 220, 80),
    ]
    region_debug = mask_debug.get('region_debug', {}) if isinstance(mask_debug, dict) else {}

    for idx, item in enumerate(roi_items):
        color = colors[idx % len(colors)]
        bbox = item.get('bbox')
        if bbox:
            left, top, right, bottom = bbox
            draw.rectangle((left, top, right, bottom), outline=color, width=1)
            draw.text((left, max(0, top - 14)), item.get('region_name', ''), fill=color)

        full_mask = item.get('full_mask')
        if full_mask is not None:
            origin = item.get('mask_origin') or [0, 0]
            full_mask_arr = np.asarray(full_mask, dtype=np.uint8)
            if full_mask_arr.shape != image_rgb.shape[:2]:
                full_debug_mask = _paste_local_mask(full_mask, image_rgb.shape[1::-1], [
                    int(origin[0]),
                    int(origin[1]),
                    int(origin[0]) + int(full_mask_arr.shape[1]),
                    int(origin[1]) + int(full_mask_arr.shape[0]),
                ])
            else:
                full_debug_mask = full_mask_arr
            mask_img = Image.fromarray(full_debug_mask).convert('L')
            tint = Image.new('RGB', base.size, color)
            overlay = Image.composite(Image.blend(overlay, tint, 0.22), overlay, mask_img)
            draw = ImageDraw.Draw(overlay)
            _draw_mask_boundary(draw, full_mask, color, width=2, offset=origin)

        debug_item = region_debug.get(item.get('region_name', ''), {})
        points = np.asarray(debug_item.get('points', []), dtype=np.float64)
        for px, py in points:
            draw.ellipse((px - 2, py - 2, px + 2, py + 2), fill=color)

        center = item.get('center') or debug_item.get('center')
        peak = center
        if center:
            cx, cy = center
            draw.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=(255, 255, 255), outline=color, width=2)
            draw.line((cx - 6, cy, cx + 6, cy), fill=(255, 255, 255), width=1)
            draw.line((cx, cy - 6, cx, cy + 6), fill=(255, 255, 255), width=1)

        distance = 0.0 if center and peak else None
        if DEBUG_ROI_ALIGNMENT:
            print(
                '[roi-align] '
                f"{item.get('region_name')}: "
                f"mask_area={int(np.sum(np.asarray(full_mask) > 0)) if full_mask is not None else 0}, "
                f"valid_pixels={item.get('valid_pixel_count', 0)}, "
                f"center={center}, heatmap_peak={peak}, "
                f"center_peak_distance={distance}, "
                f"valid={item.get('valid')}, "
                f"quality_warning={item.get('quality_warning', '')}"
            )

    overlay.save(os.path.join(ROI_DEBUG_DIR, f'{debug_id}_05_region_masks.png'))
    if DEBUG_ROI_ALIGNMENT:
        overlay.save(os.path.join(ROI_DEBUG_DIR, f'{debug_id}_06_alignment.png'))

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
