import unittest

import numpy as np

from feature_extractor import (
    EYE_RELATIVE_DARK_DELTA,
    FeatureExtractor,
    SCORING_VERSION,
    _rgb_to_lab,
)


def _region_features(lstar=65.0, roughness=0.2):
    return {
        'color': {
            'lab_mean': [lstar, 8.0, 12.0],
            'lab_std': [5.0, 2.0, 2.0],
            'erythema_index': 0.1,
        },
        'texture': {
            'homogeneity': 0.75,
            'roughness': roughness,
        },
        'pores': {'pore_visibility': 0.25},
        'spots': {
            'spot_count': 0,
            'spot_density': 0.0,
            'color_variance': 0.04,
        },
        'shine': {'gloss_score': 0.35},
    }


class LabConversionTests(unittest.TestCase):
    def test_lab_lstar_range_for_black_and_white(self):
        black = _rgb_to_lab(np.zeros((1, 1, 3), dtype=np.uint8))[0, 0, 0]
        white = _rgb_to_lab(np.full((1, 1, 3), 255, dtype=np.uint8))[0, 0, 0]

        self.assertAlmostEqual(black, 0.0, places=5)
        self.assertAlmostEqual(white, 100.0, places=3)


class FeatureScoringTests(unittest.TestCase):
    def setUp(self):
        self.extractor = FeatureExtractor()

    def test_mid_bright_skin_no_longer_scores_near_zero(self):
        scores = self.extractor._compute_region_scores(_region_features(lstar=65.0))

        self.assertGreater(scores['hydration'], 20)
        self.assertGreater(scores['brightness'], 20)

    def test_brightness_and_hydration_are_monotonic_in_lstar(self):
        dim = self.extractor._compute_region_scores(_region_features(lstar=50.0))
        bright = self.extractor._compute_region_scores(_region_features(lstar=72.0))

        self.assertGreater(bright['hydration'], dim['hydration'])
        self.assertGreater(bright['brightness'], dim['brightness'])

    def test_sigmoid_rejects_reversed_thresholds(self):
        with self.assertRaises(ValueError):
            self.extractor._sigmoid_score(10, 30, 12, invert=True)

    def test_sigmoid_thresholds_match_documented_range(self):
        self.assertAlmostEqual(
            self.extractor._sigmoid_score(10, 10, 30),
            10,
            delta=0.2,
        )
        self.assertAlmostEqual(
            self.extractor._sigmoid_score(30, 10, 30),
            90,
            delta=0.2,
        )

    def test_eye_concern_uses_relative_brightness(self):
        regions = {
            name: _region_features(lstar=58.0)
            for name in ('前额', '鼻子', '左脸颊', '右脸颊', '下巴', '唇周')
        }
        regions['左眼周'] = _region_features(lstar=57.0)
        regions['右眼周'] = _region_features(lstar=57.0)

        concerns = self.extractor._detect_concerns(regions, '中性')
        self.assertNotIn('黑眼圈', concerns)

        dark_eye_lstar = 58.0 - EYE_RELATIVE_DARK_DELTA - 1.0
        regions['左眼周'] = _region_features(lstar=dark_eye_lstar)
        regions['右眼周'] = _region_features(lstar=dark_eye_lstar)
        concerns = self.extractor._detect_concerns(regions, '中性')
        self.assertIn('黑眼圈', concerns)

    def test_default_result_declares_scoring_version(self):
        result = self.extractor._make_default_result()
        self.assertEqual(result['scoring_version'], SCORING_VERSION)


if __name__ == '__main__':
    unittest.main()
