# Оптимизация картинок историй перед коммитом/сборкой.
#   pip install pillow && python3 tools/optimize-story-images.py [stores/N ...]
# Что делает для каждой папки истории:
#   • images/*.png БЕЗ реальной прозрачности -> JPG (q84, макс. сторона 1100 px):
#     портреты на ровном фоне весят в разы меньше без видимой потери;
#   • PNG с прозрачностью оставляет PNG (только ресайз при необходимости);
#   • пути в story.json обновляет под новые имена файлов;
#   • фоны *.jpg и cover.jpg не трогает (они и так лёгкие) — только отчёт.
# Оригиналы остаются в истории Git ветки-источника.
import glob
import json
import os
import sys

from PIL import Image

MAX_DIM = 1100
JPEG_QUALITY = 84


def has_real_alpha(img: Image.Image) -> bool:
    if img.mode not in ("RGBA", "LA"):
        return False
    alpha = img.getchannel("A")
    return alpha.getextrema()[0] < 250


def optimize_story(folder: str) -> None:
    story_path = os.path.join(folder, "story.json")
    if not os.path.exists(story_path):
        print(f"-- {folder}: нет story.json, пропуск")
        return
    renames = {}
    before = after = 0
    for path in sorted(glob.glob(os.path.join(folder, "images", "*.png"))):
        before += os.path.getsize(path)
        img = Image.open(path)
        if has_real_alpha(img):
            if max(img.size) > MAX_DIM:
                img.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
                img.save(path, optimize=True)
            after += os.path.getsize(path)
            print(f"   keep PNG (alpha): {os.path.basename(path)}")
            continue
        rgb = img.convert("RGB")
        if max(rgb.size) > MAX_DIM:
            rgb.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
        new_path = os.path.splitext(path)[0] + ".jpg"
        rgb.save(new_path, quality=JPEG_QUALITY, optimize=True, progressive=True)
        os.remove(path)
        after += os.path.getsize(new_path)
        rel_old = os.path.relpath(path, folder).replace(os.sep, "/")
        rel_new = os.path.relpath(new_path, folder).replace(os.sep, "/")
        renames[rel_old] = rel_new

    if renames:
        text = open(story_path, encoding="utf-8").read()
        for old, new in renames.items():
            text = text.replace(f'"{old}"', f'"{new}"')
        with open(story_path, "w", encoding="utf-8") as f:
            f.write(text)
        json.load(open(story_path, encoding="utf-8"))  # страховка: JSON после правки валиден
    print(f"✓ {folder}: PNG {before/1048576:.1f} МБ -> {after/1048576:.1f} МБ, переименовано {len(renames)}")


folders = sys.argv[1:] or sorted(
    d for d in glob.glob("stores/[0-9]*") if os.path.isdir(d)
)
for f in folders:
    optimize_story(f)
