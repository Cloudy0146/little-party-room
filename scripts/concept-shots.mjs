// 概念稿截图（只在 concept-party-hall 分支）：现版 / A / B，各截 iPhone 8 和 360×800 两种尺寸，
// 同时量出礼物、气球、蛋糕在屏幕上的大小，以及绘制次数和三角形数。
// 先开本地开发服务器（npx vite --port 5173），再运行：node scripts/concept-shots.mjs
import fs from 'node:fs';
import path from 'node:path';
import { webkit, devices } from 'playwright';

const OUT = path.resolve(import.meta.dirname, '..', 'concept-shots');
fs.mkdirSync(OUT, { recursive: true });
const SIZES = [
  ['iphone8', { ...devices['iPhone 8'] }],
  ['360x800', { ...devices['iPhone 8'], viewport: { width: 360, height: 800 }, screen: { width: 360, height: 800 } }],
];
const browser = await webkit.launch();
for (const concept of ['now', 'a', 'b']) {
  for (const [sizeName, device] of SIZES) {
    const context = await browser.newContext(device);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:5173/?frosting=7f3a${concept === 'now' ? '' : `&concept=${concept}`}`);
    await page.waitForSelector('#entrance:not([hidden])');
    await page.waitForTimeout(600);
    await page.tap('#enter');
    await page.waitForFunction(() => window.__room);
    await page.waitForTimeout(7000);
    const info = await page.evaluate(() => {
      const { scene, camera, renderer } = window.__room;
      const r = renderer.domElement.getBoundingClientRect();
      const V = camera.position.constructor;
      const size = (key) => {
        let obj = null;
        scene.traverse((o) => { if (o.userData.interactive === key) obj = o; });
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        obj.traverse((m) => {
          if (!m.isMesh) return;
          m.geometry.computeBoundingBox();
          const b = m.geometry.boundingBox;
          for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
            const v = new V(x, y, z).applyMatrix4(m.matrixWorld).project(camera);
            const sx = ((v.x + 1) / 2) * r.width, sy = ((1 - v.y) / 2) * r.height;
            x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
          }
        });
        return `${Math.round(x1 - x0)}×${Math.round(y1 - y0)}`;
      };
      return {
        calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
        gifts: size('gifts'), balloons: size('balloons'), cake: size('cake'),
      };
    });
    const file = path.join(OUT, `${concept}-${sizeName}.png`);
    await page.screenshot({ path: file });
    console.log(`${concept.padEnd(3)} ${sizeName.padEnd(7)}  绘制 ${info.calls}  三角形 ${info.tris}  礼物 ${info.gifts}  气球 ${info.balloons}  蛋糕 ${info.cake} (px)${errors.length ? `  报错：${errors.join('; ')}` : ''}`);
    await context.close();
  }
}
await browser.close();
