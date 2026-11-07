#!/usr/bin/env python3
"""Prepare explicitly selected story sprites without allowing expression edits to redraw outfits.
Dependencies: Pillow, numpy, opencv-python-headless, mediapipe==0.10.21.
Declared neutral/outfit sources are segmented. Expressions are face-interior edits
composited onto their neutral source; silhouette, hair outline, body, clothes,
alpha and the normalisation transform remain identical within each identity/outfit group.
Original model outputs stay in references/ for audit and later art direction.
"""
import hashlib
import importlib.util
import json
import tempfile
from pathlib import Path

from review_lock import load_frozen, replace_unfrozen

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'content-work/14'
if not BASE.exists(): BASE = ROOT / 'stores/14'
spec = importlib.util.spec_from_file_location('sprite_tools', ROOT / 'tools/make-character-sprites.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare():
    frozen=load_frozen(BASE)  # fail before any writes if an accepted file changed
    lock=json.loads((BASE/'design-lock.json').read_text())
    groups=lock.get('portraitGroups')
    report = {'story': lock['story'], 'method': 'neutral silhouette + generated facial expression only',
              'canvas': [792, 1200], 'targetFaceFraction': 0.21, 'characters': {}}
    original_detector = mod._face_box
    for identity in (groups or ('heroine', 'hero', 'friend', 'director', 'heroine_casual')):
        source = BASE / f'references/{identity}.png'
        with Image.open(source) as im:
            neutral = im.convert('RGB')
        face = original_detector(neutral)
        if face is None:
            raise RuntimeError(f'Cannot measure reference face: {identity}')
        fx, fy, fw, fh = face
        # Waist-up crop before standard normalisation, so figure-height limits
        # cannot make a mid-thigh source's face smaller than everybody else's.
        bottom = min(neutral.height, round(fy + 4.6 * fh))
        cropped = neutral.crop((0, 0, neutral.width, bottom))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'neutral.png'
            cropped.save(path)
            cv2.setRNGSeed(0)
            sprite = mod.make_sprite(str(path))
        # make_sprite does not resize these <=1150px crops. Locate its exact
        # crop in the raw source; refuse any unaccounted rescale.
        rgb = np.asarray(cropped)
        part = np.asarray(sprite.convert('RGB'))
        if part.shape[0] > rgb.shape[0] or part.shape[1] > rgb.shape[1]:
            raise RuntimeError('Unexpected source resize')
        match = cv2.matchTemplate(rgb, part, cv2.TM_SQDIFF)
        _, _, origin, _ = cv2.minMaxLoc(match)
        ox, oy = origin
        if not np.array_equal(rgb[oy:oy+part.shape[0], ox:ox+part.shape[1]], part):
            raise RuntimeError(f'Cannot map source crop exactly: {identity}')
        binary = sprite.getchannel('A').point(lambda v: 255 if v > 16 else 0)
        bbox = binary.getbbox()
        if not bbox:
            raise RuntimeError(f'Blank segmentation: {identity}')
        neutral_face = original_detector(sprite.crop(bbox))
        if neutral_face is None:
            raise RuntimeError(f'No face after segmentation: {identity}')
        # Face interior only, away from the hair silhouette, ears and jaw edge.
        region = (round(fx-.12*fw), round(fy-.13*fh), round(fx+1.12*fw), round(fy+1.05*fh))
        mask = Image.new('L', neutral.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle(region, radius=round(fw*.14), fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(5))
        mask = mask.crop((ox, oy, ox+sprite.width, oy+sprite.height))
        # A declared wardrobe change needs its own full-body neutral source;
        # never paste a casual face onto the work apron by a filename glob.
        paths = [source] + sorted(p for p in (BASE/'references').glob(identity+'_*.png')
                                  if p.stem != 'heroine_casual')
        if groups:
            paths=[BASE/f'references/{name}.png' for name in groups[identity]['states'] if (BASE/f'references/{name}.png').exists()]
            assert paths and paths[0]==source
        state_report = {}
        base_final = None
        for raw_path in paths:
            with Image.open(raw_path) as im:
                variant = im.convert('RGB')
            if variant.size != neutral.size:
                raise RuntimeError(f'Expression changed framing: {raw_path}')
            expression = variant.crop((ox, oy, ox+sprite.width, oy+sprite.height))
            composed = Image.composite(expression, sprite.convert('RGB'), mask) if raw_path != source else sprite.convert('RGB')
            rgba = composed.convert('RGBA')
            rgba.putalpha(sprite.getchannel('A'))
            # One transform for the entire identity. Keep the HAIR silhouette
            # inside the canvas, not merely the detected facial rectangle.
            # A mid-thigh source can otherwise lose the top of its head.
            figure = rgba.crop(bbox)
            scale = min(252 / neutral_face[3], 2.5, (792 / .78) / figure.width)
            size = (round(figure.width * scale), round(figure.height * scale))
            figure = figure.resize(size, Image.Resampling.LANCZOS)
            final = Image.new('RGBA', (792, 1200), (0, 0, 0, 0))
            mod._paste(final, figure, (792 - figure.width) // 2, max(16, 1200 - figure.height))
            pixels = np.asarray(final)
            if base_final is None:
                base_final = pixels.copy()
            assert np.array_equal(base_final[:,:,3], pixels[:,:,3]), 'Expression changed silhouette'
            delta = np.any(pixels[:,:,:3] != base_final[:,:,:3], axis=2)
            yy, xx = np.where(delta)
            delta_box = [int(xx.min()),int(yy.min()),int(xx.max())+1,int(yy.max())+1] if len(xx) else None
            # No expression may affect the lower half (outfit and body).
            assert not delta[600:,:].any(), f'Expression changed outfit: {raw_path}'
            target = BASE / f'images/{raw_path.stem}.webp'
            tmp = target.with_suffix('.tmp.webp')
            final.save(tmp, 'WEBP', lossless=True, exact=True, method=6)
            face_out = original_detector(final)
            if face_out is None or not .18 <= face_out[3]/1200 <= .24:
                raise RuntimeError(f'Unexpected face size: {raw_path}: {face_out}')
            alpha = pixels[:,:,3]
            assert (alpha==0).mean() > .15 and (alpha>200).mean() > .15
            replace_unfrozen(tmp,target,frozen)
            state_report[raw_path.stem] = {
                'source': str(raw_path.relative_to(BASE)), 'sourceSha256': sha(raw_path),
                'file': str(target.relative_to(BASE)), 'sha256': sha(target),
                'expressionDeltaBox': delta_box, 'faceHeightFraction': round(face_out[3]/1200,4),
                'sameSilhouette': True, 'sameLowerBodyPixels': True}
            print(f'{raw_path.stem}: 792x1200; face={face_out[3]/1200:.3f}; changed={delta_box}', flush=True)
        report['characters'][identity] = {'neutralReference': str(source.relative_to(BASE)), 'identity': identity.split('_')[0], 'wardrobe': groups[identity]['wardrobe'] if groups else ('casual' if identity=='heroine_casual' else 'work'), 'states': state_report}
    (BASE/'sprite-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    manifest_path = BASE/'art-prompts.json'
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    for entry in manifest['images']:
        if entry['type']=='character':
            stem=Path(entry['file']).stem
            entry['file']=f'images/{stem}.webp'
            entry['source']=f'references/{stem}.png'
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('CAST_PREPARED; visual inspection still required')


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--story',type=int,choices=[14,15],required=True)
    args=parser.parse_args()
    if args.story==15: BASE=ROOT/'content-work/15'
    print(f'Preparing cast ONLY in {BASE}',flush=True)
    prepare()
