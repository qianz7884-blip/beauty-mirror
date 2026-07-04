import re

from flask import jsonify, request


DEFAULT_DEMO_USER_ID = 'demo_legacy_user'
USER_ID_HEADER = 'X-Anonymous-User-Id'
USER_ID_PATTERN = re.compile(r'[^a-zA-Z0-9_-]')


def _clean_user_id(value):
    value = (value or '').strip()
    if not value:
        return ''
    return USER_ID_PATTERN.sub('', value)[:80]


def get_current_user_id():
    json_payload = request.get_json(silent=True) if request.is_json else None
    json_user_id = json_payload.get('anonymous_user_id') if isinstance(json_payload, dict) else ''
    return (
        _clean_user_id(request.headers.get(USER_ID_HEADER))
        or _clean_user_id(request.headers.get('X-User-Id'))
        or _clean_user_id(request.form.get('anonymous_user_id'))
        or _clean_user_id(request.args.get('anonymous_user_id'))
        or _clean_user_id(json_user_id)
        or DEFAULT_DEMO_USER_ID
    )


def error(msg, code=400):
    return jsonify({'error': msg}), code
