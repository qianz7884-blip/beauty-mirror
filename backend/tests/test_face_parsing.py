import math
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

from face_parsing import (
    DEFAULT_MODEL_SHA256,
    _output_to_label_map,
    estimate_hairline,
)
from face_ratio_analyzer import analyze_face_ratios
from face_regions import FACE_OVAL_INDICES, build_improved_face_skin_mask


IMAGE_SIZE = (200, 240)


def _landmarks():
    points = [SimpleNamespace(x=0.5, y=0.5, z=0.0) for _ in range(478)]

    for offset, index in enumerate(FACE_OVAL_INDICES):
        angle = -math.pi / 2 + 2 * math.pi * offset / len(FACE_OVAL_INDICES)
        points[index] = SimpleNamespace(
            x=0.5 + 0.30 * math.cos(angle),
            y=0.55 + 0.35 * math.sin(angle),
            z=0.0,
        )

    def set_points(indices, y, x_start=0.40, x_end=0.60):
        for position, index in enumerate(indices):
            fraction = position / max(len(indices) - 1, 1)
            points[index] = SimpleNamespace(
                x=x_start + (x_end - x_start) * fraction,
                y=y,
                z=0.0,
            )

    set_points([70, 63, 105, 66, 107], 0.35, 0.31, 0.46)
    set_points([300, 293, 334, 296, 336], 0.35, 0.54, 0.69)
    set_points([2, 94, 97, 164, 326, 327], 0.62, 0.46, 0.54)
    set_points([13, 14, 0, 17], 0.74, 0.48, 0.52)

    coordinates = {
        1: (0.50, 0.55),
        10: (0.50, 0.20),
        33: (0.30, 0.45),
        133: (0.40, 0.45),
        362: (0.60, 0.45),
        263: (0.70, 0.45),
        152: (0.50, 0.90),
        172: (0.28, 0.80),
        397: (0.72, 0.80),
        234: (0.20, 0.55),
        454: (0.80, 0.55),
    }
    for index, (x, y) in coordinates.items():
        points[index] = SimpleNamespace(x=x, y=y, z=0.0)

    return points


def _face_parse(boundary_y=42):
    width, height = IMAGE_SIZE
    skin = np.zeros((height, width), dtype=np.uint8)
    hair = np.zeros((height, width), dtype=np.uint8)
    skin[boundary_y:218, 36:164] = 255
    hair[8:boundary_y, 36:164] = 255
    return {
        'ok': True,
        'source': 'face_parsing_onnx',
        'model_path': 'test.onnx',
        'skin_mask': skin,
        'hair_mask': hair,
        'skin_pixel_count': int(np.sum(skin > 0)),
        'hair_pixel_count': int(np.sum(hair > 0)),
    }


class FaceParsingTests(unittest.TestCase):
    def test_model_checksum_is_pinned(self):
        self.assertEqual(len(DEFAULT_MODEL_SHA256), 64)
        int(DEFAULT_MODEL_SHA256, 16)

    def test_onnx_logits_convert_to_label_map(self):
        logits = np.zeros((1, 19, 3, 4), dtype=np.float32)
        logits[:, 17, :, :] = 2.0
        label_map = _output_to_label_map(logits)

        self.assertEqual(label_map.shape, (3, 4))
        self.assertTrue(np.all(label_map == 17))

    def test_visible_hairline_is_estimated_from_shared_masks(self):
        result = estimate_hairline(
            _landmarks(),
            IMAGE_SIZE,
            face_parse=_face_parse(boundary_y=42),
        )

        self.assertTrue(result['available'])
        self.assertEqual(result['source'], 'face_parsing_skin_hair_boundary')
        self.assertGreaterEqual(result['coverage'], 0.24)
        self.assertAlmostEqual(result['y'], 42, delta=8)

    def test_skin_mask_uses_precomputed_parse_without_second_inference(self):
        parse_result = _face_parse(boundary_y=42)
        image_rgb = np.zeros((IMAGE_SIZE[1], IMAGE_SIZE[0], 3), dtype=np.uint8)

        with patch('face_parsing.parse_face', side_effect=AssertionError('unexpected inference')):
            skin_mask, debug = build_improved_face_skin_mask(
                _landmarks(),
                IMAGE_SIZE,
                image_rgb=image_rgb,
                face_parse=parse_result,
                return_debug=True,
            )

        self.assertEqual(debug['metrics']['skin_mask_source'], 'face_parsing_onnx')
        self.assertEqual(skin_mask.shape, (IMAGE_SIZE[1], IMAGE_SIZE[0]))
        self.assertEqual(int(np.sum(skin_mask[:30] > 0)), 0)
        self.assertGreater(int(np.sum(skin_mask[50:80] > 0)), 0)

    def test_three_part_ratio_uses_the_same_precomputed_hairline(self):
        parse_result = _face_parse(boundary_y=42)

        with patch('face_parsing.parse_face', side_effect=AssertionError('unexpected inference')):
            result = analyze_face_ratios(
                _landmarks(),
                IMAGE_SIZE,
                face_parse=parse_result,
            )

        upper = result['measurements']['three_part']['upper']
        self.assertTrue(result['ok'])
        self.assertTrue(upper['hairline_available'])
        self.assertTrue(upper['usable_for_ratio'])
        self.assertEqual(upper['source'], 'face_parsing_hairline')
        self.assertEqual(
            result['measurements']['three_part_guides']['forehead_top']['label'],
            '发际线',
        )


if __name__ == '__main__':
    unittest.main()
