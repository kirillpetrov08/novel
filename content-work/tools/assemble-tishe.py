#!/usr/bin/env python3
"""Assemble ONLY staged №15 into story.draft.json; never publish or touch stores/.
A complete graph/consent/length/art audit is required before writing the draft.
Publishing into stores/ or the app requires a separate explicit decision.
"""
import argparse
import importlib.util
import json
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
BASE = TOOLS.parent / '15'
spec = importlib.util.spec_from_file_location('tishe_assembly_checks', TOOLS / 'check-tishe.py')
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


def assemble():
    assert BASE == checks.BASE and BASE.parent.name == 'content-work'
    audit = checks.check()
    assert audit['chapters'] == 6 and audit['scenes'] == 168
    assert audit['productionStatus'] == 'text-complete-not-shippable'
    metadata = checks.load(BASE / 'metadata.json')
    assert metadata['id'] == 'tishe-snega' and metadata['start'] == 'a01'
    assert metadata['format'] == 'long' and set(metadata['stats']) == set(checks.graphs.STATS)
    assert not {'author', 'subtitle'} & metadata.keys()
    scenes = {}
    for config in checks.load(BASE / 'chapters/config.json'):
        fragment = checks.load(BASE / f'chapters/{config["chapter"]:02}.json')
        assert not scenes.keys() & fragment['scenes'].keys()
        scenes.update(fragment['scenes'])
    story = {**metadata, 'estimatedMinutes': audit['estimatedMinutes'],
             'characters': checks.load(BASE / 'characters.json'), 'scenes': scenes}
    # All checks complete before either source output is replaced.
    (BASE / 'story.draft.json').write_text(json.dumps(story, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (BASE / 'route-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'STAGED_SOURCE_ONLY: {len(scenes)} scenes; {audit["lines"]} lines; {audit["estimatedMinutes"]} estimated minutes; '
          f'{len(audit["missingUsedArt"])} pending artworks. NO runtime story.json or library entry written.')
    return story


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    assemble()
