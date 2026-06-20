import json
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Product(db.Model):
    __tablename__ = 'products'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(100), nullable=False)
    brand = db.Column(db.String(100), default='')
    category = db.Column(db.String(50), default='其他')
    color = db.Column(db.String(50), default='')
    purchase_date = db.Column(db.String(20), default='')
    price = db.Column(db.Float, default=0.0)
    photo = db.Column(db.String(200), default='')
    notes = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'brand': self.brand,
            'category': self.category,
            'color': self.color,
            'purchase_date': self.purchase_date,
            'price': self.price,
            'photo': self.photo,
            'notes': self.notes,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else '',
        }


class Diary(db.Model):
    __tablename__ = 'diaries'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, default='')
    mood = db.Column(db.String(20), default='😊')
    photo = db.Column(db.String(200), default='')
    product_ids = db.Column(db.String(500), default='[]')
    created_date = db.Column(db.String(20), default='')
    created_at = db.Column(db.DateTime, default=datetime.now)

    def get_product_ids(self):
        try:
            return json.loads(self.product_ids)
        except (json.JSONDecodeError, TypeError):
            return []

    def set_product_ids(self, ids_list):
        self.product_ids = json.dumps(ids_list, ensure_ascii=False)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'content': self.content,
            'mood': self.mood,
            'photo': self.photo,
            'product_ids': self.get_product_ids(),
            'created_date': self.created_date,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else '',
        }


class SkinAnalysis(db.Model):
    """肤质分析历史记录"""
    __tablename__ = 'skin_analyses'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    photo = db.Column(db.String(200), default='')
    skin_type = db.Column(db.String(50), default='')
    concerns = db.Column(db.Text, default='[]')      # JSON 数组
    scores = db.Column(db.Text, default='{}')        # JSON 对象
    overall_score = db.Column(db.Integer, default=0)
    recommendations = db.Column(db.Text, default='[]')  # JSON 数组
    summary = db.Column(db.Text, default='')
    face_data = db.Column(db.Text, default='{}')     # JSON 对象
    region_scores = db.Column(db.Text, default='{}')  # JSON 对象: 8区域分区评分
    heatmap_image = db.Column(db.Text, default='')    # base64 热点图
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
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else '',
        }
