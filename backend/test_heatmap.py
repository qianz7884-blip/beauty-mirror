"""测试热力图生成模块"""
import sys
import os
import base64

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from skin_analyzer import detect_face, _get_detector
from heatmap_generator import generate_skin_heatmap

# 找测试图片
uploads_dir = 'uploads/skin'
files = [f for f in os.listdir(uploads_dir) if f.endswith(('.jpg', '.png', '.jpeg'))]
if not files:
    print('No test images found!')
    sys.exit(1)

test_file = os.path.join(uploads_dir, files[0])
print(f'Testing with: {test_file}')

with open(test_file, 'rb') as f:
    image_bytes = f.read()

# 面部检测
has_face, face_info = detect_face(image_bytes)
if not has_face:
    print(f'Face detection failed: {face_info}')
    sys.exit(1)

print(f'Face detected! landmarks={face_info["face_data"]["landmark_count"]} points, image_size={face_info["image_size"]}')

# 模拟各区域评分（模拟 Gemini 返回的 region_scores）
mock_scores = {
    '前额':   {'overall': 72, 'hydration': 70, 'smoothness': 75, 'brightness': 68, 'pores': 74, 'evenness': 73},
    '左脸颊': {'overall': 65, 'hydration': 62, 'smoothness': 68, 'brightness': 60, 'pores': 66, 'evenness': 64},
    '右脸颊': {'overall': 80, 'hydration': 78, 'smoothness': 82, 'brightness': 76, 'pores': 80, 'evenness': 81},
    '鼻子':   {'overall': 55, 'hydration': 50, 'smoothness': 58, 'brightness': 52, 'pores': 45, 'evenness': 54},
    '下巴':   {'overall': 68, 'hydration': 65, 'smoothness': 70, 'brightness': 66, 'pores': 68, 'evenness': 72},
    '左眼周': {'overall': 60, 'hydration': 55, 'smoothness': 62, 'brightness': 50, 'pores': 65, 'evenness': 58},
    '右眼周': {'overall': 75, 'hydration': 72, 'smoothness': 78, 'brightness': 70, 'pores': 76, 'evenness': 74},
    '唇周':   {'overall': 70, 'hydration': 68, 'smoothness': 72, 'brightness': 66, 'pores': 70, 'evenness': 71},
}

# 生成热力图
print('Generating heatmap...')
result_b64 = generate_skin_heatmap(
    image_bytes=image_bytes,
    landmarks=face_info['landmarks'],
    image_size=face_info['image_size'],
    region_scores=mock_scores,
    alpha=0.5,
)

if result_b64:
    # 保存为 PNG 文件
    header, data = result_b64.split(',', 1)
    output_path = 'test_heatmap_output.png'
    with open(output_path, 'wb') as f:
        f.write(base64.b64decode(data))
    print(f'SUCCESS! Heatmap saved to: {output_path}')
    print(f'Base64 length: {len(data)} chars')
else:
    print('FAILED! generate_skin_heatmap returned None')
