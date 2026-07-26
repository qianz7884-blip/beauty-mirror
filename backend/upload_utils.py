import ipaddress
import os
import socket
import urllib.parse
import urllib.request
import uuid
from io import BytesIO

from PIL import Image


MAX_REMOTE_IMAGE_BYTES = 8 * 1024 * 1024
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}


def _safe_extension(filename, default='.jpg'):
    ext = os.path.splitext(filename or '')[1].lower()
    if ext == '.jpeg':
        return '.jpg'
    return ext if ext in IMAGE_EXTENSIONS else default


def _prepare_image(source, max_size=(800, 800), quality=85):
    img = Image.open(source)
    img.thumbnail(max_size)
    if img.mode != 'RGB':
        img = img.convert('RGB')

    output = BytesIO()
    img.save(output, 'JPEG', quality=quality, optimize=True)
    output.seek(0)
    return output


def _cloudinary_enabled():
    return bool(os.environ.get('CLOUDINARY_URL', '').strip())


def _save_cloudinary(image_buffer, folder, filename_prefix=''):
    try:
        import cloudinary.uploader
    except ImportError as exc:
        raise RuntimeError(
            '已配置 CLOUDINARY_URL，但未安装 cloudinary 依赖'
        ) from exc

    storage_folder = os.path.basename(os.path.normpath(folder)) or 'images'
    public_id = f'{filename_prefix}{uuid.uuid4().hex}'
    result = cloudinary.uploader.upload(
        image_buffer,
        folder=f'mirror-mate/{storage_folder}',
        public_id=public_id,
        resource_type='image',
        format='jpg',
        overwrite=False,
    )
    return result.get('secure_url', '')


def _save_image(source, folder, filename_prefix='', extension='.jpg', max_size=(800, 800), quality=85):
    image_buffer = _prepare_image(source, max_size=max_size, quality=quality)
    if _cloudinary_enabled():
        return _save_cloudinary(image_buffer, folder, filename_prefix=filename_prefix)

    os.makedirs(folder, exist_ok=True)
    filename = f'{filename_prefix}{uuid.uuid4().hex}.jpg'
    filepath = os.path.join(folder, filename)
    with open(filepath, 'wb') as output:
        output.write(image_buffer.getvalue())
    return filename


def save_photo(file, folder):
    if not file or not file.filename:
        return ''
    ext = _safe_extension(file.filename)
    return _save_image(file, folder, extension=ext)


def save_photo_bytes(image_bytes, folder, filename_prefix='', max_size=(400, 400), quality=80):
    if not image_bytes:
        return ''
    return _save_image(
        BytesIO(image_bytes),
        folder,
        filename_prefix=filename_prefix,
        extension='.jpg',
        max_size=max_size,
        quality=quality,
    )


def _is_blocked_host(hostname):
    if not hostname:
        return True

    lowered = hostname.lower().strip('.')
    if lowered in {'localhost'}:
        return True

    try:
        addresses = [ipaddress.ip_address(lowered)]
    except ValueError:
        try:
            infos = socket.getaddrinfo(lowered, None)
            addresses = [ipaddress.ip_address(info[4][0]) for info in infos]
        except (OSError, ValueError):
            return True

    return any(
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
        for ip in addresses
    )


def _extension_from_response(url, content_type):
    if 'png' in content_type:
        return '.png'
    if 'webp' in content_type:
        return '.webp'
    if 'gif' in content_type:
        return '.gif'

    path = urllib.parse.urlparse(url).path.lower()
    for ext in ['.png', '.webp', '.gif', '.jpg', '.jpeg']:
        if path.endswith(ext):
            return '.jpg' if ext == '.jpeg' else ext
    return '.jpg'


def download_photo_from_url(url, folder):
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in {'http', 'https'} or _is_blocked_host(parsed.hostname):
            return ''

        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            content_length = resp.headers.get('Content-Length')
            if content_length and int(content_length) > MAX_REMOTE_IMAGE_BYTES:
                return ''

            data = resp.read(MAX_REMOTE_IMAGE_BYTES + 1)
            if len(data) > MAX_REMOTE_IMAGE_BYTES:
                return ''
            content_type = resp.headers.get('Content-Type', '').lower()

        ext = _extension_from_response(url, content_type)
        return _save_image(BytesIO(data), folder, extension=ext)
    except Exception:
        return ''


def delete_photo(filename, folder):
    if not filename:
        return

    if filename.startswith(('http://', 'https://')):
        if 'res.cloudinary.com/' not in filename or not _cloudinary_enabled():
            return
        try:
            import cloudinary.uploader

            path = urllib.parse.unquote(urllib.parse.urlparse(filename).path)
            marker = '/upload/'
            if marker not in path:
                return
            public_path = path.split(marker, 1)[1]
            parts = public_path.split('/')
            if parts and parts[0].startswith('v') and parts[0][1:].isdigit():
                parts = parts[1:]
            public_id = os.path.splitext('/'.join(parts))[0]
            if public_id.startswith('mirror-mate/'):
                cloudinary.uploader.destroy(public_id, resource_type='image')
        except Exception as exc:
            print(f'[upload_utils] 云端图片删除失败: {exc}')
        return

    filepath = os.path.join(folder, filename)
    if os.path.exists(filepath):
        os.remove(filepath)
