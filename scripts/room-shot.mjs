// 生成 2D 兜底用的房间截图：用 WebKit 打开打包好的网站，进房间，直接从 3D 画布取图，
// 裁到房间大小，背景填成页面的粉色，压成 150KB 以内的 JPEG，写到 src/assets/room-2d.jpg。
// 房间外观有改动时重跑：npm run build && node scripts/room-shot.mjs

import fs from 'node:fs';
import path from 'node:path';
import { webkit, devices } from 'playwright';
import { serveDist } from './serve-dist.mjs';

const OUT = path.resolve(import.meta.dirname, '..', 'src', 'assets', 'room-2d.jpg');
const LIMIT = 150 * 1024;
const PORT = 4177;
const server = await serveDist(PORT);
const browser = await webkit.launch();
const page = await (await browser.newContext({ ...devices['iPhone 8'] })).newPage();
await page.goto(`http://127.0.0.1:${PORT}/?frosting=7f3a`);
await page.tap('#enter');
await page.waitForFunction(() => window.__room);
await page.waitForTimeout(5000);

const result = await page.evaluate((limit) => {
  const { renderer, scene, camera } = window.__room;
  renderer.render(scene, camera);
  const src = renderer.domElement;
  // 画到 2D 画布上，找出不透明像素的范围（房间以外是透明的）
  const full = document.createElement('canvas');
  full.width = src.width;
  full.height = src.height;
  const fg = full.getContext('2d');
  fg.drawImage(src, 0, 0);
  const { data } = fg.getImageData(0, 0, full.width, full.height);
  let x0 = full.width, y0 = full.height, x1 = 0, y1 = 0;
  for (let y = 0; y < full.height; y++) {
    for (let x = 0; x < full.width; x++) {
      if (data[(y * full.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  // 四周留一点边，让页面上的渐隐遮罩不会切到房间
  const m = Math.round((x1 - x0) * 0.08);
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
  x1 = Math.min(full.width - 1, x1 + m); y1 = Math.min(full.height - 1, y1 + m);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  const og = out.getContext('2d');
  og.fillStyle = '#FCE7E6'; // 和页面背景在房间位置的颜色接近，边缘再用遮罩淡出
  og.fillRect(0, 0, out.width, out.height);
  og.drawImage(full, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  for (let q = 0.86; q > 0.4; q -= 0.04) {
    const url = out.toDataURL('image/jpeg', q);
    if ((url.length - 23) * 0.75 < limit) return { url, q, w: out.width, h: out.height };
  }
  return null;
}, LIMIT);

if (!result) throw new Error('压不到 150KB 以内');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(result.url.split(',')[1], 'base64'));
console.log(`${OUT}  ${result.w}×${result.h}  质量 ${result.q.toFixed(2)}  ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
await browser.close();
server.close();
