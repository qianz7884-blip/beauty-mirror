import unittest

from flask import Flask

from models import Diary, Product, SkinAnalysis, TutorialPlan, db
from routes.tutorial import tutorial_bp


class TutorialRouteTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI='sqlite:///:memory:',
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
        )
        db.init_app(self.app)
        self.app.register_blueprint(tutorial_bp)
        with self.app.app_context():
            db.create_all()
            analysis = SkinAnalysis(
                user_id='user_a',
                skin_type='混合性',
                today_status='今天 T 区略微出油，整体状态稳定。',
            )
            analysis.set_concerns(['T区出油'])
            analysis.set_observations(['鼻部更容易出油'])
            analysis.set_face_data({
                'face_ratio': {
                    'ok': True,
                    'ratio_tags': ['眼距偏宽'],
                    'makeup_tips': ['眼妆重心可以稍微向内侧带'],
                },
            })
            other_analysis = SkinAnalysis(user_id='user_b', skin_type='干性')
            product = Product(
                user_id='user_a',
                name='通勤粉底',
                category='粉底',
                suitable_scenes='通勤',
                source='manual',
            )
            other_product = Product(
                user_id='user_b',
                name='别人的口红',
                category='口红',
                source='manual',
            )
            db.session.add_all([analysis, other_analysis, product, other_product])
            db.session.commit()
            self.analysis_id = analysis.id

        self.client = self.app.test_client()
        self.headers = {'X-Anonymous-User-Id': 'user_a'}

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def test_recommendations_use_current_users_analysis_and_products(self):
        response = self.client.post(
            '/api/tutorial/recommendations',
            headers=self.headers,
            json={
                'analysis_id': self.analysis_id,
                'time_id': 'daily',
                'scene_id': 'commute',
            },
        )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['linkage']['analysis_id'], self.analysis_id)
        self.assertIn('眼距偏宽', data['linkage']['ratio_tags'])
        self.assertTrue(any(item['name'] == '通勤粉底' for item in data['matched_products']))
        self.assertFalse(any(item['name'] == '别人的口红' for item in data['matched_products']))

    def test_start_and_complete_plan_writes_linked_diary_once(self):
        create_response = self.client.post(
            '/api/tutorial/plans',
            headers=self.headers,
            json={
                'analysis_id': self.analysis_id,
                'time_id': 'quick',
                'scene_id': 'commute',
                'recommendation_index': 0,
            },
        )
        self.assertEqual(create_response.status_code, 201)
        plan = create_response.get_json()

        complete_response = self.client.patch(
            f'/api/tutorial/plans/{plan["id"]}/complete',
            headers=self.headers,
            json={'mood': 'happy'},
        )
        self.assertEqual(complete_response.status_code, 200)
        completed = complete_response.get_json()
        self.assertEqual(completed['plan']['status'], 'completed')
        self.assertEqual(completed['diary']['skin_analysis_id'], self.analysis_id)

        repeat_response = self.client.patch(
            f'/api/tutorial/plans/{plan["id"]}/complete',
            headers=self.headers,
            json={'mood': 'happy'},
        )
        self.assertTrue(repeat_response.get_json()['already_completed'])

        with self.app.app_context():
            self.assertEqual(TutorialPlan.query.count(), 1)
            self.assertEqual(Diary.query.count(), 1)


if __name__ == '__main__':
    unittest.main()
