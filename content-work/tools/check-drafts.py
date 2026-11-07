#!/usr/bin/env python3
"""Check staged assets, frozen identity references and connected chapter graphs.
Missing planned images are explicitly reported; this is NOT a release validator.
A draft cannot be shipped until the ordinary stores/ build passes with all files.
"""
import hashlib
import json
import re
from collections import Counter
from pathlib import Path, PurePosixPath

ROOT=Path(__file__).resolve().parents[1]
STATS=('desire','trust','resolve')

def story_base(number):
    staged=ROOT/str(number)
    return staged if staged.exists() else ROOT.parent/'stores'/str(number)


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def safe(path):
    p=PurePosixPath(path)
    assert not p.is_absolute() and '..' not in p.parts and '\\' not in path and ':' not in path, path
    return p


def solve_graph(scenes, entry, exits=(), free=False, require_all=True):
    """Exact DAG dynamic program: aggregate equal (scene, stats) states.
    Route counts remain exact even when billions of choice sequences merge.
    Branches use engine order: first matching condition, then next fallback.
    """
    exits=set(exits);marks={};post=[]
    def structural_edges(scene):
        if 'ending' in scene:return []
        if 'choices' in scene:return [c['next'] for c in scene['choices']]
        return [r['to'] for r in scene.get('branch',[])]+[scene['next']]
    def order(sid):
        if sid in exits:return
        assert sid in scenes, f'Undeclared missing target: {sid}'
        assert marks.get(sid)!=1, f'Cycle: {sid}'
        if marks.get(sid)==2:return
        marks[sid]=1
        for target in structural_edges(scenes[sid]):order(target)
        marks[sid]=2;post.append(sid)
    order(entry)
    assert set(marks)==set(scenes), f'Structurally unreachable: {scenes.keys()-marks.keys()}'
    pending={entry:{(0,0,0):(1,0,0)}};seen=set();terminal={};reached=set()
    for sid in list(reversed(post))+sorted(exits):
        incoming=pending.pop(sid,{})
        if not incoming:continue
        s=scenes.get(sid);reached.add(sid)
        words=0 if s is None else sum(len(re.findall(r'[А-Яа-яЁёA-Za-z0-9]+',l['text'])) for l in s['lines'])
        for stats,(count,lo,hi) in incoming.items():
            seen.add((sid,stats));lo+=words;hi+=words
            if sid in exits or 'ending' in s:
                old=terminal.get(sid)
                terminal[sid]=(count+(old[0] if old else 0),min(lo,old[1]) if old else lo,max(hi,old[2]) if old else hi)
                continue
            values=dict(zip(STATS,stats))
            if 'choices' in s:
                options=[c for c in s['choices'] if not (free and c.get('crystals'))
                         and all(values[k]>=v for k,v in c.get('requires',{}).items())]
            else:
                target=s['next']
                for branch in s.get('branch',[]):
                    cond=branch['if'];assert set(cond)=={'stat','gte'} and cond['stat'] in values
                    if values[cond['stat']]>=cond['gte']:
                        target=branch['to'];break
                options=[{'next':target}]
            assert options, f'No available continuation: {sid}'
            for option in options:
                effect=option.get('effect',{})
                updated=tuple(v+effect.get(k,0) for k,v in zip(STATS,stats))
                dest=pending.setdefault(option['next'],{});old=dest.get(updated)
                dest[updated]=(count+(old[0] if old else 0),min(lo,old[1]) if old else lo,max(hi,old[2]) if old else hi)
    assert not pending, 'Unprocessed transitions'
    assert terminal, 'No terminal reached'
    if require_all and not free:assert set(scenes)<=reached, f'Unreachable with actual stats: {set(scenes)-reached}'
    result=(sum(v[0] for v in terminal.values()),min(v[1] for v in terminal.values()),max(v[2] for v in terminal.values()))
    return {'summary':result,'states':len(seen),'seen':seen,'terminals':terminal}


def check_graph(scenes, entry, exits, free=False):
    result=solve_graph(scenes,entry,exits,free)
    return result['summary'],result['states'],result['seen']


