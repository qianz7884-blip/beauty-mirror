import unittest
from types import SimpleNamespace

from tutorial_recommender import build_tutorial_context


def product(product_id, name, category, **overrides):
    values = {
        'id': product_id,
        'name': name,
        'brand': '测试品牌',
        'category': category,
        'usage_steps': '',
        'product_features': '',
        'suitable_regions': '',
        'suitable_scenes': '',
        'suitable_skin': '所有肤质',
        'efficacy': '',
        'usage_percent': 20,
        'expiry_date': '',
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class TutorialRecommenderTests(unittest.TestCase):
    def test_links_ratio_skin_weather_and_cabinet_without_scores(self):
        analysis = SimpleNamespace(
            id=8,
            skin_type='干性',
            today_status='今天局部有些干燥，加强保湿会有帮助。',
            get_concerns=lambda: ['干燥脱皮'],
            get_observations=lambda: ['面颊需要更多保湿'],
            get_face_data=lambda: {
                'face_ratio': {
                    'ok': True,
                    'ratio_tags': ['中庭偏长'],
                    'makeup_tips': ['腮红位置可以略上移'],
                },
            },
        )
        products = [
            product(1, '轻润妆前乳', '妆前'),
            product(2, '清透防晒', '防晒'),
            product(3, '水光粉底液', '粉底'),
            product(4, '自然口红', '口红'),
        ]

        result = build_tutorial_context(
            analysis=analysis,
            products=products,
            time_id='daily',
            scene_id='commute',
            weather={'humidity': 32, 'uvIndex': 7},
        )

        self.assertEqual(result['linkage']['analysis_id'], 8)
        self.assertIn('中庭偏长', result['linkage']['ratio_tags'])
        self.assertTrue(any('空气偏干' in item for item in result['linkage']['weather_advice']))
        self.assertTrue(any(item['id'] == 3 for item in result['matched_products']))
        self.assertTrue(any('补水' in item['action'] for item in result['flow_steps']))
        self.assertNotIn('score', str(result).lower())

    def test_excludes_empty_or_expired_products(self):
        products = [
            product(1, '用完的粉底', '粉底', usage_percent=100),
            product(2, '过期口红', '口红', expiry_date='2020-01-01'),
        ]

        result = build_tutorial_context(
            products=products,
            time_id='quick',
            scene_id='commute',
        )

        self.assertEqual(result['matched_products'], [])
        self.assertIn('底妆', result['missing_steps'])
        self.assertIn('唇妆', result['missing_steps'])


if __name__ == '__main__':
    unittest.main()
