#!/usr/bin/env python3
"""Read-only checks of the authored, INCOMPLETE №15 fragments.
--report writes only content-work/15/source-fragment-audit.json, never stores/.
This is deliberately not a publication gate or a complete-story/endings audit.
"""
import hashlib
import importlib.util
import json
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
BASE = TOOLS.parent / '15'


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, TOOLS / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


compiler = module('tishe_compiler', 'compile-chapter.py')
graphs = module('tishe_graphs', 'check-drafts.py')


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def validate_fragment(fragment, config, characters, manifest):
    assert fragment['story'] == config['story'] == manifest['story'] == 'tishe-snega'
    assert fragment['productionStatus'] == 'draft-fragment'
    assert fragment['chapter'] == config['chapter']
    assert fragment['entry'] == config['entry']
    assert fragment['externalExits'] == config['externalExits']
    scenes = fragment['scenes']
    assert len(scenes) == config['expectedScenes']
    assert not set(fragment['externalExits']) & scenes.keys()
    planned = {i['file']: i['type'] for i in manifest['images']}
    lines = points = paid = 0
    used = set()
    offscreen = []
    for sid, scene in scenes.items():
        assert sid.startswith(config['prefix'])
        assert planned[scene['bg']] == 'background'
        used.add(scene['bg'])
        if 'cg' in scene:
            assert planned[scene['cg']] == 'card'
            used.add(scene['cg'])
        shown = scene['show']
        assert len(shown) <= 3 and len(shown) == len(set(shown))
        assert set(shown) <= characters.keys()
        identities = {state.split('_')[0] for state in shown}
        assert len(identities) == len(shown), f'Duplicate identity on screen: {sid}'
        for state in shown:
            assert planned[characters[state]['image']] == 'character'
            used.add(characters[state]['image'])
        assert scene['lines']
        for line in scene['lines']:
            text = line['text']
            assert 0 < len(text) <= 240, (sid, len(text))
            assert not any(t in text for t in ('**', '`', '→', 'Редакторская пометка'))
            assert line['type'] in ('narration', 'dialogue', 'thought')
            if line['type'] != 'narration':
                assert line['who'] in ('heroine', 'hero', 'friend', 'director')
                if line['who'] not in identities and not scene.get('cg'):
                    offscreen.append((sid, line['who']))
            lines += 1
        # Partial chapters must not pretend to finish the novel.
        assert 'ending' not in scene and 'branch' not in scene
        assert ('choices' in scene) != ('next' in scene), sid
        if 'choices' in scene:
            points += 1
            assert len(scene['choices']) >= 2
            assert any(not c.get('crystals') and not c.get('requires') for c in scene['choices'])
            for choice in scene['choices']:
                assert 0 < len(choice['text']) <= 70, (sid, len(choice['text']))
                assert choice.get('crystals', 0) in (0, 5)
                assert choice['effect'] and set(choice['effect']) <= set(graphs.STATS)
                assert all(type(v) is int and 0 < v <= 10 for v in choice['effect'].values())
                assert not choice.get('requires'), 'No gated choice in these opening chapters'
                paid += bool(choice.get('crystals'))
    assert points == config['expectedChoices'] and paid == config['expectedPaid']
    return lines, points, paid, used, offscreen


def check_reviews(base, manifest, lock):
    reviewed = {}
    documents = [base / 'visual-review.json', *sorted(base.glob('art-review-stage*.json'))]
    anchors = list(lock['styleReferences'])
    anchors += [a for character in lock['characters'].values() for a in character['identityReferences']]
    items = anchors + [item for path in documents for item in load(path)['files']]
    for item in items:
        path = base / graphs.safe(item['file'])
        assert path.is_file(), f'Missing reviewed image: {path}'
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        assert digest == item['sha256'], f'Changed reviewed image: {path}'
        assert item['file'] not in reviewed or reviewed[item['file']] == digest
        reviewed[item['file']] = digest
    existing = {i['file'] for i in manifest['images'] if (base / graphs.safe(i['file'])).exists()}
    assert existing <= reviewed.keys(), f'Playable art lacks visual approval: {existing - reviewed.keys()}'
    return len(existing)


def assert_mandatory(scenes, entry, exit_id, required):
    """No player route may bypass these freely supplied core story actions."""
    for blocked in required:
        assert blocked in scenes
        todo = [entry]; visited = set()
        while todo:
            sid = todo.pop()
            if sid == blocked or sid in visited:
                continue
            assert sid != exit_id, f'Core action can be bypassed: {blocked}'
            visited.add(sid)
            scene = scenes[sid]
            assert not scene.get('branch') and not scene.get('ending')
            if 'choices' in scene:
                todo.extend(c['next'] for c in scene['choices'])
            else:
                todo.append(scene['next'])


