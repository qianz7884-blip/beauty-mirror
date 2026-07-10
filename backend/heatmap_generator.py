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
    get_region_centers,
    build_improved_face_skin_mask,
    load_image,
)
from scipy.ndimage import gaussian_filter, binary_erosion, binary_closing


MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
BUNDLED_CJK_FONT = os.path.join(MODULE_DIR, 'assets', 'fonts', 'NotoSansSC-Regular.otf')
DEBUG_HEATMAP = os.environ.get('DEBUG_HEATMAP', '').lower() in ('1', 'true', 'yes', 'on')
HEATMAP_DEBUG_DIR = os.environ.get(
    'HEATMAP_DEBUG_DIR',
    os.path.join(MODULE_DIR, 'debug_heatmap'),
)

BEAUTY_BASE_COLOR = np.array([244, 236, 222], dtype=np.float64)
BEAUTY_REGION_COLORS = {
    '前额': np.array([232, 190, 172], dtype=np.float64),
    '鼻子': np.array([229, 132, 121], dtype=np.float64),
    '下巴': np.array([226, 177, 132], dtype=np.float64),
    '唇周': np.array([226, 177, 132], dtype=np.float64),
    '左眼周': np.array([176, 162, 182], dtype=np.float64),
    '右眼周': np.array([176, 162, 182], dtype=np.float64),
    '左脸颊': np.array([147, 188, 166], dtype=np.float64),
    '右脸颊': np.array([147, 188, 166], dtype=np.float64),
}
BEAUTY_FALLBACK_COLOR = np.array([226, 178, 132], dtype=np.float64)
BEAUTY_GOOD_COLOR = np.array([118, 178, 154], dtype=np.float64)
BEAUTY_OK_COLOR = np.array([224, 196, 146], dtype=np.float64)
BEAUTY_WARN_COLOR = np.array([224, 158, 126], dtype=np.float64)
BEAUTY_BAD_COLOR = np.array([204, 86, 96], dtype=np.float64)

_CJK_FONT_PROP = None
_CJK_FONT_CHECKED = False


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
    alpha_map = np.clip(alpha_map, 0.0, 1.0)[..., None]
    return base_rgb * (1.0 - alpha_map) + overlay_color * alpha_map


def _region_blob_shape(region_name, face_span):
    base = max(face_span, 1.0)
    if region_name in ('左脸颊', '右脸颊'):
        return base * 0.24, base * 0.22
    if region_name == '鼻子':
        return base * 0.12, base * 0.16
    if region_name in ('左眼周', '右眼周'):
        return base * 0.14, base * 0.08
    if region_name == '前额':
        return base * 0.22, base * 0.12
    if region_name in ('唇周', '下巴'):
        return base * 0.14, base * 0.10
    return base * 0.18, base * 0.16


