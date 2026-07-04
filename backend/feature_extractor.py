"""
皮肤特征提取模块 (Feature Extraction)

纯 numpy/scipy/PIL 实现，无 opencv/skimage 依赖。
从 8 个面部 ROI 图像中提取数值特征，计算 0-100 评分，
分类肤质类型，检测皮肤问题。

使用方法:
    extractor = FeatureExtractor()
    feature_json = extractor.extract_all_features(region_rois, landmarks, image_size)
"""

import numpy as np
from PIL import Image
from io import BytesIO
from scipy.ndimage import uniform_filter, sobel, label as ndi_label, gaussian_filter
from scipy.ndimage import binary_erosion, generate_binary_structure


# ============================================================
# RGB → Lab 转换矩阵（sRGB, D65 白点）
# ============================================================

# sRGB → XYZ 矩阵
_RGB2XYZ = np.array([
    [0.4124564, 0.3575761, 0.1804375],
    [0.2126729, 0.7151522, 0.0721750],
    [0.0193339, 0.1191920, 0.9503041],
], dtype=np.float64)

# D65 参考白点
_Xn, _Yn, _Zn = 0.95047, 1.0, 1.08883
_DELTA = 6.0 / 29.0
_DELTA3 = _DELTA ** 3


def _rgb_to_lab(rgb):
    """
    将 RGB uint8 图像 (H, W, 3) 转换为 CIE Lab float64 (H, W, 3)。
    L* ∈ [0, 100], a* ∈ [-128, 128], b* ∈ [-128, 128]
    """
    # 归一化 & sRGB 线性化
    rgb_norm = rgb.astype(np.float64) / 255.0
    mask = rgb_norm > 0.04045
    rgb_lin = rgb_norm / 12.92
    rgb_lin[mask] = ((rgb_norm[mask] + 0.055) / 1.055) ** 2.4

    # RGB → XYZ
    xyz = np.dot(rgb_lin.reshape(-1, 3), _RGB2XYZ.T).reshape(rgb.shape)
    x, y, z = xyz[..., 0], xyz[..., 1], xyz[..., 2]

    # XYZ → Lab
    xn, yn, zn = x / _Xn, y / _Yn, z / _Zn
    f = lambda t: np.where(t > _DELTA3, t ** (1.0 / 3.0), t / (3.0 * _DELTA ** 2) + 4.0 / 29.0)

    L = 116.0 * f(yn) - 16.0
    a_val = 500.0 * (f(xn) - f(yn))
    b_val = 200.0 * (f(yn) - f(zn))

    return np.stack([L, a_val, b_val], axis=-1)


def _rgb_to_hsv(rgb):
    """
    将 RGB uint8 图像 (H, W, 3) 转换为 HSV float64 (H, W, 3)。
    H ∈ [0, 360), S ∈ [0, 1], V ∈ [0, 1]
    """
    r, g, b = rgb[..., 0].astype(np.float64) / 255.0, \
              rgb[..., 1].astype(np.float64) / 255.0, \
              rgb[..., 2].astype(np.float64) / 255.0

    cmax = np.maximum(np.maximum(r, g), b)
    cmin = np.minimum(np.minimum(r, g), b)
    delta = cmax - cmin

    V = cmax
    safe_delta = np.where(delta == 0, 1.0, delta)

    # H
    H = np.zeros_like(delta)
    mask_r = (cmax == r) & (delta != 0)
    mask_g = (cmax == g) & (delta != 0)
    mask_b = (cmax == b) & (delta != 0)
    H[mask_r] = 60.0 * (((g[mask_r] - b[mask_r]) / safe_delta[mask_r]) % 6)
    H[mask_g] = 60.0 * (((b[mask_g] - r[mask_g]) / safe_delta[mask_g]) + 2)
    H[mask_b] = 60.0 * (((r[mask_b] - g[mask_b]) / safe_delta[mask_b]) + 4)
    H = np.where(H < 0, H + 360, H)

    # S
    S = np.where(cmax == 0, 0.0, delta / cmax)

    return np.stack([H, S, V], axis=-1)


