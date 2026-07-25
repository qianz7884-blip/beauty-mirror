import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from io import BytesIO
from pathlib import Path

from app import app
from config import Config
from models import Product, db
from upload_utils import save_photo_bytes


WORKBOOK_PATH = Path(__file__).resolve().parent.parent / 'docs' / 'product_catalog_template.xlsx'
NS = {'a': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
CATEGORY_MAP = {
    '补水喷雾': '爽肤水',
    '喷雾': '爽肤水',
    '唇泥': '唇妆',
    '口红': '唇妆',
    '唇釉': '唇妆',
}


def _col_to_index(cell_ref):
    match = re.match(r'([A-Z]+)', cell_ref or 'A1')
    if not match:
        return 0

    index = 0
    for char in match.group(1):
        index = index * 26 + ord(char) - ord('A') + 1
    return index - 1


def _clean(value):
    value = str(value or '').strip()
    if len(value) >= 2 and value[0] == value[-1] == '"':
        value = value[1:-1].strip()
    return value


def _read_xlsx_rows(path):
    with zipfile.ZipFile(path) as archive:
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            root = ET.fromstring(archive.read('xl/sharedStrings.xml'))
            for item in root.findall('a:si', NS):
                shared.append(''.join(text.text or '' for text in item.findall('.//a:t', NS)))

        root = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
        rows = []
        for row in root.findall('.//a:sheetData/a:row', NS):
            values = []
            for cell in row.findall('a:c', NS):
                column_index = _col_to_index(cell.attrib.get('r'))
                while len(values) <= column_index:
                    values.append('')

                cell_type = cell.attrib.get('t')
                if cell_type == 'inlineStr':
                    value = ''.join(text.text or '' for text in cell.findall('.//a:t', NS))
                else:
                    raw_value = cell.find('a:v', NS)
                    value = ''
                    if raw_value is not None and raw_value.text is not None:
                        value = shared[int(raw_value.text)] if cell_type == 's' else raw_value.text
                values[column_index] = value
            rows.append(values)

    return rows


def _catalog_rows(path):
    rows = _read_xlsx_rows(path)
    if not rows:
        return []

    headers = [_clean(value) for value in rows[0]]
    items = []
    for row_number, row in enumerate(rows[1:], start=2):
        record = {
            headers[index]: _clean(row[index] if index < len(row) else '')
            for index in range(len(headers))
        }
        if record.get('ready_to_import', '').lower() != 'yes':
            continue
        if not record.get('brand') or not record.get('name'):
            print(f'[skip] 第 {row_number} 行缺少品牌或产品名')
            continue
        items.append(record)
    return items


def _normalize_category(category):
    category = _clean(category)
    return CATEGORY_MAP.get(category, category or '其他')


def _notes_with_source(record):
    notes = _clean(record.get('notes'))
    source_url = _clean(record.get('source_url'))
    if source_url:
        return f'{notes}\n来源：{source_url}'.strip()
    return notes


def _save_local_image(image_file):
    image_file = _clean(image_file)
    if not image_file:
        return ''

    image_path = Path(image_file)
    if not image_path.is_absolute():
        image_path = WORKBOOK_PATH.parent / 'product_images' / image_file
    if not image_path.exists():
        print(f'[image] 找不到图片：{image_path}')
        return ''

    try:
        return save_photo_bytes(
            image_path.read_bytes(),
            Config.UPLOAD_FOLDER_PRODUCTS,
            filename_prefix='catalog_',
            max_size=(800, 800),
            quality=86,
        )
    except Exception as exc:
        print(f'[image] 图片保存失败 {image_path}: {exc}')
        return ''


def import_catalog(path=WORKBOOK_PATH):
    rows = _catalog_rows(path)
    created = 0
    updated = 0

    with app.app_context():
        for record in rows:
            brand = record['brand']
            name = record['name']
            product = Product.query.filter(
                Product.source == 'knowledge_base',
                Product.brand == brand,
                Product.name == name,
            ).first()
            if not product:
                product = Product(source='knowledge_base', brand=brand, name=name)
                db.session.add(product)
                created += 1
            else:
                updated += 1

            photo = product.photo or _save_local_image(record.get('image_file'))
            product.brand = brand
            product.name = name
            product.category = _normalize_category(record.get('category'))
            product.volume = _clean(record.get('volume'))
            product.photo = photo
            product.ingredients = _clean(record.get('ingredients'))
            product.efficacy = _clean(record.get('efficacy'))
            product.suitable_skin = _clean(record.get('suitable_skin'))
            product.usage_instructions = _clean(record.get('usage_instructions'))
            product.usage_steps = _clean(record.get('usage_steps'))
            product.product_features = _clean(record.get('product_features'))
            product.suitable_regions = _clean(record.get('suitable_regions'))
            product.suitable_scenes = _clean(record.get('suitable_scenes'))
            product.notes = _notes_with_source(record)
            product.user_id = ''

        db.session.commit()

        total = Product.query.filter(Product.source == 'knowledge_base').count()
        return {'ready_rows': len(rows), 'created': created, 'updated': updated, 'catalog_total': total}


if __name__ == '__main__':
    workbook = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else WORKBOOK_PATH
    if not workbook.exists():
        raise SystemExit(f'找不到表格：{workbook}')
    result = import_catalog(workbook)
    print(result)
