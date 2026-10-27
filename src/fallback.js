// 3D 打不开时的退路（没有 WebGL2，例如 iOS 14；或 3D 渲染器创建失败）：
// 显示一张房间截图，加"拆礼物"和"我的券包"两个按钮，券的功能和 3D 版完全一样。
// 截图由 scripts/room-shot.mjs 从 3D 房间生成。
import { createCoupons } from './ui/coupons.js';
import { NOTE_ICON, TICKET_ICON } from './ui/icons.js';
import roomImage from './assets/room-2d.jpg';
import './fallback.css';

export function startFallback(el, music) {
  el.hidden = false;
  el.classList.add('fallback');
  el.innerHTML = `
    <button class="music-toggle" type="button" aria-pressed="false" aria-label="音乐">${NOTE_ICON}</button>
    <div class="fb">
      <h2 class="fb-title">阿呆的派对小房间</h2>
      <img class="fb-room" src="${roomImage}" alt="派对小房间" width="750" height="863">
      <div class="fb-actions">
        <button class="btn" type="button" data-act="gift">拆礼物</button>
        <button class="btn btn-soft fb-wallet" type="button">${TICKET_ICON}<span>我的券包</span><b></b></button>
      </div>
    </div>`;

  const count = el.querySelector('.fb-wallet b');
  const coupons = createCoupons({ onChange: update });
  function update() {
    count.textContent = `${coupons.opened}/${coupons.total}`;
  }
  update();
  el.querySelector('[data-act="gift"]').addEventListener('click', () => coupons.openGift());
  el.querySelector('.fb-wallet').addEventListener('click', () => coupons.openWallet());

  const musicBtn = el.querySelector('.music-toggle');
  musicBtn.hidden = !music?.supported;
  musicBtn.setAttribute('aria-pressed', String(!!music?.on));
  musicBtn.addEventListener('click', () => musicBtn.setAttribute('aria-pressed', String(music.toggle())));
}