# ============================================================
# FeatureExtractor
# ============================================================

class FeatureExtractor:
    """皮肤特征提取器 — 从 ROI 图像提取数值特征并计算评分"""

    # GLCM 参数
    GLCM_LEVELS = 16
    GLCM_DISTANCES = [1, 2]
    GLCM_ANGLES = [0, 45, 90, 135]

    # 评分权重（全脸综合）
    SCORE_WEIGHTS = {
        'hydration': 0.20,
        'smoothness': 0.20,
        'brightness': 0.15,
        'pores': 0.25,
        'evenness': 0.20,
    }

    # 全脸各维度按区域加权（T区 vs 面颊侧重不同）
    FACE_WEIGHTS = {
        'hydration': {'左脸颊': 0.20, '右脸颊': 0.20, '前额': 0.15, '下巴': 0.15,
                       '鼻子': 0.10, '左眼周': 0.07, '右眼周': 0.07, '唇周': 0.06},
        'smoothness': {'左脸颊': 0.22, '右脸颊': 0.22, '前额': 0.18, '下巴': 0.12,
                        '鼻子': 0.08, '左眼周': 0.06, '右眼周': 0.06, '唇周': 0.06},
        'brightness': {'前额': 0.18, '左脸颊': 0.18, '右脸颊': 0.18, '鼻子': 0.14,
                        '下巴': 0.12, '左眼周': 0.07, '右眼周': 0.07, '唇周': 0.06},
        'pores': {'鼻子': 0.25, '前额': 0.22, '下巴': 0.15, '左脸颊': 0.12,
                   '右脸颊': 0.12, '左眼周': 0.05, '右眼周': 0.05, '唇周': 0.04},
        'evenness': {'前额': 0.15, '左脸颊': 0.15, '右脸颊': 0.15, '鼻子': 0.15,
                      '下巴': 0.12, '左眼周': 0.10, '右眼周': 0.10, '唇周': 0.08},
    }

    # ============================================================
    # 公开 API
    # ============================================================

    def extract_all_features(self, region_rois, landmarks=None, image_size=None):
        """
        从所有 ROI 区域提取特征并计算皮肤分析结果。

        Args:
            region_rois: dict, {区域名: JPEG bytes 或 None}
            landmarks: MediaPipe 地标列表（保留参数，供未来扩展）
            image_size: (w, h) 原始图像尺寸（保留参数，供未来扩展）

        Returns:
            dict: 完整的 Feature JSON，包含 region_features、region_scores、
                  scores、skin_type、concerns、overall_score、aggregated_features
        """
        # Step 1: 逐区域提取原始特征
        all_region_features = {}
        for region_name, roi_bytes in region_rois.items():
            if roi_bytes is None:
                continue
            try:
                roi_rgb = self._decode_roi(roi_bytes)
                if roi_rgb.shape[0] < 10 or roi_rgb.shape[1] < 10:
                    print(f'[feature_extractor] {region_name} 区域太小，跳过')
                    continue

                color = self._extract_color_features(roi_rgb)
                texture = self._extract_texture_features(roi_rgb)
                pores = self._extract_pore_features(roi_rgb)
                spots = self._extract_spot_features(roi_rgb)
                shine = self._extract_shine_features(roi_rgb)

                all_region_features[region_name] = {
                    'color': color,
                    'texture': texture,
                    'pores': pores,
                    'spots': spots,
                    'shine': shine,
                }
            except Exception as e:
                print(f'[feature_extractor] {region_name} 特征提取异常: {e}')
                continue

        if not all_region_features:
            # 所有区域都失败：返回默认值
            return self._make_default_result()

        # Step 2: 逐区域计算 0-100 评分
        region_scores = {}
        for region_name, features in all_region_features.items():
            region_scores[region_name] = self._compute_region_scores(features)

        # Step 3: 全脸加权评分
        face_scores = self._compute_face_scores(region_scores)

        # Step 4: 肤质分类
        skin_type = self._classify_skin_type(all_region_features)

        # Step 5: 问题检测
        concerns = self._detect_concerns(all_region_features, skin_type)

        # Step 6: 聚合特征（全脸平均原始特征）
        aggregated = self._aggregate_features(all_region_features)

        return {
            'skin_type': skin_type,
            'overall_score': round(face_scores['overall']),
            'scores': {
                'hydration': round(face_scores['hydration']),
                'smoothness': round(face_scores['smoothness']),
                'brightness': round(face_scores['brightness']),
                'pores': round(face_scores['pores']),
                'evenness': round(face_scores['evenness']),
            },
            'concerns': concerns,
            'region_features': all_region_features,
            'region_scores': region_scores,
            'aggregated_features': aggregated,
        }

    # ============================================================
    # 图像解码
    # ============================================================

    @staticmethod
    def _decode_roi(roi_bytes):
        """JPEG bytes → RGB ndarray (H, W, 3) uint8"""
        img = Image.open(BytesIO(roi_bytes))
        if img.mode != 'RGB':
            img = img.convert('RGB')
        return np.array(img, dtype=np.uint8)

    # ============================================================
    # 颜色特征
    # ============================================================

    @staticmethod
    def _extract_color_features(roi_rgb):
        """
        提取颜色特征：Lab 均值/标准差、HSV 均值/标准差、红斑指数、黑色素估计值。
        """
        lab = _rgb_to_lab(roi_rgb)
        hsv = _rgb_to_hsv(roi_rgb)

        lab_mean = [float(lab[..., i].mean()) for i in range(3)]
        lab_std = [float(lab[..., i].std()) for i in range(3)]
        hsv_mean = [float(hsv[..., i].mean()) for i in range(3)]
        hsv_std = [float(hsv[..., i].std()) for i in range(3)]

        # 红斑指数: a* 通道正值 = 红色，归一化到 [0, 1]
        a_channel = lab[..., 1]
        erythema = float(max(0.0, a_channel.mean()) / 128.0)
        erythema = min(erythema, 1.0)

        # 黑色素估计: 低亮度 + 高 b* (黄色调) → 较多黑色素
        L_channel = lab[..., 0]
        b_channel = lab[..., 2]
        melanin = float(max(0.0, (255.0 - L_channel.mean()) / 255.0 * (1.0 + max(0.0, b_channel.mean()) / 128.0)))
        melanin = min(melanin, 1.0)

        return {
            'lab_mean': lab_mean,
            'lab_std': lab_std,
            'hsv_mean': hsv_mean,
            'hsv_std': hsv_std,
            'erythema_index': erythema,
            'melanin_estimate': melanin,
        }

    # ============================================================
    # 纹理特征 (GLCM)
    # ============================================================

    @staticmethod
    def _compute_glcm(gray, levels=16, distances=None, angles=None):
        """
        纯 numpy GLCM（灰度共生矩阵）计算。

        Args:
            gray: uint8 灰度图 (H, W)
            levels: 量化级数
            distances: 像素距离列表
            angles: 角度列表（度数）

        Returns:
            ndarray (levels, levels): 归一化 + 对称化 + 全方向平均 GLCM
        """
        if distances is None:
            distances = [1, 2]
        if angles is None:
            angles = [0, 45, 90, 135]

        # 量化
        gray_q = np.floor(gray.astype(np.float64) / 255.0 * (levels - 1)).astype(np.int32)
        H, W = gray_q.shape

        glcm_total = np.zeros((levels, levels), dtype=np.float64)
        count = 0

        for d in distances:
            for angle_deg in angles:
                angle_rad = np.deg2rad(angle_deg)
                dy = int(round(d * np.sin(angle_rad)))
                dx = int(round(d * np.cos(angle_rad)))

                if dy == 0 and dx == 0:
                    continue

                # 有效像素范围
                r_start = max(0, -dy)
                r_end = min(H, H - dy)
                c_start = max(0, -dx)
                c_end = min(W, W - dx)

                ref = gray_q[r_start:r_end, c_start:c_end]
                neigh = gray_q[r_start + dy:r_end + dy, c_start + dx:c_end + dx]

                if ref.size == 0:
                    continue

                glcm = np.zeros((levels, levels), dtype=np.float64)
                np.add.at(glcm, (ref.ravel(), neigh.ravel()), 1.0)

                # 对称化 & 归一化
                glcm = glcm + glcm.T
                total = glcm.sum()
                if total > 0:
                    glcm /= total

                glcm_total += glcm
                count += 1

        if count > 0:
            glcm_total /= count

        return glcm_total

    @staticmethod
    def _glcm_properties(glcm):
        """
        从单个 GLCM 计算 Haralick 特征。
        """
        levels = glcm.shape[0]
        I, J = np.meshgrid(np.arange(levels), np.arange(levels), indexing='ij')

        # 边缘概率
        p_i = glcm.sum(axis=1)
        p_j = glcm.sum(axis=0)

        # 均值
        mu_i = np.sum(I[:, 0] * p_i)
        mu_j = np.sum(J[0, :] * p_j)

        # 标准差
        sigma_i = np.sqrt(max(1e-10, np.sum(((I[:, 0] - mu_i) ** 2) * p_i)))
        sigma_j = np.sqrt(max(1e-10, np.sum(((J[0, :] - mu_j) ** 2) * p_j)))

        # Haralick 特征
        contrast = np.sum(((I - J) ** 2) * glcm)
        homogeneity = np.sum(glcm / (1.0 + (I - J) ** 2))
        energy = np.sum(glcm ** 2)

        if sigma_i > 1e-10 and sigma_j > 1e-10:
            correlation = np.sum((I - mu_i) * (J - mu_j) * glcm) / (sigma_i * sigma_j)
        else:
            correlation = 0.0

        return {
            'contrast': float(contrast),
            'homogeneity': float(homogeneity),
            'energy': float(energy),
            'correlation': float(correlation),
        }

    def _extract_texture_features(self, roi_rgb):
        """
        提取纹理特征：GLCM 属性 + 熵 + 粗糙度。
        """
        # 灰度图
        gray = (0.299 * roi_rgb[..., 0].astype(np.float64) +
                0.587 * roi_rgb[..., 1].astype(np.float64) +
                0.114 * roi_rgb[..., 2].astype(np.float64)).astype(np.uint8)

        # GLCM
        glcm = self._compute_glcm(gray, levels=self.GLCM_LEVELS,
                                  distances=self.GLCM_DISTANCES,
                                  angles=self.GLCM_ANGLES)
        haralick = self._glcm_properties(glcm)

        # 灰度直方图熵
        hist, _ = np.histogram(gray, bins=256, range=(0, 255), density=True)
        hist = hist[hist > 0]
        entropy = -np.sum(hist * np.log2(hist + 1e-10))
        entropy_norm = entropy / np.log2(256)  # 归一化到 [0, 1]

        # 粗糙度（复合指标）
        contrast_norm = min(haralick['contrast'] / 50.0, 1.0)
        roughness = (0.35 * contrast_norm +
                     0.35 * (1.0 - haralick['homogeneity']) +
                     0.30 * entropy_norm)

        return {
            'contrast': haralick['contrast'],
            'homogeneity': haralick['homogeneity'],
            'energy': haralick['energy'],
            'correlation': haralick['correlation'],
            'entropy': float(entropy),
            'roughness': float(roughness),
        }

    # ============================================================
    # 毛孔特征
    # ============================================================

    @staticmethod
    def _extract_pore_features(roi_rgb):
        """
        提取毛孔相关特征：高频分量比、毛孔可见度。
        """
        gray = (0.299 * roi_rgb[..., 0].astype(np.float64) +
                0.587 * roi_rgb[..., 1].astype(np.float64) +
                0.114 * roi_rgb[..., 2].astype(np.float64))

        # Sobel 梯度 → 边缘能量比
        gx = sobel(gray, axis=1)
        gy = sobel(gray, axis=0)
        grad_mag = np.sqrt(gx ** 2 + gy ** 2)

        # 高频像素：梯度幅度 > 均值 + 1 倍标准差
        threshold = grad_mag.mean() + grad_mag.std()
        edge_pixels = np.sum(grad_mag > threshold)
        total_pixels = grad_mag.size

        hf_ratio = float(edge_pixels / max(total_pixels, 1))

        # 毛孔可见度（结合 HF 比和局部方差）
        local_var = float(np.var(gray))
        var_norm = min(local_var / 500.0, 1.0)  # 经验阈值
        pore_visibility = float(0.5 * hf_ratio + 0.5 * var_norm)

        return {
            'hf_ratio': hf_ratio,
            'pore_visibility': min(pore_visibility, 1.0),
        }

    # ============================================================
    # 斑点/色素特征
    # ============================================================

    @staticmethod
    def _extract_spot_features(roi_rgb):
        """
        检测暗斑、色素沉着：斑点计数、斑点密度、颜色方差。
        """
        gray = (0.299 * roi_rgb[..., 0].astype(np.float64) +
                0.587 * roi_rgb[..., 1].astype(np.float64) +
                0.114 * roi_rgb[..., 2].astype(np.float64))

        H, W = gray.shape
        total_pixels = max(H * W, 1)

        # 背景估计（大核均值滤波）
        kernel_size = max(5, min(H, W) // 8)
        if kernel_size % 2 == 0:
            kernel_size += 1
        background = uniform_filter(gray, size=kernel_size)

        # 细节 = 原图 - 背景（暗斑为负值）
        detail = gray - background
        dark_threshold = -1.5 * detail.std()

        # 暗斑掩模
        dark_mask = detail < dark_threshold

        # 形态学清理：仅保留 3~200 像素的连通域
        struct = generate_binary_structure(2, 1)
        labeled, num_features = ndi_label(dark_mask, structure=struct)

        spot_count = 0
        for i in range(1, num_features + 1):
            area = np.sum(labeled == i)
            if 3 <= area <= 200:
                spot_count += 1

        spot_density = spot_count / total_pixels

        # 颜色方差（从 Lab L* 计算）
        lab = _rgb_to_lab(roi_rgb)
        color_variance = float(lab[..., 0].std() / 100.0)  # 归一化到 ~[0, 1]

        return {
            'spot_count': spot_count,
            'spot_density': float(spot_density),
            'color_variance': float(color_variance),
        }

    # ============================================================
    # 光泽/油光特征
    # ============================================================

    @staticmethod
    def _extract_shine_features(roi_rgb):
        """
        检测镜面高光（油光/水光）：高光像素比、光泽度评分。
        """
        hsv = _rgb_to_hsv(roi_rgb)
        S, V = hsv[..., 1], hsv[..., 2]

        # 高光：低饱和度 + 高亮度
        specular_mask = (S < 0.12) & (V > 0.78)
        specular_ratio = float(np.sum(specular_mask) / max(specular_mask.size, 1))

        # 光泽度 = 高光比 × 0.6 + 平均亮度 × 0.4
        gloss_score = 0.6 * specular_ratio + 0.4 * float(V.mean())
        gloss_score = min(gloss_score, 1.0)

        return {
            'specular_ratio': float(specular_ratio),
            'gloss_score': float(gloss_score),
        }

    # ============================================================
    # 评分计算
    # ============================================================

    @staticmethod
    def _sigmoid_score(value, low_thresh, high_thresh, invert=False):
        """
        用 Sigmoid 曲线将原始值映射到 0-100 分数。
        low_thresh → ~10 分，high_thresh → ~90 分。
        """
        midpoint = (low_thresh + high_thresh) / 2.0
        steepness = 10.0 / max(high_thresh - low_thresh, 1e-10)
        normalized = (value - midpoint) * steepness
        normalized = max(-50.0, min(50.0, normalized))  # 防止 exp 溢出
        score = 100.0 / (1.0 + np.exp(-normalized))
        if invert:
            score = 100.0 - score
        return max(0.0, min(100.0, score))

    def _compute_region_scores(self, region_features):
        """
        从单个区域的原始特征计算 5 维度 0-100 评分。
        """
        color = region_features.get('color', {})
        texture = region_features.get('texture', {})
        pores = region_features.get('pores', {})
        spots = region_features.get('spots', {})
        shine = region_features.get('shine', {})

        L_mean = color.get('lab_mean', [150, 0, 0])[0]
        homogeneity = texture.get('homogeneity', 0.7)
        roughness = texture.get('roughness', 0.3)
        pore_vis = pores.get('pore_visibility', 0.3)
        gloss = shine.get('gloss_score', 0.3)
        L_std = color.get('lab_std', [20, 5, 5])[0]
        spot_density = spots.get('spot_density', 0.0)

        # 水润度：亮度 + 纹理惩罚
        hydration = self._sigmoid_score(L_mean, 130, 190)
        if roughness > 0.3:
            hydration -= (roughness - 0.3) * 50
        hydration = max(0.0, min(100.0, hydration))

        # 光滑度：同质性 + 毛孔惩罚
        smoothness = self._sigmoid_score(homogeneity, 0.55, 0.85)
        if pore_vis > 0.3:
            smoothness -= (pore_vis - 0.3) * 50
        smoothness = max(0.0, min(100.0, smoothness))

        # 光泽度（明亮）：亮度 + 油光惩罚
        brightness = self._sigmoid_score(L_mean, 130, 195)
        if gloss > 0.5:
            brightness -= (gloss - 0.5) * 40
        brightness = max(0.0, min(100.0, brightness))

        # 毛孔细腻度：低毛孔可见度 = 高分
        pores_score = 100.0 - self._sigmoid_score(pore_vis, 0.2, 0.6)
        pores_score = max(5.0, min(100.0, pores_score))

        # 均匀度：低标准差 + 少斑点 = 高分
        evenness = self._sigmoid_score(L_std, 30, 12, invert=True)
        evenness -= spot_density * 5000
        if spots.get('color_variance', 0) > 0.15:
            evenness -= 10
        evenness = max(0.0, min(100.0, evenness))

        # 区域综合
        overall = (
            hydration * self.SCORE_WEIGHTS['hydration'] +
            smoothness * self.SCORE_WEIGHTS['smoothness'] +
            brightness * self.SCORE_WEIGHTS['brightness'] +
            pores_score * self.SCORE_WEIGHTS['pores'] +
            evenness * self.SCORE_WEIGHTS['evenness']
        )

        return {
            'hydration': round(hydration),
            'smoothness': round(smoothness),
            'brightness': round(brightness),
            'pores': round(pores_score),
            'evenness': round(evenness),
            'overall': round(overall),
        }

    def _compute_face_scores(self, region_scores):
        """
        从所有区域评分加权计算全脸评分。
        """
        dims = ['hydration', 'smoothness', 'brightness', 'pores', 'evenness']
        face_scores = {}

        for dim in dims:
            weights = self.FACE_WEIGHTS.get(dim, {})
            weighted_sum = 0.0
            total_weight = 0.0
            for region_name, scores in region_scores.items():
                w = weights.get(region_name, 1.0 / max(len(region_scores), 1))
                weighted_sum += scores[dim] * w
                total_weight += w

            face_scores[dim] = round(weighted_sum / max(total_weight, 1e-10))

        # 全脸综合
        overall = sum(face_scores[d] * self.SCORE_WEIGHTS[d] for d in dims)
        face_scores['overall'] = round(overall)

        return face_scores

    # ============================================================
    # 肤质分类
    # ============================================================

    def _classify_skin_type(self, all_region_features):
        """
        基于区域特征的规则树肤质分类。
        返回: "油性"/"干性"/"混合性"/"中性"/"敏感性"
        """
        # T区指标（前额 + 鼻子）
        t_pore_vis = []
        t_gloss = []
        for r in ['前额', '鼻子']:
            f = all_region_features.get(r)
            if f:
                t_pore_vis.append(f['pores']['pore_visibility'])
                t_gloss.append(f['shine']['gloss_score'])
        t_zone_pore = np.mean(t_pore_vis) if t_pore_vis else 0.3
        t_zone_gloss = np.mean(t_gloss) if t_gloss else 0.3

        # 面颊指标
        cheek_roughness = []
        cheek_L = []
        cheek_erythema = []
        for r in ['左脸颊', '右脸颊']:
            f = all_region_features.get(r)
            if f:
                cheek_roughness.append(f['texture']['roughness'])
                cheek_L.append(f['color']['lab_mean'][0])
                cheek_erythema.append(f['color']['erythema_index'])
        cheek_rough = np.mean(cheek_roughness) if cheek_roughness else 0.3
        cheek_L_mean = np.mean(cheek_L) if cheek_L else 160
        cheek_ery = np.mean(cheek_erythema) if cheek_erythema else 0.15

        # 眼周指标
        eye_erythema = []
        for r in ['左眼周', '右眼周']:
            f = all_region_features.get(r)
            if f:
                eye_erythema.append(f['color']['erythema_index'])
        eye_ery = np.mean(eye_erythema) if eye_erythema else 0.15

        # 判断
        is_t_zone_oily = t_zone_pore > 0.45 and t_zone_gloss > 0.40
        is_cheek_dry = cheek_rough > 0.35 and cheek_L_mean < 155
        is_sensitive = cheek_ery > 0.25 or eye_ery > 0.22

        if is_sensitive:
            return '敏感性'
        elif is_t_zone_oily and is_cheek_dry:
            return '混合性'
        elif is_t_zone_oily and not is_cheek_dry:
            return '油性'
        elif is_cheek_dry and not is_t_zone_oily:
            return '干性'
        else:
            return '中性'

    # ============================================================
    # 问题检测
    # ============================================================

    def _detect_concerns(self, all_region_features, skin_type):
        """
        基于特征检测皮肤问题，返回中文标签列表（最多 6 个）。
        """
        concerns = []

        # 计算跨区域汇总指标
        t_pore = [all_region_features[r]['pores']['pore_visibility']
                  for r in ['前额', '鼻子'] if r in all_region_features]
        t_gloss = [all_region_features[r]['shine']['gloss_score']
                   for r in ['前额', '鼻子'] if r in all_region_features]
        cheek_rough = [all_region_features[r]['texture']['roughness']
                       for r in ['左脸颊', '右脸颊'] if r in all_region_features]
        cheek_erythema = [all_region_features[r]['color']['erythema_index']
                          for r in ['左脸颊', '右脸颊'] if r in all_region_features]
        eye_L = [all_region_features[r]['color']['lab_mean'][0]
                 for r in ['左眼周', '右眼周'] if r in all_region_features]
        nose_pore = all_region_features.get('鼻子', {}).get('pores', {}).get('pore_visibility', 0)

        avg_t_pore = np.mean(t_pore) if t_pore else 0
        avg_t_gloss = np.mean(t_gloss) if t_gloss else 0
        avg_cheek_rough = np.mean(cheek_rough) if cheek_rough else 0
        avg_cheek_ery = np.mean(cheek_erythema) if cheek_erythema else 0
        avg_eye_L = np.mean(eye_L) if eye_L else 160

        # 总计点数
        total_spots = sum(
            f['spots']['spot_count']
            for f in all_region_features.values()
        )

        # 规则检测
        if avg_t_gloss > 0.45 or avg_t_pore > 0.50:
            concerns.append('T区出油')

        if nose_pore > 0.50 or any(
                f['pores']['pore_visibility'] > 0.50
                for r, f in all_region_features.items() if r in ['前额', '下巴']):
            concerns.append('毛孔粗大')

        # 肤色不均：检查颜色方差
        has_uneven = any(
            f['spots']['color_variance'] > 0.10
            for f in all_region_features.values()
        )
        if has_uneven:
            concerns.append('肤色不均')

        if avg_eye_L < 140:
            concerns.append('黑眼圈')

        if avg_cheek_rough > 0.40:
            concerns.append('干燥脱皮')

        if avg_cheek_ery > 0.25:
            concerns.append('面部泛红')

        # 整体亮度偏低
        all_L = [f['color']['lab_mean'][0] for f in all_region_features.values()]
        if all_L and np.mean(all_L) < 140:
            concerns.append('肤色暗沉')

        if total_spots > 10:
            concerns.append('痘印色斑')

        if skin_type == '混合性':
            concerns.append('水油失衡')

        return concerns[:6]

    # ============================================================
    # 特征聚合（全脸平均原始特征）
    # ============================================================

    @staticmethod
    def _aggregate_features(all_region_features):
        """
        将所有区域的原始特征聚合为全脸级别的平均值。
        """
        regions = list(all_region_features.values())
        n = len(regions)
        if n == 0:
            return {}

        # 颜色
        lab_means = [r['color']['lab_mean'] for r in regions]
        hsv_means = [r['color']['hsv_mean'] for r in regions]
        erythemas = [r['color']['erythema_index'] for r in regions]
        melanins = [r['color']['melanin_estimate'] for r in regions]

        # 纹理
        contrasts = [r['texture']['contrast'] for r in regions]
        homogeneities = [r['texture']['homogeneity'] for r in regions]
        energies = [r['texture']['energy'] for r in regions]
        correlations = [r['texture']['correlation'] for r in regions]
        entropies = [r['texture']['entropy'] for r in regions]
        roughnesses = [r['texture']['roughness'] for r in regions]

        # 毛孔
        hf_ratios = [r['pores']['hf_ratio'] for r in regions]
        pore_visibilities = [r['pores']['pore_visibility'] for r in regions]

        # 斑点
        total_spot_count = sum(r['spots']['spot_count'] for r in regions)
        spot_densities = [r['spots']['spot_density'] for r in regions]
        color_variances = [r['spots']['color_variance'] for r in regions]

        # 光泽
        specular_ratios = [r['shine']['specular_ratio'] for r in regions]
        gloss_scores = [r['shine']['gloss_score'] for r in regions]

        return {
            'color': {
                'mean_lab': [sum(x[i] for x in lab_means) / n for i in range(3)],
                'mean_hsv': [sum(x[i] for x in hsv_means) / n for i in range(3)],
                'erythema_index': sum(erythemas) / n,
                'melanin_estimate': sum(melanins) / n,
            },
            'texture': {
                'contrast': sum(contrasts) / n,
                'homogeneity': sum(homogeneities) / n,
                'energy': sum(energies) / n,
                'correlation': sum(correlations) / n,
                'entropy': sum(entropies) / n,
                'roughness': sum(roughnesses) / n,
            },
            'pores': {
                'hf_ratio': sum(hf_ratios) / n,
                'pore_visibility': sum(pore_visibilities) / n,
            },
            'spots': {
                'total_spot_count': total_spot_count,
                'mean_spot_density': sum(spot_densities) / n,
                'mean_color_variance': sum(color_variances) / n,
            },
            'shine': {
                'mean_specular_ratio': sum(specular_ratios) / n,
                'mean_gloss_score': sum(gloss_scores) / n,
            },
        }

    # ============================================================
    # 默认结果（所有 ROI 提取失败时的降级返回）
    # ============================================================

    @staticmethod
    def _make_default_result():
        return {
            'skin_type': '中性',
            'overall_score': 50,
            'scores': {
                'hydration': 50, 'smoothness': 50, 'brightness': 50,
                'pores': 50, 'evenness': 50,
            },
            'concerns': [],
            'region_features': {},
            'region_scores': {},
            'aggregated_features': {},
        }