def _build_visual_display_mask(face_mask_u8, image_size):
    w, h = image_size
    mask = np.asarray(face_mask_u8) > 0
    if mask.shape != (h, w) or int(np.sum(mask)) < 100:
        return np.zeros((h, w), dtype=np.float64)

    shrink_px = max(1, int(round(min(w, h) * 0.006)))
    eroded = binary_erosion(mask, iterations=shrink_px, border_value=0)
    if int(np.sum(eroded)) > 100:
        mask = eroded

    close_iter = max(1, shrink_px // 2)
    mask = binary_closing(mask, iterations=close_iter)
    sigma = max(min(w, h) * 0.006, 1.5)
    soft_mask = gaussian_filter(mask.astype(np.float64), sigma=sigma, mode='constant')
    max_val = float(soft_mask.max())
    if max_val > 1e-8:
        soft_mask = soft_mask / max_val
    return np.clip(soft_mask, 0.0, 1.0)


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


def _build_beauty_overlay(original_rgb, region_centers, region_scores,
                          image_size, display_mask, alpha=0.5):
    w, h = image_size
    output = original_rgb.astype(np.float64)
    display_mask = np.clip(display_mask.astype(np.float64), 0.0, 1.0)
    intensity = float(np.clip(alpha / 0.5, 0.45, 1.35))

    centers_list = [
        (float(cx), float(cy))
        for name, (cx, cy) in region_centers.items()
        if name in region_scores
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
    heat_only = np.full_like(output, 255.0)
    heat_only = _alpha_blend_rgb(heat_only, BEAUTY_BASE_COLOR, base_alpha)

    yy, xx = np.mgrid[0:h, 0:w]
    contour_field = np.zeros((h, w), dtype=np.float64)
    region_fields = {}
    label_sources = {}

    for region_name, scores in region_scores.items():
        if region_name not in region_centers:
            continue

        metric = _region_visual_metric(region_name)
        score_info = _region_score_info(region_name, scores, metric=metric, mode='positive_score')
        score = score_info['display_score']
        heat_val = _score_to_heat(score)
        cx, cy = region_centers[region_name]
        cx = float(np.clip(cx, 0, w - 1))
        cy = float(np.clip(cy, 0, h - 1))
        sigma_x, sigma_y = _region_blob_shape(region_name, face_span)

        blob = np.exp(-0.5 * (((xx - cx) / sigma_x) ** 2 + ((yy - cy) / sigma_y) ** 2))
        blob = gaussian_filter(blob * display_mask, sigma=max(face_span * 0.012, 1.0), mode='constant')
        if blob.max() > 1e-8:
            blob = blob / blob.max()

        local_support = np.clip((blob - 0.055) / 0.42, 0.0, 1.0)
        region_field = blob * local_support * display_mask
        color = _score_to_beauty_color(score, region_name)
        peak_alpha = (0.04 + 0.25 * (heat_val ** 1.15)) * intensity
        if score >= 80:
            peak_alpha = max(peak_alpha, 0.13 * intensity)
        elif score < 45:
            peak_alpha = max(peak_alpha, 0.23 * intensity)

        region_alpha = np.clip(region_field * peak_alpha, 0.0, 0.30)
        output = _alpha_blend_rgb(output, color, region_alpha)
        heat_only = _alpha_blend_rgb(heat_only, color, region_alpha)
        region_heat = region_field * heat_val
        contour_field += region_heat
        region_fields[region_name] = region_heat
        label_sources[region_name] = score_info

        print(f'[heatmap] beauty blob: {region_name} center=({cx:.0f},{cy:.0f}) '
              f'feature={metric} raw={score_info["raw_score"]} '
              f'display={score:.0f} heat={heat_val:.3f} peak_alpha={peak_alpha:.3f}')

    contour_field = gaussian_filter(contour_field * display_mask, sigma=max(face_span * 0.018, 1.2), mode='constant')
    debug_data = {
        'region_fields': region_fields,
        'fused_heat_field': contour_field,
        'colored_heatmap': np.clip(heat_only, 0, 255).astype(np.uint8),
        'label_sources': label_sources,
    }

    return np.clip(output, 0, 255).astype(np.uint8), contour_field, debug_data


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


# ============================================================
# 主入口
# ============================================================

def _heatmap_debug_enabled():
    debug_roi = os.environ.get('DEBUG_ROI', '').lower() in ('1', 'true', 'yes', 'on')
    return DEBUG_HEATMAP or debug_roi


def _field_to_uint8(field):
    arr = np.asarray(field, dtype=np.float64)
    arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
    max_val = float(arr.max()) if arr.size else 0.0
    if max_val > 1e-8:
        arr = arr / max_val
    return np.clip(arr * 255.0, 0, 255).astype(np.uint8)


def _safe_debug_name(name):
    return ''.join(ch if ch.isalnum() else '_' for ch in str(name))[:32] or 'region'


def _save_heatmap_debug_images(skin_mask_u8, display_mask, heatmap_debug, final_png_bytes, debug_id):
    if not _heatmap_debug_enabled():
        return

    try:
        from PIL import Image

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

        # ═══════════════════════════════════════════════════════
        # Step 2: 获取区域中心坐标
        # ═══════════════════════════════════════════════════════
        region_centers = get_region_centers(landmarks, image_size)

        # ═══════════════════════════════════════════════════════
        # Step 3: 构建连续热场（高斯扩散）
        # ═══════════════════════════════════════════════════════
        composite, contour_field, heatmap_debug = _build_beauty_overlay(
            img_np,
            region_centers,
            region_scores,
            image_size,
            display_mask,
            alpha=alpha,
        )

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
        _render_topographic_lines(ax, contour_field, display_mask)

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
        )

        b64 = base64.b64encode(final_png_bytes).decode('utf-8')
        print(f'[heatmap] 热力图生成完成: {len(b64)} 字符')
        return f'data:image/png;base64,{b64}'

    except ImportError as e:
        print(f'[heatmap] 依赖缺失: {e}')
        traceback.print_exc()
        return None
    except Exception as e:
        print(f'[heatmap] 热力图生成失败: {e}')
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
        score_info = _callout_score_info(region_scores[region_name], item['metric'], item['mode'])
        value_text = _feature_level_text(score_info, item['label_mode'])
        print(
            '[heatmap] label source: '
            f'{region_name}/{item["title"]}{item["subtitle"]} '
            f'feature={score_info["feature_key"]}, source={score_info["source"]}, '
            f'direction={score_info["direction"]}, raw={score_info["raw_score"]}, '
            f'normalized={score_info["normalized_score"]:.1f}, '
            f'display={score_info["display_score"]:.1f}, mode={score_info["mode"]}, '
            f'label={value_text}'
        )
        _draw_beauty_callout(
            ax,
            point,
            text_xy,
            item['title'],
            item['subtitle'],
            value_text,
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
    text_w = 92 * scale
    text_h = 34 * scale
    x = float(np.clip(px + dx, 6 * scale, max(6 * scale, w - text_w)))
    y = float(np.clip(py + dy, 12 * scale, max(12 * scale, h - text_h)))
    return np.array([x, y], dtype=np.float64)


def _draw_beauty_callout(ax, point, text_xy, title, subtitle, value_text, scale):
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

    anchor_x = tx + (58 * scale if tx < px else 0)
    anchor_y = ty + 17 * scale
    ax.plot([px, anchor_x], [py, anchor_y],
            color=line_color, linewidth=0.55 * scale, zorder=11)
    ax.scatter([px], [py], s=max(6.0 * scale, 4.0),
               c=[(1.0, 1.0, 1.0, 0.82)], edgecolors='none', zorder=12)

    ax.text(
        tx,
        ty,
        f'{title}\n{subtitle}',
        fontsize=6.1 * scale,
        fontproperties=font_prop,
        fontweight='regular',
        color=text_color,
        ha='left',
        va='top',
        linespacing=0.92,
        path_effects=shadow,
        zorder=13,
    )
    ax.text(
        tx,
        ty + 25 * scale,
        value_text,
        fontsize=5.4 * scale,
        fontproperties=font_prop,
        color=(1.0, 0.96, 0.88, 0.90),
        ha='left',
        va='top',
        path_effects=shadow,
        zorder=13,
    )
