import {
  WebGLRenderer, Scene, OrthographicCamera, HemisphereLight, DirectionalLight,
  PointLight, Raycaster, Vector2, Vector3, Spherical, Clock, NeutralToneMapping, MathUtils,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildRoom, LAMP, BOUNDS } from './room/scene.js';
import { collectOccluders, bakeUnit } from './room/bake.js';
import { addPaintedLight } from './room/paint.js';
import { createConfetti } from './room/confetti.js';
import { createCoupons } from './ui/coupons.js';
import { preview } from './clock.js';

// 镜头限制：只能在房间正面小范围转动，永远看不到墙后和地板下
const AZIMUTH = MathUtils.degToRad(45);
const AZIMUTH_RANGE = MathUtils.degToRad(28);
const POLAR = MathUtils.degToRad(50);
const POLAR_MIN = MathUtils.degToRad(38);
const POLAR_MAX = MathUtils.degToRad(62);
const CAKE_POLAR = MathUtils.degToRad(56);
const TARGET = new Vector3(-0.1, 0.75, -0.1);
const DISTANCE = 12;
const BALLOON_REGROW = 3.5;

const TICKET_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.2a2.8 2.8 0 0 0 0 5.6V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.2a2.8 2.8 0 0 0 0-5.6z" fill="currentColor"/><path d="M14 6v12" stroke="#fff" stroke-width="1.6" stroke-dasharray="2 2"/></svg>';

const ease = (k) => 1 - Math.pow(1 - k, 3);
const easeBack = (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);

function corners(x0, x1, y0, y1, z0, z1) {
  const pts = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) pts.push(new Vector3(x, y, z));
  return pts;
}

