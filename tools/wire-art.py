#!/usr/bin/env python3
"""Прописывает пути к картинкам в story.json для всех историй, у которых есть art-prompts.json.

Запуск из корня репозитория:
    python3 tools/wire-art.py          # прописать то, что реально существует
    python3 tools/wire-art.py --check   # только отчёт, ничего не менять

Логика:
  * обложка   -> story.cover            (если файл cover.jpg существует)
  * фон сцены -> scene.bg               (из art-prompts.json -> sceneBackgrounds)
  * персонаж  -> character.image        (если images/<ключ>.png существует)

Отсутствующие файлы остаются пустыми: приложение нарисует градиент и монограмму.
Скрипт идемпотентен, его можно гонять сколько угодно раз.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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
        prompts = load(prompts_path) if os.path.isfile(prompts_path) else {}
        scene_bgs = prompts.get("sceneBackgrounds", {})

        changed = 0
        missing = []
        expected = set()

        def exists(rel):
            return bool(rel) and os.path.isfile(os.path.join(store, rel))

        # обложка
        expected.add("cover.jpg")
        if exists("cover.jpg"):
            if story.get("cover") != "cover.jpg":
                story["cover"] = "cover.jpg"
                changed += 1
        else:
            if story.get("cover"):
                story["cover"] = ""
                changed += 1
            missing.append("cover.jpg")

        # персонажи
        for key, char in story.get("characters", {}).items():
            rel = f"images/{key}.png"
            expected.add(rel)
            if exists(rel):
                if char.get("image") != rel:
                    char["image"] = rel
                    changed += 1
            else:
                if char.get("image"):
                    char["image"] = ""
                    changed += 1
                missing.append(rel)

        # фоны: трогаем только сцены, для которых известен ожидаемый файл
        for sid, scene in story.get("scenes", {}).items():
            rel = scene_bgs.get(sid)
            if not rel:
                continue
            expected.add(rel)
            if exists(rel):
                if scene.get("bg") != rel:
                    scene["bg"] = rel
                    changed += 1
            else:
                if scene.get("bg"):
                    scene["bg"] = ""
                    changed += 1
                missing.append(rel)

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
