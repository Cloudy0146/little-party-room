import { UNLOCK_AT, now, isUnlocked, fakeVisits } from './clock.js';
import { recordVisit, quipFor } from './visits.js';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

let timer = 0;

function showCountdown() {
  const visits = Number.isFinite(fakeVisits) ? fakeVisits : recordVisit();
  $('quip').textContent = quipFor(visits);
  $('countdown').hidden = false;
  tick();
  // 手机锁屏或切到后台时计时器会被暂停，回来时立刻重算一次
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('pageshow', tick);
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
}

async function enterRoom() {
  const entrance = $('entrance');
  entrance.classList.add('leaving');
  entrance.addEventListener('animationend', () => (entrance.hidden = true), { once: true });
  const { startRoom } = await import('./room.js');
  startRoom($('room'));
}

if (isUnlocked()) showEntrance();
else showCountdown();
