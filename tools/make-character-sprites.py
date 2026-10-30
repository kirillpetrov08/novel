# Вырезание ровного фона у портретов персонажей -> прозрачные спрайты WebP.
#
# Использование:
#   pip install pillow numpy opencv-python-headless 'mediapipe==0.10.21'
#   python3 tools/make-character-sprites.py stores/1
#   python3 tools/make-character-sprites.py stores/1 --source /path/to/originals
#   python3 tools/make-character-sprites.py stores/1 --preview-dir /tmp/sprites --only heroine,matvey
#
# Алгоритм: MediaPipe Selfie Segmentation находит человека (включая случаи,
# когда за спиной нарисован интерьер), OpenCV GrabCut уточняет границу только
# в узкой полосе вокруг этой маски. Без MediaPipe используется цветовой
# fallback по ровному фону. Мелкие дефекты маски заливаются (большие просветы
# между рукой и телом остаются прозрачным фоном), край слегка смягчается,
# изображение обрезается по фигуре.
# Пути персонажей берутся из story.json и обновляются на .webp.
import argparse
import glob
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

MAX_DIM = 1150
WEBP_QUALITY = 90


def estimate_background(rgb: np.ndarray) -> np.ndarray:
    """Доминирующий цвет фона: медианы угловых патчей + проверка по границе."""
    h, w = rgb.shape[:2]
    p = max(6, min(h, w) // 18)
    patches = [
        rgb[:p, :p].reshape(-1, 3),
        rgb[:p, -p:].reshape(-1, 3),
        rgb[-p:, :p].reshape(-1, 3),
        rgb[-p:, -p:].reshape(-1, 3),
    ]
    candidates = [np.median(x, axis=0) for x in patches]
    border = np.concatenate(
        [rgb[0].reshape(-1, 3), rgb[-1].reshape(-1, 3), rgb[:, 0], rgb[:, -1]]
    ).astype(np.int16)
    best, best_score = candidates[0], -1.0
    for cand in candidates:
        dist = np.max(np.abs(border - cand.astype(np.int16)), axis=1)
        score = float(np.mean(dist <= 20))
        if score > best_score:
            best, best_score = cand, score
    return best.astype(np.float32)


def fill_holes(binary: np.ndarray, max_hole_ratio: float = 0.0015) -> np.ndarray:
    """Заливать только мелкие дефекты маски.

    Большие замкнутые просветы между рукой и телом — настоящий фон, который
    должен остаться прозрачным, а не превращаться в бежевую заплатку.
    """
    padded = cv2.copyMakeBorder(binary, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    flood = padded.copy()
    mask = np.zeros((flood.shape[0] + 2, flood.shape[1] + 2), np.uint8)
    cv2.floodFill(flood, mask, (0, 0), 128)
    holes = np.where(flood == 0, 255, 0).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(holes, 8)
    small = np.zeros_like(holes)
    max_area = max(1, int(binary.size * max_hole_ratio))
    for label in range(1, count):
        if stats[label, cv2.CC_STAT_AREA] <= max_area:
            small[labels == label] = 255
    return cv2.bitwise_or(padded, small)[1:-1, 1:-1]


_SEGMENTER = None
_SEGMENTER_TRIED = False


def segment_person(rgb: np.ndarray) -> np.ndarray | None:
    """Вероятностная маска человека MediaPipe или None, если пакет недоступен."""
    global _SEGMENTER, _SEGMENTER_TRIED
    if not _SEGMENTER_TRIED:
        _SEGMENTER_TRIED = True
        try:
            import mediapipe as mp

            _SEGMENTER = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1)
        except Exception as exc:  # цветовой fallback ниже всё равно работает
            print(f"⚠ MediaPipe недоступен ({exc}); использую цветовой fallback")
            _SEGMENTER = None
    if _SEGMENTER is None:
        return None
    result = _SEGMENTER.process(rgb)
    if result is None or result.segmentation_mask is None:
        return None
    mask = np.asarray(result.segmentation_mask, dtype=np.float32)
    if mask.shape != rgb.shape[:2]:
        mask = cv2.resize(mask, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_LINEAR)
    return np.clip(mask, 0.0, 1.0)


def make_sprite(source_path: str) -> Image.Image:
    bgr = cv2.imread(source_path, cv2.IMREAD_COLOR)
    if bgr is None:
        raise RuntimeError(f"Не удалось прочитать {source_path}")
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    h, w = rgb.shape[:2]
    bg = estimate_background(rgb)
    dist = np.max(np.abs(rgb.astype(np.int16) - bg.astype(np.int16)), axis=2)
    person = segment_person(rgb)

    if person is not None and float(np.mean(person > 0.5)) >= 0.02:
        # Семантическая маска задаёт фигуру; GrabCut ниже уточнит только границу.
        mask = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
        mask[person >= 0.32] = cv2.GC_PR_FGD
        mask[person <= 0.03] = cv2.GC_BGD
        seed = cv2.erode(
            np.where(person >= 0.68, 255, 0).astype(np.uint8),
            np.ones((5, 5), np.uint8),
            iterations=1,
        )
        mask[seed > 0] = cv2.GC_FGD

        allowed = cv2.dilate(
            np.where(person >= 0.26, 255, 0).astype(np.uint8),
            np.ones((17, 17), np.uint8),
            iterations=1,
        ) > 0
        core = cv2.erode(
            np.where(person >= 0.60, 255, 0).astype(np.uint8),
            np.ones((3, 3), np.uint8),
            iterations=1,
        ) > 0
    else:
        # Fallback для ровных фонов: цвет + центральная фигура.
        mask = np.full((h, w), cv2.GC_PR_FGD, np.uint8)
        mask[dist <= 12] = cv2.GC_PR_BGD

        band = np.zeros((h, w), bool)
        b = 6
        band[:b, :] = band[-b:, :] = True
        band[:, :b] = band[:, -b:] = True
        mask[band & (dist <= 26)] = cv2.GC_BGD

        central = np.zeros((h, w), bool)
        central[int(h * 0.08):, int(w * 0.16):int(w * 0.84)] = True
        seed = ((dist > 58) & central).astype(np.uint8) * 255
        seed = cv2.erode(seed, np.ones((7, 7), np.uint8), iterations=2)
        if np.count_nonzero(seed) < 100:
            seed = ((dist > 38) & central).astype(np.uint8) * 255
            seed = cv2.erode(seed, np.ones((7, 7), np.uint8), iterations=2)
        mask[seed > 0] = cv2.GC_FGD
        allowed = np.ones((h, w), bool)
        core = seed > 0

    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, mask, None, bgd_model, fgd_model, 6, cv2.GC_INIT_WITH_MASK)

    grab_foreground = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    foreground_bool = core | (grab_foreground & allowed)
    foreground = np.where(foreground_bool, 255, 0).astype(np.uint8)

    # Оставляем компоненты самой фигуры (по пересечению с её ядром).
    count, labels, stats, _ = cv2.connectedComponentsWithStats(foreground, 8)
    if count > 1:
        core_u8 = np.where(core, 255, 0).astype(np.uint8)
        seeded = set(np.unique(labels[core_u8 > 0]).tolist()) - {0}
        if seeded:
            foreground = np.where(np.isin(labels, list(seeded)), 255, 0).astype(np.uint8)
        else:
            largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
            foreground = np.where(labels == largest, 255, 0).astype(np.uint8)

    foreground = fill_holes(foreground)
    # Заливка дыр не должна возвращать пиксели далеко за семантическим контуром.
    foreground = np.where(allowed, foreground, 0).astype(np.uint8)
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=1)

    alpha = cv2.erode(foreground, np.ones((3, 3), np.uint8), iterations=1).astype(np.float32)
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.75)
    rgba = np.dstack([rgb, np.clip(alpha, 0, 255).astype(np.uint8)])
    img = Image.fromarray(rgba, "RGBA")

    bbox = img.getchannel("A").getbbox()
    if bbox:
        pad = 8
        bbox = (
            max(0, bbox[0] - pad),
            max(0, bbox[1] - pad),
            min(w, bbox[2] + pad),
            min(h, bbox[3] + pad),
        )
        img = img.crop(bbox)
    if max(img.size) > MAX_DIM:
        img.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
    return img


