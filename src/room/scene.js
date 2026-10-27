// 房间里的所有物件，全部用代码生成。
// 单位是米：房间 3×3，墙高 2.2。左墙在 x=-1.5，右墙在 z=-1.5，镜头永远在 +x/+z 这一侧。
//
// 这里只负责"摆什么、什么颜色"。之后 bake.js 会算顶点 AO 并合并网格，
// paint.js 会给地板和墙画上阴影和光。
//
// userData 标记：
//   unit      合并成一个网格的单位（可互动的物件、每个气球）
//   keep      不参与合并（会单独动的，或有贴图的）
//   shell     房间结构（墙、地板），不算遮挡物，也不算顶点 AO
//   noOcclude 太细太薄，不算遮挡物
//   shade     会在地板和墙上投下柔和的接触阴影
import {
  Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, CylinderGeometry, SphereGeometry,
  ConeGeometry, BoxGeometry, TorusGeometry, BufferGeometry, Float32BufferAttribute,
  CatmullRomCurve3, TubeGeometry, Vector3, PlaneGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const C = {
  pink: 0xf6c9d0,
  pinkDeep: 0xeba3b3,
  cream: 0xfff4e8,
  lilac: 0xcdb8e8,
  wood: 0xe8c49a,
  woodDark: 0xd9ad7e,
  sage: 0x9cc59a,
  sageDark: 0x86b585,
  gold: 0xe8b860,
  warm: 0xffd9a0,
  white: 0xfffaf5,
};

export const ROOM = 3;
export const HALF = ROOM / 2;
export const WALL_H = 2.2;
const WALL_T = 0.26;
export const INNER = -HALF + 0.01; // 两面墙内侧表面的位置

const mats = new Map();
const mat = (color) => {
  if (!mats.has(color)) mats.set(color, new MeshLambertMaterial({ color }));
  return mats.get(color);
};
const glowMats = new Map();
const glow = (color) => {
  if (!glowMats.has(color)) glowMats.set(color, new MeshBasicMaterial({ color }));
  return glowMats.get(color);
};

function box(w, h, d, color, r = 0.04) {
  const geo = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
  return new Mesh(geo, mat(color));
}
const cyl = (rTop, rBottom, h, color, seg = 24) => new Mesh(new CylinderGeometry(rTop, rBottom, h, seg), mat(color));
const ball = (r, color, w = 16, h = 12) => new Mesh(new SphereGeometry(r, w, h), mat(color));

function at(obj, x, y, z) {
  obj.position.set(x, y, z);
  return obj;
}
const flag = (obj, ...keys) => {
  for (const k of keys) obj.userData[k] = true;
  return obj;
};

// ---------- 结构：底座、地板、两面墙 ----------

function shell() {
  const g = new Group();
  // 厚厚的白色圆角地台和墙，做出微缩模型的感觉
  const lo = INNER - WALL_T - 0.05, hi = HALF + 0.06;
  g.add(at(box(hi - lo, 0.34, hi - lo, 0xf7dfe2, 0.12), (hi + lo) / 2, -0.21, (hi + lo) / 2));
  g.add(at(box(ROOM, 0.06, ROOM, C.wood, 0.02), 0, -0.01, 0));
  const wallH = WALL_H + 0.04;
  g.add(at(box(WALL_T, wallH, HALF - INNER, C.white, 0.1), INNER - WALL_T / 2, wallH / 2 - 0.04, (HALF + INNER) / 2));
  g.add(at(box(HALF - INNER + WALL_T, wallH, WALL_T, C.white, 0.1), (HALF + INNER - WALL_T) / 2, wallH / 2 - 0.04, INNER - WALL_T / 2));
  g.traverse((o) => flag(o, 'shell'));

  // 墙裙上沿的装饰条和踢脚线
  const trims = new Group();
  trims.add(at(box(0.035, 0.05, ROOM - 0.02, C.white, 0.015), INNER + 0.015, 0.8, 0));
  trims.add(at(box(ROOM - 0.02, 0.05, 0.035, C.white, 0.015), 0, 0.8, INNER + 0.015));
  trims.add(at(box(0.03, 0.09, ROOM - 0.02, C.pinkDeep, 0.012), INNER + 0.012, 0.065, 0));
  trims.add(at(box(ROOM - 0.02, 0.09, 0.03, C.pinkDeep, 0.012), 0, 0.065, INNER + 0.012));
  trims.traverse((o) => flag(o, 'noOcclude'));
  g.add(trims);
  return g;
}

// ---------- 装饰 ----------

export const RUG = { x: 0.15, z: 0.2, r: 1.0 };

function rugEdge() {
  // 地毯本体画在地板贴图上，这里只做一圈软软的边，让它有厚度
  const ring = new Mesh(new TorusGeometry(RUG.r, 0.028, 6, 64), mat(0xc2aae2));
  ring.rotation.x = -Math.PI / 2;
  ring.scale.z = 0.6;
  return flag(at(ring, RUG.x, 0.03, RUG.z), 'noOcclude');
}

export const WINDOW = { cx: 0.35, cy: 1.3, w: 1.0, h: 0.95 };

function curtain(w, h) {
  const geo = new BoxGeometry(w, h, 0.05, 12, 1, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setZ(i, p.getZ(i) + Math.sin((x / w) * Math.PI * 4) * 0.022);
  }
  geo.computeVertexNormals();
  return new Mesh(geo, mat(C.pink));
}

function windowOnRightWall() {
  const g = new Group();
  const { cx, cy, w, h } = WINDOW;
  const z = INNER;
  g.add(at(box(w + 0.12, h + 0.12, 0.06, C.white, 0.04), cx, cy, z));
  const glass = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: C.warm }));
  glass.name = 'glass';
  g.add(flag(at(glass, cx, cy, z + 0.032), 'keep', 'noOcclude'));
  g.add(flag(at(box(0.04, h, 0.03, C.white, 0.012), cx, cy, z + 0.05), 'noOcclude'));
  g.add(flag(at(box(w, 0.04, 0.03, C.white, 0.012), cx, cy + 0.08, z + 0.05), 'noOcclude'));
  g.add(flag(at(box(w + 0.3, 0.06, 0.12, C.white, 0.03), cx, cy - h / 2 - 0.08, z + 0.06), 'shade'));
  for (const side of [-1, 1]) {
    g.add(flag(at(curtain(0.28, h + 0.32), cx + side * (w / 2 + 0.12), cy - 0.06, z + 0.11), 'shade'));
    // 窗帘绑带
    g.add(flag(at(box(0.3, 0.022, 0.075, C.pinkDeep, 0.01), cx + side * (w / 2 + 0.12), cy - 0.2, z + 0.14), 'noOcclude'));
  }
  g.add(flag(at(cyl(0.015, 0.015, w + 0.75, C.gold, 8), cx, cy + h / 2 + 0.16, z + 0.12), 'noOcclude'));
  g.children.at(-1).rotation.z = Math.PI / 2;
  return g;
}

