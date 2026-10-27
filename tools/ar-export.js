// 把房间里的蛋糕导出成 AR 用的模型：public/ar/cake.glb（Android）和 public/ar/cake.usdz（iPhone）。
// 只在本地开发服务器里跑（vite.config.js 里的 ar-save 插件负责把文件写进 public/ar/）。
// 改了蛋糕的样子以后，重新打开这个页面导出一次。
import { Group, MeshStandardMaterial } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
import '../src/style.css';
import { buildCake } from '../src/room/scene.js';
import { paintSign } from '../src/room/paint.js';

// 房间里蛋糕主体半径 0.2，真实蛋糕直径约 20cm，所以缩小一半
const REAL_SCALE = 0.5;

const log = (s) => (document.getElementById('log').textContent += '\n' + s);

async function save(name, data) {
  const res = await fetch(`/__ar-save?name=${name}`, { method: 'POST', body: data });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  log(`${name}  ${(data.byteLength / 1024).toFixed(1)} KB`);
}

async function main() {
  await document.fonts.load('700 88px PartyRound', '阿呆');

  const cake = buildCake();
  // AR 里用真实光照：全部换成 PBR 材质（Quick Look 只认 MeshStandardMaterial）
  const cache = new Map();
  cake.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name === 'signLabel') {
      o.material = new MeshStandardMaterial({ roughness: 0.85 });
      paintSign(o, '#' + o.parent.children[0].material.color.getHexString());
      return;
    }
    if (o.name === 'flame') {
      o.material = new MeshStandardMaterial({ color: 0xffc56e, emissive: 0xffa040, emissiveIntensity: 1 });
      return;
    }
    const hex = o.material.color.getHex();
    if (!cache.has(hex)) cache.set(hex, new MeshStandardMaterial({ color: hex, roughness: 0.75, metalness: 0 }));
    o.material = cache.get(hex);
  });

  const root = new Group();
  root.name = 'birthday_cake';
  cake.scale.setScalar(REAL_SCALE);
  root.add(cake);
  root.updateMatrixWorld(true);

  const glb = await new GLTFExporter().parseAsync(root, { binary: true });
  await save('cake.glb', glb);
  const usdz = await new USDZExporter().parseAsync(root, { quickLookCompatible: true });
  await save('cake.usdz', usdz);
  log('完成');
}

main().catch((e) => log('失败：' + e.message));
