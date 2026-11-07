// Real app engine/store smoke tests with the authored story, no DOM rendering.
// This does not pretend that pending CGs or Android-device QA are complete.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const story=JSON.parse(readFileSync(resolve(root,'content-work/14/story.draft.json')));
function harness(balance){
  const storage=new Map();const events=[];
  const ctx=vm.createContext({console,setInterval,clearInterval,
    document:{dispatchEvent(){}},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    Referrals:{onFirstStoryCompleted(){}},events,story,startingBalance:balance});
  for(const file of ['js/config.js','js/store.js','js/engine.js'])vm.runInContext(readFileSync(resolve(root,file),'utf8'),ctx,{filename:file});
  vm.runInContext('Store.load(); Store.data.crystals=startingBalance; Store.save(); Engine.onEvent=(t,p)=>events.push({t,p}); Engine.open(story,"restart"); globalThis.E=Engine; globalThis.S=Store;',ctx);
  return {ctx,E:ctx.E,S:ctx.S,events};
}
for(const strategy of ['free-trust','free-resolve','paid-romance','paid-refusal']){
  const paid=strategy.startsWith('paid');const h=harness(paid?100:0);
  let steps=0,decisions=0,resumed=false;
  while(!h.E.state.completed && steps++<2000){
    const scene=h.E.scene();
    if(scene.choices && h.E.state.lineIndex===scene.lines.length-1){
      let candidates=scene.choices.map((c,i)=>({c,i})).filter(({c})=>paid||!c.crystals);
      if(h.E.state.sceneId==='f10')candidates=candidates.filter(({c})=>c.next===(strategy.endsWith('refusal')||strategy==='free-resolve'?'f10r':'f10t'));
      const score=c=>strategy==='free-resolve'?(c.effect?.resolve||0):
        (paid&&c.crystals?100:0)+(c.effect?.trust||0)*3+(c.effect?.desire||0);
      candidates.sort((a,b)=>score(b.c)-score(a.c));
      const before=h.E.state.sceneId;h.E.choose(candidates[0].i);
      assert.notEqual(h.E.state.sceneId,before);decisions++;
    }else h.E.advance();
    if(paid&&!resumed&&steps===160){
      const saved=JSON.stringify({scene:h.E.state.sceneId,line:h.E.state.lineIndex,stats:h.E.state.stats,paid:h.E.state.paid});
      vm.runInContext('Store.load(); Engine.open(story,"continue");',h.ctx);
      assert.equal(JSON.stringify({scene:h.E.state.sceneId,line:h.E.state.lineIndex,stats:h.E.state.stats,paid:h.E.state.paid}),saved);
      resumed=true;
    }
  }
  assert(h.E.state.completed);assert.equal(decisions,34);
  const expected=strategy==='free-trust'?'f14t':strategy==='paid-romance'?'f14d':'f14r';
  assert.equal(h.E.state.sceneId,expected);
  const spent=h.events.filter(e=>e.t==='crystals-spent');
  assert.equal(spent.length,paid?12:0);assert(spent.every(e=>e.p===5));
  assert.equal(h.S.data.crystals,paid?60:20); // First completion reward 20.
  const endings=h.events.filter(e=>e.t==='ending').length;h.E.advance();h.E.advance();
  assert.equal(h.events.filter(e=>e.t==='ending').length,endings);assert.equal(endings,1);
  console.log(`ENGINE_OK ${strategy}: ${expected}, ${decisions} decisions, spent ${spent.length*5}, resume=${resumed}`);
}
const h=harness(0);
for(let i=0;h.E.state.sceneId!=='a06'&&i<500;i++){
  const s=h.E.scene();
  if(s.choices&&h.E.state.lineIndex===s.lines.length-1)h.E.choose(s.choices.findIndex(c=>!c.crystals));
  else h.E.advance();
}
assert.equal(h.E.state.sceneId,'a06');
while(h.E.state.lineIndex<h.E.scene().lines.length-1)h.E.advance();
const before=JSON.stringify(h.E.state);h.E.choose(0);
assert.equal(JSON.stringify(h.E.state),before);
assert.equal(h.events.at(-1).t,'need-crystals');h.E.choose(1);
assert.equal(h.E.state.sceneId,'a06f');
console.log('NO_BALANCE_FREE_FALLBACK_OK; graphics/device testing remain pending');
