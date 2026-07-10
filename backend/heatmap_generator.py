"""
面部热力图生成模块（Apple Health / Troveskin 风格）

基于 MediaPipe 478 点面部检测和各区域评分，生成连续平滑的面部热力图。
核心算法：
    1. 以各区域中心为热源，构建二维热场
    2. scipy.ndimage.gaussian_filter 高斯扩散，生成连续平滑分布
    3. 根据 MediaPipe 人脸轮廓生成 Face Mask，裁切背景
    4. RdYlGn_r 科学配色映射（绿→黄→橙→红）
    5. 原图 + 热力图透明叠加（alpha 0.5）+ 区域评分标签

使用方式：
    from heatmap_generator import generate_skin_heatmap
    result_b64 = generate_skin_heatmap(image_bytes, landmarks, image_size, region_scores)

依赖：
    numpy, scipy, matplotlib, PIL — 均已包含在 requirements.txt 中
"""

import traceback
import base64
import os
import time
from io import BytesIO

import numpy as np
from face_regions import (
    get_region_heatmap_masks,
    build_improved_face_skin_mask,
    load_image,
)
from scipy.ndimage import gaussian_filter, binary_erosion, binary_closing, binary_dilation


MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
BUNDLED_CJK_FONT = os.path.join(MODULE_DIR, 'assets', 'fonts', 'NotoSansSC-Regular.otf')
DEBUG_HEATMAP = os.environ.get('DEBUG_HEATMAP', '').lower() in ('1', 'true', 'yes', 'on')
DEBUG_MEMORY = os.environ.get('DEBUG_MEMORY', '').lower() in ('1', 'true', 'yes', 'on')
HEATMAP_DEBUG_DIR = os.environ.get(
    'HEATMAP_DEBUG_DIR',
    os.path.join(MODULE_DIR, 'debug_heatmap'),
)

BEAUTY_BASE_COLOR = np.array([244, 236, 222], dtype=np.float32)
BEAUTY_REGION_COLORS = {
    '前额': np.array([232, 190, 172], dtype=np.float32),
    '鼻子': np.array([229, 132, 121], dtype=np.float32),
    '下巴': np.array([226, 177, 132], dtype=np.float32),
    '唇周': np.array([226, 177, 132], dtype=np.float32),
    '左眼周': np.array([176, 162, 182], dtype=np.float32),
    '右眼周': np.array([176, 162, 182], dtype=np.float32),
    '左脸颊': np.array([147, 188, 166], dtype=np.float32),
    '右脸颊': np.array([147, 188, 166], dtype=np.float32),
}
BEAUTY_FALLBACK_COLOR = np.array([226, 178, 132], dtype=np.float32)
BEAUTY_GOOD_COLOR = np.array([118, 178, 154], dtype=np.float32)
BEAUTY_OK_COLOR = np.array([224, 196, 146], dtype=np.float32)
BEAUTY_WARN_COLOR = np.array([224, 158, 126], dtype=np.float32)
BEAUTY_BAD_COLOR = np.array([204, 86, 96], dtype=np.float32)

_CJK_FONT_PROP = None
_CJK_FONT_CHECKED = False


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


# ============================================================
# 内部工具函数
# ============================================================

def _setup_cjk_font():
    """自动检测并配置中文字体，避免 matplotlib 中文乱码"""
    import matplotlib.pyplot as plt
    from matplotlib.font_manager import FontProperties, findSystemFonts

    # 优先使用的 Windows 中文字体
    candidate_names = [
        'Microsoft YaHei', 'SimHei', 'SimSun', 'KaiTi',
        'STFangsong', 'STKaiti', 'FangSong', 'YouYuan',
    ]

    # 先尝试按名称设置
    for name in candidate_names:
        try:
            prop = FontProperties(family=name)
            # 验证字体是否真的可用：尝试查找字体文件
            found = [f for f in findSystemFonts() if name.lower().replace(' ', '') in f.lower().replace(' ', '')]
            if found:
                plt.rcParams['font.family'] = [name, 'sans-serif']
                print(f'[heatmap] 使用中文字体: {name}')
                return
        except Exception:
            continue

    # 后备方案：按文件名搜索
    cjk_keywords = ['msyh', 'simhei', 'simsun', 'kaiti', 'fang', 'mingliu']
    fonts = findSystemFonts()
    for kw in cjk_keywords:
        for f in fonts:
            if kw in f.lower():
                try:
                    from matplotlib.font_manager import fontManager
                    fontManager.addfont(f)
                    prop = FontProperties(fname=f)
                    family_name = prop.get_name()
                    plt.rcParams['font.family'] = [family_name, 'sans-serif']
                    print(f'[heatmap] 使用中文字体(fname): {f}')
                    return
                except Exception:
                    continue

    print('[heatmap] 警告: 未找到中文字体，标签可能显示为方块')


def _get_cjk_font_prop():
    global _CJK_FONT_PROP, _CJK_FONT_CHECKED
    if _CJK_FONT_CHECKED:
        return _CJK_FONT_PROP

    _CJK_FONT_CHECKED = True
    try:
        import matplotlib.pyplot as plt
        from matplotlib.font_manager import FontProperties, findSystemFonts, findfont, fontManager

        if os.path.exists(BUNDLED_CJK_FONT):
            fontManager.addfont(BUNDLED_CJK_FONT)
            _CJK_FONT_PROP = FontProperties(fname=BUNDLED_CJK_FONT)
            plt.rcParams['font.family'] = [_CJK_FONT_PROP.get_name(), 'sans-serif']
            print(f'[heatmap] 使用内置中文字体: {BUNDLED_CJK_FONT}')
            return _CJK_FONT_PROP

        candidate_names = [
            'Noto Sans CJK SC', 'Noto Sans CJK JP', 'Source Han Sans SC',
            'Microsoft YaHei', 'SimHei', 'PingFang SC', 'Heiti SC',
            'WenQuanYi Zen Hei', 'Arial Unicode MS', 'SimSun',
        ]
        for name in candidate_names:
            try:
                prop = FontProperties(family=name)
                path = findfont(prop, fallback_to_default=False)
                if path:
                    _CJK_FONT_PROP = FontProperties(fname=path)
                    plt.rcParams['font.family'] = [_CJK_FONT_PROP.get_name(), 'sans-serif']
                    print(f'[heatmap] 使用中文字体: {_CJK_FONT_PROP.get_name()}')
                    return _CJK_FONT_PROP
            except Exception:
                continue

        cjk_keywords = [
            'notosanscjk', 'sourcehansans', 'wqy', 'wenquanyi',
            'msyh', 'simhei', 'simsun', 'pingfang', 'hiragino', 'heiti',
        ]
        for font_path in findSystemFonts():
            normalized = font_path.lower().replace('-', '').replace('_', '').replace(' ', '')
            if not any(keyword in normalized for keyword in cjk_keywords):
                continue
            try:
                fontManager.addfont(font_path)
                _CJK_FONT_PROP = FontProperties(fname=font_path)
                plt.rcParams['font.family'] = [_CJK_FONT_PROP.get_name(), 'sans-serif']
                print(f'[heatmap] 使用中文字体文件: {font_path}')
                return _CJK_FONT_PROP
            except Exception:
                continue
    except Exception as exc:
        print(f'[heatmap] 中文字体检测失败: {exc}')

    print('[heatmap] 警告: 未找到中文字体，部署环境可能需要安装 Noto Sans CJK。')
    _CJK_FONT_PROP = None
    return None


