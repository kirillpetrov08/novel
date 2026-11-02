#!/usr/bin/env python3
"""Нормализация прозрачных спрайтов персонажей к единому масштабу по лицу.

Запуск из корня репозитория (нужен mediapipe, как для make-character-sprites):
    python3 tools/normalize-sprites.py stores/1 [stores/2 ...]
    python3 tools/normalize-sprites.py --all

Зачем: плеер показывает персонажа через object-fit:contain в колонке фикс.
высоты. У спрайтов из разных источников разный аспект холста и разная
компоновка (по пояс / по грудь), поэтому размер голов на экране отличался
почти вдвое. Нормализация приводит все спрайты к одному стандарту:
  * единый холст 792x1200 (аспект 0.66);
  * высота лица = 21% высоты холста (MediaPipe Face Detection);
    состояния *_close (крупный план) — 26%, чтобы чувствовались ближе;
  * фигура стоит на нижней кромке холста, центрирована по горизонтали;
  * если лицо не нашлось — fallback: высота фигуры 99.5% холста.
Тогда при любом числе персонажей на экране (1/2/3) головы одного размера.
Идемпотентно: файлы уже на холсте 792x1200 пропускаются без перекодирования
(считаются нормализованными текущей версией алгоритма).
Новая генерация спрайтов (make-character-sprites.py) нормализует сама.
"""
import json
import os
import sys

from PIL import Image

CANVAS_W, CANVAS_H = 792, 1200
FACE_FRAC = 0.21
FACE_FRAC_CLOSE = 0.26
MAX_FIG_FRAC = 0.995
MAX_UPSCALE = 2.5
# Чтобы дотянуть лицо до целевого размера, фигуре разрешено:
#  * выходить за боковые края холста (плечи бюста слегка обрежутся) —
#    до 22% ширины фигуры, крупным планам до 45%;
#  * быть выше холста до 25% — низ фигуры обрежется, в плеере он всё равно
#    скрыт за карточкой диалога. Лицо при этом не выше 24 px от верха.
SIDE_CROP = 0.22
SIDE_CROP_CLOSE = 0.45
HEIGHT_OVERFLOW = 1.25
FACE_TOP_MIN = 24
WEBP_QUALITY = 90

_FACE_DETECTOR = None


def _face_box(img: Image.Image):
    """(x, y, w, h) самого крупного лица в пикселях img или None."""
    global _FACE_DETECTOR
    try:
        import mediapipe as mp
        import numpy as np
    except Exception:
        return None
    if _FACE_DETECTOR is None:
        _FACE_DETECTOR = mp.solutions.face_detection.FaceDetection(
            model_selection=1, min_detection_confidence=0.4
        )
    bg = Image.new("RGBA", img.size, (234, 223, 203, 255))
    bg.alpha_composite(img.convert("RGBA"))
    try:
        res = _FACE_DETECTOR.process(np.asarray(bg.convert("RGB")))
    except Exception:
        return None
    if not res.detections:
        return None
    w, h = img.size
    best = None
    for d in res.detections:
        bb = d.location_data.relative_bounding_box
        box = (bb.xmin * w, bb.ymin * h, bb.width * w, bb.height * h)
        if best is None or box[2] * box[3] > best[2] * best[3]:
            best = box
    return best


def _paste(canvas: Image.Image, fig: Image.Image, x: int, y: int) -> None:
    """alpha_composite с клиппингом: фигура может выходить за края холста."""
    x0, y0 = max(0, -x), max(0, -y)
    x1, y1 = min(fig.size[0], CANVAS_W - x), min(fig.size[1], CANVAS_H - y)
    if x1 <= x0 or y1 <= y0:
        return
    canvas.alpha_composite(fig.crop((x0, y0, x1, y1)), (x + x0, y + y0))


def normalize_canvas(img: Image.Image, closeup: bool = False) -> Image.Image:
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    mask = img.getchannel("A").point(lambda v: 255 if v > 16 else 0)
    bbox = mask.getbbox()
    if not bbox:
        return img
    fig = img.crop(bbox)
    fw, fh = fig.size
    face = _face_box(fig)
    if face:
        target = (FACE_FRAC_CLOSE if closeup else FACE_FRAC) * CANVAS_H
        scale = target / max(1.0, face[3])
        crop = SIDE_CROP_CLOSE if closeup else SIDE_CROP
        scale = min(
            scale,
            MAX_UPSCALE,
            (CANVAS_W / (1.0 - crop)) / fw,
            (CANVAS_H * HEIGHT_OVERFLOW) / fh,
        )
    else:
        scale = min((CANVAS_H * MAX_FIG_FRAC) / fh, CANVAS_W / fw)
    new_size = (max(1, int(round(fw * scale))), max(1, int(round(fh * scale))))
    if new_size != fig.size:
        fig = fig.resize(new_size, Image.LANCZOS)
    x = (CANVAS_W - fig.size[0]) // 2
    y = CANVAS_H - fig.size[1]
    if face and fig.size[1] > CANVAS_H:
        y = max(y, FACE_TOP_MIN - int(face[1] * scale))
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    _paste(canvas, fig, x, y)
    return canvas


def normalize_story(folder: str) -> None:
    story_path = os.path.join(folder, "story.json")
    if not os.path.exists(story_path):
        print(f"-- {folder}: нет story.json, пропуск")
        return
    story = json.load(open(story_path, encoding="utf-8"))
    done = skipped = 0
    for cid, ch in (story.get("characters") or {}).items():
        rel = ch.get("image") or ""
        if not rel.endswith(".webp"):
            continue
        path = os.path.join(folder, rel)
        if not os.path.exists(path):
            print(f"  ⚠ {cid}: нет файла {rel}")
            continue
        img = Image.open(path)
        if img.mode not in ("RGBA", "LA"):
            skipped += 1
            continue
        stem = os.path.splitext(os.path.basename(rel))[0]
        if img.size == (CANVAS_W, CANVAS_H):
            # уже на стандартном холсте: пропускаем, если лицо в допуске
            face = _face_box(img.convert("RGBA"))
            target = FACE_FRAC_CLOSE if stem.endswith("_close") else FACE_FRAC
            if face is None or abs(face[3] / CANVAS_H - target) <= 0.02:
                skipped += 1
                continue
        out = normalize_canvas(img, closeup=stem.endswith("_close"))
        out.save(path, "WEBP", quality=WEBP_QUALITY, alpha_quality=100, method=6)
        done += 1
    print(f"✓ {folder}: нормализовано {done}, пропущено {skipped}")


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--all" in sys.argv:
        args = [
            os.path.join("stores", d)
            for d in sorted(os.listdir("stores"), key=lambda x: (len(x), x))
            if os.path.isfile(os.path.join("stores", d, "story.json"))
        ]
    if not args:
        print("использование: normalize-sprites.py stores/N ... | --all")
        return 1
    for folder in args:
        normalize_story(folder.rstrip("/"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
