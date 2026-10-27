// 检查两个退路（iPhone 8 尺寸的 WebKit）：
//   A. 完全没有 WebGL → 2D 兜底页，拆完 4 张券，不下载 3D 代码
//   B. 检测到 WebGL2，但 3D 渲染器建不起来 → 也换成 2D 兜底页
//   C. 3D 代码下载很慢 → 按钮显示"正在进入……"；下载失败 → "网络有点慢，再点一次试试"，再点能进去
// 先 npm run build，再运行：node scripts/fallback-check.mjs <截图文件夹>

import fs from 'node:fs';
import path from 'node:path';
import { webkit, devices } from 'playwright';
import { serveDist } from './serve-dist.mjs';

const OUT = path.resolve(process.argv[2] ?? 'fallback-shots');
const PORT = 4178;
const URL = `http://127.0.0.1:${PORT}/?frosting=7f3a`;
const server = await serveDist(PORT);
fs.mkdirSync(OUT, { recursive: true });
const browser = await webkit.launch();
let failed = 0;
const ok = (cond, msg) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${msg}`);
};

// 在页面脚本运行之前，把 WebGL 关掉（模拟没有 WebGL 的手机）
const NO_WEBGL = () => {
  const real = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    return /webgl/.test(type) ? null : real.call(this, type, ...rest);
  };
};
// 第一次（网站的检测）给真的 WebGL2，之后（three.js 建渲染器）都失败
const RENDERER_FAILS = () => {
  const real = HTMLCanvasElement.prototype.getContext;
  let calls = 0;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (/webgl/.test(type) && calls++ > 0) return null;
    return real.call(this, type, ...rest);
  };
};

async function newPage(init) {
  const context = await browser.newContext({ ...devices['iPhone 8'] });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push(r.url()));
  return { context, page, errors, requests };
}

async function couponFlow(page, prefix) {
  await page.tap('[data-act="gift"]');
  await page.waitForSelector('.sheet .flip');
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(450);
    await page.tap('.sheet .flip');
    await page.waitForTimeout(800);
    if (i === 0) await page.screenshot({ path: path.join(OUT, `${prefix}-coupon-1.png`) });
    await page.tap('.sheet-next');
  }
  await page.waitForSelector('.sheet .wallet');
  await page.waitForTimeout(400);
  const sheetCount = (await page.textContent('.sheet-count')).trim();
  await page.tap('.sheet-close');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${prefix}-after.png`) });
  await page.tap('.fb-wallet');
  await page.waitForSelector('.sheet .wallet');
  const hash = await page.evaluate(() => location.hash);
  await page.tap('.sheet-close');
  await page.waitForTimeout(400);
  return { sheetCount, button: (await page.textContent('.fb-wallet b')).trim(), hash };
}

for (const [name, init] of [['A-no-webgl', NO_WEBGL], ['B-renderer-fails', RENDERER_FAILS]]) {
  console.log(name);
  const { context, page, errors, requests } = await newPage(init);
  await page.goto(URL);
  await page.waitForSelector('#entrance:not([hidden])');
  await page.waitForTimeout(800);
  await page.tap('#enter');
  await page.waitForSelector('#room.fallback .fb-room', { timeout: 10000 });
  await page.waitForTimeout(900);
  const img = await page.evaluate(() => {
    const i = document.querySelector('.fb-room');
    return { loaded: i.complete && i.naturalWidth > 0, w: Math.round(i.getBoundingClientRect().width) };
  });
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  ok(img.loaded, `房间截图显示出来了（宽 ${img.w}px）`);
  const r = await couponFlow(page, name);
  ok(r.sheetCount === '4 / 4' && r.button === '4/4', `拆完 4 张：券包 ${r.sheetCount}，按钮 ${r.button}，网址 ${r.hash}`);
  if (name.startsWith('A')) ok(!requests.some((u) => /\/room-[^/]*\.js$/.test(u)), '没有下载 3D 代码');
  ok(!errors.length, errors.length ? `页面报错：${errors.join('; ')}` : '没有页面报错');
  await context.close();
}

console.log('C-slow-then-fail');
{
  const { context, page, errors } = await newPage();
  // 先让 3D 代码下载很慢
  let mode = 'slow';
  await page.route(/\/assets\/room-[^/]*\.js$/, async (route) => {
    if (mode === 'fail') return route.abort();
    if (mode === 'slow') await new Promise((r) => setTimeout(r, 3000));
    return route.continue();
  });
  // C1：慢
  await page.goto(URL);
  await page.waitForSelector('#entrance:not([hidden])');
  await page.tap('#enter');
  await page.waitForTimeout(400);
  const loadingText = (await page.textContent('#enter')).trim();
  await page.screenshot({ path: path.join(OUT, 'C1-loading.png') });
  ok(loadingText === '正在进入……', `下载中按钮显示「${loadingText}」`);
  await page.waitForFunction(() => window.__room, null, { timeout: 15000 });
  ok(true, '下载完自动进入房间');

  ok(!errors.length, errors.length ? `页面报错：${errors.join('; ')}` : '没有页面报错');
  await context.close();
}
{
  // C2：失败 → 提示 → 网络恢复后再点一次。新开一个浏览器环境（不用上一步的缓存），
  // 由服务器直接断开连接来模拟断网（Playwright 的 route.abort 在 WebKit 里会被一直记住，不像真断网）
  const { context, page, errors } = await newPage();
  let mode = 'fail';
  const flaky = await serveDist(PORT + 1, (url) => mode === 'fail' && /\/assets\/room-[^/?]*\.js(\?|$)/.test(url));
  await page.goto(URL.replace(String(PORT), String(PORT + 1)));
  await page.waitForSelector('#entrance:not([hidden])');
  await page.waitForTimeout(500);
  await page.tap('#enter');
  await page.waitForTimeout(800);
  const failText = (await page.textContent('#enter')).trim();
  const stillHere = await page.isVisible('#entrance');
  await page.screenshot({ path: path.join(OUT, 'C2-failed.png') });
  ok(failText === '网络有点慢，再点一次试试' && stillHere, `下载失败按钮显示「${failText}」，还停在入场页`);
  // 网络恢复：再点一次，重新下载，进入房间
  mode = 'ok';
  await page.tap('#enter');
  const back = await page.waitForFunction(() => window.__room, null, { timeout: 15000 }).then(() => true, () => false);
  ok(back, '网络恢复后再点一次，进入了 3D 房间');
  ok(!errors.length, errors.length ? `页面报错：${errors.join('; ')}` : '没有页面报错');
  await context.close();
  flaky.close();
}

console.log(failed ? `\n${failed} 项不通过` : '\n全部通过');
await browser.close();
server.close();
process.exitCode = failed ? 1 : 0;
