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
  CatmullRomCurve3, TubeGeometry, Vector3, PlaneGeometry, CanvasTexture, SRGBColorSpace,
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

// 概念稿（只在 concept-party-hall 分支，不上线）：?concept=a 加宽的派对厅；?concept=b 再加小动物宾客。
// 不带参数就是现在的正式版房间
export const CONCEPT = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('concept');
export const HALL = CONCEPT === 'a' || CONCEPT === 'b';

export const ROOM = HALL ? 4.2 : 3;
export const HALF = ROOM / 2;
export const WALL_H = 2.2;
const WALL_T = 0.26;
export const INNER = -HALF + 0.01; // 两面墙内侧表面的位置
// 整个房间（地台+墙）的外框，镜头取景用
export const BOUNDS = { lo: INNER - WALL_T - 0.05, hi: HALF + 0.06, bottom: -0.38, top: WALL_H };

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
  const { lo, hi } = BOUNDS;
  g.add(at(box(hi - lo, 0.34, hi - lo, 0xf7dfe2, 0.12), (hi + lo) / 2, -0.21, (hi + lo) / 2));
  g.add(at(box(ROOM, 0.06, ROOM, C.wood, 0.02), 0, -0.01, 0));
  const wallH = WALL_H + 0.04;
  g.add(at(box(WALL_T, wallH, HALF - INNER, C.white, 0.1), INNER - WALL_T / 2, wallH / 2 - 0.04, (HALF + INNER) / 2));
  g.add(at(box(HALF - INNER + WALL_T, wallH, WALL_T, C.white, 0.1), (HALF + INNER - WALL_T) / 2, wallH / 2 - 0.04, INNER - WALL_T / 2));
  g.traverse((o) => flag(o, 'shell'));

  // 墙裙上沿的装饰条和踢脚线
  const trims = new Group();
  // 右墙的两条从墙角让开左墙那条的厚度，两条不在墙角重叠（重叠的顶面转动时会闪）
  const rightLen = HALF - 0.01 - (INNER + 0.035);
  const rightX = (HALF - 0.01 + INNER + 0.035) / 2;
  trims.add(at(box(0.035, 0.05, ROOM - 0.02, C.white, 0.015), INNER + 0.015, 0.8, 0));
  trims.add(at(box(rightLen, 0.05, 0.035, C.white, 0.015), rightX, 0.8, INNER + 0.015));
  trims.add(at(box(0.03, 0.09, ROOM - 0.02, C.pinkDeep, 0.012), INNER + 0.012, 0.065, 0));
  trims.add(at(box(rightLen, 0.09, 0.03, C.pinkDeep, 0.012), rightX, 0.065, INNER + 0.012));
  trims.traverse((o) => flag(o, 'noOcclude'));
  g.add(trims);
  return g;
}

// ---------- 装饰 ----------

export const RUG = HALL ? { x: 0, z: 0, r: 1.3 } : { x: 0.15, z: 0.2, r: 1.0 };

function rugEdge() {
  // 地毯本体画在地板贴图上，这里只做一圈软软的边，让它有厚度
  const ring = new Mesh(new TorusGeometry(RUG.r, 0.028, 6, 64), mat(0xc2aae2));
  ring.rotation.x = -Math.PI / 2;
  ring.scale.z = 0.6;
  return flag(at(ring, RUG.x, 0.03, RUG.z), 'noOcclude');
}

export const WINDOW = { cx: HALL ? 0.95 : 0.35, cy: 1.3, w: 1.0, h: 0.95 };

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
  // 玻璃比窗框前表面（z+0.03）高出 5mm；窗格的十字再往前，横竖两根前表面错开
  g.add(flag(at(glass, cx, cy, z + 0.035), 'keep', 'noOcclude'));
  g.add(flag(at(box(0.04, h, 0.03, C.white, 0.012), cx, cy, z + 0.058), 'noOcclude'));
  g.add(flag(at(box(w, 0.04, 0.03, C.white, 0.012), cx, cy + 0.08, z + 0.054), 'noOcclude'));
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

const K = HALF / 1.5; // 派对厅比原来的房间大多少