def _score_to_heat(score, max_score=100):
    """
    将评分（0-100，越高越好）转换为热度值（0-1，越高越需要关注）。

    公式：heat = (max_score - score) / max_score
    评分 90 → 热度 0.10（绿色，健康）
    评分 60 → 热度 0.40（黄色，一般）
    评分 30 → 热度 0.70（橙红，需改善）
    """
    return max(0.0, min(1.0, (max_score - score) / max_score))


def _get_heatmap_colormap(colormap_name='RdYlGn_r'):
    """
    获取 matplotlib colormap 对象。

    默认 RdYlGn_r（反转红黄绿）:
        0.0 → 深绿色（健康）
        0.33 → 黄色（一般）
        0.66 → 橙色（关注）
        1.0 → 红色（需改善）
    """
    import matplotlib.pyplot as plt
    return plt.get_cmap(colormap_name)


def _build_heat_field(region_centers, region_scores, image_size, sigma=None):
    """
    在二维矩阵中构建连续热场。

    算法（改进版 — 多高斯叠加）：
        1. 创建与图像等大的零矩阵
        2. 在每个区域中心生成高斯热源（振幅=heat_value, σ=face_width/8）
        3. 叠加所有热源，形成连续分布
        4. 轻度整体平滑，消除接缝
        5. 归一化到 [0, 1]

    参数：
        region_centers: {region_name: (cx_px, cy_px), ...}
        region_scores:  {region_name: {overall: 0-100, ...}, ...}
        image_size:     (width, height)
        sigma:          每个热源的扩散半径（像素），默认 face_width / 8

    返回：
        heat_field: (h, w) 形状的 float64 矩阵，值域 [0, 1]
    """
    from scipy.ndimage import gaussian_filter

    w, h = image_size

    # 1. 创建全零热场
    heat_field = np.zeros((h, w), dtype=np.float64)

    # 计算面部实际尺寸（用于自适应 sigma）
    centers_list = [(cx, cy) for cx, cy in region_centers.values()]
    if centers_list:
        cx_arr = np.array([c[0] for c in centers_list])
        cy_arr = np.array([c[1] for c in centers_list])
        face_span_x = cx_arr.max() - cx_arr.min()
        face_span_y = cy_arr.max() - cy_arr.min()
        face_span = max(face_span_x, face_span_y)
    else:
        face_span = max(w, h) * 0.3

    if sigma is None:
        # 热源扩散半径 = 面部跨度的 1/5，保证相邻热源有重叠但不淹没
        sigma = max(face_span / 5.0, 8.0)

    # 2. 在每个区域中心放置带振幅的高斯热源
    y_indices, x_indices = np.mgrid[0:h, 0:w]

    for region_name, scores in region_scores.items():
        if region_name not in region_centers:
            continue

        score = scores.get('overall', 50)
        heat_val = _score_to_heat(score)  # 0-1，越高越需关注
        cx, cy = region_centers[region_name]

        # 确保中心点在图像范围内
        cx = np.clip(cx, 0, w - 1)
        cy = np.clip(cy, 0, h - 1)

        # 计算该热源的高斯分布（2D Gaussian blob）
        # G(x,y) = A * exp(-((x-cx)² + (y-cy)²) / (2σ²))
        dx = x_indices - cx
        dy = y_indices - cy
        dist_sq = dx * dx + dy * dy
        gaussian_blob = heat_val * np.exp(-dist_sq / (2 * sigma * sigma))

        # 叠加到热场
        heat_field += gaussian_blob

        print(f'[heatmap] 热源: {region_name} center=({cx},{cy}) '
              f'score={score} heat={heat_val:.3f} sigma={sigma:.0f}px')

    # 3. 轻度整体平滑（消除热源交界处的硬边，sigma 约为热源 sigma 的 1/3）
    blend_sigma = max(sigma / 4.0, 1.5)
    heat_field = gaussian_filter(heat_field, sigma=blend_sigma, mode='constant')

    # 4. 归一化到 [0, 1]
    #    使用相对归一化：充分利用 colormap 动态范围
    heat_min = heat_field.min()
    heat_max = heat_field.max()

    if heat_max - heat_min > 1e-8:
        heat_field = (heat_field - heat_min) / (heat_max - heat_min)
        # 如果所有人脸区域评分都比较高（都很健康），
        # 整体偏移使基线为 0.1 而非 0，避免"一片深绿"无区分度
        if heat_min < 0.05:
            heat_field = np.clip(heat_field * 0.9 + 0.1, 0, 1)
    else:
        # 全脸评分一致
        heat_field = np.full_like(heat_field, 0.15)

    print(f'[heatmap] 热场构建完成: blob_sigma={sigma:.1f}px, '
          f'blend_sigma={blend_sigma:.1f}px, '
          f'range=[{heat_field.min():.4f}, {heat_field.max():.4f}]')

    return heat_field


