#!/usr/bin/env python3
"""Pixel-level outfit/silhouette checks for the prepared story-14 cast.
Needs Pillow + numpy. Face identity itself still needs human visual review.
This does NOT claim to recognise a character from a hash or from a face detector.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

BASE=Path(__file__).resolve().parents[1]/'14'


def check():
    report=json.loads((BASE/'sprite-audit.json').read_text(encoding='utf-8'))
    count=0
    for identity,person in report['characters'].items():
        neutral_record=person['states'][identity]
        with Image.open(BASE/neutral_record['file']) as im:
            base=np.asarray(im.convert('RGBA'))
        for name,state in person['states'].items():
            for key,digest_key in (('source','sourceSha256'),('file','sha256')):
                assert hashlib.sha256((BASE/state[key]).read_bytes()).hexdigest()==state[digest_key],f'Asset changed after audit: {name} {key}'
            with Image.open(BASE/state['file']) as im:
                assert im.size==(792,1200) and im.mode=='RGBA'
                image=np.asarray(im)
                bbox=im.getchannel('A').getbbox()
                assert bbox and bbox[1]>=16, f'Head cut at canvas edge: {name}'
            assert .15<float((image[:,:,3]>200).mean())<.95
            assert np.array_equal(base[:,:,3],image[:,:,3]), f'Changed silhouette: {name}'
            assert np.array_equal(base[600:,:,:],image[600:,:,:]), f'Changed body/outfit: {name}'
            changed=np.any(base[:,:,:3]!=image[:,:,:3],axis=2)
            yy,xx=np.where(changed)
            box=[int(xx.min()),int(yy.min()),int(xx.max())+1,int(yy.max())+1] if len(xx) else None
            assert box==state['expressionDeltaBox'],f'Change outside reviewed face edit: {name}'
            if name!=identity:
                assert box and box[3]<500, f'Invalid or absent expression change: {name}'
            assert .18<=state['faceHeightFraction']<=.24
            count+=1
        print(f'{identity}: stable alpha, pose and lower-body pixels across {len(person["states"])} states')
    assert count==13
    review=json.loads((BASE/'visual-review.json').read_text(encoding='utf-8'))
    expected={s[k] for p in report['characters'].values() for s in p['states'].values() for k in ('source','file')}
    assert {r['file'] for r in review['files']}==expected, 'Visual review does not cover this batch'
    for item in review['files']:
        assert hashlib.sha256((BASE/item['file']).read_bytes()).hexdigest()==item['sha256'], 'Image changed since visual review: '+item['file']
    print('CAST_PIXEL_CHECK_OK: 13 transparent 792x1200 sprites; head margins intact; expression edits confined to face')
    print('Visual review against cover/neutral references remains required for every new CG or portrait.')


if __name__=='__main__':
    check()
