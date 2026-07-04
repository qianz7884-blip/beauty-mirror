from flask import Blueprint, current_app, send_from_directory

from .common import error

uploads_bp = Blueprint('uploads', __name__)


@uploads_bp.route('/uploads/<folder>/<filename>')
def uploaded_file(folder, filename):
    folders = {
        'products': current_app.config['UPLOAD_FOLDER_PRODUCTS'],
        'diary': current_app.config['UPLOAD_FOLDER_DIARY'],
        'skin': current_app.config['UPLOAD_FOLDER_SKIN'],
    }
    upload_folder = folders.get(folder)
    if not upload_folder:
        return error('未知文件夹', 404)
    return send_from_directory(upload_folder, filename)
