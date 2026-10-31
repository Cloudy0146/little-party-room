// 用假时钟检查开门时间：10 月 31 日打开是倒计时，11 月 1 日 00:00（UTC+8）准时变成入场页。
// 先 npm run build，再运行：node scripts/unlock-check.mjs <截图文件夹>
// 用的是最终的干净网址（不带 ?frosting），和她收到的一样。

import fs from 'node:fs';
import path from 'node:path';
import { webkit, devices } from 'playwright';
import { serveDist } from './serve-dist.mjs';

const OUT = path.resolve(process.argv[2] ?? 'unlock-shots');
// 测正式网址：设 BASE_URL=https://cloudy0146.github.io/little-party-room/ 就不起本地服务器
const PORT = 4176;
const URL = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}/`;
const server = process.env.BASE_URL ? null : await serveDist(PORT);
fs.mkdirSync(OUT, { recursive: true });
const browser = await webkit.launch();
let failed = 0;

async function check(name, { time, timezoneId = 'Asia/Kuala_Lumpur', advance = 0, expect }) {
  const context = await browser.newContext({ ...devices['iPhone 8'], timezoneId });
  await context.clock.install({ time: new Date(time) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(300);
  const before = await state(page);
  if (advance) await page.clock.runFor(advance);
  await page.waitForTimeout(800);
  const after = await state(page);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const ok = after.screen === expect && !errors.length;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}（${timezoneId}）：${before.screen} ${before.timer}${advance ? ` → 过 ${advance / 1000} 秒 → ${after.screen} ${after.timer}` : ''}${errors.length ? `  报错：${errors.join('; ')}` : ''}`);
  await context.close();
}

const state = (page) => page.evaluate(() => ({
  screen: !document.getElementById('countdown').hidden ? '倒计时' : !document.getElementById('entrance').hidden ? '入场页' : '其他',
  timer: !document.getElementById('countdown').hidden ? document.querySelector('.timer').innerText.replace(/\s+/g, '') : '',
}));

await check('1030-noon', { time: '2026-10-30T12:00:00+08:00', expect: '倒计时' });
await check('1031-0000', { time: '2026-10-31T00:00:00+08:00', expect: '倒计时' });
await check('1031-2100', { time: '2026-10-31T21:00:00+08:00', expect: '倒计时' });
await check('1031-2359-to-1101', { time: '2026-10-31T23:59:55+08:00', advance: 6000, expect: '入场页' });
await check('1101-0000', { time: '2026-11-01T00:00:00+08:00', expect: '入场页' });
await check('1101-0900', { time: '2026-11-01T09:00:00+08:00', expect: '入场页' });
// 手机时区不是马来西亚也一样：按绝对时间开门
await check('1031-2100-london', { time: '2026-10-31T21:00:00+08:00', timezoneId: 'Europe/London', expect: '倒计时' });
await check('1101-0001-london', { time: '2026-11-01T00:00:01+08:00', timezoneId: 'Europe/London', expect: '入场页' });

console.log(failed ? `\n${failed} 项不通过` : '\n全部通过');
await browser.close();
server?.close();
process.exitCode = failed ? 1 : 0;
