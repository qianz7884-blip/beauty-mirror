"""
Ingredient knowledge rules for product recommendation.

This module is intentionally separate from Product records. Users manage real
products; the recommendation engine only uses these rules to interpret product
ingredient/effect text when that text is already available from OCR, manual
entry, or a future product database.
"""


INGREDIENT_RULES = [
    {
        'need': 'hydration',
        'label': '补水保湿',
        'keywords': ['透明质酸', '玻尿酸', '甘油', '角鲨烷', '海藻糖', '泛醇', '神经酰胺'],
        'reason': '保湿和修护类成分更适合当前补水锁水需求',
    },
    {
        'need': 'barrier',
        'label': '屏障修护',
        'keywords': ['神经酰胺', '胆固醇', '脂肪酸', '泛醇', '积雪草', '尿囊素', 'β-葡聚糖', '马齿苋'],
        'reason': '舒缓修护类成分更适合干燥、泛红或敏感状态',
    },
    {
        'need': 'oil_pore',
        'label': '控油毛孔',
        'keywords': ['水杨酸', 'BHA', '锌PCA', 'PCA锌', '烟酰胺', '金缕梅', '高岭土', '膨润土'],
        'reason': '控油和毛孔护理成分更适合T区出油或毛孔明显时使用',
    },
    {
        'need': 'tone',
        'label': '肤色均匀',
        'keywords': ['烟酰胺', '维生素C', 'VC', '传明酸', '377', '光果甘草', '熊果苷', '阿魏酸'],
        'reason': '提亮和肤色均匀类成分更适合暗沉、色斑或痘印色沉诉求',
    },
    {
        'need': 'sun_protection',
        'label': '防晒保护',
        'keywords': ['防晒', 'SPF', 'PA', '氧化锌', '二氧化钛', 'UVA', 'UVB'],
        'reason': '防晒能减少暗沉、色斑和痘印色沉继续加重',
    },
]


def infer_skin_needs(feature_json):
    """Infer recommendation needs from existing skin analysis signals."""
    concerns = set(feature_json.get('concerns') or [])
    scores = feature_json.get('scores') or {}
    skin_type = feature_json.get('skin_type') or ''
    needs = set()

    if '干燥脱皮' in concerns or '水油失衡' in concerns or scores.get('hydration', 100) < 62:
        needs.add('hydration')

    if skin_type == '敏感性' or '面部泛红' in concerns or '干燥脱皮' in concerns:
        needs.add('barrier')

    if 'T区出油' in concerns or '毛孔粗大' in concerns or scores.get('pores', 100) < 62:
        needs.add('oil_pore')

    if any(c in concerns for c in ['肤色不均', '肤色暗沉', '痘印色斑']):
        needs.add('tone')
    if scores.get('brightness', 100) < 62 or scores.get('evenness', 100) < 62:
        needs.add('tone')

    if any(c in concerns for c in ['肤色不均', '肤色暗沉', '痘印色斑']):
        needs.add('sun_protection')

    return needs


def _contains_keyword(text, keyword):
    if not text or not keyword:
        return False
    if keyword.isascii():
        return keyword.lower() in text.lower()
    return keyword in text


def match_ingredient_rules(product_text, feature_json):
    """
    Match actual product text against ingredient rules.

    Returns matched rule dictionaries with the keywords found in the product.
    """
    if not product_text:
        return []

    needs = infer_skin_needs(feature_json)
    if not needs:
        return []

    matches = []
    for rule in INGREDIENT_RULES:
        if rule['need'] not in needs:
            continue
        matched_keywords = [
            keyword
            for keyword in rule['keywords']
            if _contains_keyword(product_text, keyword)
        ]
        if not matched_keywords:
            continue
        matches.append({
            'need': rule['need'],
            'label': rule['label'],
            'keywords': matched_keywords[:3],
            'reason': rule['reason'],
        })

    return matches
