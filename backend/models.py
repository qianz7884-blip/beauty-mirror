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
