"""
Optional face parsing helpers for skin / hair semantic masks.

The app can run without this module's ONNX model. When the model file is
available, it refines skin ROI masks and estimates a visible hairline from the
skin-to-hair boundary.
"""

import hashlib
import os
import threading

import numpy as np
from PIL import Image
from scipy.ndimage import binary_closing, binary_fill_holes, binary_opening


MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MODEL_PATH = os.path.join(MODULE_DIR, 'models', 'face_parsing_resnet18.onnx')
DEFAULT_MODEL_URL = 'https://github.com/yakhyo/face-parsing/releases/download/weights/resnet18.onnx'

INPUT_SIZE = (512, 512)
SKIN_CLASS_ID = 1
HAIR_CLASS_ID = 17

BROW_INDICES = [70, 63, 105, 66, 107, 300, 293, 334, 296, 336]

_IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(3, 1, 1)
_IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(3, 1, 1)

_SESSION = None
_SESSION_ERROR = ''
_SESSION_LOCK = threading.Lock()
_LAST_PARSE = {
    'key': None,
    'result': None,
}


def get_default_model_path():
    return os.environ.get('FACE_PARSING_ONNX_PATH') or DEFAULT_MODEL_PATH


def is_face_parsing_enabled():
    return os.environ.get('FACE_PARSING_ENABLED', '1').lower() not in ('0', 'false', 'no', 'off')


def get_face_parsing_status():
    model_path = get_default_model_path()
    return {
        'enabled': is_face_parsing_enabled(),
        'model_path': model_path,
        'model_exists': os.path.exists(model_path),
        'session_ready': _SESSION is not None,
        'session_error': _SESSION_ERROR,
        'model_url': DEFAULT_MODEL_URL,
    }


def _get_session():
    global _SESSION, _SESSION_ERROR

    if not is_face_parsing_enabled():
        _SESSION_ERROR = 'FACE_PARSING_ENABLED is disabled'
        return None

    if _SESSION is not None:
        return _SESSION

    model_path = get_default_model_path()
    if not os.path.exists(model_path):
        _SESSION_ERROR = f'model not found: {model_path}'
        return None

    with _SESSION_LOCK:
        if _SESSION is not None:
            return _SESSION
        try:
            import onnxruntime as ort

            _SESSION = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
            _SESSION_ERROR = ''
            print(f'[face_parsing] ONNX model loaded: {model_path}')
        except Exception as exc:
            _SESSION = None
            _SESSION_ERROR = str(exc)
            print(f'[face_parsing] ONNX model unavailable: {_SESSION_ERROR}')
        return _SESSION


def _as_rgb_array(image_rgb):
    if image_rgb is None:
        return None
    if isinstance(image_rgb, Image.Image):
        return np.array(image_rgb.convert('RGB'), dtype=np.uint8)

    arr = np.asarray(image_rgb)
    if arr.ndim == 2:
        arr = np.stack([arr, arr, arr], axis=-1)
    if arr.ndim != 3 or arr.shape[2] < 3:
        return None
    arr = arr[:, :, :3]
    if arr.dtype != np.uint8:
        arr = np.clip(arr, 0, 255).astype(np.uint8)
    return arr


def _parse_cache_key(image_rgb):
    arr = np.ascontiguousarray(image_rgb)
    digest = hashlib.sha1(arr.tobytes()).hexdigest()
    return (arr.shape, digest)


def _preprocess(image_rgb):
    pil = Image.fromarray(image_rgb, mode='RGB').resize(INPUT_SIZE, Image.BILINEAR)
    arr = np.asarray(pil, dtype=np.float32) / 255.0
    arr = np.transpose(arr, (2, 0, 1))
    arr = (arr - _IMAGENET_MEAN) / _IMAGENET_STD
    return arr[None, :, :, :].astype(np.float32)


