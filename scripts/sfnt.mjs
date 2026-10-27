// 读写 TrueType 字体文件的最小工具：查字形是否存在、改字体名称。
// 只做这个项目需要的部分，不追求通用。

export function readTables(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const numTables = dv.getUint16(4);
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(...buf.subarray(rec, rec + 4));
    const offset = dv.getUint32(rec + 8);
    const length = dv.getUint32(rec + 12);
    tables.set(tag, buf.subarray(offset, offset + length));
  }
  return { sfntVersion: dv.getUint32(0), tables };
}

const view = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);

// 返回一个函数：给码位，返回字形编号（0 表示字体里没有这个字）
export function cmapLookup(buf) {
  const cmap = readTables(buf).tables.get('cmap');
  const dv = view(cmap);
  const subtables = [];
  for (let i = 0; i < dv.getUint16(2); i++) {
    const r = 4 + i * 8;
    subtables.push({ platform: dv.getUint16(r), encoding: dv.getUint16(r + 2), offset: dv.getUint32(r + 4) });
  }
  const pick = (p, e, fmt) => subtables.find((s) => s.platform === p && s.encoding === e && dv.getUint16(s.offset) === fmt);

  const f12 = pick(3, 10, 12) || pick(0, 4, 12);
  if (f12) {
    const o = f12.offset, n = dv.getUint32(o + 12);
    return (cp) => {
      for (let i = 0; i < n; i++) {
        const g = o + 16 + i * 12;
        const start = dv.getUint32(g), end = dv.getUint32(g + 4);
        if (cp >= start && cp <= end) return dv.getUint32(g + 8) + cp - start;
      }
      return 0;
    };
  }

  const f4 = pick(3, 1, 4) || pick(0, 3, 4);
  const o = f4.offset, segX2 = dv.getUint16(o + 6);
  const ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
  return (cp) => {
    if (cp > 0xffff) return 0;
    for (let i = 0; i < segX2; i += 2) {
      if (cp > dv.getUint16(ends + i)) continue;
      const start = dv.getUint16(starts + i);
      if (cp < start) return 0;
      const delta = dv.getUint16(deltas + i), ro = dv.getUint16(ranges + i);
      if (ro === 0) return (cp + delta) & 0xffff;
      const g = dv.getUint16(ranges + i + ro + (cp - start) * 2);
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
    return 0;
  };
}

// 改名：把家族名等名称换成新名字（OFL 的"保留字体名称"要求衍生字体不能沿用原名）。
// 只保留 Windows 平台的名称记录；去掉 16/17 号（排版家族名），由 1/2 号代替。
export function renameFont(buf, family, style) {
  const { sfntVersion, tables } = readTables(buf);
  const name = tables.get('name');
  const dv = view(name);
  const count = dv.getUint16(2), strOff = dv.getUint16(4);
  const replace = {
    1: family,
    2: style,
    3: `${family}-${style};subset`,
    4: `${family} ${style}`,
    6: `${family}-${style}`.replace(/\s+/g, ''),
  };
  const records = [];
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    const [platform, encoding, language, nameId, length, offset] =
      [0, 2, 4, 6, 8, 10].map((k) => dv.getUint16(r + k));
    if (platform !== 3 || nameId === 16 || nameId === 17) continue;
    const bytes = nameId in replace
      ? utf16be(replace[nameId])
      : name.slice(strOff + offset, strOff + offset + length);
    if (nameId in replace && language !== 0x409) continue; // 中文等本地化名称也去掉，只留英文新名
    records.push({ platform, encoding, language, nameId, bytes });
  }
  records.sort((a, b) => a.platform - b.platform || a.encoding - b.encoding || a.language - b.language || a.nameId - b.nameId);

  const headerLen = 6 + records.length * 12;
  const strLen = records.reduce((s, r) => s + r.bytes.length, 0);
  const out = new Uint8Array(headerLen + strLen);
  const ov = view(out);
  ov.setUint16(0, 0);
  ov.setUint16(2, records.length);
  ov.setUint16(4, headerLen);
  let p = 0;
  records.forEach((r, i) => {
    const o = 6 + i * 12;
    [r.platform, r.encoding, r.language, r.nameId, r.bytes.length, p].forEach((v, k) => ov.setUint16(o + k * 2, v));
    out.set(r.bytes, headerLen + p);
    p += r.bytes.length;
  });
  tables.set('name', out);
  return writeSfnt(sfntVersion, tables);
}

function utf16be(s) {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    out[i * 2] = s.charCodeAt(i) >> 8;
    out[i * 2 + 1] = s.charCodeAt(i) & 0xff;
  }
  return out;
}

function checksum(bytes) {
  const padded = new Uint8Array((bytes.length + 3) & ~3);
  padded.set(bytes);
  const dv = view(padded);
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + dv.getUint32(i)) >>> 0;
  return sum;
}

function writeSfnt(sfntVersion, tables) {
  const tags = [...tables.keys()].sort();
  const n = tags.length;
  let size = 12 + n * 16;
  const offsets = tags.map((t) => {
    const o = size;
    size += (tables.get(t).length + 3) & ~3;
    return o;
  });
  const out = new Uint8Array(size);
  const dv = view(out);
  const es = Math.floor(Math.log2(n));
  dv.setUint32(0, sfntVersion);
  dv.setUint16(4, n);
  dv.setUint16(6, 2 ** es * 16);
  dv.setUint16(8, es);
  dv.setUint16(10, n * 16 - 2 ** es * 16);
  tags.forEach((tag, i) => {
    const data = tables.get(tag).slice();
    if (tag === 'head') view(data).setUint32(8, 0); // 先清零 checkSumAdjustment
    tables.set(tag, data);
    const r = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[r + k] = tag.charCodeAt(k);
    dv.setUint32(r + 4, checksum(data));
    dv.setUint32(r + 8, offsets[i]);
    dv.setUint32(r + 12, data.length);
    out.set(data, offsets[i]);
  });
  const headOffset = offsets[tags.indexOf('head')];
  dv.setUint32(headOffset + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out;
}

export function readNames(buf) {
  const name = readTables(buf).tables.get('name');
  const dv = view(name);
  const strOff = dv.getUint16(4);
  const out = [];
  for (let i = 0; i < dv.getUint16(2); i++) {
    const r = 6 + i * 12;
    const [platform, , language, nameId, length, offset] = [0, 2, 4, 6, 8, 10].map((k) => dv.getUint16(r + k));
    if (platform !== 3) continue;
    const b = name.subarray(strOff + offset, strOff + offset + length);
    let s = '';
    for (let k = 0; k < b.length; k += 2) s += String.fromCharCode((b[k] << 8) | b[k + 1]);
    out.push({ nameId, language: language.toString(16), value: s });
  }
  return out;
}
