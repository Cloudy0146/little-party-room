import {
  WebGLRenderer, Scene, OrthographicCamera, HemisphereLight, DirectionalLight,
  Raycaster, Vector2, Vector3, Clock, NeutralToneMapping, MathUtils,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildRoom } from './room/scene.js';

// 镜头限制：只能在房间正面小范围转动，永远看不到墙后和地板下
const AZIMUTH = MathUtils.degToRad(45);
const AZIMUTH_RANGE = MathUtils.degToRad(28);
const POLAR = MathUtils.degToRad(57);
const POLAR_MIN = MathUtils.degToRad(42);
const POLAR_MAX = MathUtils.degToRad(68);
const TARGET = new Vector3(0, 0.85, 0);
const DISTANCE = 12;
// 竖屏时画面宽度（米），横屏时画面高度
const VIEW = 4.6;

const LABELS = { gifts: '礼物', balloons: '气球', cake: '蛋糕' };

export function startRoom(el) {
  el.hidden = false;
  const canvas = document.createElement('canvas');
  canvas.className = 'room-canvas';
  el.append(canvas);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = NeutralToneMapping;

  const scene = new Scene();
  scene.add(new HemisphereLight(0xfff6ee, 0xf3c6cf, 2.2));
  const sun = new DirectionalLight(0xfff0dd, 1.6);
  sun.position.set(3, 6, 4);
  scene.add(sun);

  const { root, interactive } = buildRoom();
  scene.add(root);

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
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
  controls.minZoom = 0.9;
  controls.maxZoom = 2.2;
  controls.enabled = false;

  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    const aspect = w / h;
    let halfW, halfH;
    if (aspect < 1) {
      halfW = VIEW / 2;
      halfH = halfW / aspect;
    } else {
      halfH = VIEW / 2;
      halfW = halfH * aspect;
    }
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- 入场镜头：2 秒内从远处、侧一点的角度推进到正位 ----------
  const intro = { t: 0, duration: 2 };
  function placeCamera(azimuth, polar, zoom) {
    camera.position.setFromSphericalCoords(DISTANCE, polar, azimuth).add(TARGET);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.lookAt(TARGET);
  }

  // ---------- 点击检测：手指移动很少才算"点"，否则是转镜头 ----------
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(root, true)[0];
    let o = hit?.object;
    while (o && !o.userData.interactive) o = o.parent;
    if (o) onTap(o.userData.interactive, o);
  });

  const hint = document.createElement('p');
  hint.className = 'room-hint';
  hint.textContent = '点点看';
  el.append(hint);

  const toast = document.createElement('p');
  toast.className = 'room-toast';
  el.append(toast);
  let toastTimer = 0;

  const pops = new Map();
  function onTap(key, obj) {
    hint.classList.add('gone');
    pops.set(obj, 0);
    // M4 会换成真正的互动，这里先确认点得到
    toast.textContent = `点到了：${LABELS[key]}`;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1200);
  }

  // ---------- 动画循环 ----------
  const clock = new Clock();
  const flame = interactive.cake.getObjectByName('flame');
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (intro.t < intro.duration) {
      intro.t += dt;
      const k = 1 - Math.pow(1 - Math.min(intro.t / intro.duration, 1), 3);
      placeCamera(AZIMUTH - 0.35 * (1 - k), POLAR - 0.12 * (1 - k), 0.72 + 0.28 * k);
      if (intro.t >= intro.duration) controls.enabled = true;
    } else {
      controls.update();
    }

    // 可互动物件的轻微提示动作
    interactive.balloons.children.forEach((b) => {
      if (b.userData.base !== undefined) b.position.y = b.userData.base + Math.sin(t * 1.4 + b.userData.phase) * 0.03;
    });
    interactive.gifts.position.y = Math.abs(Math.sin(t * 2.2)) * 0.012;
    flame.scale.set(1 + Math.sin(t * 17) * 0.08, 1.6 + Math.sin(t * 11) * 0.15, 1);

    for (const [obj, p] of pops) {
      const np = p + dt / 0.35;
      const s = 1 + Math.sin(Math.min(np, 1) * Math.PI) * 0.1;
      obj.scale.setScalar(obj.userData.baseScale * s);
      if (np >= 1) pops.delete(obj);
      else pops.set(obj, np);
    }

    renderer.render(scene, camera);
  });
}