def _output_to_label_map(output):
    logits = np.asarray(output)
    if logits.ndim == 4:
        return np.argmax(logits[0], axis=0).astype(np.uint8)
    if logits.ndim == 3:
        if logits.shape[0] >= 2:
            return np.argmax(logits, axis=0).astype(np.uint8)
        return logits[0].astype(np.uint8)
    if logits.ndim == 2:
        return logits.astype(np.uint8)
    raise ValueError(f'unexpected ONNX output shape: {logits.shape}')


def _resize_label_map(label_map, image_size):
    w, h = image_size
    pil = Image.fromarray(label_map.astype(np.uint8), mode='L')
    return np.array(pil.resize((w, h), Image.NEAREST), dtype=np.uint8)


def _clean_binary_mask(mask, close_size=3, open_size=2, fill=True):
    mask_bool = np.asarray(mask) > 0
    if close_size > 1:
        mask_bool = binary_closing(mask_bool, structure=np.ones((close_size, close_size), dtype=bool))
    if open_size > 1:
        mask_bool = binary_opening(mask_bool, structure=np.ones((open_size, open_size), dtype=bool))
    if fill:
        mask_bool = binary_fill_holes(mask_bool)
    return (mask_bool * 255).astype(np.uint8)


def parse_face(image_rgb):
    """Return semantic class map plus skin/hair masks, or None when unavailable."""
    arr = _as_rgb_array(image_rgb)
    if arr is None:
        return None

    session = _get_session()
    if session is None:
        return None

    key = _parse_cache_key(arr)
    if _LAST_PARSE['key'] == key and _LAST_PARSE['result'] is not None:
        return _LAST_PARSE['result']

    try:
        input_name = session.get_inputs()[0].name
        output = session.run(None, {input_name: _preprocess(arr)})[0]
        label_map = _resize_label_map(_output_to_label_map(output), (arr.shape[1], arr.shape[0]))

        skin_mask = _clean_binary_mask(label_map == SKIN_CLASS_ID, close_size=5, open_size=2, fill=True)
        hair_mask = _clean_binary_mask(label_map == HAIR_CLASS_ID, close_size=5, open_size=2, fill=False)

        result = {
            'ok': True,
            'source': 'face_parsing_onnx',
            'model_path': get_default_model_path(),
            'class_map': label_map,
            'skin_mask': skin_mask,
            'hair_mask': hair_mask,
            'skin_pixel_count': int(np.sum(skin_mask > 0)),
            'hair_pixel_count': int(np.sum(hair_mask > 0)),
        }
        _LAST_PARSE['key'] = key
        _LAST_PARSE['result'] = result
        return result
    except Exception as exc:
        print(f'[face_parsing] inference failed: {exc}')
        return None


def _value(landmark, name):
    if isinstance(landmark, dict):
        return landmark.get(name)
    return getattr(landmark, name, None)


def _point(landmarks, index, image_size):
    w, h = image_size
    landmark = landmarks[index]
    return (
        float(_value(landmark, 'x')) * w,
        float(_value(landmark, 'y')) * h,
    )


def _mean_point(landmarks, indices, image_size):
    points = [_point(landmarks, index, image_size) for index in indices]
    return (
        sum(point[0] for point in points) / len(points),
        sum(point[1] for point in points) / len(points),
    )


