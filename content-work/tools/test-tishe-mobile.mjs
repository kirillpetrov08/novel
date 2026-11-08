// №15 PORTRAIT/BACKGROUND preflight ONLY: all CG scenes are excluded.
// Injects fragments into an isolated browser context; never writes/registers a production story.
// Start serve-tishe-review.py after npm run build:www. No full-story/mobile approval.
// npm install --prefix /home/user/browser-test playwright-core @sparticuz/chromium
// NOVEL_TEST_URL defaults to the isolated review server, never used by app code.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const base=fileURLToPath(new URL('../15/',import.meta.url));
const load=p=>JSON.parse(readFileSync(base+p));
const configs=load('chapters/config.json');
const source={id:'tishe-snega-preflight',title:'Тише снега',start:'a01',cover:'cover.jpg',
 stats:{desire:{label:'Желание',icon:'♡'},trust:{label:'Доверие',icon:'◌'},resolve:{label:'Решимость',icon:'✦'}},
 characters:load('characters.json'),scenes:Object.assign({},...configs.map(c=>load(`chapters/${String(c.chapter).padStart(2,'0')}.json`).scenes))};
const skippedCgScenes=Object.entries(source.scenes).filter(([,s])=>s.cg).map(([id])=>id);
const require=createRequire((process.env.BROWSER_TEST_DEPS||'/home/user/browser-test')+'/package.json');
const {chromium:pw}=require('playwright-core');const chromiumModule=require('@sparticuz/chromium');const chromium=chromiumModule.default||chromiumModule;
// The minimal sandbox lacks NSS/NSPR. Use the libraries bundled in this npm
// package rather than downloading a browser/debs from an external host.
const {dirname,resolve}=await import('node:path');
await chromiumModule.inflate(resolve(dirname(require.resolve('@sparticuz/chromium')),'../bin/al2023.tar.br'));
chromiumModule.setupLambdaEnvironment('/tmp/al2023/lib');
process.env.FONTCONFIG_PATH='/etc/fonts';
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
const dest=process.env.REVIEW_OUTPUT||'/home/user/tishe-cast-preflight';mkdirSync(dest,{recursive:true});
const results=[];
try{
 const page=await browser.newPage({viewport:{width:320,height:568},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [width,height,inset] of [[320,568,0],[360,640,0],[390,844,0],[320,568,24],[390,844,24]]){
  await page.setViewportSize({width,height});
  await page.goto(process.env.NOVEL_TEST_URL||'http://127.0.0.1:8000');
  await page.waitForFunction(()=>typeof Loader!=='undefined'&&!!Loader.get('pereplyot'));
  await page.waitForFunction(()=>Store.data.welcomeShown===true);
  const welcome=page.getByRole('button',{name:'К историям',exact:true});
  if(await welcome.isVisible())await welcome.click();
  await page.evaluate(async source=>{
    Store.data.settings.typewriter=false;Store.data.settings.weatherFx=false;Store.data.settings.music=false;Store.data.crystals=100;
    Ads.showInterstitial=async()=>{};UI.preloadBg=()=>{}; // Do not preload missing CGs for excluded scenes.
    Loader.stories.set(source.id,{story:Loader.resolveAssets(source,'/review-assets/'),source:'isolated in-memory layout fixture'});
    await UI.play(source.id,'restart');
   },source);
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important} #toasts{display:none!important}'});
  for(const font of ['m','l']){
   const report=await page.evaluate(async({font,inset})=>{
    document.body.dataset.font=font;
    document.documentElement.style.setProperty('--safe-area-inset-top',inset+'px');
    document.documentElement.style.setProperty('--safe-area-inset-bottom',inset+'px');
    const failures=[];let lines=0,choices=0,cgs=0,scrollableLines=0;
    const r=e=>e.getBoundingClientRect();
    for(const [sid,s] of Object.entries(Engine.story.scenes)){
     if(s.cg)continue; // Missing cards must never be replaced or falsely counted as reviewed.
     Engine.goTo(sid);
     await Promise.all([...document.querySelectorAll('#stage img')].map(i=>i.decode().catch(()=>failures.push(sid+': image decode '+i.src))));
     for(let i=0;i<s.lines.length;i++){
      Engine.state.lineIndex=i;Engine.renderLine();lines++;
      const d=document.querySelector('#dialogue'),text=document.querySelector('#dialogue-text');
      if(document.documentElement.scrollWidth>innerWidth+1)failures.push(sid+': horizontal overflow');
      if(r(d).bottom>innerHeight+1||r(d).top<55)failures.push(sid+': dialogue outside stage');
      if(text.scrollWidth>text.clientWidth+1)failures.push(sid+': text horizontal overflow');
      if(d.scrollHeight>d.clientHeight+1){scrollableLines++;if(!['auto','scroll'].includes(getComputedStyle(d).overflowY))failures.push(sid+': inaccessible text');}
     }
     if(s.cg){
      cgs++;const card=document.querySelector('#stage-cg');
      if(r(card).bottom>r(document.querySelector('.player-lower')).top+1)failures.push(sid+': CG covered by dialogue');
     }
     if(s.choices){
      choices++;UI.renderChoices();
      const box=document.querySelector('#choices'),dw=document.querySelector('.dialogue-wrap');
      if(getComputedStyle(document.querySelector('#dialogue')).pointerEvents==='none')failures.push(sid+': dialogue cannot scroll while choices open');
      if(r(box).bottom>r(dw).top+1||r(box).top<55)failures.push(sid+': choices overlap dialogue/header');
      for(const b of box.children)if(b.scrollWidth>b.clientWidth+1)failures.push(sid+': choice text horizontal overflow');
      // Check rendered head area after object-fit: transparent image boxes alone
      // cannot tell whether the visible face is above the dialogue/choices.
      for(const image of document.querySelectorAll('#chars img')){
       const b=r(image),scale=Math.min(b.width/image.naturalWidth,b.height/image.naturalHeight);
       const top=b.bottom-image.naturalHeight*scale;
       if(top+500*scale>r(box).top+1)failures.push(sid+': face covered by choices');
       if(top+16*scale<54+inset)failures.push(sid+': head under toolbar');
      }
     }
    }
    return {font,scenes:Object.values(Engine.story.scenes).filter(s=>!s.cg).length,lines,choices,cgs,scrollableLines,failures:[...new Set(failures)]};
   },{font,inset});
   results.push({width,height,inset,...report,errors:[...errors]});
  }
  const capture=width===320&&inset===24?['d08','l','320-safe24-large-three-characters']:
    width===390&&inset===0?['c08','m','390-safe0-outdoors']:
    width===320&&inset===0?['d12','m','320-safe0-indoor-choices']:null;
  if(capture){
   await page.evaluate(([sid,font])=>{document.body.dataset.font=font;Engine.goTo(sid);Engine.state.lineIndex=Engine.scene().lines.length-1;Engine.renderLine();UI.renderChoices();},capture);
   await page.evaluate(()=>Promise.all([...document.querySelectorAll('#stage img')].map(i=>i.decode())));
   await page.screenshot({path:`${dest}/${capture[2]}.png`});
  }
  writeFileSync(dest+'/report.json',JSON.stringify({scope:'portrait-and-background-preflight-only',skippedCgScenes,results},null,2)+'\n');
 }
 writeFileSync(dest+'/report.json',JSON.stringify({scope:'portrait-and-background-preflight-only',skippedCgScenes,results},null,2)+'\n');
 console.log(JSON.stringify({scope:'portrait-and-background-preflight-only',skippedCgScenes,results},null,2));
 if(results.some(r=>r.failures.length||r.errors.length))process.exitCode=1;
}finally{await browser.close();}
