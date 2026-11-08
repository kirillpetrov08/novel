#!/usr/bin/env python3
"""Serve built 14-story www plus staged IMAGES for isolated browser preflight.
Does not add a story, change the bundle, or serve draft JSON/authoring material.
Run only as a development server; no APK integration is performed.
"""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
WWW = ROOT / 'www'
DRAFT = ROOT / 'content-work/15'


class ReviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WWW), **kwargs)

    def translate_path(self, path):
        route = unquote(urlsplit(path).path)
        prefix = '/review-assets/'
        if route.startswith(prefix):
            target = (DRAFT / route[len(prefix):]).resolve()
            if target.is_relative_to(DRAFT.resolve()) and target.suffix in ('.jpg', '.png', '.webp'):
                return str(target)
            return str(WWW / '__not_a_review_asset__')
        return super().translate_path(path)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    if not (WWW / 'js/stories-bundle.js').is_file():
        parser.error('Run npm run build:www first')
    ThreadingHTTPServer(('0.0.0.0', args.port), ReviewHandler).serve_forever()