def _apply_colormap(heat_field, colormap_name='RdYlGn_r'):
    """
    将热场矩阵映射为 RGBA 彩色图像。

    参数：
        heat_field: (h, w) 形状的 float 矩阵，值域 [0, 1]
        colormap_name: matplotlib colormap 名称

    返回：
        colored: (h, w, 4) 形状的 uint8 RGBA 图像
    """
    cmap = _get_heatmap_colormap(colormap_name)
    # cmap(value) 返回 (r, g, b, a)，每个分量 0-1
    colored = cmap(heat_field)  # shape: (h, w, 4)
    colored = (colored * 255).astype(np.uint8)
    return colored


def _blend_overlay(original_rgb, heatmap_rgba, face_mask, alpha=0.5):
    """
    将热力图以指定透明度叠加在原图上，仅在人脸区域内显示。

    参数：
        original_rgb:  (h, w, 3) uint8 原始图像
        heatmap_rgba:  (h, w, 4) uint8 热力图 RGBA
        face_mask:     (h, w) float64 人脸蒙版（0=背景，1=人脸内部）
        alpha:         热力图整体透明度，默认 0.5

    返回：
        blended: (h, w, 3) uint8 合成图像
    """
    h, w = original_rgb.shape[:2]

    # 合成透明度 = 热力图 alpha 通道 × face_mask × 用户指定的 alpha
    heat_alpha = heatmap_rgba[:, :, 3].astype(np.float64) / 255.0
    effective_alpha = heat_alpha * face_mask * alpha
    effective_alpha = np.clip(effective_alpha, 0, 1)

    # Alpha 混合: result = original * (1-α) + heatmap * α
    blended = np.zeros_like(original_rgb, dtype=np.float64)
    for c in range(3):
        blended[:, :, c] = (
            original_rgb[:, :, c].astype(np.float64) * (1 - effective_alpha) +
            heatmap_rgba[:, :, c].astype(np.float64) * effective_alpha
        )

    blended = np.clip(blended, 0, 255).astype(np.uint8)
    return blended


def _numeric_score(scores, key='overall', default=50.0):
    try:
        return float(scores.get(key, default))
    except (TypeError, ValueError, AttributeError):
        return float(default)


def _mask_bbox(mask):
    ys, xs = np.where(mask > 0.08)
    if len(xs) == 0 or len(ys) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)


def _alpha_blend_rgb(base_rgb, overlay_color, alpha_map):
    alpha_map = np.clip(np.asarray(alpha_map, dtype=np.float32), 0.0, 1.0)[..., None]
    base = np.asarray(base_rgb, dtype=np.float32)
    color = np.asarray(overlay_color, dtype=np.float32)
    return base * (1.0 - alpha_map) + color * alpha_map


def _region_blob_shape(region_name, face_span):
    base = max(face_span, 1.0)
    if region_name in ('左脸颊', '右脸颊'):
        return base * 0.22, base * 0.20
    if region_name == '鼻子':
        return base * 0.10, base * 0.13
    if region_name in ('左眼周', '右眼周'):
        return base * 0.09, base * 0.045
    if region_name == '前额':
        return base * 0.20, base * 0.10
    if region_name == '唇周':
        return base * 0.09, base * 0.055
    if region_name == '下巴':
        return base * 0.12, base * 0.08
    return base * 0.18, base * 0.16


def _region_support_radius(region_name, face_span):
    base = max(face_span, 1.0)
    if region_name in ('左眼周', '右眼周', '唇周'):
        return int(np.clip(base * 0.014, 3, 10))
    if region_name == '鼻子':
        return int(np.clip(base * 0.020, 4, 14))
    if region_name in ('下巴',):
        return int(np.clip(base * 0.022, 4, 16))
    if region_name == '前额':
        return int(np.clip(base * 0.026, 5, 22))
    if region_name in ('左脸颊', '右脸颊'):
        return int(np.clip(base * 0.030, 6, 26))
    return int(np.clip(base * 0.024, 4, 18))


