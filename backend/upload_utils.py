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


def _save_image(source, folder, filename_prefix='', extension='.jpg', max_size=(800, 800), quality=85):
    os.makedirs(folder, exist_ok=True)
    filename = f'{filename_prefix}{uuid.uuid4().hex}{extension}'
    filepath = os.path.join(folder, filename)

    img = Image.open(source)
    img.thumbnail(max_size)
    if img.mode != 'RGB':
        img = img.convert('RGB')
    img.save(filepath, 'JPEG', quality=quality)
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

    filepath = os.path.join(folder, filename)
    if os.path.exists(filepath):
        os.remove(filepath)
