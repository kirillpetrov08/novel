// Full-art staged mobile browser QA for story 15; browser preflight only, not Android/release approval.
// Injects story.draft.json into an isolated in-memory fixture; never registers it in the library.
// Requires every planned asset and checks all 168 scenes, all 16 CGs, and all three ending overlays.
// Start serve-tishe-review.py after npm run build:www. Browser deps may be supplied via BROWSER_TEST_DEPS.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname,resolve} from 'node:path';

const base=fileURLToPath(new URL('../15/',import.meta.url));
const load=p=>JSON.parse(readFileSync(join(base,p),'utf8'));
const source={...load('story.draft.json'),id:'tishe-snega-preflight'};
const planned=load('art-prompts.json').images.map(item=>item.file);
const missingAssets=planned.filter(file=>!existsSync(join(base,file)));
if(missingAssets.length)throw new Error('Full-art browser QA requires every planned image; missing: '+missingAssets.join(', '));
const missingCgScenes=Object.entries(source.scenes).filter(([,scene])=>scene.cg&&!existsSync(join(base,scene.cg))).map(([id])=>id);
if(missingCgScenes.length)throw new Error('Full-art browser QA refuses skipped CG scenes: '+missingCgScenes.join(', '));
if(planned.length!==38)throw new Error('Expected exactly 38 planned playable images, got '+planned.length);