def _local_support_from_roi_mask(local_mask, region_name, face_span):
    mask = np.asarray(local_mask, dtype=np.uint8) > 0
    if int(np.sum(mask)) < 20:
        return np.zeros(mask.shape, dtype=np.float32)

    radius = _region_support_radius(region_name, face_span)
    support = binary_dilation(mask, iterations=max(radius, 1))
    support = binary_closing(support, iterations=max(1, radius // 3))
    sigma = max(radius * 0.32, 0.8)
    soft = gaussian_filter(support.astype(np.float32), sigma=sigma, mode='constant')
    max_val = float(soft.max())
    if max_val > 1e-8:
        soft = soft / max_val
    return np.clip(soft, 0.0, 1.0).astype(np.float32, copy=False)


def _build_visual_display_mask(face_mask_u8, image_size):
    w, h = image_size
    mask = np.asarray(face_mask_u8) > 0
    if mask.shape != (h, w) or int(np.sum(mask)) < 100:
        return np.zeros((h, w), dtype=np.float32)

    shrink_px = max(1, int(round(min(w, h) * 0.006)))
    eroded = binary_erosion(mask, iterations=shrink_px, border_value=0)
    if int(np.sum(eroded)) > 100:
        mask = eroded

    close_iter = max(1, shrink_px // 2)
    mask = binary_closing(mask, iterations=close_iter)
    sigma = max(min(w, h) * 0.006, 1.5)
    soft_mask = gaussian_filter(mask.astype(np.float32), sigma=sigma, mode='constant')
    max_val = float(soft_mask.max())
    if max_val > 1e-8:
        soft_mask = soft_mask / max_val
    return np.clip(soft_mask, 0.0, 1.0).astype(np.float32, copy=False)


def _score_to_beauty_color(score, region_name):
    if score >= 80:
        status_color = BEAUTY_GOOD_COLOR
        status_mix = 0.82
    elif score >= 60:
        status_color = BEAUTY_OK_COLOR
        status_mix = 0.74
    elif score >= 40:
        status_color = BEAUTY_WARN_COLOR
        status_mix = 0.62
    else:
        status_color = BEAUTY_BAD_COLOR
        status_mix = 0.78

    region_color = BEAUTY_REGION_COLORS.get(region_name, BEAUTY_FALLBACK_COLOR)
    return region_color * (1.0 - status_mix) + status_color * status_mix


def feature_value_to_display_score(feature_key, raw_value=None, raw_score=None, mode='positive_score'):
    direction = 'positive'
    source = 'raw_score'

    if raw_score is None:
        raw_score = raw_value
        source = 'raw_value'

    try:
        score = float(raw_score)
    except (TypeError, ValueError):
        score = 50.0
        source = 'fallback'

    if mode == 'negative_raw':
        direction = 'negative'
        normalized_score = 100.0 - score
    elif mode == 'negative_from_health':
        direction = 'negative'
        normalized_score = score
    else:
        normalized_score = score

    normalized_score = float(np.clip(normalized_score, 0.0, 100.0))
    # Display scores are deliberately clamped to avoid unstable 0%/100% labels.
    display_score = float(np.clip(normalized_score, 10.0, 90.0))
    problem_score = 100.0 - display_score

    return {
        'feature_key': feature_key,
        'source': source,
        'direction': direction,
        'raw_value': raw_value,
        'raw_score': raw_score,
        'normalized_score': normalized_score,
        'display_score': display_score,
        'problem_score': problem_score,
        'mode': mode,
    }


def _feature_level_text(score_info, label_mode='positive'):
    if label_mode == 'negative':
        problem = score_info['problem_score']
        if problem < 30:
            return '轻度'
        if problem < 55:
            return '中度'
        if problem < 78:
            return '明显'
        return '较明显'

    score = score_info['display_score']
    if score >= 76:
        return '良好'
    if score >= 58:
        return '中等'
    if score >= 38:
        return '偏低'
    return '较低'


def _region_visual_metric(region_name):
    if region_name in ('左脸颊', '右脸颊'):
        return 'hydration'
    if region_name in ('左眼周', '右眼周'):
        return 'brightness'
    if region_name == '鼻子':
        return 'evenness'
    return 'overall'


def _region_score_info(region_name, scores, metric=None, mode='positive_score'):
    metric = metric or _region_visual_metric(region_name)
    fallback = _numeric_score(scores, 'overall', 50.0)
    raw_score = _numeric_score(scores, metric, fallback)
    return feature_value_to_display_score(
        feature_key=metric,
        raw_value=None,
        raw_score=raw_score,
        mode=mode,
    )


def _smooth_closed_curve(points, iterations=4, shrink_ratio=0.985):
    pts = np.asarray(points, dtype=np.float64)
    if pts.ndim != 2 or pts.shape[0] < 4 or pts.shape[1] != 2:
        return None

    for _ in range(iterations):
        nxt = np.roll(pts, -1, axis=0)
        q = pts * 0.75 + nxt * 0.25
        r = pts * 0.25 + nxt * 0.75
        smoothed = np.empty((pts.shape[0] * 2, 2), dtype=np.float64)
        smoothed[0::2] = q
        smoothed[1::2] = r
        pts = smoothed

    center = np.mean(pts, axis=0)
    pts = center + (pts - center) * shrink_ratio
    return pts


def _render_face_outline(ax, display_mask, contour_pts=None):
    smooth_curve = _smooth_closed_curve(contour_pts) if contour_pts is not None else None
    if smooth_curve is not None:
        closed = np.vstack([smooth_curve, smooth_curve[0]])
        ax.plot(
            closed[:, 0],
            closed[:, 1],
            color='white',
            linewidth=0.62,
            alpha=0.40,
            linestyle='--',
            zorder=5,
        )
        return

    if display_mask is None:
        return
    smooth_mask = gaussian_filter(
        np.clip(display_mask.astype(np.float64), 0.0, 1.0),
        sigma=2.4,
        mode='constant',
    )
    if int(np.sum(smooth_mask > 0.18)) < 100:
        return
    ax.contour(
        smooth_mask,
        levels=[0.50],
        colors='white',
        linewidths=0.62,
        alpha=0.38,
        linestyles='--',
        zorder=5,
    )


def _build_beauty_overlay(original_rgb, region_infos, region_scores,
                          image_size, display_mask, alpha=0.5):
    w, h = image_size
    debug_enabled = _heatmap_debug_enabled()
    output = np.asarray(original_rgb, dtype=np.float32)
    display_mask = np.clip(np.asarray(display_mask, dtype=np.float32), 0.0, 1.0)
    _log_array_memory('heatmap.original_rgb', original_rgb)
    _log_array_memory('heatmap.display_mask', display_mask)
    intensity = float(np.clip(alpha / 0.5, 0.45, 1.35))

    centers_list = [
        (float(cx), float(cy))
        for name, info in region_infos.items()
        for cx, cy in [info.get('center', (None, None))]
        if name in region_scores
        and cx is not None
        and cy is not None
    ]
    if centers_list:
        xs = np.array([p[0] for p in centers_list])
        ys = np.array([p[1] for p in centers_list])
        face_span = max(float(xs.max() - xs.min()), float(ys.max() - ys.min()), min(w, h) * 0.25)
    else:
        face_span = min(w, h) * 0.35

    # A very light neutral wash keeps the face connected without looking tinted.
    base_alpha = np.clip(display_mask * 0.07 * intensity, 0.0, 0.11)
    output = _alpha_blend_rgb(output, BEAUTY_BASE_COLOR, base_alpha)
    heat_only = None
    if debug_enabled:
        heat_only = np.full_like(output, 255.0, dtype=np.float32)
        heat_only = _alpha_blend_rgb(heat_only, BEAUTY_BASE_COLOR, base_alpha)

    region_fields = {}
    region_contours = []
    region_peaks = {}
    label_sources = {}
    region_centers = {}

    for region_name, scores in region_scores.items():
        info = region_infos.get(region_name)
        if not info or info.get('center') is None:
            continue

        metric = _region_visual_metric(region_name)
        score_info = _region_score_info(region_name, scores, metric=metric, mode='positive_score')
        score = score_info['display_score']
        heat_val = _score_to_heat(score)
        cx, cy = info['center']
        cx = float(np.clip(cx, 0, w - 1))
        cy = float(np.clip(cy, 0, h - 1))
        region_centers[region_name] = (int(round(cx)), int(round(cy)))
        sigma_x, sigma_y = _region_blob_shape(region_name, face_span)

        local_mask = np.asarray(info.get('mask'), dtype=np.uint8)
        origin = info.get('mask_origin') or [0, 0]
        if local_mask.ndim != 2 or int(np.sum(local_mask > 0)) < 20:
            continue

        support = _local_support_from_roi_mask(local_mask, region_name, face_span)
        support_bbox = _mask_bbox(support)
        if not support_bbox:
            continue
        sl, st, sr, sb = support_bbox
        gx1 = int(origin[0] + sl)
        gy1 = int(origin[1] + st)
        gx2 = int(origin[0] + sr)
        gy2 = int(origin[1] + sb)
        gx1, gy1 = max(0, gx1), max(0, gy1)
        gx2, gy2 = min(w, gx2), min(h, gy2)
        if gx2 <= gx1 or gy2 <= gy1:
            continue

        crop_support = support[st:st + (gy2 - gy1), sl:sl + (gx2 - gx1)]
        display_crop = display_mask[gy1:gy2, gx1:gx2]
        yy = np.arange(gy1, gy2, dtype=np.float32)[:, None]
        xx = np.arange(gx1, gx2, dtype=np.float32)[None, :]
        blob = np.exp(
            -0.5 * (((xx - cx) / sigma_x) ** 2 + ((yy - cy) / sigma_y) ** 2)
        ).astype(np.float32, copy=False)
        blob *= crop_support
        blob *= display_crop
        smooth_sigma = max(min(sigma_x, sigma_y) * 0.035, 0.65)
        blob = gaussian_filter(blob, sigma=smooth_sigma, mode='constant')
        blob = np.asarray(blob, dtype=np.float32)
        if blob.max() > 1e-8:
            blob = blob / blob.max()

        region_field = np.asarray(blob * crop_support * display_crop, dtype=np.float32)
        color = _score_to_beauty_color(score, region_name)
        peak_alpha = (0.04 + 0.25 * (heat_val ** 1.15)) * intensity
        if score >= 80:
            peak_alpha = max(peak_alpha, 0.13 * intensity)
        elif score < 45:
            peak_alpha = max(peak_alpha, 0.23 * intensity)

        region_alpha = np.clip(region_field * peak_alpha, 0.0, 0.30)
        output[gy1:gy2, gx1:gx2] = _alpha_blend_rgb(output[gy1:gy2, gx1:gx2], color, region_alpha)
        if heat_only is not None:
            heat_only[gy1:gy2, gx1:gx2] = _alpha_blend_rgb(heat_only[gy1:gy2, gx1:gx2], color, region_alpha)
        region_heat = np.asarray(region_field * heat_val, dtype=np.float32)
        contour_item = {
            'region': region_name,
            'field': region_heat,
            'support': crop_support,
            'bbox': [gx1, gy1, gx2, gy2],
        }
        region_contours.append(contour_item)
        if debug_enabled:
            region_fields[region_name] = region_heat.copy()
        label_sources[region_name] = score_info

        if np.max(region_heat) > 1e-10:
            peak_y, peak_x = np.unravel_index(int(np.argmax(region_heat)), region_heat.shape)
            peak = (int(gx1 + peak_x), int(gy1 + peak_y))
        else:
            peak = (int(round(cx)), int(round(cy)))
        region_peaks[region_name] = peak
        peak_dist = float(np.hypot(peak[0] - cx, peak[1] - cy))

        print(f'[heatmap] beauty blob: {region_name} center=({cx:.0f},{cy:.0f}) '
              f'feature={metric} raw={score_info["raw_score"]} '
              f'display={score:.0f} heat={heat_val:.3f} peak_alpha={peak_alpha:.3f} '
              f'peak={peak} center_peak_distance={peak_dist:.1f}')

    if region_contours:
        largest = max(region_contours, key=lambda item: item['field'].nbytes)
        _log_array_memory('heatmap.local_contour_largest', largest['field'])
    debug_data = {
        'region_fields': region_fields if debug_enabled else {},
        'region_contours': region_contours,
        'fused_heat_field': None,
        'colored_heatmap': np.clip(heat_only, 0, 255).astype(np.uint8) if heat_only is not None else None,
        'region_centers': dict(region_centers),
        'region_peaks': region_peaks,
        'label_sources': label_sources,
    }

    return np.clip(output, 0, 255).astype(np.uint8), debug_data


def _render_topographic_lines(ax, contour_field, display_mask):
    valid = (display_mask > 0.22) & np.isfinite(contour_field)
    if int(np.sum(valid)) < 100:
        return

    values = contour_field[valid]
    high = float(np.percentile(values, 98))
    if high < 0.14:
        return

    low = max(float(np.percentile(values, 58)), 0.07)
    if high - low < 0.025:
        return

    level_count = 7 if high < 0.28 else 10
    levels = np.linspace(low, high, level_count)
    masked_field = np.ma.masked_where(~valid, contour_field)
    ax.contour(
        masked_field,
        levels=levels,
        colors='white',
        linewidths=0.34,
        alpha=min(0.30, 0.14 + high * 0.32),
        zorder=4,
    )


def _render_local_topographic_lines(ax, region_contours):
    for item in region_contours or []:
        field = np.asarray(item.get('field'), dtype=np.float32)
        support = np.asarray(item.get('support'), dtype=np.float32)
        bbox = item.get('bbox')
        if field.ndim != 2 or support.shape != field.shape or not bbox:
            continue

        valid = (support > 0.12) & np.isfinite(field) & (field > 0.015)
        if int(np.sum(valid)) < 35:
            continue

        values = field[valid]
        high = float(np.percentile(values, 98))
        if high < 0.045:
            continue

        low = max(float(np.percentile(values, 48)), high * 0.28, 0.018)
        if high - low < 0.012:
            continue

        level_count = 4 if high < 0.18 else 6
        levels = np.linspace(low, high, level_count)
        masked_field = np.ma.masked_where(~valid, field)
        left, top, right, bottom = [int(v) for v in bbox]
        xs = np.arange(left, right, dtype=np.float32)
        ys = np.arange(top, bottom, dtype=np.float32)
        if len(xs) != field.shape[1] or len(ys) != field.shape[0]:
            continue

        ax.contour(
            xs,
            ys,
            masked_field,
            levels=levels,
            colors='white',
            linewidths=0.30,
            alpha=min(0.28, 0.12 + high * 0.32),
            zorder=4,
        )


# ============================================================
# 主入口
# ============================================================

def _heatmap_debug_enabled():
    debug_roi = os.environ.get('DEBUG_ROI', '').lower() in ('1', 'true', 'yes', 'on')
    debug_alignment = os.environ.get('DEBUG_ROI_ALIGNMENT', '').lower() in ('1', 'true', 'yes', 'on')
    return DEBUG_HEATMAP or debug_roi or debug_alignment


def _field_to_uint8(field):
    arr = np.asarray(field, dtype=np.float32)
    arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
    max_val = float(arr.max()) if arr.size else 0.0
    if max_val > 1e-8:
        arr = arr / max_val
    return np.clip(arr * 255.0, 0, 255).astype(np.uint8)


def _safe_debug_name(name):
    return ''.join(ch if ch.isalnum() else '_' for ch in str(name))[:32] or 'region'


def _save_heatmap_debug_images(skin_mask_u8, display_mask, heatmap_debug, final_png_bytes, debug_id, original_rgb=None):
    if not _heatmap_debug_enabled():
        return

    try:
        from PIL import Image, ImageDraw

        os.makedirs(HEATMAP_DEBUG_DIR, exist_ok=True)
        Image.fromarray(np.asarray(skin_mask_u8, dtype=np.uint8)).save(
            os.path.join(HEATMAP_DEBUG_DIR, f'{debug_id}_01_skin_mask.png')
        )
        Image.fromarray(_field_to_uint8(display_mask)).save(
            os.path.join(HEATMAP_DEBUG_DIR, f'{debug_id}_01b_visual_display_mask.png')
        )

        region_fields = heatmap_debug.get('region_fields', {}) if isinstance(heatmap_debug, dict) else {}
        for idx, (region_name, field) in enumerate(region_fields.items(), start=1):
            Image.fromarray(_field_to_uint8(field)).save(
                os.path.join(
                    HEATMAP_DEBUG_DIR,
                    f'{debug_id}_02_region_{idx:02d}_{_safe_debug_name(region_name)}.png',
                )
            )

        region_contours = heatmap_debug.get('region_contours', []) if isinstance(heatmap_debug, dict) else []
        if region_contours:
            import matplotlib.pyplot as plt
        for idx, item in enumerate(region_contours, start=1):
            field = np.asarray(item.get('field'), dtype=np.float32)
            support = np.asarray(item.get('support'), dtype=np.float32)
            region_name = item.get('region', f'region_{idx}')
            if field.ndim != 2 or support.shape != field.shape:
                continue
            valid = (support > 0.12) & np.isfinite(field) & (field > 0.015)
            if int(np.sum(valid)) < 35:
                continue
            values = field[valid]
            high = float(np.percentile(values, 98))
            low = max(float(np.percentile(values, 48)), high * 0.28, 0.018)
            if high - low < 0.012:
                continue
            fig_w = max(field.shape[1] / 100.0, 1.0)
            fig_h = max(field.shape[0] / 100.0, 1.0)
            fig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=100)
            try:
                ax.imshow(np.zeros_like(field), cmap='gray', vmin=0, vmax=1)
                ax.contour(
                    np.ma.masked_where(~valid, field),
                    levels=np.linspace(low, high, 4 if high < 0.18 else 6),
                    colors='white',
                    linewidths=0.45,
                    alpha=0.9,
                )
                ax.axis('off')
                fig.subplots_adjust(left=0, right=1, top=1, bottom=0)
                fig.savefig(
                    os.path.join(
                        HEATMAP_DEBUG_DIR,
                        f'{debug_id}_02b_contour_{idx:02d}_{_safe_debug_name(region_name)}.png',
                    ),
                    transparent=True,
                    bbox_inches='tight',
                    pad_inches=0,
                )
            finally:
                plt.close(fig)

        fused = heatmap_debug.get('fused_heat_field') if isinstance(heatmap_debug, dict) else None
        if fused is not None:
            Image.fromarray(_field_to_uint8(fused)).save(
                os.path.join(HEATMAP_DEBUG_DIR, f'{debug_id}_03_fused_heat_field.png')
            )

        colored = heatmap_debug.get('colored_heatmap') if isinstance(heatmap_debug, dict) else None
        if colored is not None:
            Image.fromarray(np.asarray(colored, dtype=np.uint8)).save(
                os.path.join(HEATMAP_DEBUG_DIR, f'{debug_id}_04_colored_heatmap.png')
            )

        if final_png_bytes:
            with open(os.path.join(HEATMAP_DEBUG_DIR, f'{debug_id}_05_final_contour_overlay.png'), 'wb') as f:
                f.write(final_png_bytes)

        debug_alignment = os.environ.get('DEBUG_ROI_ALIGNMENT', '').lower() in ('1', 'true', 'yes', 'on')
        if debug_alignment and original_rgb is not None and isinstance(heatmap_debug, dict):
            overlay = Image.fromarray(np.asarray(original_rgb, dtype=np.uint8)).convert('RGB')
            draw = ImageDraw.Draw(overlay)
            centers = heatmap_debug.get('region_centers', {}) or {}
            peaks = heatmap_debug.get('region_peaks', {}) or {}
            for region_name, center in centers.items():
                if center is None:
                    continue
                cx, cy = int(center[0]), int(center[1])
                peak = peaks.get(region_name, center)
                px, py = int(peak[0]), int(peak[1])
                draw.line((cx, cy, px, py), fill=(255, 255, 255), width=1)
                draw.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), outline=(255, 255, 255), width=2)
                draw.ellipse((px - 3, py - 3, px + 3, py + 3), fill=(255, 80, 80))
                draw.text((cx + 6, cy - 6), str(region_name), fill=(255, 255, 255))
            overlay.save(os.path.join(HEATMAP_DEBUG_DIR, f'{debug_id}_06_alignment_overlay.png'))

        print(f'[heatmap] debug images saved: {HEATMAP_DEBUG_DIR} ({debug_id})')
    except Exception as exc:
        print(f'[heatmap] debug image save failed: {exc}')


