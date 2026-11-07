#!/usr/bin/env python3
"""Check staged assets, frozen identity references and connected chapter graphs.
Missing planned images are explicitly reported; this is NOT a release validator.
A draft cannot be shipped until the ordinary stores/ build passes with all files.
"""
import hashlib
import json
import re
from collections import Counter, deque
from functools import lru_cache
from pathlib import Path, PurePosixPath

ROOT=Path(__file__).resolve().parents[1]
STATS=('desire','trust','resolve')


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def safe(path):
    p=PurePosixPath(path)
    assert not p.is_absolute() and '..' not in p.parts and '\\' not in path and ':' not in path, path
    return p


def check_graph(scenes, entry, exits, free=False):
    visited=set()
    # Separate cycle detection allows memoising route counts by scene only.
    marks={}
    def acyclic(sid):
        if sid in exits:return
        assert sid in scenes, f'Undeclared missing target: {sid}'
        assert marks.get(sid)!=1, f'Cycle: {sid}'
        if marks.get(sid)==2:return
        marks[sid]=1
        for c in scenes[sid].get('choices',[{'next':scenes[sid].get('next')}]):acyclic(c['next'])
        marks[sid]=2
    acyclic(entry)
    @lru_cache(None)
    def totals(sid):
        if sid in exits:return (1,0,0)
        visited.add(sid)
        s=scenes[sid]
        words=sum(len(re.findall(r'[А-Яа-яЁёA-Za-z0-9]+',l['text'])) for l in s['lines'])
        outcomes=[]
        for c in s.get('choices',[{'next':s.get('next')}]):
            assert not c.get('requires'), 'Unsupported conditional choice in draft route totals'
            if free and c.get('crystals'):continue
            outcomes.append(totals(c['next']))
        assert outcomes, f'No available continuation: {sid}'
        return sum(x[0] for x in outcomes),words+min(x[1] for x in outcomes),words+max(x[2] for x in outcomes)
    result=totals(entry)
    if not free:assert visited==set(scenes), f'Unreachable: {scenes.keys()-visited}'
    # Independently traverse exact stat states, not merely graph connectivity.
    queue=deque([(entry,(0,0,0))]);seen=set();terminal=set()
    while queue:
        sid,stats=queue.popleft()
        if (sid,stats) in seen:continue
        seen.add((sid,stats))
        if sid in exits:
            terminal.add((sid,stats));continue
        for c in scenes[sid].get('choices',[{'next':scenes[sid].get('next')}]):
            if free and c.get('crystals'):continue
            effect=c.get('effect',{})
            queue.append((c['next'],tuple(v+effect.get(k,0) for k,v in zip(STATS,stats))))
    assert terminal and {s for s,_ in terminal}==set(exits)
    return result,len(seen),seen