def check():
    configs = load(BASE / 'chapters/config.json')
    # Completion needs its own full graph/consent/endings/length audit first.
    assert 1 <= len(configs) < 6, 'Extend to a full-story audit before completing chapter 6'
    manifest = load(BASE / 'art-prompts.json')
    assert manifest['productionStatus'] == 'draft'
    assert not (BASE / 'story.json').exists(), 'Do not publish incomplete fragments'
    assert not (BASE.parent.parent / 'stores/15').exists(), 'Incomplete story entered library'
    characters = load(BASE / 'characters.json')
    lock = load(BASE / 'design-lock.json')
    assert set(characters) == {s for c in lock['characters'].values() for s in c['states']}
    for identity, person in lock['characters'].items():
        for state in person['states']:
            assert characters[state]['name'] == person['name']
            assert characters[state]['image'] == f'images/{state}.webp'
    reviewed_art = check_reviews(BASE, manifest, lock)
    compiler.BASE = BASE  # private compiler module; the canonical №14 is never a write target
    merged = {}
    used = set()
    offscreen = []
    lines = points = paid = 0
    for index, config in enumerate(configs, 1):
        assert config['chapter'] == index and config['prefix'] == chr(96 + index)
        assert config['externalExits'] == [chr(97 + index) + '01']
        fragment = load(BASE / f'chapters/{index:02}.json')
        assert compiler.compile_one(config) == fragment, f'Uncompiled source: {index}'
        counts = validate_fragment(fragment, config, characters, manifest)
        lines += counts[0]; points += counts[1]; paid += counts[2]
        used.update(counts[3]); offscreen.extend(counts[4])
        assert not merged.keys() & fragment['scenes'].keys()
        merged.update(fragment['scenes'])
    assert manifest['sceneBackgrounds'] == {sid: scene['bg'] for sid, scene in merged.items()}
    bindings = {image['file']: image['scene'] for image in manifest['images'] if 'scene' in image}
    assert bindings == {s['cg']: sid for sid, s in merged.items() if 'cg' in s}
    # Artyom is deliberately offscreen in these two porch/exit alternatives:
    # his outdoor portrait carries a camera, which he leaves inside in a16d.
    assert set(offscreen) == {('a16d', 'hero'), ('a16r', 'hero')}, offscreen
    core = ['a13', 'b04']
    if len(configs) >= 3: core += ['c01', 'c03', 'c06', 'c11']
    if len(configs) >= 4: core += ['d02', 'd04', 'd09', 'd11', 'd15']
    assert_mandatory(merged, configs[0]['entry'], configs[-1]['externalExits'][0], core)
    outcomes = {}
    for free in (False, True):
        result = graphs.solve_graph(merged, configs[0]['entry'], configs[-1]['externalExits'], free=free)
        routes, low, high = result['summary']
        assert set(result['terminals']) == set(configs[-1]['externalExits'])
        exit_stats = [stats for sid, stats in result['seen'] if sid in configs[-1]['externalExits']]
        ranges = {key: {'min': min(v[i] for v in exit_stats), 'max': max(v[i] for v in exit_stats)}
                  for i, key in enumerate(graphs.STATS)}
        outcomes['free' if free else 'all'] = {
            'routes': routes, 'states': result['states'], 'minWords': low, 'maxWords': high,
            'continuations': sorted(result['terminals']), 'exitStatRanges': ranges}
        print(f'{"FREE" if free else "ALL"} FRAGMENT: {routes} routes, {low}–{high} words, {result["states"]} states')
    missing = sorted(path for path in used if not (BASE / path).is_file())
    report = {
        'story': 'tishe-snega', 'productionStatus': 'incomplete-not-shippable',
        'chapters': len(configs), 'scenes': len(merged), 'lines': lines,
        'decisions': points, 'paidOptions': paid, 'outcomes': outcomes,
        'externalExits': configs[-1]['externalExits'], 'missingUsedArt': missing,
        'mandatoryCoreScenes': core, 'reviewedPlayableArt': reviewed_art,
        'offscreenSpeakers': [list(pair) for pair in sorted(set(offscreen))],
        'sceneDigest': hashlib.sha256(json.dumps(merged, ensure_ascii=False, sort_keys=True).encode()).hexdigest(),
        'limits': ['No final endings or full-story balance yet', 'No timed reading or mobile visual approval',
                   'Missing artwork is reported, never replaced with art from another story']}
    print(f'FRAGMENT_CHECK_OK: {len(merged)} scenes / {lines} lines / {points} choices / {paid} paid at 5◆')
    print('PENDING USED ART:', ', '.join(missing))
    print('NOT SHIPPABLE: chapters, art, final routes and mobile review remain unfinished')
    return report


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', action='store_true')
    args = parser.parse_args()
    result = check()
    if args.report:
        (BASE / 'source-fragment-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
