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
from io import BytesIO

import numpy as np
from face_regions import (
    get_region_centers,
    get_face_oval_points,
    build_improved_face_skin_mask,
    load_image,
)
from scipy.ndimage import gaussian_filter


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


# ============================================================
# 主入口
# ============================================================

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
        face_mask = skin_mask_u8.astype(np.float64) / 255.0
        face_mask = gaussian_filter(face_mask, sigma=5 / 3.0, mode='constant')

        # ═══════════════════════════════════════════════════════
        # Step 2: 获取区域中心坐标
        # ═══════════════════════════════════════════════════════
        region_centers = get_region_centers(landmarks, image_size)

        # ═══════════════════════════════════════════════════════
        # Step 3: 构建连续热场（高斯扩散）
        # ═══════════════════════════════════════════════════════
        heat_field = _build_heat_field(
            region_centers, region_scores, image_size
        )

        # ═══════════════════════════════════════════════════════
        # Step 4: 热场 → 彩色映射
        # ═══════════════════════════════════════════════════════
        heatmap_rgba = _apply_colormap(heat_field, colormap_name)

        # ═══════════════════════════════════════════════════════
        # Step 5: 原图 + 热力图透明叠加（人脸 Mask 裁切）
        # ═══════════════════════════════════════════════════════
        composite = _blend_overlay(img_np, heatmap_rgba, face_mask, alpha=alpha)

        # ═══════════════════════════════════════════════════════
        # Step 6: matplotlib 渲染标签与最终输出
        # ═══════════════════════════════════════════════════════
        _setup_cjk_font()
        dpi = 100
        fig_w, fig_h = w / dpi, h / dpi
        fig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=dpi)

        # 显示合成图（origin='upper' 使像素坐标与图像坐标一致）
        ax.imshow(composite, origin='upper')

        if show_labels:
            _render_labels(ax, region_centers, region_scores, image_size)

        # ── 改进后人脸皮肤轮廓线（白色虚线）──
        contour_pts = mask_debug.get('improved_contour') if isinstance(mask_debug, dict) else None
        if contour_pts is None or len(contour_pts) == 0:
            contour_pts = get_face_oval_points(landmarks, image_size)
        if len(contour_pts) > 0:
            closed_pts = np.vstack([contour_pts, contour_pts[0]])
            ax.plot(closed_pts[:, 0], closed_pts[:, 1],
                    color='white', linewidth=1.0, alpha=0.45,
                    linestyle='--', zorder=5)

        ax.set_xlim(0, w)
        ax.set_ylim(h, 0)  # y 轴翻转匹配 origin='upper'
        ax.axis('off')
        fig.subplots_adjust(left=0, right=1, top=1, bottom=0)

        # ── 输出 base64 PNG ──
        buf = BytesIO()
        fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight',
                    pad_inches=0.05, facecolor='white')
        plt.close(fig)
        buf.seek(0)

        b64 = base64.b64encode(buf.read()).decode('utf-8')
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

def _render_labels(ax, region_centers, region_scores, image_size):
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
