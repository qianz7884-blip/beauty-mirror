"""
产品知识层 (Product Knowledge Layer)

管理产品知识库：去重、富化、查询、种子知识。
Gemini 只负责从包装读取文字，产品知识全部由本模块和数据库维护。

使用方法:
    from product_knowledge import ProductKnowledge
    pk = ProductKnowledge(db_session)

    # 识别后富化
    enriched = pk.enrich_product(gemini_result)

    # 查找相似产品（去重）
    similar = pk.find_similar(name, brand)
"""

import re
from difflib import SequenceMatcher
from sqlalchemy import or_ as sql_or


# ============================================================
# 种子产品知识库 — 常见护肤品知识
# ============================================================

SEED_KNOWLEDGE = [
    {
        'brand': 'La Mer',
        'name': '奇迹面霜',
        'category': '面霜',
        'volume': '60ml',
        'ingredients': '海藻精华(Miracle Broth™)、酸橙茶精华、维生素E、芝麻油、桉树油',
        'efficacy': '深层修护、保湿滋润、舒缓肌肤、提亮肤色、抗初老',
        'suitable_skin': '干性, 中性, 混合性',
        'usage_instructions': '取适量于指尖温热乳化，轻轻按压于面部和颈部，早晚使用',
    },
    {
        'brand': 'SK-II',
        'name': '神仙水',
        'category': '精华',
        'volume': '230ml',
        'ingredients': 'Pitera™(半乳糖酵母样菌发酵产物滤液)、丁二醇、戊二醇、水',
        'efficacy': '改善肤质、提亮肤色、细致毛孔、平衡油脂、保湿滋润',
        'suitable_skin': '所有肤质',
        'usage_instructions': '洁面后，取适量轻拍于面部，每天早晚使用',
    },
    {
        'brand': 'Estée Lauder',
        'name': '小棕瓶精华',
        'category': '精华',
        'volume': '50ml',
        'ingredients': '二裂酵母发酵产物溶胞物、透明质酸钠、咖啡因、维生素E、胜肽',
        'efficacy': '夜间修护、淡化细纹、提亮肤色、深层保湿、紧致肌肤',
        'suitable_skin': '所有肤质',
        'usage_instructions': '每晚洁面爽肤后，取3-5滴均匀涂抹于面部',
    },
    {
        'brand': 'Lancôme',
        'name': '小黑瓶精华',
        'category': '精华',
        'volume': '50ml',
        'ingredients': '二裂酵母发酵产物溶胞物、透明质酸、维生素C、腺苷',
        'efficacy': '修护肌底、提亮肤色、改善细纹、保湿锁水',
        'suitable_skin': '所有肤质',
        'usage_instructions': '早晚洁面爽肤后，取1-2滴管均匀涂抹于面部',
    },
    {
        'brand': 'Shiseido',
        'name': '红腰子精华',
        'category': '精华',
        'volume': '50ml',
        'ingredients': '灵芝精华、鸢尾根精华、透明质酸、维生素C衍生物',
        'efficacy': '提升肌肤免疫力、保湿补水、改善肤色暗沉、强韧肌底',
        'suitable_skin': '所有肤质，尤其适合疲劳肌',
        'usage_instructions': '早晚洁面爽肤后，按压2泵均匀涂抹于面部',
    },
    {
        'brand': 'Kiehl\'s',
        'name': '金盏花爽肤水',
        'category': '爽肤水',
        'volume': '250ml',
        'ingredients': '金盏花花瓣、牛蒡根提取物、尿囊素',
        'efficacy': '舒缓镇定、控油收敛、补水保湿、调理肤质',
        'suitable_skin': '油性, 混合性, 敏感性',
        'usage_instructions': '洁面后，取适量轻拍或湿敷于面部',
    },
    {
        'brand': 'CeraVe',
        'name': '保湿修复乳',
        'category': '面霜',
        'volume': '236ml',
        'ingredients': '神经酰胺1/3/6-II、透明质酸、MVE缓释技术',
        'efficacy': '修复皮肤屏障、持久保湿、温和舒缓、改善干燥',
        'suitable_skin': '干性, 敏感性, 中性',
        'usage_instructions': '取适量均匀涂抹于面部和身体干燥部位',
    },
    {
        'brand': 'ANESSA',
        'name': '小金瓶防晒',
        'category': '防晒',
        'volume': '60ml',
        'ingredients': '氧化锌、二氧化钛、Aqua Booster EX技术、透明质酸',
        'efficacy': '高效防晒SPF50+ PA++++、防水防汗、保湿养肤',
        'suitable_skin': '所有肤质',
        'usage_instructions': '出门前15-20分钟均匀涂抹，每隔2-3小时补涂',
    },
    {
        'brand': 'La Roche-Posay',
        'name': 'B5修复霜',
        'category': '面霜',
        'volume': '40ml',
        'ingredients': '维生素B5(泛醇)、温泉水、积雪草苷、乳木果油',
        'efficacy': '修复皮肤屏障、舒缓泛红、保湿滋润、改善敏感',
        'suitable_skin': '敏感性, 干性, 所有肤质',
        'usage_instructions': '取适量涂抹于需要修护的部位，每日1-2次',
    },
    {
        'brand': 'CLINIQUE',
        'name': '黄油乳液',
        'category': '面霜',
        'volume': '125ml',
        'ingredients': '透明质酸、甘油、向日葵籽油、维生素E、尿素',
        'efficacy': '深层保湿、平衡水油、强韧肌肤屏障、打底锁水',
        'suitable_skin': '所有肤质（分有油/无油版）',
        'usage_instructions': '洁面爽肤后，取适量均匀涂抹于面部，作为保湿打底',
    },
]


