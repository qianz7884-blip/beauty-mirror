import json
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Product(db.Model):
    """产品模型 — 含 AI 识别信息 + 产品知识"""
    __tablename__ = 'products'

    # === 基础识别字段（Gemini / 手动录入）===
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.String(80), index=True, default='', nullable=False)
    name = db.Column(db.String(100), nullable=False)
    brand = db.Column(db.String(100), default='')
    category = db.Column(db.String(50), default='其他')
    color = db.Column(db.String(50), default='')
    volume = db.Column(db.String(50), default='')         # 规格容量，如 "60ml"
    purchase_date = db.Column(db.String(20), default='')
    price = db.Column(db.Float, default=0.0)
    photo = db.Column(db.String(200), default='')
    notes = db.Column(db.Text, default='')
    usage_percent = db.Column(db.Integer, default=0)

    # === 产品知识字段（Product Knowledge Base）===
    ingredients = db.Column(db.Text, default='')           # 核心成分
    efficacy = db.Column(db.Text, default='')              # 功效描述
    suitable_skin = db.Column(db.String(50), default='')   # 适合肤质：油性/干性/混合性/中性/敏感性/所有
    usage_instructions = db.Column(db.Text, default='')    # 使用方法
    source = db.Column(db.String(20), default='manual')   # 数据来源：gemini / manual / knowledge_base

    created_at = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'brand': self.brand,
            'category': self.category,
            'color': self.color,
            'volume': self.volume,
            'purchase_date': self.purchase_date,
            'price': self.price,
            'photo': self.photo,
            'notes': self.notes,
            'usage_percent': self.usage_percent or 0,
            # 产品知识字段
            'ingredients': self.ingredients,
            'efficacy': self.efficacy,
            'suitable_skin': self.suitable_skin,
            'usage_instructions': self.usage_instructions,
            'source': self.source,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else '',
        }


class Diary(db.Model):
    __tablename__ = 'diaries'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.String(80), index=True, default='', nullable=False)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, default='')
    mood = db.Column(db.String(20), default='😊')
    photo = db.Column(db.String(200), default='')
    product_ids = db.Column(db.String(500), default='[]')
    tags = db.Column(db.Text, default='[]')
    skin_analysis_id = db.Column(db.Integer, db.ForeignKey('skin_analyses.id'), nullable=True)
    created_date = db.Column(db.String(20), default='')
    created_at = db.Column(db.DateTime, default=datetime.now)

    def get_product_ids(self):
        try:
            return json.loads(self.product_ids)
        except (json.JSONDecodeError, TypeError):
            return []

    def set_product_ids(self, ids_list):
        self.product_ids = json.dumps(ids_list, ensure_ascii=False)

    def get_tags(self):
        try:
            return json.loads(self.tags)
        except (json.JSONDecodeError, TypeError):
            return []

    def set_tags(self, tags_list):
        self.tags = json.dumps(tags_list, ensure_ascii=False)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'content': self.content,
            'mood': self.mood,
            'photo': self.photo,
            'product_ids': self.get_product_ids(),
            'tags': self.get_tags(),
            'skin_analysis_id': self.skin_analysis_id,
            'created_date': self.created_date,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else '',
        }


