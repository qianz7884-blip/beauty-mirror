"""
Recommendation Engine — Mirror Mate 的核心推荐系统。

职责：
    聚合 4 个数据源（皮肤特征 + 产品库存 + 护肤历史 + RAG 知识库），
    产出结构化的 Recommendation Context，交给 Gemini 做纯 NLG。

设计理念：
    Mirror Mate 是「AI 护肤陪伴助手」，不制造护肤焦虑。
    不输出任何数字分数、等级、评分。只提供温和、自然的观察和建议。

Gemini 只负责：将 Recommendation Context 组织成自然语言。
所有推荐逻辑、产品匹配、趋势分析、流程构建均在本模块完成。

使用方法:
    from recommendation_engine import RecommendationEngine

    engine = RecommendationEngine(db_session)
    context = engine.generate_context(feature_json)
    # 将 context 传给 Gemini 做 NLG
"""

import json
import os
import traceback
from datetime import datetime, timedelta
from collections import defaultdict

from sqlalchemy import or_


# ============================================================
# 皮肤问题 → 护理方向映射
# ============================================================

CONCERN_CARE_MAP = {
    'T区出油': {
        'causes': ['T区皮脂腺较为活跃', '温度升高会加重出油'],
        'care_direction': '日常可用温和控油产品护理T区，保持分区护理习惯',
        'recommended_categories': ['爽肤水', '面膜', '洁面'],
    },
    '毛孔粗大': {
        'causes': ['皮脂分泌较多', '清洁不够彻底'],
        'care_direction': '定期深层清洁 + 保持水油平衡有帮助',
        'recommended_categories': ['精华', '面膜', '爽肤水'],
    },
    '肤色不均': {
        'causes': ['局部色素沉着', '防晒不够到位'],
        'care_direction': '坚持防晒 + 使用提亮精华，需要耐心',
        'recommended_categories': ['精华', '防晒', '面膜'],
    },
    '黑眼圈': {
        'causes': ['眼周循环不够好', '作息不规律', '眼周皮肤天生较薄'],
        'care_direction': '眼霜 + 充足睡眠 + 偶尔冷热交替敷眼',
        'recommended_categories': ['眼霜'],
    },
    '干燥脱皮': {
        'causes': ['皮脂分泌不足', '环境湿度低', '角质层含水量偏低'],
        'care_direction': '加强保湿锁水，减少清洁频率，选择温和产品',
        'recommended_categories': ['面霜', '精华', '面膜'],
    },
    '面部泛红': {
        'causes': ['皮肤较敏感', '屏障功能偏弱', '环境刺激'],
        'care_direction': '舒缓修护为主，避免刺激性成分，精简护肤',
        'recommended_categories': ['面霜', '精华'],
    },
    '肤色暗沉': {
        'causes': ['角质代谢偏慢', '紫外线累积伤害', '作息因素'],
        'care_direction': '温和焕肤 + 防晒 + 调整作息有帮助',
        'recommended_categories': ['精华', '防晒', '面膜'],
    },
    '痘印色斑': {
        'causes': ['痘痘后色素沉着', '防晒不够'],
        'care_direction': '提亮精华 + 严格防晒，色素代谢需要时间',
        'recommended_categories': ['精华', '防晒'],
    },
    '水油失衡': {
        'causes': ['T区偏油 + 面颊偏干', '分区护理不够精细'],
        'care_direction': 'T区适当控油 + 面颊加强保湿的分区护理策略',
        'recommended_categories': ['爽肤水', '精华'],
    },
}

# 护肤品类 → AM/PM 使用时机
CATEGORY_TIMING = {
    '洁面':    {'am': True,  'pm': True,  'step': 1},
    '爽肤水':  {'am': True,  'pm': True,  'step': 2},
    '精华':    {'am': True,  'pm': True,  'step': 3},
    '眼霜':    {'am': True,  'pm': True,  'step': 4},
    '面霜':    {'am': True,  'pm': True,  'step': 5},
    '防晒':    {'am': True,  'pm': False, 'step': 6},
    '面膜':    {'am': False, 'pm': True,  'step': 'weekly'},
}

# 缺失品类的温和提醒
MISSING_CATEGORY_NUDGE = {
    '防晒': '防晒是护肤中很重要的一步，可以帮助抵御紫外线对皮肤的累积伤害',
    '眼霜': '眼周皮肤比较娇嫩，专用的眼部护理产品能更好地照顾这个区域',
    '精华': '精华含有高浓度活性成分，是针对性改善肤质的好帮手',
    '面霜': '面霜帮助锁住水分和营养，是日常护理的收尾步骤',
    '爽肤水': '爽肤水可以二次清洁并帮助后续产品更好地吸收',
}

# 需要关注的品类
CORE_CATEGORIES = {'洁面', '爽肤水', '精华', '面霜', '眼霜', '防晒'}

# 维度中文名
DIM_LABELS = {
    'hydration': '水润度', 'smoothness': '光滑度',
    'brightness': '光泽度', 'pores': '毛孔细腻度', 'evenness': '均匀度',
}


# ============================================================
# Recommendation Engine
# ============================================================

