// 用 Playwright 的 WebKit 按 iPhone 8 的尺寸把整个流程走一遍，检查有没有报错、字有没有缺。
// 先 npm run build，再运行：node scripts/webkit-flow.mjs <截图文件夹>
// 测正式网址：设 BASE_URL=https://cloudy0146.github.io/little-party-room/ 就不起本地服务器
//
// 注意：这是电脑上的 WebKit，不是真的 iPhone Safari。它能抓到脚本报错、缺字、流程断掉，
// 但性能、AR Quick Look、静音键这些只能在真手机上看。

import fs from 'node:fs';
import path from 'node:path';
import { webkit, devices } from 'playwright';
import { serveDist } from './serve-dist.mjs';

const OUT = path.resolve(process.argv[2] ?? 'webkit-shots');
const PORT = 4174;
const BASE = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}/`;
const server = process.env.BASE_URL ? null : await serveDist(PORT);
fs.mkdirSync(OUT, { recursive: true });

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 8'] });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(`console.${m.type()}: ${m.text()}`));
page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url()}`));

let n = 0;
const shot = (name) => page.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`) });
const step = (msg) => console.log(`· ${msg}`);
const wait = (ms) => page.waitForTimeout(ms);

// 房间里某个物件在屏幕上的位置（预览模式才有 window.__room）
async function screenPoint(key, lift) {
  return page.evaluate(([key, lift]) => {
    const { scene, camera, renderer } = window.__room;
    let obj = null;
    scene.traverse((o) => { if (o.userData.interactive === key) obj = o; });
    if (key === 'balloons') obj = obj.children.find((c) => c.userData.base !== undefined);
    const v = camera.position.clone();
    obj.getWorldPosition(v);
    v.y += lift;
    v.project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, [key, lift]);
}
async function tapObject(key, lift) {
  const p = await screenPoint(key, lift);
  await page.touchscreen.tap(p.x, p.y);
}

// 1. 倒计时
await page.goto(BASE);
await page.waitForSelector('#countdown:not([hidden])');
await wait(800);
await shot('countdown');
step(`倒计时：${(await page.textContent('.timer')).replace(/\s+/g, ' ').trim()}`);

// 2. 解锁后的入场页
await page.goto(`${BASE}?frosting=7f3a`);
await page.waitForSelector('#entrance:not([hidden])');
await wait(1200);
await shot('entrance');

// 字体：每个字分别用 PartyRound 和系统字体画出来比较。一样就说明 PartyRound 里没有这个字，
// 浏览器借了系统字体（真手机上系统字体也没有的话就是方框）
const fontCheck = await page.evaluate(async () => {
  const chars = [...'阿呆茶修芥䄱券兑换生日快乐'];
  await document.fonts.ready;
  await Promise.all(['500', '700'].map((w) => document.fonts.load(`${w} 40px PartyRound`, chars.join(''))));
  const draw = (font, ch) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = font;
    g.fillText(ch, 4, 48);
    return c.toDataURL();
  };
  return chars.map((ch) => {
    const own = draw('700 40px PartyRound', ch);
    const fromSystem = own === draw('700 40px serif', ch) || own === draw('700 40px sans-serif', ch);
    return { ch, ok: !fromSystem };
  });
});
step(`字体：${fontCheck.map((f) => `${f.ch}${f.ok ? '✓' : '✗'}`).join(' ')}`);

// 3. 进入房间
const t0 = Date.now();
await page.tap('#enter');
await page.waitForFunction(() => window.__room);
step(`点「进入」到房间建好：${Date.now() - t0} ms（电脑上；iPhone 8 大约慢几倍）`);
await wait(4500);
const gl = await page.evaluate(() => {
  const { renderer } = window.__room;
  return { webgl2: renderer.capabilities.isWebGL2, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio() };
});
step(`WebGL2=${gl.webgl2}  draw calls=${gl.calls}  三角形=${gl.triangles}  pixelRatio=${gl.pixelRatio}`);
await shot('room');

// 4. 礼物 → 翻 4 张券 → 券包 → 单张
await tapObject('gifts', 0.45);
await page.waitForSelector('.sheet .flip');
for (let i = 0; i < 4; i++) {
  await wait(500);
  await page.tap('.sheet .flip');
  await wait(900);
  await shot(`coupon-${i + 1}`);
  await page.tap('.sheet-next');
}
await page.waitForSelector('.sheet .wallet');
await wait(500);
await shot('wallet');
step(`券包：${(await page.textContent('.sheet-count')).trim()}  网址 #：${await page.evaluate(() => location.hash)}`);
await page.locator('.wallet-item', { hasText: '使唤券' }).tap();
await page.waitForSelector('.single');
await wait(500);
await shot('single-errand');
await page.tap('.single-back');
await wait(400);
await page.tap('.sheet-close');
await wait(600);

