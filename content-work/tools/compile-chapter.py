#!/usr/bin/env python3
"""Compile authored Markdown into source scene fragments (staged or canonical).
Run from any cwd: python3 content-work/tools/compile-chapter.py
No plot, transition or ending is invented here. Presentation is declared in
chapters/config.json. This updates source JSON/manifest, never runtime story.json.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / '14'
if not BASE.exists(): BASE = ROOT.parent / 'stores/14'
SPEAKERS = {'Ася': 'heroine', 'Ася, сообщение': 'heroine', 'Лев': 'hero', 'Валентина': 'director',
            'Рита': 'friend', 'Рита, сообщение': 'friend', 'Лев, сообщение': 'hero'}
STATS = {'desire', 'trust', 'resolve'}


def chunks(text, limit=240):
    """Prefer sentence boundaries; never cut a word or inflate short sentences."""
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


def compile_one(config):
    number = config['chapter']
    source = (BASE / f'chapters/{number:02}.md').read_text(encoding='utf-8')
    sections = list(re.finditer(r'^## ([a-f]\d{2}[a-z]?) · (.+)$', source, re.M))
    scenes, titles = {}, {}
    for i, heading in enumerate(sections):
        sid, title = heading.groups()
        if sid in scenes or not sid.startswith(config['prefix']):
            raise ValueError(f'Duplicate or wrong chapter scene: {sid}')
        body = source[heading.end():sections[i + 1].start() if i + 1 < len(sections) else len(source)].strip()
        presentation = {'bg': config['defaultBg'], 'show': config['defaultShow']}
        presentation.update(config['overrides'].get(sid[:3], {}))
        presentation.update(config['overrides'].get(sid, {}))
        scene = {**presentation, 'bgGradient': ['#E9DFCE', '#796C5E'], 'lines': []}
        terminals = re.findall(r'^Финал: `([^`]+)`\.$', body, re.M)
        routes = re.findall(r'^Развилка: `([^`]+)`\.$', body, re.M)
        if len(terminals) > 1 or len(routes) > 1 or (terminals and routes):
            raise ValueError(f'Ambiguous terminal/branch: {sid}')
        if terminals:
            ending = json.loads(terminals[0])
            if set(ending) != {'title', 'text', 'badge'} or not all(isinstance(v,str) and v.strip() for v in ending.values()):
                raise ValueError(f'Invalid authored ending: {sid}')
            scene['ending'] = ending
        if routes:
            route = json.loads(routes[0])
            if set(route) != {'branch','next'} or not route['branch']:
                raise ValueError(f'Invalid authored branch: {sid}')
            scene.update(route)
        explicit_bg = re.findall(r'Фон: `(images/[^`]+)`', body)
        if explicit_bg and explicit_bg != [scene['bg']]:
            raise ValueError(f'Prose/presentation background mismatch: {sid}')
        choices = []
        targets = re.findall(r'Переход: `([a-z0-9]+)`', body)
        external = re.findall(r'Следующий узел: `([a-z0-9]+)`', body)
        if len(targets) + len(external) > 1:
            raise ValueError(f'Multiple exits: {sid}')
        if (targets or external) and (routes or terminals):
            raise ValueError(f'Multiple authored transitions: {sid}')
        if targets or external:
            scene['next'] = (targets + external)[0]
        for paragraph in re.split(r'\n\s*\n', body):
            paragraph = paragraph.strip()
            if paragraph.startswith(('Переход:', 'Иллюстрация:', 'Фон:', 'Финал:', 'Развилка:', '**Конец первой главы.**')):
                continue
            if paragraph.startswith('**Выбор'):
                for line in paragraph.splitlines()[1:]:
                    m = re.fullmatch(r'- «(.+)»\.? (Бесплатно|5◆); (.+); → `([a-z0-9]+)`\.', line)
                    if not m:
                        raise ValueError(f'Invalid choice notation in {sid}: {line}')
                    label, cost, effects, target = m.groups()
                    pairs = re.findall(r'`([a-z]+) \+(\d+)`', effects)
                    if not pairs or any(k not in STATS for k, _ in pairs) or len({k for k,_ in pairs})!=len(pairs):
                        raise ValueError(f'Invalid effects: {sid}')
                    if re.sub(r'`[a-z]+ \+\d+`', '', effects).strip(' ,'):
                        raise ValueError(f'Unparsed effect notation: {sid}')
                    option = {'text': label, 'next': target, 'effect': {k: int(v) for k, v in pairs}}
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
            if any(k in scene for k in ('next','branch','ending')):
                raise ValueError(f'Choice plus next: {sid}')
            scene['choices'] = choices
        if not scene['lines'] or not (choices or 'next' in scene or 'ending' in scene):
            raise ValueError(f'Empty or dead-end scene: {sid}')
        cg = re.findall(r'Иллюстрация: `(images/[^`]+)`', body)
        if cg:
            if len(cg) != 1:
                raise ValueError(f'Multiple CG: {sid}')
            scene['cg'] = cg[0]
        scenes[sid], titles[sid] = scene, title
    if len(scenes) != config['expectedScenes']:
        raise ValueError(f'Chapter {number}: unexpected scene count {len(scenes)}')
    if set(config['overrides']) - scenes.keys():
        raise ValueError(f'Unused presentation declarations: {set(config["overrides"]) - scenes.keys()}')
    return {'productionStatus': 'draft-fragment', 'story': 'pereplyot', 'chapter': number,
            'title': config['title'], 'entry': config['entry'], 'externalExits': config['externalExits'],
            'sceneTitles': titles, 'scenes': scenes}


def compile_chapter():
    configs = json.loads((BASE/'chapters/config.json').read_text(encoding='utf-8'))
    results = [compile_one(config) for config in configs]  # fail before replacing any output
    merged = {}
    for result in results:
        if merged.keys() & result['scenes'].keys():
            raise ValueError('Duplicate scene IDs across chapters')
        merged.update(result['scenes'])
    for result in results:
        path = BASE/f'chapters/{result["chapter"]:02}.json'
        path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(f'DRAFT chapter {result["chapter"]}: {len(result["scenes"])} scenes, '
              f'{sum(len(s["lines"]) for s in result["scenes"].values())} lines')
    manifest_path=BASE/'art-prompts.json'
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest['sceneBackgrounds']={sid:s['bg'] for sid,s in merged.items()}
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('SOURCE_COMPILED: authored endings retained; runtime story.json is not overwritten')


if __name__=='__main__':
    compile_chapter()
