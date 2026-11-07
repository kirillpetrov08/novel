#!/usr/bin/env python3
"""Validate staged assets and the chapter fragment; never claim a complete story.
Run: python3 content-work/tools/compile-chapter.py && python3 content-work/tools/check-drafts.py
Missing PLANNED art and explicitly declared exits to unwritten chapters are reported,
not silently replaced with existing story art or treated as a shippable story.
"""
import hashlib
import json
import re
from collections import Counter
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]


def check():
    total = 0
    hashes = {}
    for number in (14, 15, 16):
        base = ROOT / str(number)
        manifest = json.loads((base / 'art-prompts.json').read_text(encoding='utf-8'))
        assert manifest['productionStatus'] == 'draft'
        images = manifest['images']
        assert Counter(x['type'] for x in images) == {'cover': 1, 'background': 7, 'character': 12, 'card': 16}
        paths = [i['file'] for i in images]
        assert len(set(paths)) == 36, f'{number}: duplicate planned asset'
        expected = set(paths)
        actual = {str(p.relative_to(base)) for p in base.rglob('*') if p.suffix in ('.jpg', '.png', '.webp')}
        assert actual <= expected, f'{number}: unplanned images {actual - expected}'
        for image in images:
            p = PurePosixPath(image['file'])
            assert not p.is_absolute() and '..' not in p.parts and '\\' not in str(p)
            assert len(image['prompt']) > 250
            file = base / p
            if file.exists():
                raw = file.read_bytes()
                assert len(raw) > 1000, f'{file}: empty image'
                assert raw.startswith(b'\xff\xd8\xff') if file.suffix == '.jpg' else raw.startswith(b'\x89PNG\r\n\x1a\n')
                digest = hashlib.sha256(raw).hexdigest()
                assert digest not in hashes, f'{file}: duplicate of {hashes.get(digest)}'
                hashes[digest] = file
        total += len(actual)
        print(f'#{number}: generated files {len(actual)}/36; still planned {36 - len(actual)}')

    base = ROOT / '14'
    fragment = json.loads((base / 'chapters/01.json').read_text(encoding='utf-8'))
    assert fragment['productionStatus'] == 'draft-fragment'
    scenes = fragment['scenes']
    exits = set(fragment['externalExits'])
    assert exits == {'b01'}, 'Only the explicit chapter-two continuation may be missing'
    assert not exits & scenes.keys()
    manifest = json.loads((base / 'art-prompts.json').read_text(encoding='utf-8'))
    expected = {i['file'] for i in manifest['images']}
    assert manifest['sceneBackgrounds'] == {sid: s['bg'] for sid, s in scenes.items()}
    for entry in manifest['images']:
        if 'scene' in entry:
            assert entry['type'] == 'card'
            assert scenes[entry['scene']]['cg'] == entry['file']
    paid = points = lines = 0
    for sid, s in scenes.items():
        assert s['bg'] in expected
        if 'cg' in s:
            assert s['cg'] in expected and (base / s['cg']).is_file()
        assert 0 < len(s['show']) <= 3
        assert set(s['show']) <= {'heroine', 'hero', 'friend', 'director'}
        assert s['lines']
        for line in s['lines']:
            text = line['text']
            assert 0 < len(text) <= 240, (sid, len(text))
            assert not any(x in text for x in ('**', '`', '→', 'Редакторская пометка'))
            assert line['type'] in ('narration', 'dialogue', 'thought', 'system')
            if 'who' in line:
                assert line['who'] in {'heroine', 'hero', 'friend', 'director'}
            lines += 1
        assert ('choices' in s) != ('next' in s), sid
        if 'choices' in s:
            points += 1
            assert len(s['choices']) >= 2
            assert any(not c.get('crystals') and not c.get('requires') for c in s['choices'])
            for c in s['choices']:
                assert c.get('crystals', 0) in (0, 5)
                paid += bool(c.get('crystals'))
                assert set(c.get('effect', {})) <= {'desire', 'trust', 'resolve'}
                assert len(c['text']) <= 70

    def walk(sid, trail, stats, free):
        if sid in exits:
            return [(0, stats)]
        assert sid in scenes, f'Undeclared missing target {sid}'
        assert sid not in trail, f'Cycle through {sid}'
        visited.add(sid)
        s = scenes[sid]
        words = sum(len(re.findall(r'[А-Яа-яЁёA-Za-z0-9]+', l['text'])) for l in s['lines'])
        options = s.get('choices', [{'next': s.get('next')}])
        result = []
        for c in options:
            if free and c.get('crystals'):
                continue
            effect = c.get('effect', {})
            next_stats = tuple(v + effect.get(k, 0) for v, k in zip(stats, ('desire', 'trust', 'resolve')))
            for count, end_stats in walk(c['next'], trail | {sid}, next_stats, free):
                result.append((words + count, end_stats))
        assert result, f'No route from {sid}'
        return result

    for free in (False, True):
        visited = set()
        routes = walk(fragment['entry'], set(), (0, 0, 0), free)
        if not free:
            assert visited == set(scenes), f'Unreachable scenes: {scenes.keys() - visited}'
        counts = [x[0] for x in routes]
        print(f'Chapter 1 {"free" if free else "all"} routes: {len(routes)}, {min(counts)}–{max(counts)} words/route; all reach b01')
    assert points == 5 and paid == 2
    assert len(scenes) == 28
    print(f'Chapter 1: {len(scenes)} scenes, {lines} lines, {points} choices, {paid} paid options at 5 crystals')
    print(f'DRAFT_CHECK_OK: {total}/108 images. NOT a complete story: chapters 2–6, all endings and remaining art are pending.')


if __name__ == '__main__':
    check()
