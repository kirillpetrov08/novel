#!/usr/bin/env python3
"""Compile the explicitly marked first chapter draft, never a shipped story.

Run from any cwd: python3 content-work/tools/compile-chapter.py
This deliberately supports only the authored chapter's notation. Unknown speakers,
missing transitions, duplicate IDs and unsupported paragraphs fail loudly.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / '14'
SOURCE = BASE / 'chapters/01.md'
OUT = BASE / 'chapters/01.json'
SPEAKERS = {'Ася': 'heroine', 'Лев': 'hero', 'Валентина': 'director',
            'Рита': 'friend', 'Рита, сообщение': 'friend', 'Лев, сообщение': 'hero'}
STATS = {'desire', 'trust', 'resolve'}


def chunks(text, limit=240):
    """Prefer sentence boundaries; fall back to spaces, never cut a word."""
    result, current = [], ''
    for sentence in re.split(r'(?<=[.!?…])\s+', text.strip()):
        sentence = ' '.join(sentence.split())
        if current and len(current) + 1 + len(sentence) > limit:
            result.append(current)
            current = ''
        for word in sentence.split():
            if len(word) > limit:
                raise ValueError('Unbreakable long word')
            if current and len(current) + 1 + len(word) > limit:
                result.append(current)
                current = ''
            current = f'{current} {word}'.strip()
    if current:
        result.append(current)
    return result


def compile_chapter():
    source = SOURCE.read_text(encoding='utf-8')
    sections = list(re.finditer(r'^## (a\d{2}[a-z]?) · (.+)$', source, re.M))
    scenes = {}
    titles = {}
    for i, heading in enumerate(sections):
        sid, title = heading.groups()
        if sid in scenes:
            raise ValueError(f'Duplicate scene: {sid}')
        body = source[heading.end():sections[i + 1].start() if i + 1 < len(sections) else len(source)].strip()
        n = int(sid[1:3])
        bg = 'reading-room' if 8 <= n <= 11 else 'courtyard' if n in (12, 16, 17) else 'home' if n == 18 else 'workshop'
        show = ['heroine'] if n in (1, 18) else ['heroine', 'hero']
        if 3 <= n <= 6:
            show.append('director')
        if 8 <= n <= 11:
            show.append('friend')
        scene = {'bg': f'images/bg-{bg}.jpg', 'bgGradient': ['#E9DFCE', '#796C5E'], 'show': show, 'lines': []}
        choices = []
        targets = re.findall(r'Переход: `([a-z0-9]+)`', body)
        external = re.findall(r'Следующий узел: `([a-z0-9]+)`', body)
        if len(targets) + len(external) > 1:
            raise ValueError(f'Multiple exits: {sid}')
        if targets or external:
            scene['next'] = (targets + external)[0]
        for paragraph in re.split(r'\n\s*\n', body):
            paragraph = paragraph.strip()
            if paragraph.startswith(('Переход:', 'Иллюстрация:', 'Фон:', '**Конец первой главы.**')):
                continue
            if paragraph.startswith('**Выбор'):
                for line in paragraph.splitlines()[1:]:
                    m = re.fullmatch(r'- «(.+)»\.? (Бесплатно|5◆); (.+); → `([a-z0-9]+)`\.', line)
                    if not m:
                        raise ValueError(f'Invalid choice notation in {sid}: {line}')
                    label, cost, effects, target = m.groups()
                    effect_pairs = re.findall(r'`([a-z]+) \+(\d+)`', effects)
                    if not effect_pairs or any(k not in STATS for k, _ in effect_pairs):
                        raise ValueError(f'Invalid effects: {sid}')
                    option = {'text': label, 'next': target, 'effect': {k: int(v) for k, v in effect_pairs}}
                    if cost == '5◆':
                        option['crystals'] = 5
                    choices.append(option)
                continue
            speaker = re.match(r'^\*\*([^*]+):\*\*\s*(.*)$', paragraph, re.S)
            if speaker:
                name, text = speaker.groups()
                if name not in SPEAKERS:
                    raise ValueError(f'Unknown speaker: {name}')
                if ', сообщение' in name:
                    text = 'Сообщение: ' + text
                for part in chunks(text):
                    scene['lines'].append({'type': 'dialogue', 'who': SPEAKERS[name], 'text': part})
            else:
                if any(token in paragraph for token in ('**', '`', '→')):
                    raise ValueError(f'Unparsed editorial markup: {sid}: {paragraph}')
                for part in chunks(paragraph):
                    scene['lines'].append({'type': 'narration', 'text': part})
        if choices:
            if 'next' in scene:
                raise ValueError(f'Choice plus next: {sid}')
            scene['choices'] = choices
        if not scene['lines'] or not (choices or 'next' in scene):
            raise ValueError(f'Empty or dead-end scene: {sid}')
        cg = re.findall(r'Иллюстрация: `(images/[^`]+)`', body)
        if cg:
            if len(cg) != 1:
                raise ValueError(f'Multiple CG: {sid}')
            scene['cg'] = cg[0]
        scenes[sid] = scene
        titles[sid] = title
    if len(scenes) != 28:
        raise ValueError('Expected 28 explicitly authored chapter-one scenes')
    result = {'productionStatus': 'draft-fragment', 'story': 'pereplyot', 'chapter': 1,
              'title': 'Чужой почерк', 'entry': 'a01', 'externalExits': ['b01'],
              'sceneTitles': titles, 'scenes': scenes}
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # The manifest only maps scenes that actually exist, not planned future chapters.
    manifest_path = BASE / 'art-prompts.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest['sceneBackgrounds'] = {sid: s['bg'] for sid, s in scenes.items()}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'DRAFT ONLY: {len(scenes)} scenes, {sum(len(s["lines"]) for s in scenes.values())} lines; b01 not written')


if __name__ == '__main__':
    compile_chapter()
