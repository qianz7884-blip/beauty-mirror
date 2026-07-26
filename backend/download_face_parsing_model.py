"""Download and validate the ONNX face parsing model used by both analyses."""

import argparse
import os
from pathlib import Path
from urllib.request import urlopen

from face_parsing import (
    get_default_model_path,
    get_model_url,
    validate_model_file,
)


def download_model(target=None, url=None, force=False):
    target = Path(target or get_default_model_path())
    url = url or get_model_url()
    target.parent.mkdir(parents=True, exist_ok=True)

    if target.exists() and not force:
        info = validate_model_file(target, load_session=True)
        print(f'Already exists and is valid: {target}')
        return info

    temp_target = target.with_suffix(target.suffix + '.part')
    if temp_target.exists():
        temp_target.unlink()

    print(f'Downloading {url}')
    print(f'Target: {target}')
    try:
        with urlopen(url, timeout=120) as response, temp_target.open('wb') as output:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
        info = validate_model_file(temp_target, load_session=True)
        os.replace(temp_target, target)
    except Exception:
        temp_target.unlink(missing_ok=True)
        raise

    info['path'] = str(target)
    print(
        f'Done: {target} ({info["size_bytes"] / 1024 / 1024:.1f} MB), '
        f'sha256={info["sha256"]}'
    )
    return info


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', default=get_default_model_path())
    parser.add_argument('--url', default=get_model_url())
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    download_model(target=args.target, url=args.url, force=args.force)


if __name__ == '__main__':
    main()