def locate(source_dir: str, rel_path: str) -> str | None:
    stem = os.path.splitext(os.path.basename(rel_path))[0]
    for ext in (".png", ".webp", ".jpg", ".jpeg"):
        for candidate in (
            os.path.join(source_dir, "images", stem + ext),
            os.path.join(source_dir, stem + ext),
            os.path.join(source_dir, rel_path),
        ):
            if os.path.exists(candidate):
                return candidate
    hits = glob.glob(os.path.join(source_dir, "**", stem + ".*"), recursive=True)
    return hits[0] if hits else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("story")
    ap.add_argument("--source", default=None, help="папка оригиналов (по умолчанию сама история)")
    ap.add_argument("--only", default="", help="имена/стеммы через запятую")
    ap.add_argument("--preview-dir", default=None, help="только превью туда, историю не менять")
    args = ap.parse_args()

    story_dir = args.story.rstrip("/")
    source_dir = args.source or story_dir
    story_json = os.path.join(story_dir, "story.json")
    story = json.load(open(story_json, encoding="utf-8"))
    only = {x.strip() for x in args.only.split(",") if x.strip()}

    refs: dict[str, str] = {}
    for char in (story.get("characters") or {}).values():
        rel = char.get("image")
        if rel:
            refs[rel] = os.path.splitext(os.path.basename(rel))[0]

    out_dir = args.preview_dir or os.path.join(story_dir, "images")
    os.makedirs(out_dir, exist_ok=True)

    changed = {}
    total_before = total_after = 0
    for rel, stem in sorted(refs.items(), key=lambda x: x[1]):
        if only and stem not in only and rel not in only:
            continue
        src = locate(source_dir, rel)
        if not src:
            print(f"⚠ {stem}: оригинал не найден")
            continue
        sprite = make_sprite(src)
        dst = os.path.join(out_dir, stem + ".webp")
        sprite.save(dst, "WEBP", quality=WEBP_QUALITY, alpha_quality=100, method=6)
        total_before += os.path.getsize(src)
        total_after += os.path.getsize(dst)
        alpha = np.asarray(sprite.getchannel("A"))
        coverage = float(np.mean(alpha > 12) * 100)
        print(f"✓ {stem}: {sprite.size[0]}×{sprite.size[1]}, фигура {coverage:.0f}% кадра, {os.path.getsize(dst)//1024} КБ")

        if not args.preview_dir:
            new_rel = f"images/{stem}.webp"
            changed[rel] = new_rel
            old_path = os.path.join(story_dir, rel)
            if os.path.exists(old_path) and os.path.abspath(old_path) != os.path.abspath(dst):
                os.remove(old_path)

    if changed:
        text = open(story_json, encoding="utf-8").read()
        for old, new in changed.items():
            text = text.replace(f'"{old}"', f'"{new}"')
        with open(story_json, "w", encoding="utf-8") as f:
            f.write(text)
        json.load(open(story_json, encoding="utf-8"))

    print(
        f"Итого: спрайтов {len(changed) if changed else '— (preview)'}; "
        f"вес выбранных оригиналов {total_before/1048576:.1f} МБ -> {total_after/1048576:.1f} МБ"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
