# Оптимизация картинок историй перед коммитом/сборкой.
#   pip install pillow && python3 tools/optimize-story-images.py [stores/N ...]
# Что делает для каждой папки истории:
#   • images/*.png БЕЗ реальной прозрачности -> JPG (q84, макс. сторона 1100 px):
#     портреты на ровном фоне весят в разы меньше без видимой потери;
#   • PNG с прозрачностью оставляет PNG (только ресайз при необходимости);
#   • пути в story.json и art-prompts.json обновляет под новые имена файлов;
#   • фоны *.jpg и cover.jpg не трогает (они и так лёгкие) — только отчёт.
# Оригиналы остаются в истории Git ветки-источника.
#
# Порядок важен для безопасности: PNG удаляется только ПОСЛЕ того, как JPG
# создан, а JSON-ссылки успешно переписаны. Обрыв процесса посередине не
# оставляет story.json со ссылками на уже удалённые файлы.
import glob
import json
import os
import sys

from PIL import Image

MAX_DIM = 1100
JPEG_QUALITY = 84


def has_real_alpha(img: Image.Image) -> bool:
    if img.mode in ("RGBA", "LA"):
        return img.getchannel("A").getextrema()[0] < 250
    if img.mode == "P" and "transparency" in img.info:
        return img.convert("RGBA").getchannel("A").getextrema()[0] < 250
    return False


def atomic_write_text(path: str, text: str) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def update_json_paths(path: str, renames: dict[str, str]) -> None:
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        text = f.read()
    updated = text
    for old, new in renames.items():
        updated = updated.replace(f'"{old}"', f'"{new}"')
    if updated == text:
        return
    json.loads(updated)  # проверяем до замены файла, а не после
    atomic_write_text(path, updated)


def optimize_story(folder: str) -> None:
    story_path = os.path.join(folder, "story.json")
    if not os.path.exists(story_path):
        print(f"-- {folder}: нет story.json, пропуск")
        return

    renames: dict[str, str] = {}
    converted: list[tuple[str, str]] = []
    before = after = 0

    for path in sorted(glob.glob(os.path.join(folder, "images", "*.png"))):
        before += os.path.getsize(path)
        with Image.open(path) as opened:
            opened.load()
            img = opened.copy()

        if has_real_alpha(img):
            if max(img.size) > MAX_DIM:
                img.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
                tmp = path + ".tmp.png"
                img.save(tmp, optimize=True)
                os.replace(tmp, path)
            after += os.path.getsize(path)
            print(f"   keep PNG (alpha): {os.path.basename(path)}")
            continue

        rgb = img.convert("RGB")
        if max(rgb.size) > MAX_DIM:
            rgb.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
        new_path = os.path.splitext(path)[0] + ".jpg"
        rgb.save(new_path, quality=JPEG_QUALITY, optimize=True, progressive=True)
        after += os.path.getsize(new_path)
        rel_old = os.path.relpath(path, folder).replace(os.sep, "/")
        rel_new = os.path.relpath(new_path, folder).replace(os.sep, "/")
        renames[rel_old] = rel_new
        converted.append((path, new_path))

    if renames:
        update_json_paths(story_path, renames)
        update_json_paths(os.path.join(folder, "art-prompts.json"), renames)
        for old_path, _new_path in converted:
            if os.path.exists(old_path):
                os.remove(old_path)

    print(
        f"✓ {folder}: PNG {before / 1048576:.1f} МБ -> {after / 1048576:.1f} МБ, "
        f"переименовано {len(renames)}"
    )


def main() -> int:
    folders = sys.argv[1:] or sorted(
        d for d in glob.glob("stores/[0-9]*") if os.path.isdir(d)
    )
    if not folders:
        print("Папки историй не найдены: запускай из корня репозитория или укажи stores/N")
        return 1
    for folder in folders:
        optimize_story(folder)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
