"""Download the optional ONNX face parsing model used for hairline detection."""

from pathlib import Path
from urllib.request import urlretrieve

from face_parsing import DEFAULT_MODEL_PATH, DEFAULT_MODEL_URL


def main():
    target = Path(DEFAULT_MODEL_PATH)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > 1024 * 1024:
        print(f'Already exists: {target}')
        return

    print(f'Downloading {DEFAULT_MODEL_URL}')
    print(f'Target: {target}')
    urlretrieve(DEFAULT_MODEL_URL, target)
    print(f'Done: {target} ({target.stat().st_size / 1024 / 1024:.1f} MB)')


if __name__ == '__main__':
    main()
