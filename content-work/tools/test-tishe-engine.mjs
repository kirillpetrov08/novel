// Real Store/Engine against №15 authored fragments, without rendering pending art.
// Stop on the final authored line BEFORE the missing next chapter: no fake ending,
// no completion reward, no story.json or stores/15 created by this test.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const load=file=>JSON.parse(readFileSync(resolve(root,'content-work/15',file)));
const configs=load('chapters/config.json');
const scenes=Object.assign({},...configs.map(c=>load(`chapters/${String(c.chapter).padStart(2,'0')}.json`).scenes));
const [exit]=configs.at(-1).externalExits;
assert(exit && !scenes[exit]);
assert(Object.values(scenes).every(s=>!s.ending));
const story={id:'test-only-tishe-fragment',title:'Тише снега — тест фрагмента',start:'a01',
  stats:{desire:{},trust:{},resolve:{}},characters:load('characters.json'),scenes};
const decisions=configs.reduce((n,c)=>n+c.expectedChoices,0);
const paidCount=configs.reduce((n,c)=>n+c.expectedPaid,0);
function harness(balance){
  const storage=new Map(),events=[];
  const ctx=vm.createContext({console,setInterval,clearInterval,story,events,balance,
    document:{dispatchEvent(){}},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    Referrals:{onFirstStoryCompleted(){throw Error('Incomplete fragment must not complete');}}});
  for(const file of ['js/config.js','js/store.js','js/engine.js'])vm.runInContext(readFileSync(resolve(root,file),'utf8'),ctx,{filename:file});
  vm.runInContext('Store.load(); Store.data.crystals=balance; Store.save(); Engine.onEvent=(t,p)=>events.push({t,p}); Engine.open(story,"restart"); globalThis.E=Engine; globalThis.S=Store;',ctx);
  return {ctx,E:ctx.E,S:ctx.S,events};
}
for(const strategy of ['free-trust','free-resolve','paid']){
  const paid=strategy==='paid';
  const h=harness(paid?paidCount*5:0);
  const expectedStats={desire:0,trust:0,resolve:0};
  let steps=0,selected=0,resumed=false;
  while(steps++<5000){
    const scene=h.E.scene();
    if(scene.next===exit && h.E.state.lineIndex===scene.lines.length-1)break;
    if(scene.choices && h.E.state.lineIndex===scene.lines.length-1){
      const candidates=scene.choices.map((c,i)=>({c,i})).filter(({c})=>paid||!c.crystals);
      const score=c=>(paid&&c.crystals?100:0)+(c.effect?.[strategy==='free-resolve'?'resolve':'trust']||0);
      candidates.sort((a,b)=>score(b.c)-score(a.c));
      const {c,i}=candidates[0];
      for(const [key,value] of Object.entries(c.effect||{}))expectedStats[key]+=value;
      const previous=h.E.state.sceneId;h.E.choose(i);
      assert.notEqual(h.E.state.sceneId,previous);selected++;
    }else h.E.advance();
    if(!resumed && steps===80){
      const saved=JSON.stringify({scene:h.E.state.sceneId,line:h.E.state.lineIndex,stats:h.E.state.stats,paid:h.E.state.paid});
      vm.runInContext('Store.load(); Engine.open(story,"continue");',h.ctx);
      assert.equal(JSON.stringify({scene:h.E.state.sceneId,line:h.E.state.lineIndex,stats:h.E.state.stats,paid:h.E.state.paid}),saved);
      resumed=true;
    }
  }
  assert(steps<5000 && resumed);
  assert.equal(selected,decisions);
  assert.equal(h.E.scene().next,exit);
  assert.equal(h.E.state.completed,false);
  assert.equal(h.events.filter(e=>e.t==='ending').length,0);
  const payments=h.events.filter(e=>e.t==='crystals-spent');
  assert.equal(payments.length,paid?paidCount:0);
  assert(payments.every(e=>e.p===5));
  assert.equal(h.S.data.crystals,0); // Paid budget exactly spent; no completion bonus.
  assert.deepEqual(JSON.parse(JSON.stringify(h.E.state.stats)),expectedStats);
  console.log(`TISHE_ENGINE_OK ${strategy}: ${selected} choices, paid ${payments.length*5}◆, resume OK, stops before ${exit}, no ending/reward`);
}
const h=harness(0);
for(let steps=0;h.E.state.sceneId!=='a09'&&steps<500;steps++){
  const scene=h.E.scene();
  if(scene.choices&&h.E.state.lineIndex===scene.lines.length-1)h.E.choose(scene.choices.findIndex(c=>!c.crystals));
  else h.E.advance();
}
assert.equal(h.E.state.sceneId,'a09');
while(h.E.state.lineIndex<h.E.scene().lines.length-1)h.E.advance();
const previous=JSON.stringify(h.E.state);
h.E.choose(h.E.scene().choices.findIndex(c=>c.crystals));
assert.equal(JSON.stringify(h.E.state),previous);
assert.equal(h.events.at(-1).t,'need-crystals');
h.E.choose(h.E.scene().choices.findIndex(c=>!c.crystals));
assert.equal(h.E.state.sceneId,'a09r');
console.log('TISHE_NO_BALANCE_FREE_FALLBACK_OK; incomplete story remains outside the library');
