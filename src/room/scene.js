// 房间里的所有物件，全部用代码生成。
// 单位是米：房间 3×3，墙高 2.2。左墙在 x=-1.5，右墙在 z=-1.5，镜头永远在 +x/+z 这一侧。
import {
  Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, CylinderGeometry, SphereGeometry,
  ConeGeometry, BufferGeometry, Float32BufferAttribute, CatmullRomCurve3, TubeGeometry,
  Vector3, DoubleSide,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const C = {
  pink: 0xf6c9d0,
  pinkDeep: 0xeba3b3,
  cream: 0xfff4e8,
  wallLeft: 0xfdeee3,
  lilac: 0xcdb8e8,
  wood: 0xe8c49a,
  woodDark: 0xd9ad7e,
  sage: 0x9cc59a,
  sageDark: 0x86b585,
  gold: 0xe8b860,
  warm: 0xffd9a0,
  white: 0xffffff,
};

const ROOM = 3;
const HALF = ROOM / 2;
const WALL_H = 2.2;
const WALL_T = 0.14;

const mats = new Map();
const mat = (color) => {
  if (!mats.has(color)) mats.set(color, new MeshLambertMaterial({ color }));
  return mats.get(color);
};
const glow = (color) => new MeshBasicMaterial({ color });

function box(w, h, d, color, r = 0.04) {
  const geo = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
  return new Mesh(geo, mat(color));
}

function cyl(rTop, rBottom, h, color, seg = 24) {
  return new Mesh(new CylinderGeometry(rTop, rBottom, h, seg), mat(color));
}

function at(obj, x, y, z) {
  obj.position.set(x, y, z);
  return obj;
}

// ---------- 结构：底座、地板、两面墙 ----------

function shell() {
  const g = new Group();
  g.add(at(box(ROOM + 0.1, 0.22, ROOM + 0.1, C.pinkDeep, 0.08), 0, -0.13, 0));
  g.add(at(box(ROOM, 0.06, ROOM, C.wood, 0.02), 0, -0.01, 0));
  g.add(at(box(WALL_T, WALL_H, ROOM, C.wallLeft, 0.05), -HALF - WALL_T / 2 + 0.01, WALL_H / 2, 0));
  g.add(at(box(ROOM + WALL_T, WALL_H, WALL_T, C.cream, 0.05), -WALL_T / 2, WALL_H / 2, -HALF - WALL_T / 2 + 0.01));
  // 踢脚线
  g.add(at(box(0.04, 0.1, ROOM, C.pink, 0.015), -HALF + 0.02, 0.07, 0));
  g.add(at(box(ROOM, 0.1, 0.04, C.pink, 0.015), 0, 0.07, -HALF + 0.02));
  return g;
}

// ---------- 装饰 ----------

function rug() {
  const g = new Group();
  g.add(at(cyl(1.0, 1.0, 0.03, C.lilac, 48), 0.15, 0.035, 0.2));
  g.add(at(cyl(0.72, 0.72, 0.035, 0xdccdf0, 48), 0.15, 0.04, 0.2));
  return g;
}

function windowOnRightWall() {
  const g = new Group();
  const z = -HALF + 0.02;
  const cx = 0.35, cy = 1.3, w = 1.0, h = 0.95;
  g.add(at(box(w + 0.12, h + 0.12, 0.06, C.white, 0.04), cx, cy, z));
  const glass = new Mesh(new RoundedBoxGeometry(w, h, 0.02, 2, 0.03), glow(C.warm));
  g.add(at(glass, cx, cy, z + 0.03));
  g.add(at(box(0.04, h, 0.03, C.white, 0.01), cx, cy, z + 0.05));
  g.add(at(box(w, 0.04, 0.03, C.white, 0.01), cx, cy + 0.08, z + 0.05));
  g.add(at(box(w + 0.3, 0.06, 0.12, C.white, 0.03), cx, cy - h / 2 - 0.08, z + 0.06)); // 窗台
  // 窗帘
  for (const side of [-1, 1]) {
    g.add(at(box(0.26, h + 0.3, 0.08, C.pink, 0.06), cx + side * (w / 2 + 0.1), cy - 0.05, z + 0.1));
  }
  g.add(at(box(w + 0.7, 0.04, 0.04, C.gold, 0.02), cx, cy + h / 2 + 0.16, z + 0.1)); // 窗帘杆
  return g;
}

function stringLights() {
  const g = new Group();
  const pts = [
    new Vector3(-HALF + 0.05, WALL_H - 0.12, HALF - 0.1),
    new Vector3(-HALF + 0.05, WALL_H - 0.4, 0.3),
    new Vector3(-HALF + 0.05, WALL_H - 0.18, -0.6),
    new Vector3(-HALF + 0.08, WALL_H - 0.14, -HALF + 0.08),
    new Vector3(-0.4, WALL_H - 0.36, -HALF + 0.05),
    new Vector3(0.6, WALL_H - 0.16, -HALF + 0.05),
    new Vector3(HALF - 0.1, WALL_H - 0.34, -HALF + 0.05),
  ];
  const curve = new CatmullRomCurve3(pts);
  g.add(new Mesh(new TubeGeometry(curve, 64, 0.008, 4), mat(C.woodDark)));
  const bulb = new SphereGeometry(0.035, 10, 8);
  const bulbMat = glow(0xffe6b0);
  for (let i = 0; i <= 22; i++) {
    const p = curve.getPoint(i / 22);
    g.add(at(new Mesh(bulb, bulbMat), p.x, p.y - 0.04, p.z));
  }
  return g;
}

function bunting() {
  const g = new Group();
  const x = -HALF + 0.04;
  const curve = new CatmullRomCurve3([
    new Vector3(x, 1.55, 1.2), new Vector3(x, 1.35, 0.4), new Vector3(x, 1.5, -0.4), new Vector3(x, 1.7, -1.25),
  ]);
  g.add(new Mesh(new TubeGeometry(curve, 32, 0.007, 4), mat(C.woodDark)));
  const colors = [C.pink, C.lilac, C.gold, C.pinkDeep, C.sage];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const p = curve.getPoint((i + 0.5) / n);
    const tri = triangle(0.2, 0.24, colors[i % colors.length]);
    tri.position.set(p.x + 0.005, p.y, p.z);
    tri.rotation.y = Math.PI / 2;
    g.add(tri);
  }
  return g;
}