def check():
    total=planned=0;hashes={}
    for number in (14,15,16):
        base=ROOT/str(number);manifest=load(base/'art-prompts.json');images=manifest['images']
        assert manifest['productionStatus']=='draft'
        assert Counter(i['type'] for i in images)=={'cover':1,'background':7,'character':13 if number==14 else 12,'card':16}
        files=[i['file'] for i in images];expected=set(files)
        assert len(files)==len(expected)
        actual={str(p.relative_to(base)) for p in (base/'images').glob('*') if p.suffix in ('.jpg','.png','.webp')}
        if (base/'cover.jpg').exists():actual.add('cover.jpg')
        assert actual<=expected, f'Unplanned playable art: {actual-expected}'
        for image in images:
            file=base/safe(image['file']);assert len(image['prompt'])>250
            if 'source' in image:
                source=base/safe(image['source'])
                if file.exists():assert source.is_file(), f'Missing raw source: {source}'
            if file.exists():
                raw=file.read_bytes();assert len(raw)>1000
                signatures={'.jpg':raw.startswith(b'\xff\xd8\xff'),'.png':raw.startswith(b'\x89PNG\r\n\x1a\n'),'.webp':raw[:4]==b'RIFF' and raw[8:12]==b'WEBP'}
                assert signatures[file.suffix], f'Invalid image header: {file}'
                digest=hashlib.sha256(raw).hexdigest()
                assert digest not in hashes,f'Duplicate artwork: {file}, {hashes.get(digest)}'
                hashes[digest]=file
        lock=load(base/'design-lock.json')
        assert lock['story']==manifest['story']
        anchors=lock['styleReferences']+[a for c in lock['characters'].values() for a in c['identityReferences']]
        for anchor in anchors:
            assert hashlib.sha256((base/safe(anchor['file'])).read_bytes()).hexdigest()==anchor['sha256'],f'Frozen identity reference changed: {anchor["file"]}'
        for identity,char in lock['characters'].items():
            expected_states={Path(i['file']).stem for i in images if i['type']=='character' and Path(i['file']).stem.split('_')[0]==identity}
            assert set(char['states'])==expected_states
        total+=len(actual);planned+=len(files)
        print(f'#{number}: playable artwork files {len(actual)}/{len(files)}; raw reference files not counted twice')

    base=ROOT/'14';configs=load(base/'chapters/config.json');characters=load(base/'characters.json')
    manifest=load(base/'art-prompts.json');expected={i['file'] for i in manifest['images']}
    merged={};used=set();total_lines=total_points=total_paid=0
    for config in configs:
        fragment=load(base/f'chapters/{config["chapter"]:02}.json')
        assert fragment['productionStatus']=='draft-fragment'
        scenes=fragment['scenes'];exits=set(fragment['externalExits'])
        assert not exits & scenes.keys()
        assert len(scenes)==config['expectedScenes']
        points=paid=lines=0
        for sid,s in scenes.items():
            assert s['bg'] in expected;used.add(s['bg'])
            if 'cg' in s:assert s['cg'] in expected;used.add(s['cg'])
            assert 0<=len(s['show'])<=3 and set(s['show'])<=characters.keys()
            for key in s['show']:
                assert characters[key]['image'] in expected;used.add(characters[key]['image'])
            assert s['lines']
            for line in s['lines']:
                text=line['text'];assert 0<len(text)<=240,(sid,len(text))
                assert not any(x in text for x in ('**','`','→','Редакторская пометка'))
                assert line['type'] in ('narration','dialogue','thought','system')
                if 'who' in line:assert line['who'] in characters
                lines+=1
            assert ('choices' in s)!=('next' in s)
            if 'choices' in s:
                points+=1;assert len(s['choices'])>=2
                assert any(not c.get('crystals') and not c.get('requires') for c in s['choices'])
                for c in s['choices']:
                    assert c.get('crystals',0) in (0,5);paid+=bool(c.get('crystals'))
                    assert set(c.get('effect',{}))<=set(STATS)
                    assert all(type(v) is int and abs(v)<=10 for v in c.get('effect',{}).values())
                    assert len(c['text'])<=70
        assert points==config['expectedChoices'] and paid==config['expectedPaid']
        for free in (False,True):
            result,states,_=check_graph(scenes,fragment['entry'],exits,free)
            print(f'Chapter {config["chapter"]} {"free" if free else "all"}: {result[0]} routes, {result[1]}–{result[2]} words/route, {states} exact states')
        assert not merged.keys() & scenes.keys();merged.update(scenes)
        total_lines+=lines;total_points+=points;total_paid+=paid
    assert manifest['sceneBackgrounds']=={sid:s['bg'] for sid,s in merged.items()}
    for image in manifest['images']:
        if 'scene' in image:assert merged[image['scene']]['cg']==image['file']
    for free in (False,True):
        result,states,reached=check_graph(merged,configs[0]['entry'],set(configs[-1]['externalExits']),free)
        print(f'Connected draft {"free" if free else "all"}: {result[0]} routes, {result[1]}–{result[2]} words, {states} exact states')
        if free:
            assert any(sid=='c10t' for sid,_ in reached),'First kiss must remain entirely free'
            assert any(sid=='c10r' for sid,_ in reached),'Refusal must remain free too'
    missing=sorted(p for p in used if not (base/p).exists())
    print(f'PENDING USED ART ({len(missing)}): '+', '.join(missing))
    print(f'DRAFT_CHECK_OK: {len(merged)} scenes, {total_lines} lines, {total_points} decisions, {total_paid} paid options at 5 crystals; {total}/{planned} artworks')
    print('NOT SHIPPABLE: missing art, chapters 4–6 and all endings remain pending; stories 15/16 have plans and covers only.')


if __name__=='__main__':
    check()
