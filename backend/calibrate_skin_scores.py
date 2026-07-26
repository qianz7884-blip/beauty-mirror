"""Run the local ROI scoring pipeline on a fixed image set without Gemini.

Example:
    python calibrate_skin_scores.py calibration_images --repeat 3 \
        --output calibration_report.json
"""

import argparse
import json
import statistics
import time
from pathlib import Path

from face_regions import extract_all_regions
from feature_extractor import FeatureExtractor, SCORING_VERSION
from skin_analyzer import _prepare_analysis_image_bytes, detect_face


IMAGE_SUFFIXES = {'.jpg', '.jpeg', '.png', '.webp'}
SCORE_KEYS = ('hydration', 'smoothness', 'brightness', 'pores', 'evenness')


def analyze_once(image_path):
    started = time.perf_counter()
    image_bytes = image_path.read_bytes()
    analysis_bytes, analysis_meta = _prepare_analysis_image_bytes(image_bytes)
    has_face, face_info = detect_face(analysis_bytes)
    if not has_face:
        return {
            'status': 'no_face',
            'message': str(face_info),
            'elapsed_ms': round((time.perf_counter() - started) * 1000, 1),
        }

    regions = extract_all_regions(
        analysis_bytes,
        face_info['landmarks'],
        face_info['image_size'],
    )
    result = FeatureExtractor().extract_all_features(
        regions,
        face_info['landmarks'],
        face_info['image_size'],
    )
    valid_regions = [
        name
        for name, quality in result.get('roi_quality', {}).items()
        if isinstance(quality, dict) and quality.get('valid', True)
    ]

    return {
        'status': 'ok',
        'scoring_version': result.get('scoring_version', SCORING_VERSION),
        'skin_type': result.get('skin_type', ''),
        'overall_score': result.get('overall_score'),
        'scores': result.get('scores', {}),
        'concerns': result.get('concerns', []),
        'valid_regions': valid_regions,
        'analysis_size': analysis_meta.get('analysis_size'),
        'elapsed_ms': round((time.perf_counter() - started) * 1000, 1),
    }


def summarize_runs(runs):
    successful = [run for run in runs if run.get('status') == 'ok']
    if not successful:
        return {'successful_runs': 0, 'stable': False}

    score_spans = {}
    for key in ('overall_score', *SCORE_KEYS):
        values = [
            run.get('overall_score') if key == 'overall_score' else run.get('scores', {}).get(key)
            for run in successful
        ]
        values = [float(value) for value in values if value is not None]
        if not values:
            continue
        score_spans[key] = {
            'mean': round(statistics.mean(values), 2),
            'min': min(values),
            'max': max(values),
            'span': max(values) - min(values),
        }

    max_span = max((item['span'] for item in score_spans.values()), default=0)
    return {
        'successful_runs': len(successful),
        'max_score_span': max_span,
        'stable': max_span <= 2,
        'score_spans': score_spans,
    }


def main():
    parser = argparse.ArgumentParser(description='Mirror Mate 本地肤质评分校准工具')
    parser.add_argument('image_dir', type=Path, help='固定测试图片目录')
    parser.add_argument('--repeat', type=int, default=3, help='每张图片重复次数，默认 3')
    parser.add_argument('--output', type=Path, default=Path('calibration_report.json'))
    args = parser.parse_args()

    image_paths = sorted(
        path
        for path in args.image_dir.iterdir()
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )
    if not image_paths:
        raise SystemExit(f'目录中没有支持的图片: {args.image_dir}')

    report = {
        'scoring_version': SCORING_VERSION,
        'interpretation': '单张照片的视觉代理指标，不等同于临床检测',
        'repeat': max(1, args.repeat),
        'images': [],
    }

    for image_path in image_paths:
        runs = [
            analyze_once(image_path)
            for _ in range(max(1, args.repeat))
        ]
        report['images'].append({
            'image': image_path.name,
            'runs': runs,
            'repeatability': summarize_runs(runs),
        })

    args.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
    print(f'校准报告已写入 {args.output}')


if __name__ == '__main__':
    main()
