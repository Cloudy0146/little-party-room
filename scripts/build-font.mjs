// 字体子集化：扫描网站里实际用到的字，只保留这些字，生成很小的 woff2。
// 网站文字有改动时运行一次：npm run font
//
// 原始字体（十几 MB）放在 fonts-src/，不进仓库。下载方法见 CREDITS.md。

import fs from 'node:fs';
import path from 'node:path';
import subsetFont from 'subset-font';
import { cmapLookup, renameFont } from './sfnt.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(ROOT, 'fonts-src/rhr');
const OUT_DIR = path.join(ROOT, 'src/fonts');

// 原字体带有 OFL 的"保留字体名称"，所以子集化后改用自己的名字
const FAMILY = 'PartyRound';
const WEIGHTS = [
  { file: 'ResourceHanRoundedCN-Medium.ttf', style: 'Medium', out: 'party-round-500.woff2' },
  { file: 'ResourceHanRoundedCN-Bold.ttf', style: 'Bold', out: 'party-round-700.woff2' },
];

function collectText() {
  const files = [path.join(ROOT, 'index.html')];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      // sv-test.js 是排查用的测试页，用系统字体，不放进子集
      else if (/\.(js|css|html)$/.test(e.name) && e.name !== 'sv-test.js') files.push(p);
    }
  };
  walk(path.join(ROOT, 'src'));

  let text = '';
  for (const f of files) {
    text += fs.readFileSync(f, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')   // HTML 注释
      .replace(/\/\*[\s\S]*?\*\//g, '')  // CSS/JS 块注释
      .replace(/^\s*\/\/.*$/gm, '')      // 整行 JS 注释
      .replace(/\s\/\/ .*$/gm, '');      // 行尾 JS 注释
  }
  // 所有可打印 ASCII 都保留（数字、字母、标点），方便以后改文案
  for (let c = 0x20; c < 0x7f; c++) text += String.fromCharCode(c);
  const chars = [...new Set(text)].filter((c) => c.codePointAt(0) >= 0x20 && !/\s/.test(c) || c === ' ');
  return chars.sort().join('');
}

const text = collectText();
const cjk = [...text].filter((c) => c.codePointAt(0) > 0x7f);
console.log(`共 ${text.length} 个字符（其中非 ASCII ${cjk.length} 个）`);

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const w of WEIGHTS) {
  const src = new Uint8Array(fs.readFileSync(path.join(SRC_DIR, w.file)));
  const has = cmapLookup(src);
  const missing = [...text].filter((c) => !has(c.codePointAt(0)));
  if (missing.length) console.warn(`  ⚠ ${w.style} 缺字：${missing.join(' ')}`);

  const renamed = renameFont(src, FAMILY, w.style);
  const woff2 = await subsetFont(Buffer.from(renamed), text, { targetFormat: 'woff2' });
  fs.writeFileSync(path.join(OUT_DIR, w.out), woff2);
  console.log(`  ${w.out}  ${(woff2.length / 1024).toFixed(1)} KB`);
}
