#!/usr/bin/env python3
"""Assemble authored chapters. Default: update only the source draft/audit.
Explicit --publish writes canonical story.json only in stores/14 after complete
art, format and exact-story browser-review gates. Android CI remains separate.
"""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'14'
if not BASE.exists(): BASE=ROOT.parent/'stores/14'

def assemble():
    spec=importlib.util.spec_from_file_location('draft_checks',ROOT/'tools/check-drafts.py')
    checks=importlib.util.module_from_spec(spec);spec.loader.exec_module(checks)
    audit=checks.check()
    configs=json.loads((BASE/'chapters/config.json').read_text(encoding='utf-8'))
    scenes={}
    for config in configs:
        fragment=json.loads((BASE/f'chapters/{config["chapter"]:02}.json').read_text(encoding='utf-8'))
        assert not scenes.keys() & fragment['scenes'].keys()
        scenes.update(fragment['scenes'])
    assert len(configs)==6 and sum('ending' in s for s in scenes.values())==3
    digest=hashlib.sha256(json.dumps(scenes,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
    assert digest==audit['sceneDigest']
    # PROMPT_LONG formula, independently cross-checked against actual route
    # word counts plus decision time; neither estimate is physical-device timing.
    minutes=round(audit['lines']/7.5)
    assert 60<=minutes<=120
    story={
        'id':'pereplyot','title':'Переплёт',
        'description':'Реставратор Ася и переводчик Лев исследуют старый альбом. За красивой версией чужой любви обнаруживается другая история — совместной работы и права на тишину. Теперь им предстоит научиться слышать друг друга без готовых ответов.',
        'genre':'Романтика · Драма','tags':['Книги','Доверие','Тайна прошлого','Выбор себя'],
        'format':'long','estimatedMinutes':minutes,
        'cover':'cover.jpg','coverGradient':['#E9DFCE','#796C5E'],'coverSymbol':'❦',
        'start':'a01',
        'stats':{'desire':{'label':'Желание','icon':'♡'},'trust':{'label':'Доверие','icon':'◌'},'resolve':{'label':'Решимость','icon':'✦'}},
        'characters':json.loads((BASE/'characters.json').read_text(encoding='utf-8')),
        'scenes':scenes}
    (BASE/'story.draft.json').write_text(json.dumps(story,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    audit['estimatedMinutes']=minutes
    audit['timingMethod']='PROMPT_LONG: round(lines / 7.5); cross-check: route words / 170 + decisions * 0.4; not device-timed'
    audit['wordBasedMinutes']={key:round(audit['outcomes']['all'][word]/170+audit['decisions']*.4,1) for key,word in [('min','minWords'),('max','maxWords')]}
    assert 60<=audit['wordBasedMinutes']['min']<=audit['wordBasedMinutes']['max']<=120
    (BASE/'route-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    if '--publish' in sys.argv:
        assert BASE.parent.name=='stores' and not audit['missingArt'] and audit['longFormatLineRange']['matches']
        review=json.loads((BASE/'mobile-review.json').read_text())
        assert hashlib.sha256((BASE/'story.draft.json').read_bytes()).hexdigest()==review['storySha256'], 'Mobile review story is stale'
        assert len(review['results'])==10 and all(not r['failures'] and not r['errors'] for r in review['results'])
        for file,digest in review['codeSha256'].items():
            assert hashlib.sha256((ROOT.parent/file).read_bytes()).hexdigest()==digest, 'Mobile review is stale: '+file
        (BASE/'story.json').write_text(json.dumps(story,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        manifest=json.loads((BASE/'art-prompts.json').read_text());manifest['productionStatus']='ready'
        (BASE/'art-prompts.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print('CANONICAL_STORY_WRITTEN: stores/14/story.json; library build and Android CI still required')
    print(f'COMPLETE TEXT ASSEMBLED: 168 scenes, 3 authored endings, estimated {minutes} min. source assembly; missing art: {len(audit["missingArt"])}')

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description='Assemble only №14; №15 has no publication gate yet.')
    parser.add_argument('--publish',action='store_true')
    parser.parse_args()  # reject --story 15 BEFORE touching any canonical file
    assemble()