class RecommendationEngine:
    """
    Mirror Mate 推荐引擎 — AI 护肤陪伴助手。

    聚合皮肤特征、产品库存、历史记录、专业知识库，
    产出结构化 Recommendation Context（不含任何分数/评级）。
    """

    def __init__(self, db_session, user_id=None):
        self.db = db_session
        self.user_id = user_id
        from models import Product, SkinAnalysis
        self.Product = Product
        self.SkinAnalysis = SkinAnalysis

    # ================================================================
    # 公开 API
    # ================================================================

    def generate_context(self, feature_json):
        """
        主入口：聚合所有数据源，生成 Recommendation Context。

        Args:
            feature_json: FeatureExtractor.extract_all_features() 的完整输出

        Returns:
            dict: 结构化 Recommendation Context，可直接序列化为 JSON 给 Gemini。
                  包含 4 个用户可见模块 + 内部数据。
        """
        # ③ 产品匹配（先计算，routine 依赖它）
        product_guidance = self._match_products(feature_json)

        # ① 皮肤画像 + 今日状态
        skin_profile = self._build_skin_profile(feature_json)

        # ② 今日观察
        observations = self._generate_observations(feature_json)

        # ④ 护肤流程
        routine_plan = self._build_routine(feature_json, product_guidance)

        # ⑤ 趋势
        trend_context = self._analyze_trends()

        # ⑥ RAG 知识
        knowledge_references = self._retrieve_knowledge(feature_json)

        # ⑦ 镜前候选：基于 ROI + 已有产品的结构化建议，供 Gemini 选择和润色
        mirror_candidates = self._build_mirror_advice(
            feature_json,
            observations,
            product_guidance,
        )

        return {
            'skin_profile': skin_profile,
            'observations': observations,
            'routine_plan': routine_plan,
            'product_guidance': product_guidance,
            'trend_context': trend_context,
            'knowledge_references': knowledge_references,
            'mirror_candidates': mirror_candidates,
        }

    def generate_ui_modules(self, feature_json):
        """
        生成面向 UI 的 4 个模块（Engine 端规则生成，不依赖 Gemini）。

        Returns:
            dict: {
                'today_status': str,
                'observations': [str, ...],
                'mirror_advice': [{area, product, action, reason}, ...],
                'today_routine': {morning: [...], evening: [...], weekly: [...]},
                'trend': {has_history: bool, summary: str, detail: str} | None,
            }
        """
        ctx = self.generate_context(feature_json)

        # ① 今日状态
        sp = ctx['skin_profile']
        today_status = self._compose_status_text(sp)

        # ② 今日观察
        observations = [obs['description'] for obs in ctx['observations']]

        # ③ 镜前即时建议
        mirror_advice = ctx.get('mirror_candidates') or self._build_mirror_advice(
            feature_json,
            ctx['observations'],
            ctx['product_guidance'],
        )

        # ③ 今日建议
        today_routine = ctx['routine_plan']

        # ④ 趋势
        tc = ctx['trend_context']
        if tc.get('has_history'):
            trend = {
                'has_history': True,
                'summary': tc.get('summary', ''),
                'detail': tc.get('detail', ''),
            }
        else:
            trend = {'has_history': False}

        return {
            'today_status': today_status,
            'observations': observations,
            'mirror_advice': mirror_advice,
            'today_routine': today_routine,
            'trend': trend,
        }

    # ================================================================
    # ① 皮肤画像 + 状态文案
    # ================================================================

    def _build_skin_profile(self, feature_json):
        """构建不含分数的皮肤画像"""
        scores = feature_json.get('scores', {})
        region_scores = feature_json.get('region_scores', {})
        skin_type = feature_json.get('skin_type', '')
        concerns = feature_json.get('concerns', [])
        aggregated = feature_json.get('aggregated_features', {})

        # 分析维度状态（定性，不定量）
        dim_conditions = {}
        for dim, label in DIM_LABELS.items():
            score = scores.get(dim, 50)
            if score >= 70:
                dim_conditions[dim] = {'label': label, 'condition': '良好'}
            elif score >= 45:
                dim_conditions[dim] = {'label': label, 'condition': '一般'}
            else:
                dim_conditions[dim] = {'label': label, 'condition': '需关注'}

        # 找出最需要关注的维度（用于生成状态文案）
        dims_ordered = sorted(scores.items(), key=lambda x: x[1])
        weakest_dims = [d for d, s in dims_ordered if s < 50][:2]
        strongest_dims = [d for d, s in dims_ordered if s >= 65][:2]

        # 区域概况（定性）
        region_summary = []
        for rname, rscores in region_scores.items():
            if not rscores:
                continue
            worst_dim = min(
                ['hydration', 'smoothness', 'brightness', 'pores', 'evenness'],
                key=lambda d: rscores.get(d, 50)
            )
            worst_val = rscores.get(worst_dim, 50)
            if worst_val < 40:
                region_summary.append({'region': rname, 'note': f'{DIM_LABELS.get(worst_dim, "")}偏低'})
            elif worst_val < 55:
                region_summary.append({'region': rname, 'note': f'{DIM_LABELS.get(worst_dim, "")}待关注'})

        # 肤质中文描述
        skin_type_descriptions = {
            '油性': '皮肤油脂分泌较旺盛，毛孔可能比较明显，但不容易出现干纹',
            '干性': '皮肤油脂分泌偏少，较容易感到紧绷干燥，需要更注重保湿',
            '混合性': 'T区偏油、面颊偏干，是亚洲人常见的肤质类型，分区护理效果更好',
            '中性': '水油平衡状态不错，是比较理想的肤质基础',
            '敏感性': '皮肤屏障偏薄，对外界刺激反应较明显，需要温和精简的护理',
        }

        return {
            'skin_type': skin_type,
            'skin_type_description': skin_type_descriptions.get(skin_type, ''),
            'concerns': concerns,
            'dim_conditions': dim_conditions,
            'weakest_dimensions': [DIM_LABELS.get(d, d) for d in weakest_dims],
            'strongest_dimensions': [DIM_LABELS.get(d, d) for d in strongest_dims],
            'region_notes': region_summary[:4],
            'overall_impression': self._compose_overall_impression(
                skin_type, concerns, weakest_dims, strongest_dims
            ),
        }

    def _compose_overall_impression(self, skin_type, concerns, weakest_dims, strongest_dims):
        """生成整体印象的一句话（不含分数）"""
        parts = []

        if skin_type == '中性':
            parts.append('今天皮肤整体状态比较均衡')
        elif skin_type == '混合性':
            parts.append('今天的皮肤呈现混合性特征')
        elif skin_type == '油性':
            parts.append('今天皮肤油脂分泌偏旺盛')
        elif skin_type == '干性':
            parts.append('今天皮肤感觉偏干燥')
        elif skin_type == '敏感性':
            parts.append('今天皮肤状态需要温和对待')
        else:
            parts.append('今天皮肤状态基本稳定')

        if concerns:
            main_concern = concerns[0]
            parts.append(f'主要观察到{main_concern}')

        if weakest_dims:
            parts.append(f'{"和".join(weakest_dims[:2])}方面可以多关注一下')

        return '，'.join(parts) + '。'

    def _compose_status_text(self, skin_profile):
        """组合今日状态的一句话"""
        sp = skin_profile
        skin_type = sp.get('skin_type', '')
        concerns = sp.get('concerns', [])

        if not concerns:
            return f'今天皮肤状态比较稳定，适合保持日常护理节奏。'

        main_concern = concerns[0]
        templates = {
            'T区出油': '今天 T 区略微出油，整体状态稳定，按日常节奏护理就好。',
            '毛孔粗大': '今天 T 区细节更容易被看见，注意轻薄清爽即可。',
            '肤色不均': '今天肤色整体还算均衡，局部轻薄过渡会更自然。',
            '黑眼圈': '今天眼周略显疲惫，轻薄提亮即可，保持自然感。',
            '干燥脱皮': '今天局部有些干燥，加强保湿会有帮助。',
            '面部泛红': '今天局部略微泛红，温和护理、避免摩擦就好。',
            '肤色暗沉': '今天肤色略显暗沉，做好防晒和轻薄提亮即可。',
            '痘印色斑': '今天皮肤整体尚可，局部轻薄修饰会更干净。',
            '水油失衡': '今天 T 区和面颊状态不太一样，分区护理会更有效。',
        }

        base = templates.get(main_concern, f'今天皮肤状态比较稳定，适合保持日常护理。')

        # 根据皮肤类型微调
        if skin_type == '敏感性':
            base += ' 记得选择温和的产品。'
        elif skin_type == '干性':
            base += ' 注意加强保湿。'

        return base

    # ================================================================
    # ② 观察生成 — 从 Feature JSON 推导自然语言观察
    # ================================================================

    def _generate_observations(self, feature_json):
        """
        从特征数据中生成 2-4 条自然语言观察。
        这些观察来源于 Feature JSON 的实际数值，不是 Gemini 的猜测。
        """
        observations = []
        region_features = feature_json.get('region_features', {})
        region_scores = feature_json.get('region_scores', {})
        skin_type = feature_json.get('skin_type', '')
        concerns = feature_json.get('concerns', [])

        # 中文区域名映射
        region_name_cn = {
            '前额': '前额', '鼻子': '鼻子', '下巴': '下巴',
            '左脸颊': '左脸颊', '右脸颊': '右脸颊',
            '左眼周': '左眼周', '右眼周': '右眼周', '唇周': '唇周',
        }

        # --- T区（前额+鼻子）分析 ---
        t_zone_regions = ['前额', '鼻子']
        t_gloss_vals = []
        t_pore_vals = []
        for r in t_zone_regions:
            rf = region_features.get(r)
            if rf:
                t_gloss_vals.append(rf.get('shine', {}).get('gloss_score', 0))
                t_pore_vals.append(rf.get('pores', {}).get('pore_visibility', 0))

        avg_t_gloss = sum(t_gloss_vals) / len(t_gloss_vals) if t_gloss_vals else 0
        avg_t_pore = sum(t_pore_vals) / len(t_pore_vals) if t_pore_vals else 0

        # T区油光
        if avg_t_gloss > 0.55:
            observations.append({
                'area': 'T区',
                'finding': 'T区油光比较明显',
                'description': 'T区油光比较明显，皮脂分泌偏旺盛，可以适当使用控油产品',
                'type': 'concern',
            })
        elif avg_t_gloss > 0.40:
            observations.append({
                'area': 'T区',
                'finding': 'T区略有油光',
                'description': 'T区略有油光，属于正常范围，日常温和清洁即可',
                'type': 'neutral',
            })

        # T区毛孔
        if avg_t_pore > 0.55:
            observations.append({
                'area': 'T区',
                'finding': 'T区毛孔比较明显',
                'description': 'T区毛孔比较明显，深层清洁和收敛护理会有帮助',
                'type': 'concern',
            })
        elif avg_t_pore > 0.38:
            observations.append({
                'area': 'T区',
                'finding': 'T区毛孔略有可见',
                'description': 'T区毛孔略有可见，属于混合性肌肤的常见状态',
                'type': 'neutral',
            })

        # --- 面颊分析 ---
        cheek_regions = ['左脸颊', '右脸颊']
        cheek_rough = []
        cheek_L = []
        cheek_erythema = []
        cheek_hydration_scores = []
        for r in cheek_regions:
            rf = region_features.get(r)
            rs = region_scores.get(r)
            if rf:
                cheek_rough.append(rf.get('texture', {}).get('roughness', 0))
                cheek_L.append(rf.get('color', {}).get('lab_mean', [150, 0, 0])[0])
                cheek_erythema.append(rf.get('color', {}).get('erythema_index', 0))
            if rs:
                cheek_hydration_scores.append(rs.get('hydration', 50))

        avg_cheek_rough = sum(cheek_rough) / len(cheek_rough) if cheek_rough else 0
        avg_cheek_L = sum(cheek_L) / len(cheek_L) if cheek_L else 160
        avg_cheek_ery = sum(cheek_erythema) / len(cheek_erythema) if cheek_erythema else 0
        avg_cheek_hyd = sum(cheek_hydration_scores) / len(cheek_hydration_scores) if cheek_hydration_scores else 50

        # 面颊干燥
        if avg_cheek_rough > 0.40:
            observations.append({
                'area': '面颊',
                'finding': '面颊有些干燥',
                'description': '面颊摸起来不够光滑，加强保湿锁水会有改善',
                'type': 'concern',
            })
        elif avg_cheek_rough < 0.25 and avg_cheek_hyd >= 65:
            observations.append({
                'area': '面颊',
                'finding': '面颊状态稳定',
                'description': '面颊水润度和光滑度保持良好',
                'type': 'positive',
            })
        elif avg_cheek_hyd >= 55:
            observations.append({
                'area': '面颊',
                'finding': '面颊状态尚可',
                'description': '面颊状态基本稳定，保持日常护理节奏',
                'type': 'neutral',
            })

        # 面颊泛红
        if avg_cheek_ery > 0.28:
            observations.append({
                'area': '面颊',
                'finding': '面颊有轻微泛红',
                'description': '面颊区域有轻微泛红，可能与皮肤敏感或环境刺激有关，温和修护产品可以帮助舒缓',
                'type': 'concern',
            })
        elif avg_cheek_ery > 0.20:
            observations.append({
                'area': '面颊',
                'finding': '面颊微红',
                'description': '面颊肤色微微泛红，在正常范围内，继续使用温和产品即可',
                'type': 'neutral',
            })

        # --- 鼻子分析 ---
        nose_rf = region_features.get('鼻子')
        if nose_rf:
            nose_erythema = nose_rf.get('color', {}).get('erythema_index', 0)
            nose_pore = nose_rf.get('pores', {}).get('pore_visibility', 0)

            if nose_erythema > 0.30:
                observations.append({
                    'area': '鼻翼',
                    'finding': '鼻翼轻微泛红',
                    'description': '鼻翼区域有轻微泛红，可能是敏感或清洁过度，注意温和护理',
                    'type': 'concern',
                })

            if nose_pore > 0.55 and not any(o['area'] == 'T区' and '毛孔' in o['finding'] for o in observations):
                observations.append({
                    'area': '鼻子',
                    'finding': '鼻头毛孔较明显',
                    'description': '鼻头毛孔比较明显，定期清洁面膜 + 收敛护理可以有效改善',
                    'type': 'concern',
                })

        # --- 眼周分析 ---
        eye_regions = ['左眼周', '右眼周']
        eye_L_vals = []
        eye_hydration = []
        for r in eye_regions:
            rf = region_features.get(r)
            rs = region_scores.get(r)
            if rf:
                eye_L_vals.append(rf.get('color', {}).get('lab_mean', [150, 0, 0])[0])
            if rs:
                eye_hydration.append(rs.get('hydration', 50))

        avg_eye_L = sum(eye_L_vals) / len(eye_L_vals) if eye_L_vals else 160
        avg_eye_hyd = sum(eye_hydration) / len(eye_hydration) if eye_hydration else 50

        if avg_eye_L < 135:
            observations.append({
                'area': '眼周',
                'finding': '眼周略显暗沉',
                'description': '眼周肤色偏暗，可能与作息或循环有关，眼霜+充足睡眠是最好的护理',
                'type': 'concern',
            })
        elif avg_eye_hyd >= 55:
            observations.append({
                'area': '眼周',
                'finding': '眼周状态保持不错',
                'description': '眼周状态保持不错，继续目前的眼部护理习惯',
                'type': 'positive',
            })
        else:
            observations.append({
                'area': '眼周',
                'finding': '眼周状态一般',
                'description': '眼周皮肤比较娇嫩，日常可以多注意保湿和防晒',
                'type': 'neutral',
            })

        # --- 唇周分析 ---
        lip_rf = region_features.get('唇周')
        if lip_rf:
            lip_rough = lip_rf.get('texture', {}).get('roughness', 0)
            if lip_rough > 0.35:
                observations.append({
                    'area': '唇周',
                    'finding': '唇周略显干燥',
                    'description': '唇周皮肤偏干燥，涂抹面霜时可以多照顾一下这个区域',
                    'type': 'concern',
                })

        # --- 整体暗沉检查 ---
        all_L_vals = []
        for rf in region_features.values():
            L = rf.get('color', {}).get('lab_mean', [150, 0, 0])[0]
            all_L_vals.append(L)
        avg_all_L = sum(all_L_vals) / len(all_L_vals) if all_L_vals else 160

        if avg_all_L < 138:
            observations.append({
                'area': '全脸',
                'finding': '整体肤色偏暗',
                'description': '整体肤色略显暗沉，可能与作息、防晒或角质代谢有关',
                'type': 'concern',
            })

        # --- 泛红检查（跨区域） ---
        high_erythema_regions = []
        for rname, rf in region_features.items():
            ery = rf.get('color', {}).get('erythema_index', 0)
            if ery > 0.28:
                high_erythema_regions.append(rname)
        if len(high_erythema_regions) >= 3 and not any(o.get('area') == '全脸' and '泛红' in o.get('finding', '') for o in observations):
            observations.append({
                'area': '全脸',
                'finding': '多处有轻微泛红',
                'description': '多个区域有轻微泛红，建议精简护肤步骤，使用修护类产品',
                'type': 'concern',
            })

        # --- 均衡/正面观察 ---
        if not any(o['type'] == 'concern' for o in observations):
            observations.append({
                'area': '全脸',
                'finding': '整体状态稳定',
                'description': '各区域皮肤状态都比较稳定，没有明显需要特别关注的问题',
                'type': 'positive',
            })

        # 正面观察至少保留一条
        positive_obs = [o for o in observations if o['type'] == 'positive']
        concern_obs = [o for o in observations if o['type'] == 'concern']
        neutral_obs = [o for o in observations if o['type'] == 'neutral']

        # 排序：concern → neutral → positive，每个最多保留一部分
        selected = []
        selected.extend(concern_obs[:3])
        selected.extend(neutral_obs[:2])
        if len(selected) < 3:
            selected.extend(positive_obs[:1])
        if len(selected) < 2:
            selected.append({
                'area': '全脸',
                'finding': '状态稳定',
                'description': '今天皮肤整体状态稳定，继续保持日常护理习惯就好',
                'type': 'neutral',
            })

        return selected[:4]

    # ================================================================
    # ③ 产品匹配（保持原逻辑，优化输出描述）
    # ================================================================

    def _match_products(self, feature_json):
        """
        将用户产品库存与肤质需求匹配。输出温和的产品引导，不含分数。
        """
        skin_type = feature_json.get('skin_type', '')
        concerns = feature_json.get('concerns', [])
        scores = feature_json.get('scores', {})

        try:
            all_products = self._user_products_query().order_by(self.Product.created_at.desc()).all()
        except Exception as e:
            print(f'[recommendation_engine] 查询产品失败: {e}')
            all_products = []

        if not all_products:
            return {
                'suitable': [],
                'owned_products': [],
                'missing_categories': list(MISSING_CATEGORY_NUDGE.keys()),
                'missing_nudges': {cat: MISSING_CATEGORY_NUDGE.get(cat, '') for cat in MISSING_CATEGORY_NUDGE},
                'inventory_summary': '还没有添加护肤品',
                'total_products': 0,
            }

        # 需要关注的品类（基于 concerns）
        needed_categories = set()
        for concern in concerns:
            care_info = CONCERN_CARE_MAP.get(concern, {})
            for cat in care_info.get('recommended_categories', []):
                needed_categories.add(cat)

        owned_categories = {p.category for p in all_products if p.category}

        suitable = []
        for p in all_products:
            pd = p.to_dict()
            match_score = 50
            reasons = []

            # 肤质匹配
            if p.suitable_skin:
                if skin_type in p.suitable_skin or '所有' in p.suitable_skin:
                    match_score += 20
                    reasons.append(f'适合{skin_type}肌肤使用')
                elif skin_type == '混合性' and '混合性' in p.suitable_skin:
                    match_score += 15
                    reasons.append('适合混合性肌肤')

            # 品类匹配需求
            if p.category in needed_categories:
                match_score += 15
                if not reasons:
                    reasons.append('能满足当前护肤需求')

            # 成分关键词匹配
            ingredient_text = (p.ingredients or '') + (p.efficacy or '')
            kw_map = {
                '保湿': 'hydration', '补水': 'hydration',
                '控油': 'pores', '收敛': 'pores', '水杨酸': 'pores',
                '维生素C': 'brightness', '提亮': 'brightness',
                '修护': 'evenness', '舒缓': 'smoothness',
                '神经酰胺': 'hydration', '玻尿酸': 'hydration',
                '烟酰胺': 'evenness', '防晒': 'brightness',
            }
            for kw, dim in kw_map.items():
                if kw in ingredient_text and scores.get(dim, 100) < 60:
                    match_score += 5
                    if f'含{kw}' not in '；'.join(reasons):
                        reasons.append(f'含有{kw}，适合当前需求')

            match_score = min(100, match_score)

            if match_score >= 55:
                suitable.append({
                    'id': pd['id'],
                    'name': pd['name'],
                    'brand': pd['brand'],
                    'category': pd['category'],
                    'efficacy': pd['efficacy'][:60] if pd['efficacy'] else '',
                    'why_suitable': '；'.join(reasons) if reasons else '可以继续使用',
                })

        suitable.sort(key=lambda x: len(x.get('why_suitable', '')), reverse=True)

        # 缺失品类（温和提醒）
        missing = []
        for cat in CORE_CATEGORIES:
            if cat not in owned_categories:
                missing.append(cat)

        # 库存摘要
        cat_counts = defaultdict(int)
        for p in all_products:
            if p.category:
                cat_counts[p.category] += 1
        cat_summary = '、'.join(f'{cat}{cnt}件' for cat, cnt in sorted(cat_counts.items()))
        owned_products = []
        for p in all_products[:20]:
            owned_products.append({
                'name': self._product_display_name(p),
                'category': p.category or '其他',
                'efficacy': (p.efficacy or '')[:80],
                'usage': (p.usage_instructions or '')[:80],
            })

        return {
            'suitable': suitable[:5],
            'owned_products': owned_products,
            'missing_categories': missing,
            'missing_nudges': {cat: MISSING_CATEGORY_NUDGE.get(cat, '') for cat in missing},
            'inventory_summary': f'共有{len(all_products)}件产品（{cat_summary}）',
            'total_products': len(all_products),
        }

    def _build_mirror_advice(self, feature_json, observations, product_guidance):
        """
        生成镜前可立即执行的 1-3 条建议。
        规则来源：分区观察 + concerns + 用户已有产品库。只推荐轻微处理，不引导购买。
        """
        products = self._load_inventory_products()
        concerns = feature_json.get('concerns', [])
        region_scores = feature_json.get('region_scores', {})
        region_features = feature_json.get('region_features', {})

        candidates = []

        for obs in observations:
            area = obs.get('area', '')
            finding = obs.get('finding', '')
            text = f'{area}{finding}{obs.get("description", "")}'
            if area in ('鼻翼', '鼻子') or '鼻翼' in text:
                if '泛红' in text:
                    candidates.append(self._make_mirror_card(
                        area='鼻翼两侧',
                        product=self._pick_product(products, ['面霜', '精华'], ['舒缓', '修护', '保湿']),
                        action='少量按压，避开来回摩擦',
                        reason='鼻翼区域较容易受清洁和摩擦影响，轻压能让后续妆面更平整',
                        priority=95,
                    ))
                else:
                    candidates.append(self._make_mirror_card(
                        area='鼻翼两侧',
                        product=self._pick_product(products, ['面霜', '精华'], ['保湿', '舒缓', '修护']),
                        action='少量按压，等待 10 秒后再上底妆',
                        reason='鼻翼区域更容易干燥或起伏，提前按压能让底妆更服帖',
                        priority=90,
                    ))
            elif area == 'T区' or 'T区' in text:
                if '油' in text or '毛孔' in text:
                    candidates.append(self._make_mirror_card(
                        area='T 区',
                        product=self._pick_product(products, ['爽肤水', '底妆', '彩妆'], ['控油', '清爽', '定妆']),
                        action='薄薄按压出油位置，保持用量轻',
                        reason='T 区光泽更容易影响妆面清爽感，少量处理即可',
                        priority=88,
                    ))
            elif area in ('眼周', '左眼周', '右眼周') or '眼周' in text or '眼下' in text:
                candidates.append(self._make_mirror_card(
                    area='眼下区域',
                    product=self._pick_product(products, ['底妆', '彩妆'], ['遮瑕', '提亮', '定妆'], require_category=True),
                    action='薄薄补一层，轻拍提亮',
                    reason='眼周肤色变化在自然光下更明显，轻薄叠加能保留自然感',
                    priority=86,
                ))
            elif area == '唇周' or '唇周' in text:
                candidates.append(self._make_mirror_card(
                    area='唇周边缘',
                    product=self._pick_product(products, ['底妆', '彩妆'], ['遮瑕', '定妆', '均匀'], require_category=True),
                    action='轻薄修饰边缘，让整体更干净',
                    reason='唇周边缘会影响整体清爽感，轻微过渡就够',
                    priority=84,
                ))
            elif area == '面颊' or '面颊' in text:
                candidates.append(self._make_mirror_card(
                    area='面颊',
                    product=self._pick_product(products, ['面霜', '精华', '底妆'], ['保湿', '修护', '舒缓']),
                    action='在偏干位置少量按压，保持薄而均匀',
                    reason='面颊状态会影响底妆贴合度，先补一点保湿更自然',
                    priority=78,
                ))
            elif area == '全脸' and ('暗沉' in text or '肤色' in text):
                candidates.append(self._make_mirror_card(
                    area='面中到下颌',
                    product=self._pick_product(products, ['防晒', '底妆', '彩妆'], ['提亮', '防晒', '均匀'], require_category=True),
                    action='少量叠加在面中，边缘轻拍过渡',
                    reason='面中明净度会影响整体气色，轻薄处理更适合镜前快速完成',
                    priority=74,
                ))

        if '黑眼圈' in concerns and not self._has_area(candidates, '眼下区域'):
            candidates.append(self._make_mirror_card(
                area='眼下区域',
                product=self._pick_product(products, ['底妆', '彩妆'], ['遮瑕', '提亮', '定妆'], require_category=True),
                action='薄薄补一层，轻拍提亮',
                reason='眼下肤色略暗时，少量叠加比大面积遮盖更自然',
                priority=82,
            ))

        if any(c in concerns for c in ['干燥脱皮', '水油失衡']) and not self._has_area(candidates, '鼻翼两侧'):
            candidates.append(self._make_mirror_card(
                area='鼻翼两侧',
                product=self._pick_product(products, ['面霜', '精华'], ['保湿', '修护', '舒缓']),
                action='少量按压，等待 10 秒后再上底妆',
                reason='局部干燥会让底妆边缘更明显，提前按压能减少卡纹',
                priority=80,
            ))

        if '肤色不均' in concerns and not self._has_area(candidates, '唇周边缘'):
            candidates.append(self._make_mirror_card(
                area='唇周边缘',
                product=self._pick_product(products, ['底妆', '彩妆'], ['遮瑕', '定妆', '均匀'], require_category=True),
                action='轻薄修饰边缘，让整体更干净',
                reason='局部肤色不够均匀时，边缘过渡会比厚涂更自然',
                priority=76,
            ))

        # ROI 分区分数补充候选：当 observations 没有覆盖到细节时，
        # 仍然根据实际分区弱项选择 1-3 个镜前可执行动作。
        for roi_card in self._build_roi_mirror_candidates(region_scores, products):
            if not self._has_area(candidates, roi_card.get('area')):
                candidates.append(roi_card)

        if not candidates:
            weakest_region = self._weakest_mirror_region(region_scores, region_features)
            candidates.append(self._fallback_mirror_card(weakest_region, products))

        deduped = []
        seen = set()
        for card in sorted(candidates, key=lambda x: x.get('_priority', 0), reverse=True):
            key = card['area']
            if key in seen:
                continue
            seen.add(key)
            card.pop('_priority', None)
            deduped.append(card)
            if len(deduped) >= 3:
                break

        return deduped

    def _load_inventory_products(self):
        try:
            return self._user_products_query().order_by(self.Product.created_at.desc()).all()
        except Exception as e:
            print(f'[recommendation_engine] 查询镜前推荐产品失败: {e}')
            return []

    def _user_products_query(self):
        query = self.Product.query.filter(
            or_(self.Product.source.is_(None), self.Product.source != 'knowledge_base')
        )
        if self.user_id:
            query = query.filter(self.Product.user_id == self.user_id)
        return query

    def _product_display_name(self, product):
        if not product:
            return ''

        if isinstance(product, dict):
            name = product.get('name') or ''
            brand = product.get('brand') or ''
        else:
            name = product.name or ''
            brand = product.brand or ''

        if brand and name and brand not in name:
            return f'{brand} {name}'
        return name or brand

    def _category_matches(self, product_category, categories):
        if not product_category:
            return False
        return any(
            product_category == category
            or product_category in category
            or category in product_category
            for category in categories
            if category
        )

    def _find_product(self, products, categories, keywords, require_category=False):
        scored = []
        for p in products:
            text = ''.join([
                p.name or '',
                p.brand or '',
                p.category or '',
                p.ingredients or '',
                p.efficacy or '',
                p.usage_instructions or '',
                p.usage_steps or '',
                p.product_features or '',
                p.suitable_regions or '',
                p.suitable_scenes or '',
                p.notes or '',
            ])
            negative_feedback = p.user_feedback or ''
            if any(word in negative_feedback for word in ['闷痘', '搓泥', '容易卡粉', '太油', '太干', '不好用']):
                continue

            category_match = self._category_matches(p.category or '', categories)
            score = 0
            if category_match:
                score += 30
            elif require_category:
                continue
            for keyword in keywords:
                if keyword and keyword in text:
                    score += 12
                if keyword and keyword in (p.user_feedback or ''):
                    score += 4
            for field in (p.usage_steps, p.product_features, p.suitable_regions, p.suitable_scenes):
                if field and any(keyword and keyword in field for keyword in keywords):
                    score += 10
            if p.suitable_skin and ('所有' in p.suitable_skin):
                score += 3
            if score > 0:
                scored.append((score, p))

        if not scored:
            return None

        scored.sort(key=lambda item: (item[0], item[1].created_at or datetime.min), reverse=True)
        return scored[0][1]

    def _select_product_name(self, products, categories, keywords, require_category=False):
        return self._product_display_name(
            self._find_product(products, categories, keywords, require_category=require_category)
        )

    def _pick_product(self, products, categories, keywords, require_category=False):
        product = self._find_product(products, categories, keywords, require_category=require_category)
        if product:
            return self._product_display_name(product)
        return ''

    def _make_mirror_card(self, area, product, action, reason, priority):
        return {
            'area': area,
            'product': product,
            'action': action,
            'reason': reason,
            '_priority': priority,
        }

    def _has_area(self, cards, area):
        return any(card.get('area') == area for card in cards)

    def _build_roi_mirror_candidates(self, region_scores, products):
        """
        从 ROI 分区评分里提取镜前候选。
        这里不展示分数，只把低分维度转成轻量动作，供排序和 Gemini 上下文使用。
        """
        if not region_scores:
            return []

        cards = []
        for region, scores in region_scores.items():
            if not isinstance(scores, dict):
                continue

            hydration = scores.get('hydration', 60)
            smoothness = scores.get('smoothness', 60)
            brightness = scores.get('brightness', 60)
            pores = scores.get('pores', 60)
            evenness = scores.get('evenness', 60)

            if region in ('鼻子', '前额') and (pores < 58 or smoothness < 55):
                cards.append(self._make_mirror_card(
                    area='T 区',
                    product=self._pick_product(products, ['爽肤水', '底妆', '彩妆'], ['控油', '清爽', '定妆']),
                    action='少量按压出油或不平整位置，保持用量轻',
                    reason='T 区细节更容易影响妆面清爽感，轻量处理即可',
                    priority=72 + max(0, 58 - min(pores, smoothness)),
                ))

            if region == '鼻子' and (hydration < 58 or evenness < 56):
                cards.append(self._make_mirror_card(
                    area='鼻翼两侧',
                    product=self._pick_product(products, ['面霜', '精华'], ['保湿', '舒缓', '修护']),
                    action='少量按压，等待 10 秒后再上底妆',
                    reason='鼻翼两侧更容易出现贴合不均，提前按压能让底妆更服帖',
                    priority=78 + max(0, 58 - min(hydration, evenness)),
                ))

            if region in ('左眼周', '右眼周') and (brightness < 58 or evenness < 56):
                cards.append(self._make_mirror_card(
                    area='眼下区域',
                    product=self._pick_product(products, ['底妆', '彩妆'], ['遮瑕', '提亮', '定妆'], require_category=True),
                    action='薄薄补一层，轻拍提亮',
                    reason='眼下明净度会影响镜前气色，少量叠加更自然',
                    priority=76 + max(0, 58 - min(brightness, evenness)),
                ))

            if region == '唇周' and (evenness < 58 or hydration < 56):
                cards.append(self._make_mirror_card(
                    area='唇周边缘',
                    product=self._pick_product(products, ['底妆', '彩妆'], ['遮瑕', '定妆', '均匀'], require_category=True),
                    action='轻薄修饰边缘，让整体更干净',
                    reason='唇周边缘过渡会影响整体清爽感，轻微修饰即可',
                    priority=74 + max(0, 58 - min(evenness, hydration)),
                ))

            if region in ('左脸颊', '右脸颊') and (hydration < 56 or smoothness < 56):
                cards.append(self._make_mirror_card(
                    area='面颊',
                    product=self._pick_product(products, ['面霜', '精华'], ['保湿', '修护', '舒缓']),
                    action='在偏干位置少量按压，保持薄而均匀',
                    reason='面颊贴合度会影响底妆质感，先做轻微保湿更自然',
                    priority=70 + max(0, 56 - min(hydration, smoothness)),
                ))

        return sorted(cards, key=lambda x: x.get('_priority', 0), reverse=True)[:5]

    def _weakest_mirror_region(self, region_scores, region_features):
        if not region_scores:
            return '鼻翼两侧'
        ordered = []
        for region, scores in region_scores.items():
            vals = [scores.get(k, 60) for k in ('hydration', 'smoothness', 'brightness', 'pores', 'evenness')]
            ordered.append((sum(vals) / len(vals), region))
        ordered.sort(key=lambda item: item[0])
        region = ordered[0][1] if ordered else '鼻翼两侧'
        if region in ('鼻子', '前额'):
            return '鼻翼两侧'
        if region in ('左眼周', '右眼周'):
            return '眼下区域'
        if region == '唇周':
            return '唇周边缘'
        if region in ('左脸颊', '右脸颊'):
            return '面颊'
        return '鼻翼两侧'

    def _fallback_mirror_card(self, area, products):
        if area == '眼下区域':
            return self._make_mirror_card(
                area=area,
                product=self._pick_product(products, ['底妆', '彩妆'], ['遮瑕', '提亮', '定妆'], require_category=True),
                action='薄薄补一层，轻拍提亮',
                reason='眼下细节会影响镜前气色，少量处理即可',
                priority=60,
            )
        if area == '唇周边缘':
            return self._make_mirror_card(
                area=area,
                product=self._pick_product(products, ['底妆', '彩妆'], ['遮瑕', '定妆', '均匀'], require_category=True),
                action='轻薄修饰边缘，让整体更干净',
                reason='唇周边缘处理干净后，整体妆感会更清爽',
                priority=60,
            )
        return self._make_mirror_card(
            area=area,
            product=self._pick_product(products, ['面霜', '精华'], ['保湿', '舒缓', '修护']),
            action='少量按压，等待 10 秒后再上底妆',
            reason='局部先做轻微保湿，后续底妆更容易贴合',
            priority=60,
        )

    # ================================================================
    # ④ 护肤流程构建
    # ================================================================

    def _build_routine(self, feature_json, product_guidance):
        """
        基于肤质 + 产品库存构建 AM/PM/周 护理建议流程。
        用温和、可执行的建议语言，不出现分数。
        """
        skin_type = feature_json.get('skin_type', '中性')
        concerns = feature_json.get('concerns', [])
        missing = product_guidance.get('missing_categories', [])
        products = self._load_inventory_products()

        cleanser = self._select_product_name(products, ['洁面', '洗面奶'], ['洁面', '洗面奶', '清洁'])
        toner = self._select_product_name(products, ['爽肤水', '化妆水'], ['爽肤水', '化妆水', '补水', '舒缓', '控油'])
        essence = self._select_product_name(products, ['精华'], ['精华', '修护', '舒缓', '保湿', '提亮'])
        eye_cream = self._select_product_name(products, ['眼霜', '眼部护理'], ['眼霜', '眼部', '淡纹', '黑眼圈'])
        moisturizer = self._select_product_name(products, ['面霜', '乳液', '身体乳'], ['面霜', '乳液', '保湿', '修护', '屏障'])
        sunscreen = self._select_product_name(products, ['防晒'], ['防晒', '隔离', 'SPF'])
        remover = self._select_product_name(products, ['卸妆'], ['卸妆', '清洁油', '卸妆水', '卸妆膏'])
        oil_control = self._select_product_name(products, ['爽肤水', '精华'], ['控油', '清爽', '水杨酸', '收敛'])
        hydrating_mask = self._select_product_name(products, ['面膜'], ['面膜', '保湿', '补水', '舒缓'])
        cleansing_mask = self._select_product_name(products, ['面膜'], ['泥膜', '清洁', '控油', '毛孔'])

        morning = []
        if skin_type in ('干性', '敏感性'):
            morning.append(f'早上如果不油，用清水或少量{cleanser}温和清洁' if cleanser else '早上用清水或最温和的洁面产品')
        else:
            morning.append(f'用{cleanser}温和清洁' if cleanser else '温和洁面')

        morning.append(f'轻拍{toner}帮助补水' if toner else '爽肤水轻拍补水')
        morning.append(f'涂抹{essence}护理' if essence else '精华护理（还未添加）')
        morning.append(f'取适量{eye_cream}轻拍眼周' if eye_cream else '眼霜轻拍眼周（还未添加，值得准备一支）')
        morning.append(f'涂抹{moisturizer}锁水保湿' if moisturizer else '面霜锁水保湿（还没添加哦）')

        if sunscreen:
            morning.append(f'出门前涂{sunscreen}' if sunscreen else '涂防晒再出门')
        elif '防晒' in missing:
            morning.append('出门前涂防晒（这是护肤中很重要的一步 ✨）')

        evening = []
        evening.append(f'如果白天化妆或涂了防晒，先用{remover}卸妆' if remover else '如果白天化妆或涂了防晒，先卸妆')
        evening.append(f'再用{cleanser}温和洁面' if cleanser else '温和洁面')

        # 晚上针对 T区出油/毛孔问题
        has_tzone_issues = any(c in concerns for c in ['T区出油', '毛孔粗大'])
        if has_tzone_issues:
            evening.append(
                f'用{oil_control}轻擦T区（前额+鼻子），帮助清理多余油脂'
                if oil_control else '用控油棉片轻擦T区（前额+鼻子），帮助清理多余油脂'
            )

        evening.append(f'轻拍{toner}做基础补水' if toner else '爽肤水')
        evening.append(f'涂抹{essence}做针对护理' if essence else '精华')
        evening.append(f'取适量{eye_cream}轻拍眼周' if eye_cream else '眼霜')
        evening.append(f'最后用{moisturizer}锁水修护' if moisturizer else '面霜')

        weekly = []
        if has_tzone_issues:
            weekly.append(
                f'每周用{cleansing_mask}做一次T区清洁护理'
                if cleansing_mask else '做一次清洁泥膜，重点敷在T区，帮助深层清洁毛孔'
            )
        if skin_type in ('干性', '敏感性'):
            weekly.append(
                f'敷1-2次{hydrating_mask}，给皮肤补充水分'
                if hydrating_mask else '敷1-2次保湿舒缓面膜，给皮肤补充水分'
            )
        elif any(c in concerns for c in ['干燥脱皮', '肤色暗沉']):
            weekly.append(f'敷2次{hydrating_mask}加强保湿提亮' if hydrating_mask else '敷2次保湿提亮面膜')
        else:
            weekly.append(f'敷1-2次{hydrating_mask}，维持水润状态' if hydrating_mask else '敷1-2次保湿面膜，维持水润状态')

        return {
            'morning': morning,
            'evening': evening,
            'weekly': weekly,
        }

    # ================================================================
    # ⑤ 历史趋势分析
    # ================================================================

    def _analyze_trends(self):
        """
        分析最近 10 条肤质分析记录，生成温和的趋势描述。
        不出现分数，只用自然语言状态词。
        """
        try:
            query = self.SkinAnalysis.query
            if self.user_id:
                query = query.filter(self.SkinAnalysis.user_id == self.user_id)
            records = (query.order_by(self.SkinAnalysis.created_at.desc())
                       .limit(10)
                       .all())
        except Exception as e:
            print(f'[recommendation_engine] 查询历史失败: {e}')
            records = []

        if len(records) < 2:
            return {
                'has_history': False,
                'analyses_count': len(records),
                'summary': '还没有足够的历史记录，再分析几次就能看到趋势啦',
            }

        records = list(reversed(records))

        dims = ['hydration', 'smoothness', 'brightness', 'pores', 'evenness']
        dim_labels = {
            'hydration': '水润度', 'smoothness': '光滑度',
            'brightness': '光泽度', 'pores': '毛孔细腻度', 'evenness': '均匀度',
        }

        # 提取各维度历史分
        history = {dim: [] for dim in dims}
        for r in records:
            scores = r.get_scores()
            for dim in dims:
                history[dim].append(scores.get(dim, 0))

        # 简化趋势：比较最早的1/3和最近的1/3
        trends = {}
        for dim in dims:
            vals = history[dim]
            if len(vals) < 3:
                trends[dim] = 'stable'
                continue
            n = len(vals)
            first_half = vals[:max(1, n // 3)]
            last_half = vals[-max(1, n // 3):]
            avg_first = sum(first_half) / len(first_half)
            avg_last = sum(last_half) / len(last_half)
            diff = avg_last - avg_first

            if diff > 5:
                trends[dim] = 'improving'
            elif diff < -5:
                trends[dim] = 'declining'
            else:
                trends[dim] = 'stable'

        # 计算连续天数
        consecutive = 1
        today = datetime.now().date()
        for i, r in enumerate(records):
            record_date = r.created_at.date() if r.created_at else None
            if record_date:
                expected = today - timedelta(days=i)
                if record_date == expected:
                    consecutive = i + 1
                else:
                    break

        # 生成自然语言趋势描述
        improving = [dim_labels[d] for d, t in trends.items() if t == 'improving']
        declining = [dim_labels[d] for d, t in trends.items() if t == 'declining']

        summary_parts = []
        detail_parts = []

        if improving:
            summary_parts.append(f"{'、'.join(improving)}在逐渐改善")
            detail_parts.append(f"{'、'.join(improving)}方面比之前有进步，继续保持当前的护理方式")
        if declining:
            summary_parts.append(f"{'、'.join(declining)}有所下降")
            detail_parts.append(f"{'、'.join(declining)}方面略有下降，可以留意一下近期的护理和生活习惯")

        if not summary_parts:
            summary = '近期皮肤状态保持稳定'
            detail = f'连续{consecutive}天的记录显示，各项指标都比较稳定，说明目前的护理方式适合你'
        else:
            summary = '，'.join(summary_parts)
            detail = '，'.join(detail_parts) if detail_parts else summary

        # 时间锚点
        if consecutive >= 7:
            time_anchor = f'过去{consecutive}天'
        elif consecutive >= 3:
            time_anchor = f'最近{consecutive}天'
        else:
            time_anchor = '近期'

        return {
            'has_history': True,
            'analyses_count': len(records),
            'consecutive_days': consecutive,
            'trends': trends,
            'time_anchor': time_anchor,
            'summary': summary,
            'detail': detail,
            'improving': improving,
            'declining': declining,
        }

    # ================================================================
    # ⑥ RAG 知识检索
    # ================================================================

    def _retrieve_knowledge(self, feature_json):
        """基于当前皮肤状态从本地知识 JSON 检索专业知识。

        不走 ChromaDB/query_knowledge，避免为了 embedding 额外调用 Gemini。
        """
        skin_type = feature_json.get('skin_type', '')
        concerns = feature_json.get('concerns', [])
        scores = feature_json.get('scores', {})

        query_parts = [f'{skin_type}肌肤']
        if concerns:
            query_parts.extend(concerns[:4])

        dims = ['hydration', 'smoothness', 'brightness', 'pores', 'evenness']
        worst_dim = min(dims, key=lambda d: scores.get(d, 50))
        dim_labels = {
            'hydration': '补水保湿', 'smoothness': '光滑度改善',
            'brightness': '提亮肤色', 'pores': '毛孔护理', 'evenness': '肤色均匀',
        }
        query_parts.append(dim_labels.get(worst_dim, '护肤'))

        query_text = ' '.join(query_parts)

        try:
            kb_path = os.path.join(os.path.dirname(__file__), 'knowledge_base', 'skin_knowledge.json')
            with open(kb_path, 'r', encoding='utf-8') as f:
                documents = json.load(f)

            terms = [term for term in query_text.replace('，', ' ').replace('、', ' ').split() if term]
            scored = []
            for doc in documents:
                content = f"{doc.get('category', '')} {doc.get('topic', '')} {doc.get('content', '')}"
                score = 0
                for term in terms:
                    if term and term in content:
                        score += 3 if term in doc.get('topic', '') else 1
                if score:
                    scored.append((score, doc))

            if not scored:
                scored = [(1, doc) for doc in documents[:3]]

            scored.sort(key=lambda item: item[0], reverse=True)
            results = [doc for _, doc in scored[:5]]
        except Exception as e:
            print(f'[recommendation_engine] 本地知识检索异常: {e}')
            return []

        snippets = []
        for r in results:
            content = r.get('content', '')
            snippets.append({
                'topic': r.get('topic', ''),
                'category': r.get('category', ''),
                'snippet': content[:200] + ('...' if len(content) > 200 else ''),
            })

        return snippets
