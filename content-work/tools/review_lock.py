"""Protect already visually reviewed source/sprite bytes during later batches."""
import hashlib
import json


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_frozen(base):
    review = base / 'visual-review.json'
    if not review.exists():
        return {}
    frozen = {}
    for item in json.loads(review.read_text(encoding='utf-8'))['files']:
        path = (base / item['file']).resolve()
        if not path.is_relative_to(base.resolve()):
            raise ValueError(f'Review path outside story: {path}')
        if not path.is_file() or digest(path) != item['sha256']:
            raise ValueError(f'Reviewed asset changed BEFORE preparation: {path}')
        frozen[path] = item['sha256']
    return frozen


def replace_unfrozen(temporary, target, frozen):
    """Keep accepted bytes untouched; refuse rather than silently reapprove changes."""
    expected = frozen.get(target.resolve())
    if expected is not None:
        actual = digest(temporary)
        temporary.unlink()
        if actual != expected:
            raise ValueError(f'Refusing to replace reviewed sprite: {target}')
        return
    temporary.replace(target)