function stringLights() {
  const g = new Group();
  const y = WALL_H;
  const curve = new CatmullRomCurve3([
    new Vector3(INNER + 0.03, y - 0.12, HALF - 0.1),
    new Vector3(INNER + 0.03, y - 0.4, 0.4 * K),
    new Vector3(INNER + 0.03, y - 0.16, -0.5 * K),
    new Vector3(INNER + 0.06, y - 0.12, INNER + 0.06),
    new Vector3(-0.5 * K, y - 0.38, INNER + 0.03),
    new Vector3(0.5 * K, y - 0.14, INNER + 0.03),
    new Vector3(HALF - 0.1, y - 0.34, INNER + 0.03),
  ]);
  g.add(flag(new Mesh(new TubeGeometry(curve, 64, 0.008, 4), mat(C.woodDark)), 'noOcclude'));
  const bulb = new SphereGeometry(0.032, 10, 8);
  const n = HALL ? 30 : 22;
  for (let i = 0; i <= n; i++) {
    const p = curve.getPoint(i / n);
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

// 一串彩旗：points 是绳子经过的点，onLeft 表示挂在左墙（旗子朝 +x），否则挂在右墙（朝 +z）
function bunting(points, n, w, h, onLeft, colorOffset = 0) {
  const g = new Group();
  const curve = new CatmullRomCurve3(points);
  g.add(new Mesh(new TubeGeometry(curve, 32, 0.007, 4), mat(C.woodDark)));
  const colors = [0xffb3c6, 0xd6c2ff, 0xffe39a, 0xb9ebc8, 0xffcfae];
  for (let i = 0; i < n; i++) {
    const p = curve.getPoint((i + 0.5) / n);
    const tri = triangle(w, h, colors[(i + colorOffset) % colors.length]);
    // 旗子离绳子中心 4mm，贴在绳子前面
    if (onLeft) {
      tri.position.set(p.x + 0.004, p.y, p.z);
      tri.rotation.y = Math.PI / 2;
    } else {
      tri.position.set(p.x, p.y, p.z + 0.004);
    }
    g.add(tri);
  }
  g.traverse((o) => flag(o, 'noOcclude'));
  return g;
}

function buntings() {
  const x = INNER + 0.03;
  const z = INNER + 0.03;
  if (HALL) {
    // 派对厅：左墙留给"生日快乐"横幅，彩旗只挂右墙，从墙角挂到窗帘旁边
    return bunting([
      new Vector3(-2.0, 1.72, z), new Vector3(-1.4, 1.52, z), new Vector3(-0.75, 1.68, z), new Vector3(-0.1, 1.55, z),
    ], 9, 0.17, 0.2, false);
  }
  const left = bunting([
    new Vector3(x, 1.6, 1.25), new Vector3(x, 1.38, 0.45), new Vector3(x, 1.52, -0.4), new Vector3(x, 1.75, -1.3),
  ], 9, 0.2, 0.24, true);
  // 右墙：接着左墙那串从墙角拐过来，挂到窗帘旁边为止（台灯在它前面）
  const right = bunting([
    new Vector3(-1.38, 1.7, z), new Vector3(-0.98, 1.55, z), new Vector3(-0.6, 1.66, z),
  ], 5, 0.16, 0.19, false, 4);
  const g = new Group();
  g.add(left, right);
  return g;
}

export const LAMP = HALL ? { x: -1.72, z: -1.72, shadeY: 1.38 } : { x: -1.12, z: -1.12, shadeY: 1.38 };

function lamp() {
  const g = new Group();
  g.add(flag(at(cyl(0.16, 0.18, 0.05, C.wood), 0, 0.025, 0), 'shade'));
  g.add(flag(at(cyl(0.02, 0.02, 1.25, C.gold, 8), 0, 0.65, 0), 'shade'));
  // 灯罩本身发光
  g.add(flag(at(new Mesh(new CylinderGeometry(0.15, 0.24, 0.28, 32), glow(0xffe6c0)), 0, LAMP.shadeY, 0), 'shade'));
  // 灯罩上下的滚边：比灯罩粗 1.5cm，灯罩的顶面和底面藏在滚边里面，没有贴在一起的面
  g.add(at(cyl(0.165, 0.165, 0.034, C.pink, 32), 0, LAMP.shadeY + 0.14, 0));
  g.add(at(cyl(0.255, 0.255, 0.034, C.pink, 32), 0, LAMP.shadeY - 0.14, 0));
  g.position.set(LAMP.x, 0.02, LAMP.z);
  return g;
}

function plant() {
  const g = new Group();
  // 盆身顶面在 0.30；盆口是一圈空心圆环（顶到 0.346），土壤顶面在 0.316，陷在环里面
  g.add(flag(at(cyl(0.17, 0.13, 0.3, C.pinkDeep), 0, 0.15, 0), 'shade'));
  const rim = new Mesh(new TorusGeometry(0.16, 0.026, 8, 32), mat(C.pink));
  rim.rotation.x = -Math.PI / 2;
  g.add(at(rim, 0, 0.32, 0));
  g.add(at(cyl(0.148, 0.148, 0.03, 0x9b7a5c), 0, 0.301, 0));
  const leaves = [[0, 0.49, 0, 0.18], [0.11, 0.64, 0.05, 0.14], [-0.1, 0.68, -0.03, 0.13], [0.02, 0.82, 0, 0.11], [-0.06, 0.55, 0.1, 0.12]];
  leaves.forEach(([x, y, z, r], i) => g.add(at(ball(r, i % 2 ? C.sageDark : C.sage), x, y, z)));
  g.position.set(1.15, 0.02, -1.12);
  return g;
}

// 填补前面空地板：坐垫和派对帽
const CUSHION_LOBES = 6;
const cushionIndent = (theta) => 1 - 0.045 * (0.5 + 0.5 * Math.cos(CUSHION_LOBES * theta));

function cushion() {
  const g = new Group();
  // 鼓鼓的六瓣坐垫：缝线处往里收一点，每一瓣就鼓起来
  const geo = new SphereGeometry(1, 48, 16);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = cushionIndent(Math.atan2(p.getZ(i), p.getX(i)));
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const body = new Mesh(geo, mat(0xffc2d1));
  body.scale.set(0.3, 0.14, 0.3);
  g.add(flag(at(body, 0, 0.14, 0), 'shade'));
  // 缝线：沿着每一瓣的交界，从中间纽扣画到侧面，离表面 4mm
  for (let s = 0; s < CUSHION_LOBES; s++) {
    const theta = (s / CUSHION_LOBES) * Math.PI * 2;
    const pts = [];
    for (let j = 0; j <= 8; j++) {
      const phi = 0.14 + (j / 8) * 1.05;
      const r = 0.3 * cushionIndent(theta) * Math.sin(phi) + 0.004 * Math.sin(phi);
      pts.push(new Vector3(Math.cos(theta) * r, 0.14 + 0.14 * Math.cos(phi) + 0.004 * Math.cos(phi), Math.sin(theta) * r));
    }
    g.add(flag(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 10, 0.0055, 4), mat(0xf2a3b8)), 'noOcclude'));
  }
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
    // 第二条丝带高一点点，两条丝带交叉处的顶面不重叠
    b.add(at(box(0.055, h + 0.022, d + 0.012, ribbon, 0.015), 0, h / 2, 0));
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
    b.userData.color = color;
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

// 蛋糕本身（不含桌子）：原点在盘子底部中心。AR 导出（tools/ar-export.js）也用这一个
export function buildCake() {
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
  sign.add(flag(at(label, 0, 0.53, 0.011), 'keep')); // 离牌子表面 4mm
  sign.position.set(-0.05, 0, -0.05);
  sign.rotation.y = Math.PI / 4;
  sign.traverse((o) => flag(o, 'noOcclude'));
  cake.add(sign);
  return cake;
}

function cakeTable() {
  const g = new Group();
  g.add(flag(at(cyl(0.42, 0.42, 0.06, C.wood, 40), 0, 0.62, 0), 'shade'));
  g.add(flag(at(cyl(0.05, 0.07, 0.6, C.woodDark, 12), 0, 0.31, 0), 'shade'));
  g.add(flag(at(cyl(0.22, 0.24, 0.04, C.woodDark, 24), 0, 0.02, 0), 'shade'));

  const cake = buildCake();
  cake.position.y = 0.65;
  g.add(cake);
  g.position.set(0.55, 0.02, -0.15);
  g.scale.setScalar(1.5);
  return g;
}

// ---------- 概念稿：派对厅才有的东西 ----------

// 靠左墙的零食饮料长桌
const SNACK_Z = 1.0; // 长桌放在左墙前半段，后半段留给气球拱门的脚

function snackTable() {
  const g = new Group();
  const len = 1.6, dep = 0.5, h = 0.72;
  g.add(flag(at(box(dep, h, len, C.white, 0.04), 0, h / 2, 0), 'shade'));
  // 桌布上沿一圈粉色裙边，比桌面高 2cm、宽 1cm，没有贴在一起的面
  g.add(at(box(dep + 0.02, 0.16, len + 0.02, C.pink, 0.03), 0, h - 0.06, 0));
  const top = h + 0.02;
  // 饮料桶：玻璃罐里是紫色果汁
  g.add(at(cyl(0.09, 0.09, 0.26, 0xd6c2ff, 20), 0, top + 0.13, -0.58));
  g.add(at(cyl(0.095, 0.095, 0.03, C.cream, 20), 0, top + 0.275, -0.58));
  g.add(at(cyl(0.07, 0.08, 0.04, C.gold, 20), 0, top + 0.02, -0.58));
  // 一排纸杯
  const cupColors = [0xffb3c6, 0xb9ebc8, 0xffe39a, 0xd6c2ff];
  for (let i = 0; i < 6; i++) {
    g.add(at(cyl(0.032, 0.026, 0.08, cupColors[i % 4], 12), (i % 2 ? 0.07 : -0.07), top + 0.04, -0.34 + Math.floor(i / 2) * 0.09));
  }
  // 纸杯蛋糕盘
  g.add(at(cyl(0.17, 0.17, 0.02, C.white, 28), 0, top + 0.01, 0.05));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const x = Math.cos(a) * 0.09, z = 0.05 + Math.sin(a) * 0.09;
    g.add(at(cyl(0.035, 0.028, 0.045, C.gold, 12), x, top + 0.045, z));
    g.add(at(ball(0.042, i % 2 ? C.lilac : 0xffb3c6, 12, 8), x, top + 0.085, z));
  }
  // 薯片碗
  const bowl = new Mesh(new SphereGeometry(0.12, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(C.pinkDeep));
  g.add(at(bowl, 0, top + 0.12, 0.42));
  for (let i = 0; i < 7; i++) {
    const chip = ball(0.03, 0xffd27a, 8, 6);
    chip.scale.set(1, 0.4, 1);
    g.add(at(chip, Math.cos(i * 2.4) * 0.05, top + 0.115 + (i % 3) * 0.012, 0.42 + Math.sin(i * 2.4) * 0.05));
  }
  // 甜甜圈塔
  for (let i = 0; i < 3; i++) {
    const d = new Mesh(new TorusGeometry(0.05, 0.025, 8, 20), mat([0xffb3c6, 0xd6c2ff, 0xffe39a][i]));
    d.rotation.x = -Math.PI / 2;
    g.add(at(d, 0, top + 0.025 + i * 0.05, 0.64));
  }
  g.position.set(INNER + 0.06 + dep / 2, 0.02, SNACK_Z);
  return g;
}

// "生日快乐"横幅：一张贴图画出绳子、四面旗子和字，挂在左墙上（一次绘制）
function banner() {
  const W = 1.7, H = 0.5;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 300;
  const g = c.getContext('2d');
  const sx = c.width / W;
  g.scale(sx, sx);
  g.strokeStyle = '#D9AD7E';
  g.lineWidth = 0.012;
  g.beginPath();
  g.moveTo(0.02, 0.05);
  g.quadraticCurveTo(W / 2, 0.16, W - 0.02, 0.05);
  g.stroke();
  const colors = ['#F6B7C6', '#D6C2FF', '#FFE08A', '#B9EBC8'];
  [...'生日快乐'].forEach((ch, i) => {
    const cx = 0.25 + i * 0.4;
    const t = cx / W;
    const y = 0.05 + (1 - (2 * t - 1) ** 2) * 0.055;
    const fw = 0.3, fh = 0.36;
    g.fillStyle = colors[i];
    g.beginPath();
    g.moveTo(cx - fw / 2, y);
    g.lineTo(cx + fw / 2, y);
    g.lineTo(cx + fw / 2, y + fh);
    g.lineTo(cx, y + fh - 0.07);
    g.lineTo(cx - fw / 2, y + fh);
    g.closePath();
    g.fill();
    g.fillStyle = '#C9707F';
    g.font = '700 0.19px PartyRound, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, cx, y + 0.14);
  });
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(new PlaneGeometry(W, H), new MeshBasicMaterial({ map: tex, transparent: true }));
  mesh.rotation.y = Math.PI / 2;
  mesh.position.set(INNER + 0.012, 1.38, SNACK_Z);
  return flag(mesh, 'keep', 'noOcclude');
}

// 气球拱门：在蛋糕后面，正对镜头，把蛋糕框在中间
function balloonArch() {
  const g = new Group();
  const R = 1.15, HEIGHT = 2.0;
  const center = new Vector3(-0.78, 0, -0.78);
  const along = new Vector3(1, 0, -1).normalize();
  const toward = new Vector3(1, 0, 1).normalize();
  const colors = [C.pink, C.lilac, C.cream, C.gold, C.pinkDeep, 0xffffff];
  const sphere = new SphereGeometry(1, 14, 10);
  const n = 30;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i <= n; i++) {
      const t = (i + row * 0.5) / n;
      if (t > 1) continue;
      const a = Math.PI * t;
      const r = 0.1 + ((i * 7 + row * 3) % 5) * 0.008;
      const p = center.clone()
        .addScaledVector(along, Math.cos(a) * R)
        .addScaledVector(toward, (row ? -1 : 1) * 0.06);
      p.y = 0.12 + Math.sin(a) * HEIGHT;
      const b = new Mesh(sphere, mat(colors[(i + row * 2) % colors.length]));
      b.scale.set(r, r * 1.1, r);
      g.add(at(b, p.x, p.y, p.z));
    }
  }
  // 两脚的配重
  for (const s of [-1, 1]) {
    const p = center.clone().addScaledVector(along, s * R);
    g.add(flag(at(box(0.18, 0.12, 0.18, C.gold, 0.04), p.x, 0.06, p.z), 'shade'));
  }
  g.traverse((o) => o.isMesh && !o.userData.shade && flag(o, 'noOcclude'));
  return g;
}