def generate_skin_heatmap(image_bytes, landmarks, image_size, region_scores,
                          alpha=0.5, colormap_name='RdYlGn_r',
                          show_labels=True):
    """
    生成 Apple Health 风格的面部热力图。

    完整管线：
        1. 人脸 Mask 生成（MediaPipe 轮廓 → 二值蒙版 + 边缘羽化）
        2. 区域中心热源放置
        3. 高斯扩散构建连续热场
        4. RdYlGn_r 科学配色映射
        5. 原图 + 热力图透明叠加（仅在人脸区域内）
        6. matplotlib 渲染区域标签 + 图例 + 整体评分

    参数：
        image_bytes:    原始图片字节
        landmarks:      MediaPipe 归一化地标列表（NormalizedLandmark 对象）
        image_size:     (width, height) 原始图像尺寸
        region_scores:  {region_name: {overall: 0-100, ...}, ...}
        alpha:          热力图透明度 0-1，默认 0.5（推荐 0.45~0.6）
        colormap_name:  matplotlib colormap，默认 'RdYlGn_r'
        show_labels:    是否显示区域评分标签

    返回：
        str: "data:image/png;base64,..." 格式的 base64 PNG
        失败返回 None
    """
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        from matplotlib.font_manager import FontProperties

        w, h = image_size
        debug_id = f'heatmap_{int(time.time() * 1000)}'

        # ── 加载原图 ──
        img = load_image(image_bytes).convert('RGB')
        img_np = np.array(img, dtype=np.uint8)
        _log_array_memory('heatmap.input_rgb', img_np)

        # ═══════════════════════════════════════════════════════
        # Step 1: 生成人脸 Skin Mask（改进轮廓 + 五官排除 + 羽化）
        # ═══════════════════════════════════════════════════════
        skin_mask_u8, mask_debug = build_improved_face_skin_mask(
            landmarks,
            image_size,
            image_rgb=img_np,
            return_debug=True,
        )
        display_mask_u8 = mask_debug.get('face_mask', skin_mask_u8) if isinstance(mask_debug, dict) else skin_mask_u8
        display_mask = _build_visual_display_mask(display_mask_u8, image_size)
        _log_array_memory('heatmap.skin_mask', skin_mask_u8)
        _log_array_memory('heatmap.display_mask_ready', display_mask)

        # ═══════════════════════════════════════════════════════
        # Step 2: 获取区域中心坐标
        # ═══════════════════════════════════════════════════════
        region_infos = get_region_heatmap_masks(
            landmarks,
            image_size,
            skin_mask=skin_mask_u8,
            mask_debug=mask_debug,
        )
        region_centers = {
            name: info.get('center')
            for name, info in region_infos.items()
            if info.get('center') is not None
        }

        # ═══════════════════════════════════════════════════════
        # Step 3: 构建连续热场（高斯扩散）
        # ═══════════════════════════════════════════════════════
        composite, heatmap_debug = _build_beauty_overlay(
            img_np,
            region_infos,
            region_scores,
            image_size,
            display_mask,
            alpha=alpha,
        )
        _log_array_memory('heatmap.composite', composite)

        # ═══════════════════════════════════════════════════════
        # Step 4: 热场 → 彩色映射
        # ═══════════════════════════════════════════════════════
        # colormap_name is kept for API compatibility. The beauty-contour style
        # uses region-specific soft colors instead of a full-face red/green map.

        # ═══════════════════════════════════════════════════════
        # Step 5: 原图 + 热力图透明叠加（人脸 Mask 裁切）
        # ═══════════════════════════════════════════════════════
        # composite is built above so facial features stay natural in the final image.

        # ═══════════════════════════════════════════════════════
        # Step 6: matplotlib 渲染标签与最终输出
        # ═══════════════════════════════════════════════════════
        dpi = 100
        fig_w, fig_h = w / dpi, h / dpi
        fig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=dpi)

        # 显示合成图（origin='upper' 使像素坐标与图像坐标一致）
        ax.imshow(composite, origin='upper')
        _render_local_topographic_lines(ax, heatmap_debug.get('region_contours', []))

        if show_labels:
            _render_labels(ax, region_centers, region_scores, image_size, display_mask)

        contour_pts = mask_debug.get('improved_contour') if isinstance(mask_debug, dict) else None
        _render_face_outline(ax, display_mask, contour_pts=contour_pts)

        ax.set_xlim(0, w)
        ax.set_ylim(h, 0)  # y 轴翻转匹配 origin='upper'
        ax.axis('off')
        fig.subplots_adjust(left=0, right=1, top=1, bottom=0)

        # ── 输出 base64 PNG ──
        buf = BytesIO()
        fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight',
                    pad_inches=0.05, facecolor='white')
        plt.close(fig)
        final_png_bytes = buf.getvalue()
        _save_heatmap_debug_images(
            skin_mask_u8,
            display_mask,
            heatmap_debug,
            final_png_bytes,
            debug_id,
            original_rgb=img_np,
        )

        b64 = base64.b64encode(final_png_bytes).decode('utf-8')
        print(f'[heatmap] final_png_bytes={len(final_png_bytes)} bytes')
        print(f'[heatmap] 热力图生成完成: {len(b64)} 字符')
        del composite, heatmap_debug, display_mask, display_mask_u8, skin_mask_u8, img_np
        return f'data:image/png;base64,{b64}'

    except ImportError as e:
        print(f'[heatmap] 依赖缺失: {e}')
        traceback.print_exc()
        return None
    except Exception as e:
        print(f'[heatmap] 热力图生成失败: {e}')
        try:
            import matplotlib.pyplot as plt
            plt.close('all')
        except Exception:
            pass
        traceback.print_exc()
        return None


