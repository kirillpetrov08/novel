#!/usr/bin/env python3
"""Прописывает пути к картинкам в story.json для всех историй, у которых есть art-prompts.json.

Запуск из корня репозитория:
    python3 tools/wire-art.py          # прописать то, что реально существует
    python3 tools/wire-art.py --check   # только отчёт, ничего не менять

Логика:
  * обложка   -> story.cover            (cover с расширением webp/jpg/png)
  * фон сцены -> scene.bg               (из art-prompts.json -> sceneBackgrounds)
  * персонаж  -> character.image        (images/<ключ> с расширением webp/png/jpg)
  * карточка  -> scene.cg               (images[] с type="card" и scene)

Скрипт недеструктивен: уже прописанный существующий путь никогда не очищает
и не заменяет другим файлом. Если ожидаемой картинки пока нет, поле остаётся
как было, а файл просто попадает в отчёт недостающих. Поэтому скрипт можно
запускать и до, и после изготовления прозрачных .webp-спрайтов.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGE_EXTENSIONS = (".webp", ".jpg", ".jpeg", ".png")


def existing_variant(store, rel):
    """Найти существующий файл: exact path или тот же stem с другим расширением."""
    if not rel:
        return None
    if os.path.isfile(os.path.join(store, rel)):
        return rel
    stem, _ext = os.path.splitext(rel)
    for ext in IMAGE_EXTENSIONS:
        candidate = stem + ext
        if os.path.isfile(os.path.join(store, candidate)):
            return candidate
    return None


def first_existing(store, candidates):
    for rel in candidates:
        found = existing_variant(store, rel)
        if found:
            return found
    return None


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    check_only = "--check" in sys.argv
    stores_dir = os.path.join(ROOT, "stores")
    if not os.path.isdir(stores_dir):
        print("нет папки stores/")
        return 1

    total_missing = 0
    for name in sorted(os.listdir(stores_dir)):
        store = os.path.join(stores_dir, name)
        story_path = os.path.join(store, "story.json")
        if not os.path.isfile(story_path):
            continue
        story = load(story_path)
        prompts_path = os.path.join(store, "art-prompts.json")
        # Трогаем ТОЛЬКО истории с art-prompts.json: у остальных (уже собранных,
        # например со спрайтами .webp) пути прописаны вручную и затирать их нельзя.
        if not os.path.isfile(prompts_path):
            continue
        prompts = load(prompts_path)
        scene_bgs = prompts.get("sceneBackgrounds", {})
        scene_cards = {}
        for item in prompts.get("images", []):
            if (isinstance(item, dict) and item.get("type") == "card"
                    and item.get("scene") and item.get("file")):
                scene_cards[item["scene"]] = item["file"]

        changed = 0
        missing = []
        expected = set()

        # Обложка: текущий существующий файл важнее предположений инструмента.
        cover = existing_variant(store, story.get("cover")) or first_existing(
            store, ("cover.jpg", "cover.webp", "cover.png", "cover.jpeg"))
        if cover:
            expected.add(cover)
            if story.get("cover") != cover:
                story["cover"] = cover
                changed += 1
        else:
            expected.add(story.get("cover") or "cover.jpg")
            missing.append(story.get("cover") or "cover.jpg")

        # Персонажи: после конвейера спрайтов обычно лежит .webp, до него — .png.
        for key, char in story.get("characters", {}).items():
            if not isinstance(char, dict):
                continue
            rel = existing_variant(store, char.get("image")) or first_existing(
                store,
                (f"images/{key}.webp", f"images/{key}.png",
                 f"images/{key}.jpg", f"images/{key}.jpeg"),
            )
            if rel:
                expected.add(rel)
                if char.get("image") != rel:
                    char["image"] = rel
                    changed += 1
            else:
                absent = char.get("image") or f"images/{key}.webp"
                expected.add(absent)
                missing.append(absent)

        # Фоны и особые карточки: трогаем только сцены с манифестами и никогда
        # не очищаем уже прописанное значение при временно отсутствующем файле.
        for sid, scene in story.get("scenes", {}).items():
            if not isinstance(scene, dict):
                continue

            expected_bg = scene_bgs.get(sid)
            if expected_bg:
                rel = existing_variant(store, scene.get("bg")) or existing_variant(store, expected_bg)
                if rel:
                    expected.add(rel)
                    if scene.get("bg") != rel:
                        scene["bg"] = rel
                        changed += 1
                else:
                    expected.add(expected_bg)
                    missing.append(expected_bg)

            expected_cg = scene_cards.get(sid)
            if expected_cg:
                rel = existing_variant(store, scene.get("cg")) or existing_variant(store, expected_cg)
                if rel:
                    expected.add(rel)
                    if scene.get("cg") != rel:
                        scene["cg"] = rel
                        changed += 1
                else:
                    expected.add(expected_cg)
                    missing.append(expected_cg)

        missing = sorted(set(missing))
        total_missing += len(missing)
        ready = len(expected) - len(missing)
        print(f"[{name}] {story.get('title', '?')}: "
              f"готово {ready} файлов, не хватает {len(missing)}, "
              f"изменений в json: {changed}")
        for m in missing[:5]:
            print(f"    нет: {m}")
        if len(missing) > 5:
            print(f"    ... и ещё {len(missing) - 5}")

        if changed and not check_only:
            save(story_path, story)

    print(f"\nвсего не хватает файлов: {total_missing}")
    if check_only:
        print("режим --check: ничего не записано")
    return 0


if __name__ == "__main__":
    sys.exit(main())
