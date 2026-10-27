// 解锁时刻：2026-11-01 00:00 马来西亚时间（UTC+8）。
// 用绝对时间戳比较，所以手机时区设成哪里都一样。
export const UNLOCK_AT = Date.parse('2026-11-01T00:00:00+08:00');

// 测试用的预览开关（只给自己用）：
//   ?frosting=7f3a          直接解锁
//   ?frosting=7f3a&eta=10   假装离解锁还有 10 秒，用来看自动切换
//   ?frosting=7f3a&eta=600&visits=7   顺便假装这是第 7 次访问
const params = new URLSearchParams(location.search);
export const preview = params.get('frosting') === '7f3a';

const eta = preview && params.has('eta') ? Number(params.get('eta')) : NaN;
const simulating = Number.isFinite(eta);
const offset = simulating ? UNLOCK_AT - eta * 1000 - Date.now() : 0;

export const fakeVisits = preview && params.has('visits') ? Number(params.get('visits')) : NaN;

export const now = () => Date.now() + offset;

export const isUnlocked = () => (preview && !simulating) || now() >= UNLOCK_AT;