export const BULBS = [];

function stringLights() {
  const g = new Group();
  const y = WALL_H;
  const curve = new CatmullRomCurve3([
    new Vector3(INNER + 0.03, y - 0.12, HALF - 0.1),
    new Vector3(INNER + 0.03, y - 0.4, 0.4),
    new Vector3(INNER + 0.03, y - 0.16, -0.5),
    new Vector3(INNER + 0.06, y - 0.12, INNER + 0.06),
    new Vector3(-0.5, y - 0.38, INNER + 0.03),
    new Vector3(0.5, y - 0.14, INNER + 0.03),
    new Vector3(HALF - 0.1, y - 0.34, INNER + 0.03),
  ]);
  g.add(flag(new Mesh(new TubeGeometry(curve, 64, 0.008, 4), mat(C.woodDark)), 'noOcclude'));
  const bulb = new SphereGeometry(0.032, 10, 8);
  for (let i = 0; i <= 22; i++) {
    const p = curve.getPoint(i / 22);
    p.y -= 0.04;
    BULBS.push(p.clone());
    g.add(flag(at(new Mesh(bulb, glow(0xfff0c8)), p.x, p.y, p.z), 'noOcclude'));
  }
  return g;
}

function triangle(w, h, color) {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, -h, 0], 3));
  geo.setIndex([0, 2, 1]);
  geo.computeVertexNormals();
  return new Mesh(geo, mat(color));
}