# ============================================================
# 标签渲染
# ============================================================

def _render_legacy_badge_labels(ax, region_centers, region_scores, image_size):
    """
    在热力图上叠加区域名称标签（仅显示区域名，不显示分数/评级）。
    Mirror Mate 陪伴助手风格。
    """
    w, h = image_size
    base_w = 800.0
    scale = max(w / base_w, 0.55)
    font_main = 7.5 * scale
    offset_y = -12 * scale

    for region_name, scores in region_scores.items():
        if region_name not in region_centers:
            continue

        score = scores.get('overall', 50)
        cx, cy = region_centers[region_name]

        # 根据分数确定标签底色
        color_hex, _ = _get_status_info(score)

        # ── 仅显示区域名称 ──
        ax.annotate(
            region_name,
            (cx, cy),
            textcoords='offset points',
            xytext=(0, offset_y),
            fontsize=font_main,
            fontweight='bold',
            color='white',
            ha='center', va='top',
            bbox=dict(
                boxstyle='round,pad=0.3',
                facecolor=color_hex,
                edgecolor='white',
                linewidth=1.2,
                alpha=0.92,
            ),
            zorder=10,
        )


def _get_status_info(score):
    """
    根据评分返回对应的颜色（内部使用，仅用于热力图着色）。
    Mirror Mate 陪伴助手风格 — 不输出状态文字。
    """
    if score >= 85:
        return '#2EA043', ''
    if score >= 70:
        return '#30A0D8', ''
    if score >= 55:
        return '#E8A837', ''
    if score >= 40:
        return '#E07030', ''
    return '#D03030', ''


