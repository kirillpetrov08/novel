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
    for filename in ('visual-review.json', 'art-review-stage4.json'):
        review = load(BASE / filename)
        for item in review['files']:
            assert hashlib.sha256((BASE / graphs.safe(item['file'])).read_bytes()).hexdigest() == item['sha256']
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
    outcomes = {}
    for free in (False, True):
        result = graphs.solve_graph(merged, configs[0]['entry'], configs[-1]['externalExits'], free=free)
        routes, low, high = result['summary']
        assert set(result['terminals']) == set(configs[-1]['externalExits'])
        outcomes['free' if free else 'all'] = {
            'routes': routes, 'states': result['states'], 'minWords': low, 'maxWords': high,
            'continuations': sorted(result['terminals'])}
        print(f'{"FREE" if free else "ALL"} FRAGMENT: {routes} routes, {low}–{high} words, {result["states"]} states')
    missing = sorted(path for path in used if not (BASE / path).is_file())
    report = {
        'story': 'tishe-snega', 'productionStatus': 'incomplete-not-shippable',
        'chapters': len(configs), 'scenes': len(merged), 'lines': lines,
        'decisions': points, 'paidOptions': paid, 'outcomes': outcomes,
        'externalExits': configs[-1]['externalExits'], 'missingUsedArt': missing,
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
