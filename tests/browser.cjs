const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
 const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.otf') ? 'font/otf' : 'text/html'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404).end(); }
 }).listen(0, '127.0.0.1');
 await new Promise(resolve => server.on('listening', resolve));
 const origin = `http://127.0.0.1:${server.address().port}`;
 let browser;
 try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-crashpad', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({viewport:{width:1200,height:1000}}), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/examples/custom-ui.html');
  await page.getByText('Ready to explore', {exact:true}).waitFor();
  await page.getByRole('button', {name:'Add water',exact:true}).click();
  await page.locator('#card').evaluate(async container => {
   const {createMaterialCard}=await import('/src/material-card.js');
   // Separate test mounts prevent interference from example UI state.
   const a=document.createElement('div'),b=document.createElement('div');
   a.style.cssText=b.style.cssText='height:250px;width:400px';
   document.body.prepend(a,b);
   window.testA=await createMaterialCard(a);window.testB=await createMaterialCard(b);
   window.testMount=a;
   window.testA.apply('water');
  });
  await page.waitForTimeout(200);
  assert((await page.evaluate(()=>testA.getState().wet))>0);
  assert.equal(await page.evaluate(()=>testB.getState().wet),0);
  await page.evaluate(()=>{testA.fresh();testA.apply('burn');});
  await page.waitForTimeout(600);
  const dryChar=await page.evaluate(()=>testA.getState().char);
  await page.evaluate(()=>{testA.fresh();testA.apply('water');testA.apply('burn');});
  await page.waitForTimeout(600);
  assert((await page.evaluate(()=>testA.getState().char))<dryChar);
  await page.evaluate(()=>{testA.inspect();testA.flip();testA.setLight(5);testA.setRakingLight(true);testA.setBrushSize(.15);testA.dry();testA.apply('crease');testA.fresh();});
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>testA.getState().char),0);
  assert.equal(await page.evaluate(()=>testA.getState().wet),0);
  await page.evaluate(async()=>{testA.destroy();testA.destroy();testB.destroy();const {createMaterialCard}=await import('/src/material-card.js');window.testA=await createMaterialCard(testMount);});
  assert.equal(await page.evaluate(()=>testMount.children.length),1);
  await page.evaluate(()=>testA.destroy());
  await page.goto(origin+'/index.html');
  await page.locator('#cardMount div').first().waitFor();
  await page.waitForTimeout(350);
  await page.getByRole('button',{name:'Water',exact:true}).click();
  await page.locator('#cardMount #stage').focus();await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  assert.match(await page.locator('#status').innerText(),/water/);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: public API, independent instances, wet/heat coupling, cleanup, re-mount, original and custom UIs, mobile layout.');
 } finally { if(browser)await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
