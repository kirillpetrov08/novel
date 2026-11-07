#!/usr/bin/env python3
"""№15 fragment regressions; fixture mutations never touch real source files."""
import contextlib
import copy
import importlib.util
import io
import hashlib
import json
import tempfile
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

TOOLS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('tishe_checks', TOOLS / 'check-tishe.py')
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)
BASE = checks.BASE
configs = checks.load(BASE / 'chapters/config.json')
characters = checks.load(BASE / 'characters.json')
manifest = checks.load(BASE / 'art-prompts.json')


class TisheTests(unittest.TestCase):
    def fragment(self):
        return checks.load(BASE / 'chapters/01.json')

    def test_all_sources_compile_to_their_own_story(self):
        with patch.object(checks.compiler, 'BASE', BASE):
            for config in configs:
                compiled = checks.compiler.compile_one(config)
                self.assertEqual(compiled, checks.load(BASE / f'chapters/{config["chapter"]:02}.json'))
                self.assertEqual(compiled['story'], 'tishe-snega')

    def assert_bad_source(self, source):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            (base / 'chapters').mkdir()
            (base / 'chapters/01.md').write_text(source, encoding='utf-8')
            with patch.object(checks.compiler, 'BASE', base):
                with self.assertRaises(ValueError):
                    checks.compiler.compile_one(configs[0])

    def test_non_five_price_rejected(self):
        self.assert_bad_source((BASE / 'chapters/01.md').read_text().replace('5◆', '7◆', 1))

    def test_previous_story_speaker_rejected(self):
        self.assert_bad_source((BASE / 'chapters/01.md').read_text().replace('**Артём:**', '**Лев:**', 1))

    def test_duplicate_identity_on_screen_rejected(self):
        fragment = self.fragment()
        fragment['scenes']['a01']['show'] = ['heroine', 'heroine_indoor']
        with self.assertRaises(AssertionError):
            checks.validate_fragment(fragment, configs[0], characters, manifest)

    def test_long_line_rejected(self):
        fragment = self.fragment()
        fragment['scenes']['a01']['lines'][0]['text'] = 'я' * 241
        with self.assertRaises(AssertionError):
            checks.validate_fragment(fragment, configs[0], characters, manifest)

    def test_dangling_target_and_cycle_rejected(self):
        scenes = self.fragment()['scenes']
        for target in ('missing', 'a01'):
            mutated = copy.deepcopy(scenes)
            mutated['a01']['next'] = target
            with self.assertRaises(AssertionError):
                checks.graphs.solve_graph(mutated, 'a01', ['b01'])

    def test_wardrobe_groups_never_mix(self):
        lock = checks.load(BASE / 'design-lock.json')
        states = []
        for neutral, group in lock['portraitGroups'].items():
            self.assertEqual(group['states'][0], neutral)
            states.extend(group['states'])
            if group['wardrobe'] == 'indoor':
                self.assertEqual(group['states'], [neutral])
            else:
                self.assertFalse(any(s.endswith('_indoor') for s in group['states']))
        self.assertEqual(len(states), len(set(states)))
        self.assertEqual(set(states), set(characters))

    def test_reviewed_bytes_cannot_be_replaced(self):
        guard = checks.module('review_guard', 'review_lock.py')
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); target = base / 'sprite.webp'; temp = base / 'new.webp'
            target.write_bytes(b'accepted bytes')
            frozen = {target.resolve(): hashlib.sha256(target.read_bytes()).hexdigest()}
            temp.write_bytes(b'accepted bytes')
            guard.replace_unfrozen(temp, target, frozen)
            self.assertFalse(temp.exists())
            temp.write_bytes(b'different face or outfit')
            with self.assertRaises(ValueError):
                guard.replace_unfrozen(temp, target, frozen)
            self.assertEqual(target.read_bytes(), b'accepted bytes')
            self.assertFalse(temp.exists())

    def test_source_change_is_detected_before_preparation(self):
        guard = checks.module('review_guard_source', 'review_lock.py')
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); source = base / 'reference.png'
            source.write_bytes(b'original')
            (base / 'visual-review.json').write_text(json.dumps({'files': [
                {'file': 'reference.png', 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}]}))
            self.assertEqual(len(guard.load_frozen(base)), 1)
            source.write_bytes(b'redesigned')
            with self.assertRaises(ValueError):
                guard.load_frozen(base)

    def test_old_publication_tools_refuse_story15(self):
        canonical = BASE.parent.parent / 'stores/14'
        names = ('story.json', 'story.draft.json', 'route-audit.json', 'art-prompts.json')
        before = {name: (canonical / name).read_bytes() for name in names}
        for tool, flag in [('assemble-story.py', '--publish'), ('check-drafts.py', '--report')]:
            result = subprocess.run([sys.executable, str(TOOLS / tool), '--story', '15', flag],
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 2)
            self.assertIn('unrecognized arguments', result.stderr)
        self.assertEqual(before, {name: (canonical / name).read_bytes() for name in names})

    def test_partial_routes_report_is_current(self):
        with contextlib.redirect_stdout(io.StringIO()):
            report = checks.check()
        self.assertEqual(report, checks.load(BASE / 'source-fragment-audit.json'))
        self.assertEqual(report['productionStatus'], 'incomplete-not-shippable')
        self.assertEqual(report['outcomes']['all']['routes'], 2 ** report['decisions'])
        self.assertEqual(report['outcomes']['free']['routes'], 2 ** (report['decisions'] - report['paidOptions']))
        self.assertFalse((BASE / 'story.json').exists())


if __name__ == '__main__':
    unittest.main()