const require=createRequire((process.env.BROWSER_TEST_DEPS||'/home/user/browser-test')+'/package.json');
const {chromium:pw}=require('playwright-core');
const chromiumModule=require('@sparticuz/chromium');
const chromium=chromiumModule.default||chromiumModule;
// The minimal sandbox lacks NSS/NSPR. Use libraries bundled in the npm browser package.
await chromiumModule.inflate(resolve(dirname(require.resolve('@sparticuz/chromium')),'../bin/al2023.tar.br'));
chromiumModule.setupLambdaEnvironment('/tmp/al2023/lib');
process.env.FONTCONFIG_PATH='/etc/fonts';
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
const dest=process.env.REVIEW_OUTPUT||join(base,'reviews/full-mobile-stage8');
mkdirSync(dest,{recursive:true});
const results=[];
const viewports=[[320,568,0],[360,640,0],[390,844,0],[320,568,24],[390,844,24]];
const expectedEndings={f14t:'На одной частоте',f14d:'Долгий свет',f14r:'Свой маршрут'};
try{
 const page=await browser.newPage({viewport:{width:320,height:568},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 for(const [width,height,inset] of viewports){
  await page.setViewportSize({width,height});
  await page.goto(process.env.NOVEL_TEST_URL||'http://127.0.0.1:8000');
  await page.waitForFunction(()=>typeof Loader!=='undefined'&&!!Loader.get('pereplyot'));
  await page.waitForFunction(()=>Store.data.welcomeShown===true);
  const welcome=page.getByRole('button',{name:'К историям',exact:true});
  if(await welcome.isVisible())await welcome.click();
  await page.evaluate(async story=>{
   Store.data.settings.typewriter=false;Store.data.settings.weatherFx=false;Store.data.settings.music=false;Store.data.crystals=100;Store.save();
   Ads.showInterstitial=async()=>{};UI.preloadBg=()=>{};
   Loader.stories.set(story.id,{story:Loader.resolveAssets(story,'/review-assets/'),source:'isolated in-memory full-art mobile fixture'});
   await UI.play(story.id,'restart');
  },source);
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important} #toasts{display:none!important}'});
  for(const font of ['m','l']){
   const report=await page.evaluate(async({font,inset,expectedEndings})=>{
    document.body.dataset.font=font;
    document.documentElement.style.setProperty('--safe-area-inset-top',inset+'px');
    document.documentElement.style.setProperty('--safe-area-inset-bottom',inset+'px');
    const failures=[];let lines=0,choices=0,cgs=0,scrollableLines=0;
    const rect=element=>element.getBoundingClientRect();
    for(const [sid,scene] of Object.entries(Engine.story.scenes)){
     Engine.goTo(sid);
     if(Engine.state.sceneId!==sid)failures.push(sid+': incorrect rendered scene');
     await Promise.all([...document.querySelectorAll('#stage img')].map(image=>image.decode().catch(()=>failures.push(sid+': image decode '+image.src))));
     for(let index=0;index<scene.lines.length;index++){
      Engine.state.lineIndex=index;Engine.renderLine();lines++;
      const dialogue=document.querySelector('#dialogue'),text=document.querySelector('#dialogue-text');
      if(document.documentElement.scrollWidth>innerWidth+1)failures.push(sid+': horizontal overflow');
      if(rect(dialogue).bottom>innerHeight+1||rect(dialogue).top<55)failures.push(sid+': dialogue outside stage');
      if(text.scrollWidth>text.clientWidth+1)failures.push(sid+': text horizontal overflow');
      if(dialogue.scrollHeight>dialogue.clientHeight+1){
       scrollableLines++;
       if(!['auto','scroll'].includes(getComputedStyle(dialogue).overflowY))failures.push(sid+': inaccessible dialogue text');
      }
     }
     if(scene.cg){
      cgs++;
      const card=document.querySelector('#stage-cg');
      if(!document.querySelector('#cg-frame img')?.naturalWidth)failures.push(sid+': CG missing from rendered frame');
      if(rect(card).bottom>rect(document.querySelector('.player-lower')).top+1)failures.push(sid+': CG covered by dialogue');
     }
     if(scene.choices){
      choices++;UI.renderChoices();
      const box=document.querySelector('#choices'),wrap=document.querySelector('.dialogue-wrap');
      if(getComputedStyle(document.querySelector('#dialogue')).pointerEvents==='none')failures.push(sid+': dialogue cannot scroll while choices open');
      if(rect(box).bottom>rect(wrap).top+1||rect(box).top<55)failures.push(sid+': choices overlap dialogue/header');
      for(const button of box.children)if(button.scrollWidth>button.clientWidth+1)failures.push(sid+': choice text horizontal overflow');
      for(const image of document.querySelectorAll('#chars img')){
       const bounds=rect(image),scale=Math.min(bounds.width/image.naturalWidth,bounds.height/image.naturalHeight);
       const headTop=bounds.bottom-image.naturalHeight*scale;
       if(headTop+500*scale>rect(box).top+1)failures.push(sid+': face covered by choices');
       if(headTop+16*scale<54+inset)failures.push(sid+': head under toolbar');
      }
     }
    }
    const endingOverlays=[];
    for(const [sid,title] of Object.entries(expectedEndings)){
     const overlay=document.querySelector('#ending-ov');
     overlay.classList.remove('open');Engine._finishedSceneId=null;Engine.goTo(sid);
     Engine.state.lineIndex=Engine.scene().lines.length-1;Engine.renderLine();Engine.advance();
     const card=document.querySelector('.ending-card'),exit=document.querySelector('#ending-library');
     const bounds=rect(card),visible=overlay.classList.contains('open'),scroll=getComputedStyle(card).overflowY;
     if(!visible)failures.push(sid+': ending overlay did not open');
     if(document.querySelector('#ending-title').textContent!==title)failures.push(sid+': wrong ending title');
     if(bounds.left<0||bounds.right>innerWidth+1||bounds.top<inset-1||bounds.bottom>innerHeight-inset+1)failures.push(sid+': ending card outside safe area');
     if(scroll!=='auto')failures.push(sid+': ending card is not scrollable');
     exit.scrollIntoView({block:'end'});
     const exitBounds=rect(exit),cardBounds=rect(card);
     if(exitBounds.top<cardBounds.top-1||exitBounds.bottom>cardBounds.bottom+1)failures.push(sid+': ending exit button inaccessible');
     endingOverlays.push({scene:sid,title:document.querySelector('#ending-title').textContent,visible,scroll});
     overlay.classList.remove('open');
    }
    if(Object.keys(Engine.story.scenes).length!==168||lines!==523||choices!==34||cgs!==16)
     failures.push(`incomplete traversal: ${Object.keys(Engine.story.scenes).length} scenes/${lines} lines/${choices} choices/${cgs} CGs`);
    return {font,scenes:Object.keys(Engine.story.scenes).length,lines,choices,cgs,scrollableLines,endingOverlays,failures:[...new Set(failures)]};
   },{font,inset,expectedEndings});
   results.push({width,height,inset,...report,errors:[...errors]});
   if(width===320&&inset===24&&font==='l'){
    for(const [sid,name] of [['f14t','trust'],['f14d','desire'],['f14r','resolve']]){
     await page.evaluate(([ending,font])=>{
      document.body.dataset.font=font;
      document.documentElement.style.setProperty('--safe-area-inset-top','24px');
      document.documentElement.style.setProperty('--safe-area-inset-bottom','24px');
      document.querySelector('#ending-ov').classList.remove('open');Engine._finishedSceneId=null;Engine.goTo(ending);
      Engine.state.lineIndex=Engine.scene().lines.length-1;Engine.renderLine();Engine.advance();
     },[sid,'l']);
     await page.screenshot({path:join(dest,`stage8-ending-${name}-320-safe24-large.png`)});
    }
   }
  }
  const capture=width===320&&inset===24?['a04','l','stage8-320-safe24-large-rules-card']:
   width===390&&inset===0?['c10t','m','stage8-390-safe0-kiss-card']:
   width===320&&inset===0?['f09','m','stage8-320-safe0-final-answer-choice']:null;
  if(capture){
   await page.evaluate(([sid,font,inset])=>{
    document.body.dataset.font=font;
    document.documentElement.style.setProperty('--safe-area-inset-top',inset+'px');
    document.documentElement.style.setProperty('--safe-area-inset-bottom',inset+'px');
    Engine.goTo(sid);Engine.state.lineIndex=Engine.scene().lines.length-1;Engine.renderLine();UI.renderChoices();
   },[capture[0],capture[1],inset]);
   await page.evaluate(()=>Promise.all([...document.querySelectorAll('#stage img')].map(image=>image.decode().catch(()=>null))));
   await page.screenshot({path:join(dest,capture[2]+'.png')});
  }
 }
 const report={scope:'full-art-staged-mobile-browser-qa-not-release-approval',missingCgScenes,missingAssets,results};
 writeFileSync(join(dest,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
 if(results.some(result=>result.failures.length||result.errors.length))process.exitCode=1;
}finally{await browser.close();}