class SkinAnalysis(db.Model):
    """肤质分析历史记录 — Mirror Mate「AI 护肤陪伴助手」"""
    __tablename__ = 'skin_analyses'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.String(80), index=True, default='', nullable=False)
    photo = db.Column(db.String(200), default='')
    skin_type = db.Column(db.String(50), default='')
    concerns = db.Column(db.Text, default='[]')      # JSON 数组
    scores = db.Column(db.Text, default='{}')        # JSON 对象（内部计算用）
    overall_score = db.Column(db.Integer, default=0)  # 内部计算用
    recommendations = db.Column(db.Text, default='[]')  # JSON 数组
    summary = db.Column(db.Text, default='')
    face_data = db.Column(db.Text, default='{}')     # JSON 对象
    region_scores = db.Column(db.Text, default='{}')  # JSON 对象: 8区域分区评分（内部用）
    heatmap_image = db.Column(db.Text, default='')    # base64 热点图
    feature_json = db.Column(db.Text, default='{}')  # JSON: 完整特征提取结果（内部用）
    today_status = db.Column(db.Text, default='')     # 今日状态一句话
    observations = db.Column(db.Text, default='[]')   # JSON 数组: 今日观察
    mirror_advice = db.Column(db.Text, default='[]')   # JSON 数组: 镜前即时建议卡
    today_routine = db.Column(db.Text, default='{}')   # JSON 对象: 今日建议
    trend = db.Column(db.Text, default='{}')          # JSON 对象: 趋势记录
    created_at = db.Column(db.DateTime, default=datetime.now)

    def get_concerns(self):
        try:
            return json.loads(self.concerns)
        except (json.JSONDecodeError, TypeError):
            return []

    def set_concerns(self, lst):
        self.concerns = json.dumps(lst, ensure_ascii=False)

    def get_scores(self):
        try:
            return json.loads(self.scores)
        except (json.JSONDecodeError, TypeError):
            return {}

    def set_scores(self, d):
        self.scores = json.dumps(d, ensure_ascii=False)

    def get_recommendations(self):
        try:
            return json.loads(self.recommendations)
        except (json.JSONDecodeError, TypeError):
            return []

    def set_recommendations(self, lst):
        self.recommendations = json.dumps(lst, ensure_ascii=False)

    def get_face_data(self):
        try:
            return json.loads(self.face_data)
        except (json.JSONDecodeError, TypeError):
            return {}

    def set_face_data(self, d):
        self.face_data = json.dumps(d, ensure_ascii=False)

    def get_region_scores(self):
        try:
            return json.loads(self.region_scores)
        except (json.JSONDecodeError, TypeError):
            return {}

    def set_region_scores(self, d):
        self.region_scores = json.dumps(d, ensure_ascii=False)

    def get_feature_json(self):
        try:
            return json.loads(self.feature_json)
        except (json.JSONDecodeError, TypeError):
            return {}

    def set_feature_json(self, d):
        self.feature_json = json.dumps(d, ensure_ascii=False)

    def get_observations(self):
        try:
            return json.loads(self.observations)
        except (json.JSONDecodeError, TypeError):
            return []

    def set_observations(self, lst):
        self.observations = json.dumps(lst, ensure_ascii=False)

    def get_mirror_advice(self):
        try:
            return json.loads(self.mirror_advice)
        except (json.JSONDecodeError, TypeError):
            return []

    def set_mirror_advice(self, lst):
        self.mirror_advice = json.dumps(lst, ensure_ascii=False)

    def get_today_routine(self):
        try:
            return json.loads(self.today_routine)
        except (json.JSONDecodeError, TypeError):
            return {}

    def set_today_routine(self, d):
        self.today_routine = json.dumps(d, ensure_ascii=False)

    def get_trend(self):
        try:
            return json.loads(self.trend)
        except (json.JSONDecodeError, TypeError):
            return {'has_history': False}

    def set_trend(self, d):
        self.trend = json.dumps(d, ensure_ascii=False)

    def to_dict(self):
        return {
            'id': self.id,
            'photo': self.photo,
            'skin_type': self.skin_type,
            'concerns': self.get_concerns(),
            'scores': self.get_scores(),
            'overall_score': self.overall_score,
            'region_scores': self.get_region_scores(),
            'recommendations': self.get_recommendations(),
            'summary': self.summary,
            'face_data': self.get_face_data(),
            'heatmap_image': self.heatmap_image,
            'feature_json': self.get_feature_json(),
            'today_status': self.today_status,
            'observations': self.get_observations(),
            'mirror_advice': self.get_mirror_advice(),
            'today_routine': self.get_today_routine(),
            'trend': self.get_trend(),
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else '',
        }