function bunting() {
  const g = new Group();
  const x = INNER + 0.03;
  const curve = new CatmullRomCurve3([
    new Vector3(x, 1.6, 1.25), new Vector3(x, 1.38, 0.45), new Vector3(x, 1.52, -0.4), new Vector3(x, 1.75, -1.3),
  ]);
  g.add(new Mesh(new TubeGeometry(curve, 32, 0.007, 4), mat(C.woodDark)));
  const colors = [0xffb3c6, 0xd6c2ff, 0xffe39a, 0xb9ebc8, 0xffcfae];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const p = curve.getPoint((i + 0.5) / n);
    const tri = triangle(0.2, 0.24, colors[i % colors.length]);
    tri.position.set(p.x + 0.004, p.y, p.z);
    tri.rotation.y = Math.PI / 2;
    g.add(tri);
  }
  g.traverse((o) => flag(o, 'noOcclude'));
  return g;
}

export const LAMP = { x: -1.12, z: -1.12, shadeY: 1.38 };

function lamp() {
  const g = new Group();
  g.add(flag(at(cyl(0.16, 0.18, 0.05, C.wood), 0, 0.025, 0), 'shade'));
  g.add(flag(at(cyl(0.02, 0.02, 1.25, C.gold, 8), 0, 0.65, 0), 'shade'));
  // 灯罩本身发光
  g.add(flag(at(new Mesh(new CylinderGeometry(0.15, 0.24, 0.28, 32), glow(0xffe6c0)), 0, LAMP.shadeY, 0), 'shade'));
  g.add(at(cyl(0.155, 0.155, 0.03, C.pink, 32), 0, LAMP.shadeY + 0.14, 0));
  g.add(at(cyl(0.245, 0.245, 0.03, C.pink, 32), 0, LAMP.shadeY - 0.14, 0));
  g.position.set(LAMP.x, 0.02, LAMP.z);
  return g;
}

function plant() {
  const g = new Group();
  g.add(flag(at(cyl(0.17, 0.13, 0.32, C.pinkDeep), 0, 0.16, 0), 'shade'));
  g.add(at(cyl(0.175, 0.175, 0.04, C.pink), 0, 0.32, 0));
  g.add(at(cyl(0.15, 0.15, 0.02, 0x9b7a5c), 0, 0.33, 0));
  const leaves = [[0, 0.52, 0, 0.18], [0.11, 0.64, 0.05, 0.14], [-0.1, 0.68, -0.03, 0.13], [0.02, 0.82, 0, 0.11], [-0.06, 0.55, 0.1, 0.12]];
  leaves.forEach(([x, y, z, r], i) => g.add(at(ball(r, i % 2 ? C.sageDark : C.sage), x, y, z)));
  g.position.set(1.15, 0.02, -1.12);
  return g;
}

// 填补前面空地板：坐垫和派对帽
function cushion() {
  const g = new Group();
  const body = ball(1, 0xffc2d1, 24, 14);
  body.scale.set(0.3, 0.14, 0.3);
  g.add(flag(at(body, 0, 0.14, 0), 'shade'));
  const piping = new Mesh(new TorusGeometry(0.27, 0.03, 8, 40), mat(0xffe0e8));
  piping.rotation.x = -Math.PI / 2;
  g.add(at(piping, 0, 0.12, 0));
  g.add(at(ball(0.035, C.white, 10, 8), 0, 0.275, 0));
  g.position.set(1.0, 0.02, 0.95);
  return g;
}

