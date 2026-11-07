// Bundled library/detail/ending-overlay smoke test, not physical Android QA.
// npm install --prefix /home/user/browser-test playwright-core @sparticuz/chromium
// NOVEL_TEST_URL defaults to the isolated review server, never used by app code.
import {createRequire} from 'node:module';
import {writeFileSync,mkdirSync} from 'node:fs';
const require=createRequire((process.env.BROWSER_TEST_DEPS||'/home/user/browser-test')+'/package.json');
const {chromium:pw}=require('playwright-core');const chromiumModule=require('@sparticuz/chromium');const chromium=chromiumModule.default||chromiumModule;
// The minimal sandbox lacks NSS/NSPR. Use the libraries bundled in this npm
// package rather than downloading a browser/debs from an external host.
const {dirname,resolve}=await import('node:path');
await chromiumModule.inflate(resolve(dirname(require.resolve('@sparticuz/chromium')),'../bin/al2023.tar.br'));
chromiumModule.setupLambdaEnvironment('/tmp/al2023/lib');
process.env.FONTCONFIG_PATH='/etc/fonts';
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});

const p=await browser.newPage({viewport:{width:320,height:568}});
await p.goto(process.env.NOVEL_TEST_URL||'http://127.0.0.1:8000');await p.waitForFunction(()=>typeof Loader!=='undefined'&&Loader.stories.size>=14&&Store.data.welcomeShown);
const welcome=p.getByRole('button',{name:'К историям',exact:true});if(await welcome.isVisible())await welcome.click();
await p.locator('#lib-tabs button').filter({hasText:'Длинные'}).click();
const card=p.locator('.story-card').filter({hasText:'Переплёт'});if(await card.count()!==1)throw Error('Missing/duplicate library card');await card.click();
if(await p.locator('#detail-title').textContent()!=='Переплёт')throw Error('Wrong detail');
console.log('BUNDLED_LIBRARY_LONG_TAB_AND_DETAIL_OK');
await p.evaluate(async()=>{Store.data.settings.typewriter=false;Store.data.meta.rate.state='never';Ads.showInterstitial=async()=>{};await UI.play('pereplyot','restart');document.documentElement.style.setProperty('--safe-area-inset-top','24px');document.documentElement.style.setProperty('--safe-area-inset-bottom','24px');});
for(const id of ['f14t','f14d','f14r']){
 const info=await p.evaluate(id=>{Engine.goTo(id);Engine.state.lineIndex=Engine.scene().lines.length-1;Engine.renderLine();Engine.advance();const card=document.querySelector('.ending-card');const b=card.getBoundingClientRect();return {title:document.querySelector('#ending-title').textContent,visible:document.querySelector('#ending-ov').classList.contains('open'),top:b.top,bottom:b.bottom,scroll:getComputedStyle(card).overflowY};},id);
 if(!info.visible||info.top<24||info.bottom>544||info.scroll!=='auto')throw Error(JSON.stringify(info));
 await p.locator('#ending-library').scrollIntoViewIfNeeded();
 const box=await p.locator('#ending-library').boundingBox();if(box.y+box.height>544)throw Error('Ending exit hidden');
 console.log('ENDING_OVERLAY_OK',id,info.title);
}
await browser.close();
