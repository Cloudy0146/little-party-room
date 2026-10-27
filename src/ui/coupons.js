// 抽券和券包（纯 DOM，不依赖 3D）
import { COUPONS, COUPON_FOOTER } from '../coupons.js';
import './coupons.css';

const KEY = 'pr.coupons';
const IDS = COUPONS.map((c) => c.id);

const ICONS = {
  // 服务铃
  errand: '<svg viewBox="0 0 48 48"><path d="M8 34h32a2 2 0 0 1 0 4H8a2 2 0 0 1 0-4z" fill="currentColor"/><path d="M10 32a14 14 0 0 1 28 0z" fill="currentColor" opacity=".85"/><circle cx="24" cy="15" r="3" fill="currentColor"/><path d="M17 26a8 8 0 0 1 5-6" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>',
  // 相框
  avatar: '<svg viewBox="0 0 48 48"><rect x="7" y="9" width="34" height="30" rx="7" fill="currentColor"/><rect x="12" y="14" width="24" height="20" rx="4" fill="#fff"/><circle cx="20" cy="22" r="2" fill="currentColor"/><circle cx="28" cy="22" r="2" fill="currentColor"/><path d="M19 27q5 4 10 0" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>',
  // 带闪电的对话框
  reply: '<svg viewBox="0 0 48 48"><path d="M10 9h28a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H22l-9 7v-7h-3a6 6 0 0 1-6-6V15a6 6 0 0 1 6-6z" fill="currentColor"/><path d="M26 13l-8 11h6l-2 9 8-12h-6z" fill="#fff"/></svg>',
  // 游戏手柄
  game: '<svg viewBox="0 0 48 48"><path d="M14 14h20a10 10 0 0 1 9.6 12.8l-2.2 7.6a5 5 0 0 1-8.6 1.8L29 32H19l-3.8 4.2a5 5 0 0 1-8.6-1.8l-2.2-7.6A10 10 0 0 1 14 14z" fill="currentColor"/><path d="M15 20v8M11 24h8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="31" cy="21.5" r="2.2" fill="#fff"/><circle cx="35.5" cy="26" r="2.2" fill="#fff"/></svg>',
};

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 读写都包 try/catch：存储不能用时就当第一次，照常能抽
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    const ok = s && Array.isArray(s.order) && s.order.length === IDS.length
      && IDS.every((id) => s.order.includes(id)) && Number.isInteger(s.opened) && s.opened >= 0 && s.opened <= IDS.length;
    if (ok) return s;
  } catch {}
  return { order: shuffle(IDS), opened: 0 };
}
function save(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

function couponHTML(id, index) {
  const c = COUPONS.find((x) => x.id === id);
  return `
    <article class="coupon theme-${c.id}">
      <div class="coupon-main">
        <div class="coupon-meta"><span>No.1101-0${index + 1}</span><span>阿呆专用</span></div>
        <div class="coupon-icon">${ICONS[c.id]}</div>
        <h3>${c.title}</h3>
        <p>${c.body}</p>
      </div>
      <div class="coupon-stub">${COUPON_FOOTER}</div>
    </article>`;
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function createCoupons({ onChange, onOpen, onClose }) {
  const state = load();
  let sheet = null;

  function close() {
    if (!sheet) return;
    const s = sheet;
    sheet = null;
    s.classList.add('closing');
    setTimeout(() => s.remove(), 250);
    onClose?.();
  }

  function openSheet(html) {
    close();
    sheet = el(`<div class="sheet" role="dialog" aria-modal="true">${html}</div>`);
    sheet.querySelector('.sheet-close')?.addEventListener('click', close);
    document.body.append(sheet);
    onOpen?.();
    return sheet;
  }

  // ---------- 拆礼物：一张一张翻 ----------
  function openGift() {
    if (state.opened >= IDS.length) return openWallet('礼物都拆完啦，券都在这里');
    const s = openSheet(`
      <button class="sheet-close" type="button" aria-label="关闭">×</button>
      <p class="sheet-title">拆礼物 <span class="sheet-count"></span></p>
      <div class="deck"></div>
      <p class="sheet-hint">点一下翻开</p>
      <button class="btn sheet-next" type="button" hidden></button>`);
    const deck = s.querySelector('.deck');
    const hint = s.querySelector('.sheet-hint');
    const next = s.querySelector('.sheet-next');

    function deal() {
      const i = state.opened;
      s.querySelector('.sheet-count').textContent = `${i + 1} / ${IDS.length}`;
      deck.innerHTML = '';
      // 后面还剩几张，叠在下面
      for (let k = IDS.length - i - 1; k > 0; k--) {
        deck.append(el(`<div class="deck-ghost" style="--k:${k}"></div>`));
      }
      const card = el(`
        <button class="flip" type="button" aria-label="翻开第 ${i + 1} 张">
          <div class="flip-inner">
            <div class="flip-front"><div class="seal">★</div><p>第 ${i + 1} 张</p></div>
            <div class="flip-back">${couponHTML(state.order[i], i)}</div>
          </div>
        </button>`);
      deck.append(card);
      hint.hidden = false;
      next.hidden = true;
      card.addEventListener('click', () => {
        if (card.classList.contains('open')) return;
        card.classList.add('open');
        state.opened = i + 1;
        save(state);
        onChange?.(state.opened);
        hint.hidden = true;
        setTimeout(() => {
          next.hidden = false;
          next.textContent = state.opened < IDS.length ? '下一张' : '全部收进券包';
        }, 550);
      }, { once: true });
    }

    next.addEventListener('click', () => {
      if (state.opened < IDS.length) {
        deck.querySelector('.flip')?.classList.add('away');
        setTimeout(deal, 280);
      } else {
        openWallet();
      }
    });
    deal();
  }

  // ---------- 券包 ----------
  function openWallet(note) {
    const items = IDS.map((_, i) => (i < state.opened
      ? `<button class="wallet-item" type="button" data-i="${i}">${couponHTML(state.order[i], i)}</button>`
      : '<div class="coupon coupon-locked"><p>还没拆开</p><span>去点房间里的礼物盒</span></div>')).join('');
    const s = openSheet(`
      <button class="sheet-close" type="button" aria-label="关闭">×</button>
      <p class="sheet-title">我的券包 <span class="sheet-count">${state.opened} / ${IDS.length}</span></p>
      ${note ? `<p class="sheet-note">${note}</p>` : ''}
      <div class="wallet">${items}</div>
      <p class="sheet-note">点一张券可以单独查看，方便截图</p>`);
    s.classList.add('sheet-list');
    s.querySelectorAll('.wallet-item').forEach((b) => b.addEventListener('click', () => showOne(Number(b.dataset.i))));
  }

  // 单独显示一张，画面干净，方便截图
  function showOne(i) {
    const s = openSheet(`
      <div class="single">${couponHTML(state.order[i], i)}</div>
      <button class="btn btn-soft single-back" type="button">回到券包</button>`);
    s.querySelector('.single-back').addEventListener('click', () => openWallet());
  }

  return {
    openGift,
    openWallet: () => openWallet(),
    close,
    get opened() { return state.opened; },
    get total() { return IDS.length; },
    get isOpen() { return !!sheet; },
  };
}