function partyHat() {
  const g = new Group();
  g.add(flag(new Mesh(new ConeGeometry(0.1, 0.24, 20), mat(0xffb3c6)), 'shade'));
  g.add(at(cyl(0.101, 0.101, 0.03, C.white, 20), 0, -0.09, 0));
  g.add(at(cyl(0.065, 0.065, 0.025, C.white, 20), 0, -0.01, 0));
  g.add(at(ball(0.04, C.gold, 10, 8), 0, 0.13, 0));
  g.rotation.z = 0.5;
  g.position.set(0.52, 0.1, 1.28);
  return g;
}

// ---------- 可互动的三样 ----------

function gifts() {
  const g = new Group();
  const make = (w, h, d, color, ribbon, x, z, ry) => {
    const b = new Group();
    b.add(flag(at(box(w, h, d, color, 0.06), 0, h / 2, 0), 'shade'));
    b.add(at(box(w + 0.012, h + 0.012, 0.055, ribbon, 0.015), 0, h / 2, 0));
    b.add(at(box(0.055, h + 0.012, d + 0.012, ribbon, 0.015), 0, h / 2, 0));
    for (const s of [-1, 1]) {
      const loop = ball(0.065, ribbon, 12, 8);
      loop.scale.set(1.25, 0.7, 0.6);
      loop.rotation.z = s * 0.35;
      loop.position.set(s * 0.065, h + 0.04, 0);
      b.add(loop);
    }
    b.add(at(ball(0.03, ribbon, 10, 8), 0, h + 0.03, 0));
    b.position.set(x, 0.02, z);
    b.rotation.y = ry;
    return b;
  };
  g.add(make(0.5, 0.42, 0.5, C.pinkDeep, C.gold, 0, 0, 0.2));
  g.add(make(0.36, 0.3, 0.36, C.lilac, C.white, 0.4, 0.28, -0.3));
  g.add(make(0.3, 0.24, 0.3, C.cream, C.pinkDeep, -0.24, 0.38, 0.5));
  const top = make(0.28, 0.22, 0.28, C.sage, C.cream, 0, 0, -0.2);
  top.position.y = 0.45;
  g.add(top);
  g.position.set(-0.42, 0, 0.72);
  g.scale.setScalar(1.35);
  return g;
}

function balloons() {
  const g = new Group();
  const anchor = new Vector3(0, 0.1, 0);
  g.add(flag(at(box(0.14, 0.12, 0.14, C.gold, 0.045), 0, 0.08, 0), 'shade'));
  const list = [
    [-0.15, 1.75, 0.05, C.pink, 0.24],
    [0.18, 1.88, -0.08, C.lilac, 0.23],
    [0.02, 2.05, 0.12, C.pinkDeep, 0.22],
    [-0.1, 1.55, -0.2, C.cream, 0.2],
    [0.24, 1.6, 0.18, C.gold, 0.19],
  ];
  const sphere = new SphereGeometry(1, 24, 18);
  const knot = new ConeGeometry(0.035, 0.06, 8);
  list.forEach(([x, y, z, color, r], i) => {
    const b = new Group();
    const body = new Mesh(sphere, mat(color));
    body.scale.set(r, r * 1.15, r);
    flag(body, 'shade');
    b.add(body);
    b.add(at(new Mesh(knot, mat(color)), 0, -r * 1.15 - 0.02, 0));
    b.position.set(x, y, z);
    b.userData.phase = i * 1.3;
    b.userData.base = y;
    flag(b, 'unit');
    g.add(b);
    const curve = new CatmullRomCurve3([
      new Vector3(x, y - r * 1.15 - 0.04, z),
      new Vector3(x * 0.6 + 0.03, (y + anchor.y) / 2, z * 0.6),
      anchor.clone(),
    ]);
    g.add(flag(new Mesh(new TubeGeometry(curve, 12, 0.005, 3), mat(0xd7b9a0)), 'noOcclude'));
  });
  g.position.set(-1.0, 0, 0.0);
  return g;
}

