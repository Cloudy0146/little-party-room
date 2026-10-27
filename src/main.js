import { UNLOCK_AT, now, isUnlocked, fakeVisits } from './clock.js';
import { recordVisit, quipFor } from './visits.js';
import { createMusic } from './music.js';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

let timer = 0;

// 手机能不能跑 3D：没有 WebGL2（例如 iOS 14）就直接用 2D 兜底页，不下载 3D 代码
let webgl2;
const hasWebGL2 = () => {
  if (webgl2 === undefined) {
    try {
      webgl2 = !!document.createElement('canvas').getContext('webgl2');
    } catch {
      webgl2 = false;
    }
  }
  return webgl2;
};

// 3D 房间的代码比较大，等倒计时页显示完、手机空闲时再在背景下载，不拖慢首屏。
// 下载失败后的重试：Safari 会记住失败的模块，同一个网址再 import 会马上失败、不再下载。
// 所以重试时用 Vite 放进页面的 <link rel="modulepreload"> 找到这个文件的网址，加个参数当成新文件下载；
// 找不到网址就只好重新载入整页
let retries = 0;
function reimport(name) {
  const link = [...document.querySelectorAll('link[rel="modulepreload"]')]
    .find((l) => new RegExp(`/${name}-[^/?]*\\.js$`).test(l.href));
  if (!link) {
    location.reload();
    return new Promise(() => {});
  }
  return import(/* @vite-ignore */ `${link.href}?retry=${++retries}`);
}
function loader(name, first) {
  let promise = null;
  let failed = false;
  return () => (promise ??= (failed ? reimport(name) : first()).catch((err) => {
    failed = true;
    promise = null;
    throw err;
  }));
}
const loadFallback = loader('fallback', () => import('./fallback.js'));
const loadRoom3D = loader('room', () => import('./room.js'));
const loadRoom = () => (hasWebGL2() ? loadRoom3D() : loadFallback());
// 提前在背景下载；失败了不用管，她点"进入"时会再处理
const prefetch = () => loadRoom().catch(() => {});
const whenIdle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500));

function showCountdown() {
  const visits = Number.isFinite(fakeVisits) ? fakeVisits : recordVisit();
  $('quip').textContent = quipFor(visits);
  $('countdown').hidden = false;
  tick();
  // 手机锁屏或切到后台时计时器会被暂停，回来时立刻重算一次
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('pageshow', tick);
  window.addEventListener('load', () => whenIdle(prefetch), { once: true });
}

function tick() {
  clearTimeout(timer);
  if (isUnlocked()) return showEntrance();

  // 向上取整：最后一秒显示 00:00:01，归零的同一刻切换
  const total = Math.ceil((UNLOCK_AT - now()) / 1000);
  $('d').textContent = Math.floor(total / 86400);
  $('h').textContent = pad(Math.floor(total / 3600) % 24);
  $('m').textContent = pad(Math.floor(total / 60) % 60);
  $('s').textContent = pad(total % 60);

  // 对齐到下一个整秒
  timer = setTimeout(tick, 1000 - (now() % 1000) + 20);
}

function showEntrance() {
  document.removeEventListener('visibilitychange', tick);
  window.removeEventListener('pageshow', tick);
  $('countdown').hidden = true;
  $('entrance').hidden = false;
  $('enter').addEventListener('click', enterRoom, { once: true });
  prefetch();
}

// 音乐要在点击的同一刻开始，浏览器才允许出声，所以在等 3D 房间下载之前就先开
const music = createMusic();

async function enterRoom() {
  music.start();
  const entrance = $('entrance');
  const btn = $('enter');
  // 房间还在下载时让她知道点到了；下载完会马上进去，这几个字只是一闪
  btn.textContent = '正在进入……';
  btn.classList.remove('btn-long');
  const room = $('room');
  try {
    const mod = await loadRoom();
    if (mod.startRoom) {
      try {
        mod.startRoom(room, music);
      } catch (err) {
        // 3D 渲染器建不起来（显卡驱动、被系统禁用等）：清掉半成品，改用 2D 兜底页
        console.error(err);
        room.replaceChildren();
        room.className = '';
        room.hidden = true; // 兜底页也下载失败时，不让空白的房间层盖住入场页
        (await loadFallback()).startFallback(room, music);
      }
    } else {
      mod.startFallback(room, music);
    }
  } catch {
    btn.textContent = '网络有点慢，再点一次试试';
    btn.classList.add('btn-long');
    btn.addEventListener('click', enterRoom, { once: true });
    return;
  }
  entrance.classList.add('leaving');
  entrance.addEventListener('animationend', () => (entrance.hidden = true), { once: true });
}

if (isUnlocked()) showEntrance();
else showCountdown();
