import pw from '/opt/npm-tools/node_modules/playwright/index.js';
const { chromium } = pw;
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = [];
p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto('http://localhost:3217/lab', { waitUntil: 'load', timeout: 120000 });
await p.waitForTimeout(40000);
await p.evaluate(() => { const e = document.querySelector('.room3d-stage'); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 4); });
await p.waitForTimeout(2500);
const stage = await p.locator('.room3d-stage').first().boundingBox();
console.log('stage', JSON.stringify(stage), 'aspect', (stage.width/stage.height).toFixed(3));
const shots = ['studio','desk','window','corner'];
for (let i = 0; i < 4; i++) {
  if (i > 0) {
    await p.locator('.room3d-nav button').last().click();
    await p.waitForTimeout(26000);
  }
  const name = await p.locator('.room3d-shot').first().innerText().catch(()=>'?');
  await p.screenshot({ path: `scratchpad/mob-${i}-${shots[i]}.png`, clip: stage });
  console.log(i, 'label:', name);
}
console.log('ERRORS', errs.slice(0,6));
await b.close();