function cakeTable() {
  const g = new Group();
  g.add(flag(at(cyl(0.42, 0.42, 0.06, C.wood, 40), 0, 0.62, 0), 'shade'));
  g.add(flag(at(cyl(0.05, 0.07, 0.6, C.woodDark, 12), 0, 0.31, 0), 'shade'));
  g.add(flag(at(cyl(0.22, 0.24, 0.04, C.woodDark, 24), 0, 0.02, 0), 'shade'));

  const cake = new Group();
  cake.add(at(cyl(0.27, 0.27, 0.02, C.white, 40), 0, 0.01, 0)); // 盘子
  cake.add(at(cyl(0.2, 0.2, 0.14, C.cream, 40), 0, 0.09, 0));
  cake.add(at(cyl(0.207, 0.207, 0.035, C.pink, 40), 0, 0.165, 0)); // 糖霜
  cake.add(at(cyl(0.14, 0.14, 0.1, C.pink, 40), 0, 0.23, 0));
  cake.add(at(cyl(0.145, 0.145, 0.02, C.white, 40), 0, 0.275, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    cake.add(at(ball(0.026, C.white, 8, 6), Math.cos(a) * 0.18, 0.19, Math.sin(a) * 0.18));
    if (i % 2) cake.add(at(ball(0.018, C.pinkDeep, 8, 6), Math.cos(a) * 0.1, 0.29, Math.sin(a) * 0.1));
  }
  cake.add(at(cyl(0.012, 0.012, 0.12, C.lilac, 8), 0, 0.34, 0)); // 蜡烛
  const flame = new Mesh(new SphereGeometry(0.022, 10, 8), new MeshBasicMaterial({ color: 0xffc56e }));
  flame.scale.set(1, 1.6, 1);
  flame.position.set(0, 0.43, 0);
  flame.name = 'flame';
  cake.add(flag(flame, 'keep', 'noOcclude'));

  // 插在蛋糕上的牌子，比蜡烛高，放在蜡烛后面；"阿呆"两个字由 paint.js 画上去
  const sign = new Group();
  sign.add(at(box(0.34, 0.16, 0.014, C.white, 0.03), 0, 0.53, 0));
  // 两根插进蛋糕的小棍
  for (const s of [-1, 1]) sign.add(at(cyl(0.009, 0.009, 0.26, 0xd9a441, 8), s * 0.11, 0.36, -0.012));
  const label = new Mesh(new PlaneGeometry(0.32, 0.15), new MeshBasicMaterial({ transparent: true }));
  label.name = 'signLabel';
  sign.add(flag(at(label, 0, 0.53, 0.0085), 'keep'));
  sign.position.set(-0.05, 0, -0.05);
  sign.rotation.y = Math.PI / 4;
  sign.traverse((o) => flag(o, 'noOcclude'));
  cake.add(sign);

  cake.position.y = 0.65;
  g.add(cake);
  g.position.set(0.55, 0.02, -0.15);
  g.scale.setScalar(1.5);
  return g;
}

export function buildRoom() {
  const root = new Group();
  flag(root, 'unit');
  root.add(shell(), rugEdge(), windowOnRightWall(), stringLights(), bunting(), lamp(), plant(), cushion(), partyHat());
  const interactive = { gifts: gifts(), balloons: balloons(), cake: cakeTable() };
  for (const [key, obj] of Object.entries(interactive)) {
    obj.userData.interactive = key;
    obj.userData.baseScale = obj.scale.x;
    flag(obj, 'unit');
    root.add(obj);
  }
  root.updateMatrixWorld(true);
  return { root, interactive };
}