def check():
    total=planned=0;hashes={}
    for number in (14,15,16):
        base=story_base(number);manifest=load(base/'art-prompts.json');images=manifest['images']
        assert manifest['productionStatus'] in (('draft','ready') if number==14 else ('draft',))
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

    base=story_base(14);configs=load(base/'chapters/config.json');characters=load(base/'characters.json')
    manifest=load(base/'art-prompts.json');expected={i['file'] for i in manifest['images']}
    for stage,count in [(3,7),(4,9)]:
        review=load(base/f'art-review-stage{stage}.json')
        assert len(review['files'])==count
        for item in review['files']:
            assert hashlib.sha256((base/safe(item['file'])).read_bytes()).hexdigest()==item['sha256'], f'Artwork changed since visual review: {item["file"]}'
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
            assert sum(bool(s.get(k)) for k in ('choices','ending')) + int('next' in s) == 1
            if 'branch' in s:assert 'next' in s and s['branch']
            if 'choices' in s:
                points+=1;assert len(s['choices'])>=2
                assert any(not c.get('crystals') and not c.get('requires') for c in s['choices'])
                for c in s['choices']:
                    assert c.get('crystals',0) in (0,5);paid+=bool(c.get('crystals'))
                    assert set(c.get('effect',{}))<=set(STATS)
                    assert all(type(v) is int and abs(v)<=10 for v in c.get('effect',{}).values())
                    assert len(c['text'])<=70
        assert points==config['expectedChoices'] and paid==config['expectedPaid']
        for free in ((False,True) if exits else ()):
            result,states,_=check_graph(scenes,fragment['entry'],exits,free)
            print(f'Chapter {config["chapter"]} {"free" if free else "all"}: {result[0]} routes, {result[1]}–{result[2]} words/route, {states} exact states')
        assert not merged.keys() & scenes.keys();merged.update(scenes)
        total_lines+=lines;total_points+=points;total_paid+=paid
    assert manifest['sceneBackgrounds']=={sid:s['bg'] for sid,s in merged.items()}
    for image in manifest['images']:
        if 'scene' in image:assert merged[image['scene']]['cg']==image['file']
    assert len(configs)==6 and len(merged)==168
    assert total_points==34 and total_paid==12
    outcomes={}
    expected_endings={'f14t','f14d','f14r'}
    for free in (False,True):
        result=solve_graph(merged,configs[0]['entry'],set(configs[-1]['externalExits']),free)
        summary=result['summary'];reached=result['seen']
        print(f'Complete text {"free" if free else "all"}: {summary[0]} routes, {summary[1]}–{summary[2]} words, {result["states"]} exact states')
        print('Endings:',result['terminals'])
        outcomes['free' if free else 'all']={'routes':summary[0],'minWords':summary[1],'maxWords':summary[2],
            'states':result['states'],'endings':{k:{'routes':v[0],'minWords':v[1],'maxWords':v[2]} for k,v in result['terminals'].items()}}
        if free:
            assert set(result['terminals'])=={'f14t','f14r'}
            assert any(sid=='c10t' for sid,_ in reached) and any(sid=='c10r' for sid,_ in reached)
            maximum=max(stats[0] for sid,stats in reached if sid=='f11')
            assert merged['f11']['branch'][0]['if']['gte']==maximum+1
            outcomes['maxFreeDesireAtFinalBranch']=maximum
        else:
            assert set(result['terminals'])==expected_endings
            assert any(sid=='f10r' and stats[0]>=4 for sid,stats in reached)
    # Explicit refusal has a stat-independent path to independence: paid
    # affection must never override the player's final decision not to be a pair.
    sid='f10r';refusal_path=[]
    while 'ending' not in merged[sid]:
        refusal_path.append(sid);assert not any(k in merged[sid] for k in ('branch','choices'))
        sid=merged[sid]['next']
    assert sid=='f14r'
    missing=sorted(p for p in used if not (base/p).exists())
    print(f'PENDING USED ART ({len(missing)}): '+', '.join(missing))
    print(f'COMPLETE_TEXT_CHECK_OK: {len(merged)} scenes, {total_lines} lines, {total_points} decisions, {total_paid} paid options; {total}/{planned} artworks')
    line_range_ok=480<=total_lines<=560
    print(f'LONG FORMAT LINE RANGE: {total_lines}/480–560; '+('OK' if line_range_ok else 'EDITORIAL REVISION REQUIRED before publication'))
    print('TEXT_AND_ART_CHECKS_OK; mobile review and explicit publication are separate.' if not missing and line_range_ok else 'NOT SHIPPABLE: pending art or editorial work.')
    return {'longFormatLineRange':{'min':480,'max':560,'actual':total_lines,'matches':line_range_ok},'story':'pereplyot','sceneDigest':hashlib.sha256(json.dumps(merged,ensure_ascii=False,sort_keys=True).encode()).hexdigest(),
            'scenes':len(merged),'lines':total_lines,'decisions':total_points,'paidOptions':total_paid,
            'outcomes':outcomes,'explicitRefusalPath':refusal_path+[sid],'missingArt':missing,
            'completedArt':total,'plannedArt':planned}


if __name__=='__main__':
    import sys
    report=check()
    if '--report' in sys.argv:
        (story_base(14)/'route-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
