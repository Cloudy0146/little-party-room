// 券的文字已定稿，不要随意改动
// body 里的 \n 是手动指定的断行位置：每一行都不会再被拆开（券会被截图，断行要好看）
export const COUPONS = [
  { id: 'errand', title: '茶修芥䄱使唤券', body: '使唤茶修芥䄱做一件事。' },
  { id: 'avatar', title: '头像券', body: '指定一张照片，\n当茶修芥䄱的微信头像，\n维持 3 天。' },
  { id: 'reply', title: '秒回券', body: '24 小时内，消息 5 分钟内必回\n（睡觉除外）。' },
  { id: 'game', title: '陪玩券', body: '陪玩一局阿呆指定的游戏，\n输了不准抱怨。' },
];

// 宽度够就一行；不够只会在"·"那里分成两行
export const COUPON_FOOTER = ['截图发给茶修芥䄱即可兑换', '限用一次'];