// 原创黏土小动物宾客（坐在地上，戴派对帽），正面是 +z
function guest(kind, fur, belly, hat) {
  const g = new Group();
  const blob = (r, color, sx, sy, sz, x, y, z) => {
    const m = ball(r, color, 14, 10);
    m.scale.set(sx, sy, sz);
    return at(m, x, y, z);
  };
  g.add(flag(blob(1, fur, 0.17, 0.17, 0.15, 0, 0.17, 0), 'shade')); // 身体
  g.add(blob(1, belly, 0.11, 0.11, 0.05, 0, 0.15, 0.11)); // 肚子
  for (const s of [-1, 1]) {
    g.add(blob(0.055, fur, 1, 0.7, 1.3, s * 0.08, 0.04, 0.1)); // 脚
    g.add(blob(0.05, fur, 1, 1, 1, s * 0.15, 0.2, 0.05)); // 手
  }
  g.add(blob(0.15, fur, 1, 0.92, 0.95, 0, 0.42, 0)); // 头
  for (const s of [-1, 1]) {
    g.add(blob(0.018, 0x5a4048, 1, 1.2, 1, s * 0.055, 0.44, 0.13)); // 眼睛
    g.add(blob(0.03, 0xffa7b8, 1, 0.6, 0.4, s * 0.09, 0.4, 0.12)); // 腮红
  }
  if (kind === 'chick') {
    const beak = new Mesh(new ConeGeometry(0.03, 0.06, 10), mat(0xf5a64a));
    beak.rotation.x = Math.PI / 2;
    g.add(at(beak, 0, 0.41, 0.16));
  } else {
    g.add(blob(0.016, 0xd9768a, 1.3, 1, 1, 0, 0.415, 0.143)); // 鼻子
  }
  for (const s of [-1, 1]) {
    if (kind === 'cat') {
      const ear = new Mesh(new ConeGeometry(0.05, 0.1, 12), mat(fur));
      ear.rotation.z = -s * 0.35;
      g.add(at(ear, s * 0.09, 0.56, 0));
    } else if (kind === 'rabbit') {
      const ear = blob(1, fur, 0.035, 0.13, 0.025, s * 0.06, 0.64, -0.01);
      ear.rotation.z = -s * 0.18;
      g.add(ear);
      const inner = blob(1, 0xffc2d1, 0.018, 0.09, 0.01, s * 0.061, 0.64, 0.014); // 耳朵内侧
      inner.rotation.z = -s * 0.18;
      g.add(inner);
    } else if (kind === 'bear') {
      g.add(blob(0.05, fur, 1, 1, 0.7, s * 0.11, 0.53, -0.01));
    }
  }
  // 派对帽
  const cone = new Mesh(new ConeGeometry(0.065, 0.16, 16), mat(hat));
  cone.rotation.z = 0.25;
  g.add(at(cone, 0.03, kind === 'rabbit' ? 0.6 : 0.61, -0.02));
  g.add(at(ball(0.025, C.white, 8, 6), 0.01, kind === 'rabbit' ? 0.685 : 0.695, -0.02));
  g.scale.setScalar(1.45);
  return g;
}