function triangle(w, h, color) {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, -h, 0], 3));
  geo.computeVertexNormals();
  const m = new MeshLambertMaterial({ color, side: DoubleSide });
  return new Mesh(geo, m);
}

function lamp() {
  const g = new Group();
  g.add(at(cyl(0.16, 0.18, 0.04, C.wood), 0, 0.02, 0));
  g.add(at(cyl(0.02, 0.02, 1.25, C.gold, 8), 0, 0.65, 0));
  const shade = new Mesh(new CylinderGeometry(0.15, 0.24, 0.26, 24, 1, true), new MeshLambertMaterial({ color: C.cream, side: DoubleSide, emissive: 0xffd9a0, emissiveIntensity: 0.55 }));
  g.add(at(shade, 0, 1.36, 0));
  g.add(at(new Mesh(new SphereGeometry(0.06, 12, 8), glow(0xfff0d0)), 0, 1.3, 0));
  g.position.set(-0.72, 0.02, -1.15);
  g.name = 'lamp';
  return g;
}

function plant() {
  const g = new Group();
  g.add(at(cyl(0.16, 0.12, 0.3, C.pinkDeep), 0, 0.15, 0));
  g.add(at(cyl(0.15, 0.15, 0.02, 0x9b7a5c), 0, 0.3, 0));
  const leaves = [[0, 0.5, 0, 0.17], [0.1, 0.62, 0.05, 0.13], [-0.09, 0.66, -0.03, 0.12], [0.02, 0.78, 0, 0.1]];
  leaves.forEach(([x, y, z, r], i) => {
    g.add(at(new Mesh(new SphereGeometry(r, 14, 10), mat(i % 2 ? C.sageDark : C.sage)), x, y, z));
  });
  g.position.set(1.2, 0.02, -1.15);
  return g;
}

function shelf() {
  // 左墙上的小置物板，放一个小相框形状（不放照片）和一颗星星
  const g = new Group();
  const x = -HALF + 0.12;
  g.add(at(box(0.22, 0.04, 0.6, C.wood, 0.015), x, 1.0, -0.55));
  g.add(at(box(0.04, 0.22, 0.18, C.lilac, 0.03), x - 0.05, 1.13, -0.7));
  g.add(at(new Mesh(new SphereGeometry(0.07, 12, 10), mat(C.gold)), x, 1.09, -0.4));
  return g;
}

// ---------- 可互动的三样 ----------

function gifts() {
  const g = new Group();
  const make = (w, h, d, color, ribbon, x, z, ry) => {
    const b = new Group();
    b.add(at(box(w, h, d, color, 0.05), 0, h / 2, 0));
    b.add(at(box(w + 0.01, h + 0.01, 0.05, ribbon, 0.01), 0, h / 2, 0));
    b.add(at(box(0.05, h + 0.01, d + 0.01, ribbon, 0.01), 0, h / 2, 0));
    for (const s of [-1, 1]) {
      const loop = new Mesh(new SphereGeometry(0.06, 10, 8), mat(ribbon));
      loop.scale.set(1.2, 0.7, 0.6);
      loop.position.set(s * 0.06, h + 0.04, 0);
      b.add(loop);
    }
    b.position.set(x, 0.02, z);
    b.rotation.y = ry;
    return b;
  };
  g.add(make(0.5, 0.42, 0.5, C.pinkDeep, C.gold, 0, 0, 0.2));
  g.add(make(0.36, 0.3, 0.36, C.lilac, C.white, 0.38, 0.28, -0.3));
  g.add(make(0.3, 0.24, 0.3, C.cream, C.pinkDeep, -0.22, 0.38, 0.5));
  const top = make(0.28, 0.22, 0.28, C.sage, C.cream, 0, 0, -0.2);
  top.position.y = 0.44;
  g.add(top);
  g.position.set(-0.6, 0, 0.95);
  g.scale.setScalar(1.15);
  g.name = 'gifts';
  return g;
}