# ============================================================
# ProductKnowledge 类
# ============================================================

class ProductKnowledge:
    """
    产品知识层 — 管理本地产品知识库。

    职责：
    - 识别后去重检查（避免重复录入）
    - 匹配本地知识库进行富化
    - 种子知识写入
    - 知识查询
    """

    def __init__(self, db_session, user_id=None):
        """
        Args:
            db_session: SQLAlchemy 数据库 session
        """
        self.db = db_session
        self.user_id = user_id
        # 延迟导入避免循环依赖
        from models import Product
        self.Product = Product

    def _visible_products_query(self):
        query = self.Product.query
        if self.user_id:
            return query.filter(
                sql_or(
                    self.Product.source == 'knowledge_base',
                    self.Product.user_id == self.user_id,
                )
            )
        return query.filter(self.Product.source == 'knowledge_base')

    # ============================================================
    # 相似度计算
    # ============================================================

    @staticmethod
    def _similarity(a, b):
        """计算两个字符串的相似度 (0-1)"""
        if not a or not b:
            return 0.0
        a_clean = re.sub(r'[\s\-_/()（）]', '', a.lower())
        b_clean = re.sub(r'[\s\-_/()（）]', '', b.lower())
        return SequenceMatcher(None, a_clean, b_clean).ratio()

    @staticmethod
    def _normalize(s):
        """标准化字符串用于比较"""
        if not s:
            return ''
        s = re.sub(r'[\s\-_/()（）]', '', s.lower())
        # 移除常见容量后缀
        s = re.sub(r'\d+(ml|g|片|粒|包|瓶)$', '', s)
        return s

    # ============================================================
    # 去重查询
    # ============================================================

    def find_similar(self, name, brand, threshold=0.75):
        """
        在数据库和种子知识库中查找与给定产品相似的产品。

        Args:
            name: 产品名称
            brand: 品牌名称
            threshold: 名称相似度阈值（默认 0.75）

        Returns:
            list: 匹配的产品信息列表，按相似度降序排列
        """
        results = []

        # 1. 搜索数据库中的现有产品
        db_products = self._visible_products_query().all()
        for p in db_products:
            name_sim = self._similarity(name, p.name)
            brand_sim = self._similarity(brand, p.brand)

            # 综合评分：名称权重 0.6，品牌权重 0.4
            combined = name_sim * 0.6 + brand_sim * 0.4

            if combined >= threshold or (name_sim >= 0.85 and brand_sim >= 0.5):
                results.append({
                    'source': 'database',
                    'product_id': p.id,
                    'name': p.name,
                    'brand': p.brand,
                    'category': p.category,
                    'similarity': round(combined, 2),
                    'has_knowledge': bool(p.ingredients or p.efficacy),
                })

        # 2. 搜索种子知识库
        name_norm = self._normalize(name)
        brand_norm = self._normalize(brand)
        for seed in SEED_KNOWLEDGE:
            seed_name = self._normalize(seed['name'])
            seed_brand = self._normalize(seed['brand'])

            name_match = (name_norm in seed_name or seed_name in name_norm or
                          self._similarity(name, seed['name']) >= 0.70)
            brand_match = (brand_norm in seed_brand or seed_brand in brand_norm or
                           self._similarity(brand, seed['brand']) >= 0.70)

            if name_match and brand_match:
                # 避免重复：如果 DB 中已有相同结果则跳过
                already_in_db = any(
                    self._similarity(r['name'], seed['name']) >= 0.85
                    for r in results
                )
                if not already_in_db:
                    results.append({
                        'source': 'seed',
                        'product_id': None,
                        'name': seed['name'],
                        'brand': seed['brand'],
                        'category': seed['category'],
                        'similarity': 0.85,
                        'has_knowledge': True,
                    })

        # 按相似度降序排列
        results.sort(key=lambda x: x['similarity'], reverse=True)
        return results

    # ============================================================
    # 产品富化
    # ============================================================

    def enrich_product(self, recognized_info):
        """
        用本地知识库富化 Gemini 识别结果。

        流程：
        1. 检查数据库中是否有相同产品（精确匹配品牌+名称）
        2. 如果有，返回已有知识
        3. 如果没有，检查种子知识库
        4. 返回富化后的产品信息 + 是否已存在的标记

        Args:
            recognized_info: dict，Gemini 识别结果
                {brand, name, category, volume, packaging_text}

        Returns:
            dict: {
                'brand': str,
                'name': str,
                'category': str,
                'volume': str,
                'ingredients': str,
                'efficacy': str,
                'suitable_skin': str,
                'usage_instructions': str,
                'source': str,            # 'gemini' | 'knowledge_base'
                'existing_id': int|None,  # 数据库中已存在则返回 ID
                'is_duplicate': bool,
                'similar_products': list, # 相似产品列表
            }
        """
        brand = recognized_info.get('brand', '')
        name = recognized_info.get('name', '')
        category = recognized_info.get('category', '其他')
        volume = recognized_info.get('volume', '')
        packaging_text = recognized_info.get('packaging_text', '')

        result = {
            'brand': brand,
            'name': name,
            'category': category,
            'volume': volume,
            'ingredients': '',
            'efficacy': '',
            'suitable_skin': '',
            'usage_instructions': '',
            'source': 'gemini',
            'existing_id': None,
            'is_duplicate': False,
            'similar_products': [],
        }

        # Step 1: 精确匹配（数据库中已有相同品牌+名称）
        exact_match = self._visible_products_query().filter(
            self.Product.brand == brand,
            self.Product.name == name,
        ).first()

        if exact_match:
            result['existing_id'] = exact_match.id
            result['is_duplicate'] = True
            result['source'] = 'knowledge_base' if exact_match.source != 'gemini' else 'gemini'
            if exact_match.ingredients:
                result['ingredients'] = exact_match.ingredients
            if exact_match.efficacy:
                result['efficacy'] = exact_match.efficacy
            if exact_match.suitable_skin:
                result['suitable_skin'] = exact_match.suitable_skin
            if exact_match.usage_instructions:
                result['usage_instructions'] = exact_match.usage_instructions
            if exact_match.volume:
                result['volume'] = exact_match.volume
            return result

        # Step 2: 相似查询
        similar = self.find_similar(name, brand, threshold=0.70)
        result['similar_products'] = similar[:5]

        # Step 3: 从种子知识库中匹配并富化
        name_norm = self._normalize(name)
        brand_norm = self._normalize(brand)

        best_seed = None
        best_score = 0
        for seed in SEED_KNOWLEDGE:
            seed_name = self._normalize(seed['name'])
            seed_brand = self._normalize(seed['brand'])
            name_score = self._similarity(name, seed['name'])
            brand_score = self._similarity(brand, seed['brand'])
            combined = name_score * 0.5 + brand_score * 0.5

            if combined > best_score and combined >= 0.55:
                best_score = combined
                best_seed = seed

            # 子串匹配也视为命中
            if (name_norm and seed_name) and (name_norm in seed_name or seed_name in name_norm):
                if brand_norm in seed_brand or seed_brand in brand_norm:
                    best_seed = seed
                    break

        if best_seed:
            result['ingredients'] = best_seed.get('ingredients', '')
            result['efficacy'] = best_seed.get('efficacy', '')
            result['suitable_skin'] = best_seed.get('suitable_skin', '')
            result['usage_instructions'] = best_seed.get('usage_instructions', '')
            result['source'] = 'knowledge_base'
            if not result['volume']:
                result['volume'] = best_seed.get('volume', '')

        return result

    # ============================================================
    # 知识查询
    # ============================================================

    def query_knowledge(self, category=None, skin_type=None, keyword=None):
        """
        查询产品知识库。

        Args:
            category: 按分类筛选，None 表示不过滤
            skin_type: 按适合肤质筛选，如 "油性"
            keyword: 在名称/品牌/成分/功效中搜索关键词

        Returns:
            list[dict]: 匹配的产品知识条目
        """
        query = self._visible_products_query()

        if category:
            query = query.filter(self.Product.category == category)

        if skin_type:
            # suitable_skin 字段包含肤质关键词
            query = query.filter(
                self.Product.suitable_skin.contains(skin_type)
            )

        if keyword:
            query = query.filter(
                sql_or(
                    self.Product.name.contains(keyword),
                    self.Product.brand.contains(keyword),
                    self.Product.ingredients.contains(keyword),
                    self.Product.efficacy.contains(keyword),
                )
            )

        products = query.order_by(self.Product.created_at.desc()).all()

        return [
            {
                'id': p.id,
                'name': p.name,
                'brand': p.brand,
                'category': p.category,
                'ingredients': p.ingredients,
                'efficacy': p.efficacy,
                'suitable_skin': p.suitable_skin,
                'usage_instructions': p.usage_instructions,
                'usage_steps': p.usage_steps,
                'product_features': p.product_features,
                'suitable_regions': p.suitable_regions,
                'suitable_scenes': p.suitable_scenes,
                'source': p.source,
            }
            for p in products
            if p.ingredients or p.efficacy  # 只返回有知识内容的产品
        ]

    # ============================================================
    # 种子知识初始化
    # ============================================================

    def seed_knowledge_base(self, force=False):
        """
        将种子知识写入或更新到数据库（只同步系统知识库产品）。

        Args:
            force: 为 True 时强制全部写入

        Returns:
            int: 新写入或更新的记录数
        """
        count = 0
        legacy_cards = self.Product.query.filter(
            self.Product.source == 'knowledge_base',
            self.Product.brand == 'Mirror Mate 成分库',
        ).all()
        for product in legacy_cards:
            self.db.delete(product)
            count += 1

        seed_fields = [
            'category',
            'volume',
            'ingredients',
            'efficacy',
            'suitable_skin',
            'usage_instructions',
            'usage_steps',
            'product_features',
            'suitable_regions',
            'suitable_scenes',
        ]
        for seed in SEED_KNOWLEDGE:
            existing = self.Product.query.filter(
                self.Product.name == seed['name'],
                self.Product.brand == seed['brand'],
                self.Product.source == 'knowledge_base',
            ).first()

            if existing:
                if force:
                    updated = False
                    for field in seed_fields:
                        next_value = seed.get(field, '')
                        if next_value and getattr(existing, field, '') != next_value:
                            setattr(existing, field, next_value)
                            updated = True
                    if updated:
                        existing.category = seed.get('category', existing.category)
                        existing.source = 'knowledge_base'
                        count += 1
                elif not existing.ingredients:
                    existing.ingredients = seed.get('ingredients', '')
                    existing.efficacy = seed.get('efficacy', '')
                    existing.suitable_skin = seed.get('suitable_skin', '')
                    existing.usage_instructions = seed.get('usage_instructions', '')
                    existing.volume = seed.get('volume', '')
                    existing.source = 'knowledge_base'
                    count += 1
                continue

            product = self.Product(
                name=seed['name'],
                brand=seed['brand'],
                category=seed['category'],
                volume=seed.get('volume', ''),
                ingredients=seed.get('ingredients', ''),
                efficacy=seed.get('efficacy', ''),
                suitable_skin=seed.get('suitable_skin', ''),
                usage_instructions=seed.get('usage_instructions', ''),
                usage_steps=seed.get('usage_steps', ''),
                product_features=seed.get('product_features', ''),
                suitable_regions=seed.get('suitable_regions', ''),
                suitable_scenes=seed.get('suitable_scenes', ''),
                source='knowledge_base',
            )
            self.db.add(product)
            count += 1

        if count > 0:
            self.db.commit()
            print(f'[product_knowledge] 种子知识同步/清理完成: {count} 条')

        return count

    # ============================================================
    # 统计信息
    # ============================================================

    def get_stats(self):
        """获取知识库统计"""
        visible_query = self._visible_products_query()
        total = visible_query.count()
        with_knowledge = visible_query.filter(
            (self.Product.ingredients != '') | (self.Product.efficacy != '')
        ).count()
        by_source = {}
        for source in ['gemini', 'manual', 'knowledge_base']:
            by_source[source] = visible_query.filter(
                self.Product.source == source
            ).count()

        return {
            'total_products': total,
            'with_knowledge': with_knowledge,
            'by_source': by_source,
            'seed_count': len(SEED_KNOWLEDGE),
        }
