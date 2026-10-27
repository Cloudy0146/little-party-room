import { UNLOCK_AT, now, isUnlocked, fakeVisits } from './clock.js';
import { recordVisit, quipFor } from './visits.js';
import { createMusic } from './music.js';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

let timer = 0;

// 3D 房间的代码比较大，等倒计时页显示完、手机空闲时再在背景下载，不拖慢首屏
let roomModule;
const loadRoom = () =>
  (roomModule ??= import('./room.js').catch((err) => {
    roomModule = null; // 网络不好下载失败时，下次点击再试
    throw err;
  }));
const whenIdle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500));

function showCountdown() {
  const visits = Number.isFinite(fakeVisits) ? fakeVisits : recordVisit();
  $('quip').textContent = quipFor(visits);
  $('countdown').hidden = false;
  tick();
  // 手机锁屏或切到后台时计时器会被暂停，回来时立刻重算一次
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('pageshow', tick);
  window.addEventListener('load', () => whenIdle(loadRoom), { once: true });
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
  loadRoom();
}

// 音乐要在点击的同一刻开始，浏览器才允许出声，所以在等 3D 房间下载之前就先开
const music = createMusic();

async function enterRoom() {
  music.start();
  const entrance = $('entrance');
  let mod;
  try {
    mod = await loadRoom();
  } catch {
    $('enter').addEventListener('click', enterRoom, { once: true });
    return;
  }
  entrance.classList.add('leaving');
  entrance.addEventListener('animationend', () => (entrance.hidden = true), { once: true });
  mod.startRoom($('room'), music);
}

if (isUnlocked()) showEntrance();
else showCountdown();