function balloons() {
  const g = new Group();
  const anchor = new Vector3(0, 0.08, 0);
  g.add(at(box(0.14, 0.1, 0.14, C.gold, 0.04), 0, 0.07, 0)); // 小砝码
  const list = [
    [-0.15, 1.75, 0.05, C.pink, 0.24],
    [0.18, 1.88, -0.08, C.lilac, 0.23],
    [0.02, 2.05, 0.12, C.pinkDeep, 0.22],
    [-0.08, 1.55, -0.2, C.cream, 0.2],
    [0.24, 1.6, 0.18, C.gold, 0.19],
  ];
  const sphere = new SphereGeometry(1, 20, 16);
  const knot = new ConeGeometry(0.035, 0.06, 8);
  list.forEach(([x, y, z, color, r], i) => {
    const b = new Group();
    const ball = new Mesh(sphere, mat(color));
    ball.scale.set(r, r * 1.15, r);
    b.add(ball);
    b.add(at(new Mesh(knot, mat(color)), 0, -r * 1.15 - 0.02, 0));
    b.position.set(x, y, z);
    b.userData.phase = i * 1.3;
    b.userData.base = y;
    g.add(b);
    const curve = new CatmullRomCurve3([
      new Vector3(x, y - r * 1.15 - 0.04, z),
      new Vector3(x * 0.6 + 0.03, (y + anchor.y) / 2, z * 0.6),
      anchor.clone(),
    ]);
    g.add(new Mesh(new TubeGeometry(curve, 12, 0.005, 3), mat(0xd7b9a0)));
  });
  g.position.set(-1.0, 0, 0.0);
  g.name = 'balloons';
  return g;
}

function cakeTable() {
  const g = new Group();
  g.add(at(cyl(0.42, 0.42, 0.06, C.wood, 32), 0, 0.62, 0));
  g.add(at(cyl(0.05, 0.07, 0.6, C.woodDark, 12), 0, 0.31, 0));
  g.add(at(cyl(0.22, 0.24, 0.03, C.woodDark, 24), 0, 0.03, 0));

  const cake = new Group();
  cake.add(at(cyl(0.27, 0.27, 0.02, C.white, 32), 0, 0.01, 0)); // 盘子
  cake.add(at(cyl(0.2, 0.2, 0.14, C.cream, 32), 0, 0.09, 0));
  cake.add(at(cyl(0.205, 0.205, 0.03, C.pink, 32), 0, 0.17, 0)); // 糖霜
  cake.add(at(cyl(0.14, 0.14, 0.1, C.pink, 32), 0, 0.23, 0));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    cake.add(at(new Mesh(new SphereGeometry(0.025, 8, 6), mat(C.white)), Math.cos(a) * 0.18, 0.19, Math.sin(a) * 0.18));
  }
  cake.add(at(cyl(0.012, 0.012, 0.12, C.lilac, 8), 0, 0.34, 0)); // 蜡烛
  const flame = new Mesh(new SphereGeometry(0.022, 10, 8), glow(0xffc56e));
  flame.scale.set(1, 1.6, 1);
  flame.position.set(0, 0.43, 0);
  flame.name = 'flame';
  cake.add(flame);
  // 小牌子（M3 写上"阿呆"）
  cake.add(at(box(0.12, 0.07, 0.01, C.white, 0.01), 0.07, 0.36, 0.06));
  cake.add(at(cyl(0.004, 0.004, 0.1, C.gold, 6), 0.07, 0.3, 0.055));
  cake.position.y = 0.65;
  g.add(cake);

  g.position.set(0.72, 0.02, -0.3);
  g.scale.setScalar(1.25);
  g.name = 'cake';
  return g;
}

export function buildRoom() {
  const root = new Group();
  root.add(shell(), rug(), windowOnRightWall(), stringLights(), bunting(), shelf(), lamp(), plant());
  const interactive = { gifts: gifts(), balloons: balloons(), cake: cakeTable() };
  for (const [key, obj] of Object.entries(interactive)) {
    obj.userData.interactive = key;
    obj.userData.baseScale = obj.scale.x;
    root.add(obj);
  }
  return { root, interactive };
}
