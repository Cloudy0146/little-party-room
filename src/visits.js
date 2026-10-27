const KEY = 'pr.visits';

// 每次打开倒计时页记一次。浏览器禁止存储（无痕模式等）时当作第一次访问。
export function recordVisit() {
  let n = 0;
  try {
    n = parseInt(localStorage.getItem(KEY), 10) || 0;
  } catch {}
  n += 1;
  try {
    localStorage.setItem(KEY, String(n));
  } catch {}
  return n;
}

const QUIPS = {
  1: '还没到哦。11 月 1 日见。',
  2: '又来了？刷新不会让时间变快。',
  3: '蛋糕还在烤，别催。',
  4: '气球才吹了一半，你先坐。',
  5: '阿呆，你这样很像在等外卖。',
  6: '礼物还没包好，不许偷看。',
  7: '第 7 次了，去睡觉。',
  8: '你是不是把这里设成主页了？',
  9: '再来一次就两位数了，想清楚。',
};

export const quipFor = (n) => QUIPS[n] ?? `你已经偷看了 ${n} 次（只有你的手机知道）。`;