def _render_labels(ax, region_centers, region_scores, image_size, display_mask=None):
    w, h = image_size
    scale = max(min(w, h) / 560.0, 0.62)
    bbox = _mask_bbox(display_mask) if display_mask is not None else None
    if bbox is None:
        bbox = (0, 0, w, h)
    left, top, right, bottom = bbox
    face_w = max(right - left, 1)
    face_h = max(bottom - top, 1)

    for item in _select_beauty_callouts(region_centers, region_scores):
        region_name = item['region']
        if region_name not in region_centers or region_name not in region_scores:
            continue

        point = np.array(region_centers[region_name], dtype=np.float64)
        text_xy = _callout_text_position(
            item['slot'],
            point,
            image_size,
            face_w,
            face_h,
            scale,
        )
        print(
            '[heatmap] label anchor: '
            f'{region_name} -> {item["title"]}, '
            f'point=({int(point[0])},{int(point[1])})'
        )
        _draw_beauty_callout(
            ax,
            point,
            text_xy,
            item['title'],
            scale,
        )


def _select_beauty_callouts(region_centers, region_scores):
    callouts = []

    def add(region_name, title, subtitle, metric, slot, mode='positive_score', label_mode='positive'):
        if region_name in region_centers and region_name in region_scores:
            callouts.append({
                'region': region_name,
                'title': title,
                'subtitle': subtitle,
                'metric': metric,
                'slot': slot,
                'mode': mode,
                'label_mode': label_mode,
            })

    add('前额', '额头', '敏感倾向', 'overall', 'forehead', 'negative_from_health', 'negative')

    eye_candidates = [name for name in ('左眼周', '右眼周') if name in region_centers and name in region_scores]
    if eye_candidates:
        eye_region = min(
            eye_candidates,
            key=lambda name: _numeric_score(region_scores[name], 'brightness', _numeric_score(region_scores[name])),
        )
        add(eye_region, '眼周', '暗沉倾向', 'brightness', 'under_eye', 'negative_from_health', 'negative')

    add('鼻部', '鼻部', '红感', 'evenness', 'nose', 'negative_from_health', 'negative')
    if '鼻部' not in region_centers or '鼻部' not in region_scores:
        add('鼻子', '鼻部', '红感', 'evenness', 'nose', 'negative_from_health', 'negative')

    cheek_candidates = [name for name in ('左脸颊', '右脸颊') if name in region_centers and name in region_scores]
    if cheek_candidates:
        cheek_region = max(cheek_candidates, key=lambda name: region_centers[name][0])
        add(cheek_region, '双颊', '水润状态', 'hydration', 'cheek')

    if '唇周' in region_centers and '唇周' in region_scores:
        add('唇周', '口周', '状态', 'overall', 'perioral')
    else:
        add('下巴', '下巴', '状态', 'overall', 'perioral')

    return callouts[:5]


