#!/usr/bin/env python3
"""Regression checks for the authoring helpers, with no edits to real sources."""
import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

TOOLS=Path(__file__).resolve().parent

def module(name,file):
    spec=importlib.util.spec_from_file_location(name,TOOLS/file)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value)
    return value

compiler=module('chapter_compiler','compile-chapter.py')
checks=module('draft_checks','check-drafts.py')

class DraftTests(unittest.TestCase):
    def test_chunks_preserve_text(self):
        for text in ('Да. Нет? Может быть… Проверим.', 'Длинная реплика '*100, '👩🏽‍🔬 наблюдает. Всё понятно.', 'Слово\n\tи слово.'):
            chunks=compiler.chunks(text)
            self.assertEqual(' '.join(chunks),' '.join(text.split()))
            self.assertTrue(all(0<len(s)<=240 for s in chunks))
        with self.assertRaises(ValueError):compiler.chunks('x'*241)

    def test_compilation_is_current(self):
        configs=json.loads((compiler.BASE/'chapters/config.json').read_text())
        for config in configs:
            expected=json.loads((compiler.BASE/f'chapters/{config["chapter"]:02}.json').read_text())
            self.assertEqual(compiler.compile_one(config),expected)

    def test_invalid_paid_cost_rejected(self):
        config=json.loads((compiler.BASE/'chapters/config.json').read_text())[0]
        original=(compiler.BASE/'chapters/01.md').read_text()
        with tempfile.TemporaryDirectory() as td:
            base=Path(td);(base/'chapters').mkdir()
            (base/'chapters/01.md').write_text(original.replace('5◆','7◆',1))
            with patch.object(compiler,'BASE',base):
                with self.assertRaises(ValueError):compiler.compile_one(config)

    def test_route_counts_and_free_path(self):
        scenes={'a':{'lines':[{'text':'Одна реплика'}],'choices':[{'next':'b','crystals':5,'effect':{'desire':1}},{'next':'b','effect':{'trust':1}}]},
                'b':{'lines':[{'text':'Ответ'}],'next':'exit'}}
        full,_,_=checks.check_graph(scenes,'a',{'exit'})
        free,_,_=checks.check_graph(scenes,'a',{'exit'},True)
        self.assertEqual(full,(2,3,3));self.assertEqual(free,(1,3,3))

    def test_broken_graphs_rejected(self):
        for scenes in ({'a':{'lines':[{'text':'Текст'}],'next':'missing'}},
                       {'a':{'lines':[{'text':'Текст'}],'next':'a'}},
                       {'a':{'lines':[{'text':'Текст'}],'choices':[{'next':'exit','crystals':5}]}}):
            with self.assertRaises(AssertionError):checks.check_graph(scenes,'a',{'exit'},True)

    def test_reference_hash_change_rejected(self):
        original=checks.load
        def tampered(path):
            data=original(path)
            if path.name=='design-lock.json':data['styleReferences'][0]['sha256']='0'*64
            return data
        with patch.object(checks,'load',side_effect=tampered),contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(AssertionError,'Frozen identity reference changed'):
                checks.check()

if __name__=='__main__':
    unittest.main()