function guests() {
  const g = new Group();
  const list = [
    ['rabbit', 0xfff6f0, 0xffe4ea, C.lilac, 108],
    ['cat', 0xf7cfa2, 0xfff1e0, 0xffb3c6, 152],
    ['bear', 0xd9a57e, 0xf3d6bd, 0xb9ebc8, -18],
    ['chick', 0xffe08a, 0xfff3c4, C.pinkDeep, -62],
  ];
  const cam = new Vector3(1, 0, 1).normalize();
  for (const [kind, fur, belly, hat, deg] of list) {
    const a = (deg * Math.PI) / 180;
    const p = new Vector3(Math.cos(a) * 1.2, 0.02, Math.sin(a) * 1.2);
    const m = guest(kind, fur, belly, hat);
    m.position.copy(p);
    // 一半朝着蛋糕，一半朝着镜头，脸才看得到
    const d = p.clone().negate().normalize().multiplyScalar(0.55).addScaledVector(cam, 0.8);
    m.rotation.y = Math.atan2(d.x, d.z);
    g.add(m);
  }
  return g;
}

export function buildRoom() {
  const root = new Group();
  flag(root, 'unit');
  root.add(shell(), rugEdge(), windowOnRightWall(), stringLights(), buntings(), lamp(), plant(), cushion(), partyHat());
  const interactive = { gifts: gifts(), balloons: balloons(), cake: cakeTable() };
  if (HALL) {
    root.add(snackTable(), banner(), balloonArch());
    if (CONCEPT === 'b') root.add(guests());
    // 派对厅的摆位：蛋糕在正中间，礼物左前，气球右边，坐垫右前
    // 场地变大、整体缩小了，可以点的三样放大一点
    interactive.cake.position.set(0, 0.02, 0);
    interactive.cake.scale.setScalar(1.7);
    interactive.gifts.position.set(0.55, 0, 1.6);
    interactive.gifts.scale.setScalar(1.55);
    interactive.balloons.position.set(1.65, 0, -0.75);
    interactive.balloons.scale.setScalar(1.15);
    const [plantObj, cushionObj, hatObj] = root.children.slice(6, 9);
    plantObj.position.set(1.78, 0.02, -1.75);
    cushionObj.position.set(1.65, 0.02, 0.85);
    hatObj.position.set(1.35, 0.1, 1.55);
  }
  for (const [key, obj] of Object.entries(interactive)) {
    obj.userData.interactive = key;
    obj.userData.baseScale = obj.scale.x;
    flag(obj, 'unit');
    root.add(obj);
  }
  root.updateMatrixWorld(true);
  return { root, interactive };
}