def _callout_score_info(scores, metric, mode='positive_score'):
    overall = _numeric_score(scores, 'overall', 50.0)
    if metric == 'hydration':
        raw_score = _numeric_score(scores, 'hydration', overall)
    elif metric == 'brightness':
        raw_score = _numeric_score(scores, 'brightness', overall)
    elif metric == 'evenness':
        raw_score = _numeric_score(scores, 'evenness', overall)
    else:
        raw_score = overall
    return feature_value_to_display_score(metric, raw_value=None, raw_score=raw_score, mode=mode)


def _callout_text_position(slot, point, image_size, face_w, face_h, scale):
    w, h = image_size
    px, py = point
    offsets = {
        'forehead': (-0.18 * face_w, -0.05 * face_h),
        'under_eye': (-0.30 * face_w, 0.02 * face_h),
        'nose': (-0.30 * face_w, 0.15 * face_h),
        'cheek': (0.22 * face_w, 0.03 * face_h),
        'perioral': (-0.20 * face_w, 0.18 * face_h),
    }
    dx, dy = offsets.get(slot, (0.12 * face_w, 0.0))
    text_w = 46 * scale
    text_h = 18 * scale
    x = float(np.clip(px + dx, 6 * scale, max(6 * scale, w - text_w)))
    y = float(np.clip(py + dy, 12 * scale, max(12 * scale, h - text_h)))
    return np.array([x, y], dtype=np.float64)


def _draw_beauty_callout(ax, point, text_xy, title, scale):
    import matplotlib.patheffects as path_effects

    px, py = float(point[0]), float(point[1])
    tx, ty = float(text_xy[0]), float(text_xy[1])
    font_prop = _get_cjk_font_prop()
    text_color = (1.0, 0.97, 0.90, 0.86)
    line_color = (1.0, 1.0, 1.0, 0.54)
    shadow = [
        path_effects.withStroke(
            linewidth=max(1.0 * scale, 0.8),
            foreground=(0.22, 0.14, 0.08, 0.28),
        )
    ]

    anchor_x = tx + (36 * scale if tx < px else 0)
    anchor_y = ty + 8 * scale
    ax.plot([px, anchor_x], [py, anchor_y],
            color=line_color, linewidth=0.55 * scale, zorder=11)
    ax.scatter([px], [py], s=max(6.0 * scale, 4.0),
               c=[(1.0, 1.0, 1.0, 0.82)], edgecolors='none', zorder=12)

    ax.text(
        tx,
        ty,
        title,
        fontsize=7.0 * scale,
        fontproperties=font_prop,
        fontweight='regular',
        color=text_color,
        ha='left',
        va='top',
        path_effects=shadow,
        zorder=13,
    )
