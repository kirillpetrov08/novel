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

    def test_ordered_stat_branches_and_free_ending(self):
        scenes={'a':{'lines':[{'text':'Старт'}],'choices':[{'next':'b','crystals':5,'effect':{'desire':2,'trust':2}},{'next':'b','effect':{'trust':1}}]},
                'b':{'lines':[{'text':'Развилка'}],'branch':[{'if':{'stat':'desire','gte':2},'to':'d'},{'if':{'stat':'trust','gte':1},'to':'t'}],'next':'t'},
                'd':{'lines':[{'text':'Первый финал'}],'ending':{'title':'D'}},
                't':{'lines':[{'text':'Второй финал'}],'ending':{'title':'T'}}}
        full=checks.solve_graph(scenes,'a')
        free=checks.solve_graph(scenes,'a',free=True)
        self.assertEqual(set(full['terminals']),{'d','t'})
        self.assertEqual(set(free['terminals']),{'t'})
        self.assertEqual(full['summary'][0],2)
        self.assertEqual(free['summary'][0],1)

    def test_authored_endings_are_not_placeholders(self):
        config=json.loads((compiler.BASE/'chapters/config.json').read_text())[-1]
        chapter=compiler.compile_one(config)
        endings=[s for s in chapter['scenes'].values() if 'ending' in s]
        self.assertEqual(len(endings),3)
        self.assertTrue(all(len(s['lines'])>=5 and len(s['ending']['text'])>80 for s in endings))
        original=(compiler.BASE/'chapters/06.md').read_text()
        with tempfile.TemporaryDirectory() as td:
            base=Path(td);(base/'chapters').mkdir()
            (base/'chapters/06.md').write_text(original.replace('"badge":"Доверие"','"badge":null'))
            with patch.object(compiler,'BASE',base):
                with self.assertRaises(ValueError):compiler.compile_one(config)

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
