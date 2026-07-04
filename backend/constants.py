CATEGORIES = ['全部', '面霜', '精华', '面膜', '洁面', '防晒', '其他']

MOOD_MAP = {
    'excellent': {'label': '状态极佳', 'color': '#7C9473', 'emoji': '✨'},
    'happy': {'label': '开心', 'color': '#D4929A', 'emoji': '😊'},
    'stable': {'label': '状态稳定', 'color': '#7B9EC7', 'emoji': '🙂'},
    'normal': {'label': '一般', 'color': '#A0A0A0', 'emoji': '😐'},
    'low': {'label': '状态较差', 'color': '#E08E5A', 'emoji': '😥'},
}

MOOD_LEGACY_MAP = {
    '😍': 'excellent',
    '😊': 'happy',
    '😐': 'normal',
    '😩': 'low',
}