def estimate_hairline(landmarks, image_size, image_rgb=None, face_parse=None):
    """
    Estimate visible central hairline y from hair-to-skin transitions.

    Returns a dict with available=False when hairline is hidden by bangs, cropped,
    or the parser/model is unavailable.
    """
    if not landmarks or len(landmarks) <= max(454, *BROW_INDICES):
        return {'available': False, 'reason': 'insufficient_landmarks'}

    face_parse = face_parse or parse_face(image_rgb)
    if not face_parse or not face_parse.get('ok'):
        return {'available': False, 'reason': 'face_parsing_unavailable'}

    skin_mask = np.asarray(face_parse.get('skin_mask'), dtype=np.uint8) > 0
    hair_mask = np.asarray(face_parse.get('hair_mask'), dtype=np.uint8) > 0
    if skin_mask.shape != (image_size[1], image_size[0]) or hair_mask.shape != skin_mask.shape:
        return {'available': False, 'reason': 'invalid_parse_mask'}

    w, h = image_size
    brow_x, brow_y = _mean_point(landmarks, BROW_INDICES, image_size)
    chin_x, chin_y = _point(landmarks, 152, image_size)
    face_left = _point(landmarks, 234, image_size)
    face_right = _point(landmarks, 454, image_size)
    nose_x, _ = _point(landmarks, 1, image_size)
    mesh_top_y = _point(landmarks, 10, image_size)[1]

    face_width = max(abs(face_right[0] - face_left[0]), 1.0)
    mesh_face_height = max(chin_y - mesh_top_y, 1.0)
    search_left = int(max(0, min(w - 1, nose_x - face_width * 0.30)))
    search_right = int(max(search_left + 1, min(w, nose_x + face_width * 0.30)))
    search_top = int(max(0, brow_y - mesh_face_height * 0.78))
    search_bottom = int(min(h, brow_y - mesh_face_height * 0.045))

    if search_bottom - search_top < 12 or search_right - search_left < 12:
        return {'available': False, 'reason': 'search_area_too_small'}

    x_step = max(1, int(round(face_width * 0.012)))
    x_radius = max(1, int(round(face_width * 0.012)))
    y_window = max(4, int(round(mesh_face_height * 0.026)))
    candidates = []
    sampled_columns = 0

    for x in range(search_left, search_right, x_step):
        sampled_columns += 1
        col_left = max(0, x - x_radius)
        col_right = min(w, x + x_radius + 1)
        candidate_y = None
        for y in range(search_top + y_window, max(search_top + y_window, search_bottom - y_window)):
            above = slice(max(search_top, y - y_window * 2), y)
            below = slice(y, min(search_bottom, y + y_window * 2))
            hair_above = float(np.mean(hair_mask[above, col_left:col_right])) if above.stop > above.start else 0.0
            skin_below = float(np.mean(skin_mask[below, col_left:col_right])) if below.stop > below.start else 0.0
            if hair_above >= 0.18 and skin_below >= 0.42:
                candidate_y = y
                break
        if candidate_y is not None:
            candidates.append(candidate_y)

    min_candidates = max(8, int(sampled_columns * 0.24))
    if len(candidates) < min_candidates:
        return {
            'available': False,
            'reason': 'not_enough_hair_skin_boundary',
            'candidate_count': len(candidates),
            'sampled_columns': sampled_columns,
        }

    y_arr = np.asarray(candidates, dtype=np.float64)
    hairline_y = float(np.median(y_arr))
    spread = float(np.median(np.abs(y_arr - hairline_y)))
    forehead_px = float(brow_y - hairline_y)
    min_forehead_px = max(mesh_face_height * 0.12, 18.0)

    if forehead_px < min_forehead_px:
        return {
            'available': False,
            'reason': 'hairline_or_bangs_too_close_to_brows',
            'candidate_count': len(candidates),
            'sampled_columns': sampled_columns,
            'hairline_y': round(hairline_y, 1),
            'forehead_px': round(forehead_px, 1),
        }

    if hairline_y <= search_top + 2:
        return {
            'available': False,
            'reason': 'hairline_near_image_top_or_cropped',
            'candidate_count': len(candidates),
            'sampled_columns': sampled_columns,
            'hairline_y': round(hairline_y, 1),
        }

    confidence = 'high'
    if spread > mesh_face_height * 0.045 or len(candidates) < sampled_columns * 0.38:
        confidence = 'medium'

    return {
        'available': True,
        'source': 'face_parsing_skin_hair_boundary',
        'x': round(float(brow_x), 1),
        'y': round(hairline_y, 1),
        'forehead_px': round(forehead_px, 1),
        'candidate_count': int(len(candidates)),
        'sampled_columns': int(sampled_columns),
        'coverage': round(float(len(candidates) / max(sampled_columns, 1)), 3),
        'spread_px': round(spread, 1),
        'confidence': confidence,
        'search_bbox': [search_left, search_top, search_right, search_bottom],
    }