// 5. 气球：连戳 5 下，每次对准还没破的第一个气球的中心，应该 5 个全破
const popped = () => page.evaluate(() => {
  let n = 0;
  window.__room.scene.traverse((o) => { if (o.userData.popped) n++; });
  return n;
});
const pops = [];
for (let i = 0; i < 5; i++) {
  const p = await page.evaluate(() => {
    const { scene, camera, renderer } = window.__room;
    let g = null;
    scene.traverse((o) => { if (o.userData.interactive === 'balloons') g = o; });
    const b = g.children.find((c) => c.userData.base !== undefined && !c.userData.popped);
    const v = camera.position.clone();
    b.getWorldPosition(v);
    v.project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  });
  await page.touchscreen.tap(p.x, p.y);
  await wait(250);
  pops.push(await popped());
  if (i === 0) await shot('balloon-pop');
}
step(`气球：每戳一下后破了几个 → ${pops.join(' ')}`);

// 5b. 小茶杯人：点一下应该跳出小字，过两秒多自己消失
await tapObject('teacup', 0.45);
await wait(500);
await shot('teacup');
const bubbleOn = await page.evaluate(() => document.querySelector('.tea-bubble').classList.contains('show'));
step(`茶杯人：小字「${await page.textContent('.tea-bubble')}」show=${bubbleOn}`);
await wait(4500);

// 6. 蛋糕 → 吹蜡烛
await tapObject('cake', 1.1);
await page.waitForFunction(() => document.querySelector('#room').classList.contains('cake-mode'));
await wait(1800);
await shot('cake');
step(`蛋糕：${await page.textContent('.cake-msg')}`);
const vp = page.viewportSize();
await page.touchscreen.tap(vp.width / 2, vp.height * 0.4);
await wait(1500);
await shot('blown');
step(`吹完：${await page.textContent('.cake-msg')}`);

// 7. AR 按钮（这里没有 Quick Look，应该是转一转 3D 蛋糕）
const arLabel = (await page.textContent('[data-act="ar"]')).trim();
await page.tap('[data-act="ar"]');
await wait(2200);
const spin = await page.evaluate(() => document.querySelector('#room').classList.contains('spin-mode'));
step(`AR 按钮「${arLabel}」→ spin-mode=${spin}`);
await shot('spin');

// 8. 音乐开关（Windows 版 WebKit 没有 Web Audio，按钮会藏起来；真 iPhone 上有）
if (await page.isVisible('.music-toggle')) {
  await page.tap('.music-toggle');
  await wait(1200);
  const musicOn = await page.getAttribute('.music-toggle', 'aria-pressed');
  await shot('music-on');
  await page.tap('.music-toggle');
  await wait(300);
  step(`音乐：点一下 aria-pressed=${musicOn}，再点一下 ${await page.getAttribute('.music-toggle', 'aria-pressed')}`);
} else {
  step(`音乐：按钮已隐藏（AudioContext=${await page.evaluate(() => typeof AudioContext)}）`);
}

// 9. 回到房间
await page.tap('[data-act="back"]');
await wait(2200);
await shot('back-to-room');
step(`回到房间：cake-mode=${await page.evaluate(() => document.querySelector('#room').classList.contains('cake-mode'))}`);

console.log(problems.length ? `\n问题 ${problems.length} 条：\n${problems.join('\n')}` : '\n没有报错');
await browser.close();
server?.close();