export function startRoom(el) {
  el.hidden = false;
  const canvas = document.createElement('canvas');
  canvas.className = 'room-canvas';
  el.append(canvas);

  el.insertAdjacentHTML('beforeend', `
    <header class="room-title room-ui">
      <h2>阿呆的派对小房间</h2>
      <p class="room-hint">点点看</p>
    </header>
    <button class="room-wallet room-ui btn" type="button">${TICKET_ICON}<span>我的券包</span><b class="room-wallet-count"></b></button>
    <button class="cake-close cake-ui" type="button">‹ 回到房间</button>
    <div class="cake-panel cake-ui">
      <p class="cake-msg"></p>
      <div class="cake-actions">
        <button class="btn" type="button" data-act="ar">放到桌上看看</button>
        <button class="btn btn-soft" type="button" data-act="back">回到房间</button>
      </div>
    </div>
    <p class="room-toast"></p>`);
  const $ = (sel) => el.querySelector(sel);
  const title = $('.room-title'), hint = $('.room-hint'), wallet = $('.room-wallet');
  const cakePanel = $('.cake-panel'), cakeMsg = $('.cake-msg'), cakeActions = $('.cake-actions');
  const toast = $('.room-toast');

  // ---------- 场景 ----------
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.1; // 偏高调，但保留对比和粉色饱和度

  const scene = new Scene();
  // 天空偏奶油、地面偏粉：物体朝下的面会带一点地板反上来的粉色
  scene.add(new HemisphereLight(0xfff6ee, 0xf6c6cf, 2.35));
  const sun = new DirectionalLight(0xfff0dd, 1.45);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  const lampLight = new PointLight(0xffb070, 2.2, 2.8, 1.2);
  lampLight.position.set(LAMP.x + 0.1, LAMP.shadeY - 0.2, LAMP.z + 0.1);
  scene.add(lampLight);

  const { root, interactive } = buildRoom();
  const occluders = collectOccluders(root);
  const updateLight = addPaintedLight(root, occluders, renderer);
  bakeUnit(root, occluders);
  scene.add(root);
  const confetti = createConfetti();
  scene.add(confetti.points);
  if (preview) window.__room = { renderer, scene, get camera() { return camera; }, get controls() { return controls; } };

  const flame = interactive.cake.getObjectByName('flame');
  const flameHalo = interactive.cake.getObjectByName('flameHalo');
  const cakeBase = new Vector3(0, 0.69, 0).applyMatrix4(interactive.cake.matrixWorld); // 盘子上方一点
  const balloons = interactive.balloons.children.filter((b) => b.userData.base !== undefined);

  // ---------- 镜头 ----------
  // 镜头离目标点固定 12 米，房间在它前后 3 米以内：近远平面收紧到 7–17 米，
  // 就算手机只有 16 位深度缓冲，精度也有约 0.15mm，几毫米的高度差就不会闪
  const camera = new OrthographicCamera(-1, 1, 1, -1, DISTANCE - 5, DISTANCE + 5);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(TARGET);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.5;
  controls.minAzimuthAngle = AZIMUTH - AZIMUTH_RANGE;
  controls.maxAzimuthAngle = AZIMUTH + AZIMUTH_RANGE;
  controls.minPolarAngle = POLAR_MIN;
  controls.maxPolarAngle = POLAR_MAX;
  controls.minZoom = 1;
  controls.maxZoom = 2.2;
  controls.enabled = false;

  function placeCamera(azimuth, polar, zoom) {
    camera.position.setFromSphericalCoords(DISTANCE, polar, azimuth).add(TARGET);
    camera.zoom = zoom;
    camera.lookAt(TARGET);
  }

  // 取景：每一帧按当前角度，把房间（或蛋糕）完整放进标题和按钮之间的空白里。
  // 转动时房间投影变宽，就自动拉远一点，所以任何角度都不会被切掉。
  const ROOM_PTS = corners(BOUNDS.lo, BOUNDS.hi, BOUNDS.bottom, BOUNDS.top, BOUNDS.lo, BOUNDS.hi);
  const CAKE_PTS = corners(-0.34, 0.34, 0.6, 1.24, -0.34, 0.34).map((p) => p.applyMatrix4(interactive.cake.matrixWorld));
  const _v = new Vector3();
  let size = { w: 1, h: 1 };
  let roomRes = { top: 0, bottom: 0 };
  const cakeRes = { top: 64, bottom: 240 };

  function fit(points, res, margin) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      _v.copy(p).applyMatrix4(camera.matrixWorldInverse);
      minX = Math.min(minX, _v.x); maxX = Math.max(maxX, _v.x);
      minY = Math.min(minY, _v.y); maxY = Math.max(maxY, _v.y);
    }
    const { w, h } = size;
    const availH = Math.max(h - res.top - res.bottom, h * 0.4);
    const s = Math.min((w - margin * 2) / (maxX - minX), (availH - margin * 2) / (maxY - minY));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const yc = res.top + availH / 2;
    return [cx - w / 2 / s, cx + w / 2 / s, cy + yc / s, cy - (h - yc) / s];
  }

  function frame(cakeMix) {
    camera.updateMatrixWorld();
    let f = fit(ROOM_PTS, roomRes, 14);
    if (cakeMix > 0) {
      const g = fit(CAKE_PTS, cakeRes, 24);
      const k = ease(cakeMix);
      f = f.map((v, i) => v + (g[i] - v) * k);
    }
    [camera.left, camera.right, camera.top, camera.bottom] = f;
    camera.updateProjectionMatrix();
  }

  // 版面：把"标题 + 房间 + 券包按钮"当成一组，放在屏幕中间。
  // 屏幕越长，上下留白平均分到两头，而不是标题贴顶、按钮贴底、中间一大片空。
  const probe = camera.clone();
  probe.position.setFromSphericalCoords(DISTANCE, POLAR, AZIMUTH).add(TARGET);
  probe.lookAt(TARGET);
  probe.updateMatrixWorld();

  function safeInsets() {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.append(d);
    const cs = getComputedStyle(d);
    const r = [parseFloat(cs.paddingTop) || 0, parseFloat(cs.paddingBottom) || 0];
    d.remove();
    return r;
  }

  function layout() {
    const { w, h } = size;
    const [insetTop, insetBottom] = safeInsets();
    const safeTop = Math.max(18, insetTop + 8), safeBottom = Math.max(22, insetBottom + 12);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of ROOM_PTS) {
      _v.copy(p).applyMatrix4(probe.matrixWorldInverse);
      minX = Math.min(minX, _v.x); maxX = Math.max(maxX, _v.x);
      minY = Math.min(minY, _v.y); maxY = Math.max(maxY, _v.y);
    }
    const gap = 8;
    const titleH = title.offsetHeight, btnH = wallet.offsetHeight;
    const roomPx = ((maxY - minY) * (w - 28)) / (maxX - minX) + 28;
    const groupH = titleH + gap + roomPx + gap + btnH;
    let top = Math.max(safeTop, (h - groupH) / 2);
    if (top + groupH > h - safeBottom) {
      // 屏幕不够高（例如横屏）：标题贴顶、按钮贴底，房间缩小放在中间
      title.style.top = `${safeTop}px`;
      wallet.style.top = `${h - safeBottom - btnH}px`;
      roomRes = { top: safeTop + titleH + gap, bottom: safeBottom + btnH + gap };
    } else {
      title.style.top = `${top}px`;
      wallet.style.top = `${top + titleH + gap + roomPx + gap}px`;
      roomRes = { top: top + titleH + gap, bottom: h - (top + titleH + gap + roomPx) };
    }
  }

  function resize() {
    size = { w: el.clientWidth, h: el.clientHeight };
    layout();
    renderer.setSize(size.w, size.h, false);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- 镜头动画（入场、进出蛋糕特写） ----------
  let shot = { from: null, to: [AZIMUTH, POLAR, 1], t: 0, duration: 2, done: () => (controls.enabled = true) };
  shot.from = [AZIMUTH - 0.35, POLAR + 0.12, 0.72];
  let mode = 'room';
  let cakeMix = 0, cakeMixTarget = 0;

  const _s = new Spherical();
  function moveCamera(to, duration, done) {
    _s.setFromVector3(_v.copy(camera.position).sub(TARGET));
    shot = { from: [_s.theta, _s.phi, camera.zoom], to, t: 0, duration, done };
    controls.enabled = false;
  }

  // ---------- 提示文字 ----------
  let toastTimer = 0;
  function say(text, ms = 1600) {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
  }

  // ---------- 券 ----------
  const coupons = createCoupons({ onChange: updateWallet });
  function updateWallet() {
    wallet.querySelector('.room-wallet-count').textContent = `${coupons.opened}/${coupons.total}`;
  }
  updateWallet();
  wallet.addEventListener('click', () => coupons.openWallet());

  // ---------- 点击和滑动 ----------
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
  canvas.addEventListener('pointermove', (e) => {
    // 蛋糕特写时，手指往上滑也能吹蜡烛
    if (mode === 'cake' && down && down.y - e.clientY > 40 && performance.now() - down.t < 800) {
      down = null;
      blowCandle();
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    down = null;
    if (mode === 'cake') return blowCandle();
    const rect = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(root, true)[0];
    let o = hit?.object;
    while (o && !o.userData.interactive) o = o.parent;
    if (o) onTap(o.userData.interactive, hit.object);
  });

  const bounces = new Map();
  function bounce(obj) {
    bounces.set(obj, 0);
  }

  function onTap(key, hitObject) {
    hint.classList.add('gone');
    if (key === 'gifts') {
      bounce(interactive.gifts);
      setTimeout(() => coupons.openGift(), 280);
    } else if (key === 'balloons') {
      let b = hitObject;
      while (b && b.parent !== interactive.balloons) b = b.parent;
      if (!balloons.includes(b) || b.userData.popped) {
        const intact = balloons.filter((x) => !x.userData.popped);
        b = intact[Math.floor(Math.random() * intact.length)];
      }
      if (b) popBalloon(b);
    } else if (key === 'cake') {
      enterCake();
    }
  }

  // ---------- 气球：戳破，过一会儿长回来 ----------
  function popBalloon(b) {
    b.userData.popped = true;
    b.userData.t = 0;
    const p = b.getWorldPosition(new Vector3());
    confetti.burst(p, { count: 50, speed: 1.8, up: 0.6, colors: [b.userData.color, 0xffffff] });
  }

  function updateBalloons(dt, t) {
    for (const b of balloons) {
      b.position.y = b.userData.base + Math.sin(t * 1.4 + b.userData.phase) * 0.03;
      if (!b.userData.popped) continue;
      b.userData.t += dt;
      const bt = b.userData.t;
      if (bt < 0.07) b.scale.setScalar(1 + bt * 3); // 先鼓一下
      else if (bt < BALLOON_REGROW) b.scale.setScalar(0.0001);
      else {
        const k = Math.min((bt - BALLOON_REGROW) / 0.9, 1);
        b.scale.setScalar(Math.max(0.0001, easeBack(k)));
        if (k >= 1) b.userData.popped = false;
      }
    }
  }

  // ---------- 蛋糕：特写、吹蜡烛 ----------
  let blown = false, flameT = 0;
  function enterCake() {
    mode = 'cake';
    el.classList.add('cake-mode');
    blown = false;
    flameT = 0;
    flame.visible = flameHalo.visible = true;
    cakeMsg.textContent = '点一下，或者往上滑，吹灭蜡烛';
    cakeActions.hidden = true;
    cakeMixTarget = 1;
    moveCamera([AZIMUTH, CAKE_POLAR, 1], 0.9);
  }

  function leaveCake() {
    mode = 'room';
    el.classList.remove('cake-mode');
    cakeMixTarget = 0;
    moveCamera([AZIMUTH, POLAR, 1], 0.9, () => (controls.enabled = true));
  }

  function blowCandle() {
    if (blown) return;
    blown = true;
    flameT = 0.0001;
    setTimeout(() => {
      // 两门礼炮放在盘子左右两边（按画面的左右），往外、往上、稍微往后喷，
      // 彩纸一开始就在牌子外侧，只会往外飞，所以"阿呆"一直看得到
      const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
      const back = new Vector3().subVectors(TARGET, camera.position).setY(0).normalize();
      for (const [side, delay] of [[-1, 0], [1, 90], [-1, 260], [1, 330]]) {
        const origin = cakeBase.clone().addScaledVector(right, side * 0.46);
        const dir = right.clone().multiplyScalar(side * 0.75).addScaledVector(back, 0.35).setY(1).normalize();
        setTimeout(() => confetti.burst(origin, { count: delay < 200 ? 60 : 40, speed: 3.4, dir, spread: 0.35 }), delay);
      }
      cakeMsg.textContent = '呼——灭了。生日快乐！';
      cakeActions.hidden = false;
    }, 260);
  }

  $('.cake-close').addEventListener('click', leaveCake);
  cakeActions.addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'back') leaveCake();
    if (act === 'ar') say('AR 在 M5 做，先看看效果～');
  });

  // ---------- 动画循环 ----------
  const clock = new Clock();
  renderer.setAnimationLoop(() => {
    const raw = clock.getDelta();
    const dt = Math.min(raw, 0.05);
    const t = clock.elapsedTime;
    if (coupons.isOpen) return; // 券的界面盖住房间时不用画，省电

    if (shot) {
      shot.t += raw; // 按真实时间走，手机卡顿时也不会拖长
      const k = ease(Math.min(shot.t / shot.duration, 1));
      const [a0, p0, z0] = shot.from, [a1, p1, z1] = shot.to;
      placeCamera(a0 + (a1 - a0) * k, p0 + (p1 - p0) * k, z0 + (z1 - z0) * k);
      if (shot.t >= shot.duration) {
        const done = shot.done;
        shot = null;
        done?.();
      }
    } else if (controls.enabled) {
      controls.update();
    }
    cakeMix += Math.sign(cakeMixTarget - cakeMix) * Math.min(Math.abs(cakeMixTarget - cakeMix), raw / 0.9);
    frame(cakeMix);

    // 可互动物件的轻微提示动作
    updateBalloons(dt, t);
    if (!bounces.has(interactive.gifts)) interactive.gifts.position.y = Math.abs(Math.sin(t * 2.2)) * 0.012;
    if (flameT > 0) {
      flameT += dt;
      const k = Math.max(0, 1 - flameT / 0.25);
      flame.scale.set(k, 1.6 * k, k);
      flameHalo.material.opacity = 0.7 * k;
      if (k === 0) flame.visible = flameHalo.visible = false;
    } else {
      flame.scale.set(1 + Math.sin(t * 17) * 0.08, 1.6 + Math.sin(t * 11) * 0.15, 1);
    }

    for (const [obj, p] of bounces) {
      const np = p + dt / 0.35;
      obj.scale.setScalar(obj.userData.baseScale * (1 + Math.sin(Math.min(np, 1) * Math.PI) * 0.1));
      if (np >= 1) bounces.delete(obj);
      else bounces.set(obj, np);
    }

    const pxPerMeter = renderer.domElement.height / ((camera.top - camera.bottom) / camera.zoom);
    confetti.update(dt, pxPerMeter);
    updateLight(camera, t, flameT > 0);
    renderer.render(scene, camera);
  });
}
