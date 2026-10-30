// 用 2D canvas "画"出光影：地板和墙上的柔和阴影、窗外透进的暖光、台灯光晕、灯串光点。
// 这些都是一次性画好的贴图，运行时不算实时阴影，所以手机跑得动。
import {
  CanvasTexture, SRGBColorSpace, Mesh, PlaneGeometry, MeshLambertMaterial, MeshBasicMaterial,
  Points, PointsMaterial, BufferGeometry, Float32BufferAttribute, Sprite, SpriteMaterial, AdditiveBlending,
  Vector3,
} from 'three';
import { INNER, HALF, WALL_H, RUG, WINDOW, LAMP, BULBS } from './scene.js';

// ---------- 小工具 ----------

// iOS 16 以前的 Safari 没有 roundRect，补一个简单版
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function texture(c, renderer) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  if (renderer) t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return t;
}

function rand(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 一块要画的表面：用"米"作单位画图，内部换算成像素
class Surface {
  constructor(widthM, heightM, px, toLocal) {
    this.widthM = widthM;
    this.heightM = heightM;
    this.toLocal = toLocal;
    this.albedo = canvas(px, Math.round((px * heightM) / widthM));
    this.glow = canvas(256, Math.round((256 * heightM) / widthM));
    for (const c of [this.albedo, this.glow]) {
      const s = c.width / widthM;
      c.getContext('2d').setTransform(s, 0, 0, s, 0, 0);
    }
    this.glow.getContext('2d').fillRect(0, 0, widthM, heightM);
  }

  get a() { return this.albedo.getContext('2d'); }
  get g() { return this.glow.getContext('2d'); }

  // 模糊的圆角矩形（用 canvas 的 shadowBlur，所有手机浏览器都支持）
  soft(ctx, x, y, w, h, r, blur, color) {
    const s = ctx.canvas.width / this.widthM;
    const off = 10000;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * s;
    ctx.shadowOffsetX = off;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(x - off / s, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
    ctx.fill();
    ctx.restore();
  }

  radial(ctx, x, y, r, color, alpha, op = 'lighter') {
    ctx.save();
    ctx.globalCompositeOperation = op;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${color},${alpha})`);
    gr.addColorStop(0.45, `rgba(${color},${alpha * 0.45})`);
    gr.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = gr;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  mesh(renderer) {
    const material = new MeshLambertMaterial({
      map: texture(this.albedo, renderer),
      emissive: 0xffffff,
      emissiveMap: texture(this.glow),
    });
    const mesh = new Mesh(new PlaneGeometry(this.widthM, this.heightM), material);
    mesh.userData.keep = true;
    return mesh;
  }
}

const SHADOW = '150,92,104';

// 物件在表面上的柔和接触阴影
function contactShadows(surf, occluders, distanceOf, rectOf, near, color = SHADOW, strength = 1) {
  for (const o of occluders) {
    if (!o.shade) continue;
    const d = distanceOf(o.box);
    if (d > near || d < -0.05) continue;
    const k = 1 - Math.max(d, 0) / near;
    const [x, y, w, h] = rectOf(o.box);
    const r = Math.min(w, h) * 0.45;
    surf.soft(surf.a, x + w * 0.06, y + h * 0.06, w * 0.88, h * 0.88, r, 0.02 + d * 0.25, `rgba(${color},${0.55 * k * strength})`);
    surf.soft(surf.a, x - 0.05, y - 0.05, w + 0.1, h + 0.1, r + 0.05, 0.14 + d * 0.3, `rgba(${color},${0.2 * k * strength})`);
  }
}

// 墙角和地面交界处的暗部（乘法叠加）
function cornerShade(ctx, x0, y0, x1, y1) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const gr = ctx.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, 'rgb(238,212,210)');
  gr.addColorStop(0.35, 'rgb(248,234,232)');
  gr.addColorStop(1, 'rgb(255,255,255)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

// ---------- 地板 ----------

function paintFloor(occluders, renderer) {
  const x0 = INNER, x1 = HALF - 0.02, z0 = INNER, z1 = HALF - 0.02;
  const surf = new Surface(x1 - x0, z1 - z0, 1024, (p) => [p.x - x0, p.z - z0]);
  const a = surf.a;
  const W = surf.widthM, H = surf.heightM;

  // 木地板
  a.fillStyle = '#EDCBA4';
  a.fillRect(0, 0, W, H);
  const rnd = rand(7);
  const plank = 0.24;
  for (let row = 0; row * plank < H; row++) {
    let x = -rnd() * 1.2;
    while (x < W) {
      const len = 0.9 + rnd() * 0.8;
      a.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(170,120,80,0.06)';
      a.fillRect(x, row * plank, len, plank);
      a.fillStyle = 'rgba(178,128,92,0.3)';
      a.fillRect(x, row * plank, 0.006, plank);
      x += len;
    }
    a.fillRect(0, row * plank, W, 0.006);
  }

  // 地毯
  const [rx, rz] = surf.toLocal(new Vector3(RUG.x, 0, RUG.z));
  const circle = (r, color) => {
    a.fillStyle = color;
    a.beginPath();
    a.arc(rx, rz, r, 0, Math.PI * 2);
    a.fill();
  };
  circle(RUG.r, '#D8C5F0');
  circle(0.72, '#E6DCF7');
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    a.fillStyle = '#C6B0E8';
    a.beginPath();
    a.arc(rx + Math.cos(t) * 0.86, rz + Math.sin(t) * 0.86, 0.022, 0, Math.PI * 2);
    a.fill();
  }
  for (let i = 0; i < 7; i++) {
    const t = (i / 7) * Math.PI * 2 + 0.3;
    star(a, rx + Math.cos(t) * 0.42, rz + Math.sin(t) * 0.42, 0.06, '#D7C6F1');
  }
  star(a, rx, rz, 0.1, '#D7C6F1');

  const confetti = ['#FFB3C6', '#D6C2FF', '#FFE39A', '#B9EBC8', '#FFCFAE', '#F6C9D0'];
  const rc = rand(21);
  for (let i = 0; i < 90; i++) {
    const x = 0.2 + rc() * (W - 0.3), z = 1.3 + rc() * (H - 1.4);
    if (x < 1.6 && z < 1.9) continue; // 主要撒在前面的空地板
    a.save();
    a.translate(x, z);
    a.rotate(rc() * Math.PI);
    a.fillStyle = confetti[i % confetti.length];
    if (i % 3) a.fillRect(-0.025, -0.01, 0.05, 0.02);
    else { a.beginPath(); a.arc(0, 0, 0.016, 0, Math.PI * 2); a.fill(); }
    a.restore();
  }

  cornerShade(a, 0, 0, 0.55, 0);
  cornerShade(a, 0, 0, 0, 0.55);
  surf.radial(a, 0, 0, 0.8, '214,170,170', 0.18, 'source-over');

  contactShadows(surf, occluders, (b) => b.min.y - 0.02, (b) => [b.min.x - x0, b.min.z - z0, b.max.x - b.min.x, b.max.z - b.min.z], 0.4);
  // 桌面这类离地较高的物件，在地上留下很淡的一大片影子
  for (const o of occluders) {
    if (!o.shade || o.box.min.y < 0.4 || o.box.min.y > 1.1) continue;
    const b = o.box;
    surf.soft(a, b.min.x - x0, b.min.z - z0, b.max.x - b.min.x, b.max.z - b.min.z, 0.3, 0.3, `rgba(${SHADOW},0.1)`);
  }

  // 发光：台灯照在地上的暖光、窗户投下的光斑
  const g = surf.g;
  const [lx, lz] = surf.toLocal(new Vector3(LAMP.x, 0, LAMP.z));
  surf.radial(g, lx, lz, 1.1, '255,176,110', 0.4);
  const { cx, w } = WINDOW;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.shadowColor = 'rgba(255,210,140,0.9)';
  g.shadowBlur = 0.05 * (g.canvas.width / W);
  g.fillStyle = 'rgba(255,210,140,0.92)';
  const panes = [[cx - w / 2 + 0.03, cx - 0.03], [cx + 0.03, cx + w / 2 - 0.03]];
  for (const [xa, xb] of panes) {
    for (const [za, zb] of [[0.05, 0.42], [0.48, 1.05]]) {
      const shift = 0.28; // 光斜着照进来，越往前越偏右
      const q = [[xa + za * shift, za], [xb + za * shift, za], [xb + zb * shift, zb], [xa + zb * shift, zb]]
        .map(([x, z]) => surf.toLocal(new Vector3(x, 0, INNER + z)));
      g.beginPath();
      q.forEach(([u, v], i) => (i ? g.lineTo(u, v) : g.moveTo(u, v)));
      g.fill();
    }
  }
  g.restore();

  const mesh = surf.mesh(renderer);
  mesh.rotation.x = -Math.PI / 2;
  // 比地板木块顶面（0.02）高 4mm，避免两个面重叠闪烁
  mesh.position.set((x0 + x1) / 2, 0.024, (z0 + z1) / 2);
  return mesh;
}

function star(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr);
  }
  ctx.fill();
}

// ---------- 墙 ----------

function paintWall(side, occluders, renderer) {
  const y0 = 0.02, y1 = WALL_H - 0.1;
  const a0 = INNER, a1 = HALF - 0.1;
  // 左墙：画布左边是靠镜头的前缘，右边是墙角；右墙：画布左边是墙角
  const toLocal = side === 'left' ? (p) => [a1 - p.z, y1 - p.y] : (p) => [p.x - a0, y1 - p.y];
  const surf = new Surface(a1 - a0, y1 - y0, 512, toLocal);
  const a = surf.a;
  const W = surf.widthM, H = surf.heightM;

  a.fillStyle = '#FFF3EA';
  a.fillRect(0, 0, W, H);
  // 小圆点壁纸
  a.fillStyle = 'rgba(238,170,186,0.42)';
  for (let row = 0; row * 0.15 < H - 0.85; row++) {
    for (let col = 0; col * 0.15 < W + 0.15; col++) {
      a.beginPath();
      a.arc(col * 0.15 + (row % 2) * 0.075, 0.08 + row * 0.15, 0.011, 0, Math.PI * 2);
      a.fill();
    }
  }
  // 墙裙
  const wainscot = y1 - 0.8;
  a.fillStyle = '#F9D8DE';
  a.fillRect(0, wainscot, W, H - wainscot);
  for (let x = 0.08; x < W - 0.2; x += 0.34) {
    a.strokeStyle = 'rgba(226,150,168,0.45)';
    a.lineWidth = 0.008;
    a.beginPath();
    a.roundRect(x, wainscot + 0.1, 0.26, 0.52, 0.03);
    a.stroke();
  }

  const cornerX = side === 'left' ? W : 0;
  cornerShade(a, cornerX, 0, side === 'left' ? W - 0.45 : 0.45, 0);
  cornerShade(a, 0, H, 0, H - 0.35);

  const dist = side === 'left' ? (b) => b.min.x - INNER : (b) => b.min.z - INNER;
  const rect = side === 'left'
    ? (b) => [a1 - b.max.z, y1 - b.max.y, b.max.z - b.min.z, b.max.y - b.min.y]
    : (b) => [b.min.x - a0, y1 - b.max.y, b.max.x - b.min.x, b.max.y - b.min.y];
  contactShadows(surf, occluders, dist, rect, 0.6, '236,160,180', 0.55);

  // 发光：灯串的光点、台灯照在墙上的光、窗户周围的暖光
  const g = surf.g;
  for (const p of BULBS) {
    const d = side === 'left' ? p.x - INNER : p.z - INNER;
    if (d > 0.12) continue;
    const [u, v] = toLocal(p);
    surf.radial(g, u, v, 0.17, '255,214,150', 0.42);
  }
  const lamp = new Vector3(LAMP.x, LAMP.shadeY, LAMP.z);
  const [lu, lv] = toLocal(lamp);
  const lampDist = side === 'left' ? LAMP.x - INNER : LAMP.z - INNER;
  surf.radial(g, lu, lv + 0.1, 0.65 + lampDist, '255,184,118', 0.6 * Math.exp(-lampDist * 1.5));
  if (side === 'right') {
    const [wu, wv] = toLocal(new Vector3(WINDOW.cx, WINDOW.cy, INNER));
    surf.radial(g, wu, wv, 1.15, '255,206,140', 0.16);
  }

  const mesh = surf.mesh(renderer);
  const cy = (y0 + y1) / 2;
  // 离墙面 4mm，避免和墙重叠闪烁
  if (side === 'left') {
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(INNER + 0.004, cy, (a0 + a1) / 2);
  } else {
    mesh.position.set((a0 + a1) / 2, cy, INNER + 0.004);
  }
  return mesh;
}

// ---------- 其他贴图 ----------

function paintGlass() {
  const c = canvas(128, 128);
  const ctx = c.getContext('2d');
  const gr = ctx.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#FFEBC6');
  gr.addColorStop(1, '#FFCB8E');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 128, 128);
  const sun = ctx.createRadialGradient(92, 34, 0, 92, 34, 60);
  sun.addColorStop(0, 'rgba(255,252,236,0.95)');
  sun.addColorStop(1, 'rgba(255,252,236,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 128, 128);
  return texture(c);
}

function haloTexture() {
  const c = canvas(64, 64);
  const ctx = c.getContext('2d');
  const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 64, 64);
  return texture(c);
}

function roomShadow() {
  const size = 6;
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const s = 256 / size;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.shadowColor = 'rgba(200,104,130,0.62)';
  ctx.shadowBlur = 0.4 * s;
  ctx.shadowOffsetX = 10000;
  ctx.beginPath();
  ctx.roundRect(size / 2 - 1.85 - 10000 / s, size / 2 - 1.85, 3.5, 3.5, 0.35);
  ctx.fill();
  const mesh = new Mesh(new PlaneGeometry(size, size), new MeshBasicMaterial({ map: texture(c), transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.385;
  mesh.renderOrder = -1;
  mesh.userData.keep = true;
  return mesh;
}

// background：给 AR 导出用，画成不透明的（和牌子同色），避免透明贴图在 Quick Look 里出问题
export function paintSign(mesh, background) {
  const c = canvas(256, 120);
  const tex = texture(c);
  const draw = () => {
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.fillStyle = '#D9788B';
    ctx.font = '700 88px PartyRound, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('阿呆', 128, 66);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.load('700 88px PartyRound', '阿呆').then(draw, () => {});
  mesh.material.map = tex;
  mesh.material.needsUpdate = true;
}

// ---------- 组装 ----------

export function addPaintedLight(root, occluders, renderer) {
  root.add(paintFloor(occluders, renderer), paintWall('left', occluders, renderer), paintWall('right', occluders, renderer), roomShadow());

  const glass = root.getObjectByName('glass');
  glass.material.map = paintGlass();
  glass.material.color.set(0xffffff);
  paintSign(root.getObjectByName('signLabel'));

  // 光晕：灯串用一组点（一次绘制），台灯、窗户、烛火各用一个精灵
  const halo = haloTexture();
  const bulbs = new Points(
    new BufferGeometry().setAttribute('position', new Float32BufferAttribute(BULBS.flatMap((p) => [p.x + 0.03, p.y, p.z + 0.03]), 3)),
    new PointsMaterial({ map: halo, color: 0xffc77a, transparent: true, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: false }),
  );
  root.add(bulbs);

  const sprite = (color, opacity, size, pos) => {
    const s = new Sprite(new SpriteMaterial({ map: halo, color, opacity, depthWrite: false, blending: AdditiveBlending }));
    s.scale.setScalar(size);
    s.position.copy(pos);
    root.add(s);
    return s;
  };
  sprite(0xffb062, 0.42, 1.15, new Vector3(LAMP.x + 0.08, LAMP.shadeY - 0.05, LAMP.z + 0.08));
  sprite(0xffc98a, 0.12, 1.5, new Vector3(WINDOW.cx, WINDOW.cy, INNER + 0.25));
  const flame = root.getObjectByName('flame');
  const flameHalo = new Sprite(new SpriteMaterial({ map: halo, color: 0xffb35c, opacity: 0.8, depthWrite: false, blending: AdditiveBlending }));
  flameHalo.scale.setScalar(0.28);
  flameHalo.name = 'flameHalo';
  flame.parent.add(flameHalo);
  flameHalo.position.copy(flame.position);

  // 每帧更新：点的大小要跟着缩放走（正交镜头下点大小是像素）
  return (camera, t, flameOut) => {
    const pxPerMeter = renderer.domElement.height / ((camera.top - camera.bottom) / camera.zoom);
    bulbs.material.size = 0.17 * pxPerMeter;
    bulbs.material.opacity = 0.5 + Math.sin(t * 2.2) * 0.1;
    if (!flameOut) flameHalo.material.opacity = 0.7 + Math.sin(t * 13) * 0.1;
  };
}
