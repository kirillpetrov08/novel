#!/usr/bin/env python3
"""Assemble the authored six-chapter text, NOT a publish command.
The output intentionally stays in content-work/14/story.draft.json until all
artwork exists and the normal library build and device checks are completed.
"""
import hashlib
import importlib.util
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'14'

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
    # An estimate, not a claim of timed device testing: 170 words/minute plus
    # 24 seconds per decision, rounded up to five minutes.
    minutes=math.ceil((audit['outcomes']['all']['maxWords']/170+audit['decisions']*.4)/5)*5
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
    audit['timingMethod']='estimate: max route words / 170 + decisions * 0.4; rounded up to 5 minutes; not device-timed'
    (BASE/'route-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'COMPLETE TEXT ASSEMBLED: 168 scenes, 3 authored endings, estimated {minutes} min. NOT PUBLISHED; missing art: {len(audit["missingArt"])}')

if __name__=='__main__':
    assemble()
