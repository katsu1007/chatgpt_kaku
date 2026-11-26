// original/vendor/ezpzfile-cad/src/cad/jww/geom.ts
function arcSegs(sweep, r, tol) {
  if (!(r > 0) || !(tol > 0)) return Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 18)));
  const ratio = Math.min(1, tol / r);
  const step = 2 * Math.acos(1 - ratio);
  let n = Math.ceil(Math.abs(sweep) / Math.max(step, 0.01));
  if (!isFinite(n)) n = 64;
  return Math.max(2, Math.min(720, n));
}
function ringArea(p) {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += (p[j * 2] + p[i * 2]) * (p[j * 2 + 1] - p[i * 2 + 1]);
  return -a / 2;
}
function pointInRing(x, y, p) {
  let inside = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], yi = p[i * 2 + 1], xj = p[j * 2], yj = p[j * 2 + 1];
    if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function reverseRing(p) {
  const r = new Array(p.length);
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    r[i * 2] = p[(n - 1 - i) * 2];
    r[i * 2 + 1] = p[(n - 1 - i) * 2 + 1];
  }
  return r;
}
function ringsToPolygons(rings) {
  const rs = rings.filter((r) => r.length >= 6 && Math.abs(ringArea(r)) > 0);
  if (rs.length === 0) return [];
  if (rs.length === 1) return [rs[0]];
  if (rs.length > 400) return rs;
  const depth = rs.map((r, i) => {
    let d = 0;
    const x = r[0], y = r[1];
    for (let j = 0; j < rs.length; j++) if (j !== i && Math.abs(ringArea(rs[j])) > Math.abs(ringArea(r)) && pointInRing(x, y, rs[j])) d++;
    return d;
  });
  const out = [];
  for (let i = 0; i < rs.length; i++) {
    if (depth[i] % 2 !== 0) continue;
    let outer = ringArea(rs[i]) < 0 ? reverseRing(rs[i]) : rs[i].slice();
    const holes = [];
    for (let j = 0; j < rs.length; j++) {
      if (depth[j] === depth[i] + 1 && pointInRing(rs[j][0], rs[j][1], rs[i])) holes.push(ringArea(rs[j]) > 0 ? reverseRing(rs[j]) : rs[j]);
    }
    holes.sort((a, b) => maxX(b) - maxX(a));
    for (const h of holes) outer = bridge(outer, h);
    out.push(outer);
  }
  return out;
}
function maxX(p) {
  let m = -Infinity;
  for (let i = 0; i < p.length; i += 2) if (p[i] > m) m = p[i];
  return m;
}
function bridge(outer, hole) {
  let hi = 0;
  for (let i = 2; i < hole.length; i += 2) if (hole[i] > hole[hi]) hi = i;
  const hx = hole[hi], hy = hole[hi + 1];
  let oi = 0, best = Infinity;
  for (let i = 0; i < outer.length; i += 2) {
    const d = (outer[i] - hx) ** 2 + (outer[i + 1] - hy) ** 2;
    if (d < best) {
      best = d;
      oi = i;
    }
  }
  const res = outer.slice(0, oi + 2);
  const hn = hole.length;
  for (let k = 0; k <= hn; k += 2) {
    const idx = (hi + k) % hn;
    res.push(hole[idx], hole[idx + 1]);
  }
  res.push(outer[oi], outer[oi + 1]);
  for (let i = oi + 2; i < outer.length; i++) res.push(outer[i]);
  return res;
}
function itemsBounds(items) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  for (const it of items) {
    switch (it.kind) {
      case "line":
      case "fill":
        for (let i = 0; i + 1 < it.pts.length; i += 2) add(it.pts[i], it.pts[i + 1]);
        break;
      case "arc": {
        if (![it.cx, it.cy, it.r, it.a0, it.a1].every(Number.isFinite)) break;
        let sw = it.a1 - it.a0;
        sw = sw - Math.floor(sw / (Math.PI * 2)) * Math.PI * 2;
        if (sw === 0 && it.a1 !== it.a0) sw = Math.PI * 2;
        if (sw >= Math.PI * 2 - 1e-9) {
          add(it.cx - it.r, it.cy - it.r);
          add(it.cx + it.r, it.cy + it.r);
          break;
        }
        add(it.cx + it.r * Math.cos(it.a0), it.cy + it.r * Math.sin(it.a0));
        add(it.cx + it.r * Math.cos(it.a0 + sw), it.cy + it.r * Math.sin(it.a0 + sw));
        const a0n = it.a0 - Math.floor(it.a0 / (Math.PI * 2)) * Math.PI * 2;
        for (let k = Math.ceil(a0n / (Math.PI / 2)); k * (Math.PI / 2) <= a0n + sw && k < 12; k++) {
          const a = k * (Math.PI / 2);
          add(it.cx + it.r * Math.cos(a), it.cy + it.r * Math.sin(a));
        }
        break;
      }
      case "text": {
        const w = it.text.length * it.size * 0.55, h = it.size * 0.75;
        const c = Math.cos(it.rot ?? 0), sn = Math.sin(it.rot ?? 0);
        const x02 = it.align === "center" ? -w / 2 : it.align === "right" ? -w : 0;
        for (const [u, v] of [[x02, 0], [x02 + w, 0], [x02, h], [x02 + w, h]]) add(it.x + u * c - v * sn, it.y + u * sn + v * c);
        break;
      }
      case "image":
        add(it.x, it.y);
        add(it.x + it.w, it.y + it.h);
        break;
    }
  }
  if (!isFinite(x0)) return null;
  return [x0, y0, x1, y1];
}
function saneItem(it) {
  switch (it.kind) {
    case "line":
    case "fill":
      for (let i = 0; i < it.pts.length; i++) if (!Number.isFinite(it.pts[i]) || Math.abs(it.pts[i]) > 1e12) return false;
      return it.pts.length >= 2;
    case "arc": {
      if (![it.cx, it.cy, it.r, it.a0, it.a1].every(Number.isFinite) || !(it.r > 0) || it.r > 1e12) return false;
      const TAU = Math.PI * 2;
      let sw = it.a1 - it.a0;
      if (Math.abs(sw) >= TAU - 1e-9 || Math.abs(sw) > 1e6) {
        it.a0 = 0;
        it.a1 = TAU;
        return true;
      }
      const a0 = it.a0 - Math.floor(it.a0 / TAU) * TAU;
      sw = sw - Math.floor(sw / TAU) * TAU;
      it.a0 = a0;
      it.a1 = a0 + sw;
      return true;
    }
    case "text":
      return Number.isFinite(it.x) && Number.isFinite(it.y) && it.size > 0 && it.size < 1e9 && (it.rot === void 0 || Number.isFinite(it.rot));
    case "image":
      return [it.x, it.y, it.w, it.h].every(Number.isFinite);
  }
  return true;
}

// original/vendor/ezpzfile-cad/src/cad/jww/types.ts
var CadError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "CadError";
  }
};

// original/vendor/ezpzfile-cad/src/cad/jww/jww.ts
var SIG = "JwwData.";
var AUX_LAYER = "\u88DC\u52A9\u7DDA (construction lines)";
var FRAME_LAYER = "\u7528\u7D19\u67A0 (paper frame)";
function sniffJww(b) {
  if (b.length < 12) return false;
  for (let i = 0; i < 8; i++) if (b[i] !== SIG.charCodeAt(i)) return false;
  return true;
}
var PAPER = {
  0: [1189, 841, "A0"],
  1: [841, 594, "A1"],
  2: [594, 420, "A2"],
  3: [420, 297, "A3"],
  4: [297, 210, "A4"],
  8: [1682, 1189, "2A"],
  9: [2378, 1682, "3A"],
  10: [3364, 2378, "4A"],
  11: [4756, 3364, "5A"],
  12: [1e4, 7071, "10m"],
  13: [5e4, 35355, "50m"],
  14: [1e5, 70711, "100m"]
};
var DEFAULT_COLORS = ["#ffffff", "#00a0c0", "#000000", "#00a000", "#b09000", "#c000c0", "#0000ff", "#008080", "#ff0000", "#808080"];
var Rd = class {
  b;
  dv;
  p = 0;
  dec;
  constructor(b) {
    this.b = b;
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    this.dec = new TextDecoder("shift_jis");
  }
  need(n) {
    if (this.p + n > this.b.length) throw new RangeError(`unexpected end of data at byte ${this.p}`);
  }
  u8() {
    this.need(1);
    return this.b[this.p++];
  }
  u16() {
    this.need(2);
    const v = this.dv.getUint16(this.p, true);
    this.p += 2;
    return v;
  }
  u32() {
    this.need(4);
    const v = this.dv.getUint32(this.p, true);
    this.p += 4;
    return v;
  }
  i32() {
    this.need(4);
    const v = this.dv.getInt32(this.p, true);
    this.p += 4;
    return v;
  }
  f64() {
    this.need(8);
    const v = this.dv.getFloat64(this.p, true);
    this.p += 8;
    return v;
  }
  /** MFC CString: BYTE length, 0xFF -> WORD, 0xFFFF -> DWORD; 0xFFFE marks a UTF-16 string */
  str() {
    let n = this.u8();
    let uni = false;
    if (n === 255) {
      n = this.u16();
      if (n === 65534) {
        uni = true;
        n = this.u8();
        if (n === 255) {
          n = this.u16();
          if (n === 65535) n = this.u32();
        }
      } else if (n === 65535) n = this.u32();
    }
    if (uni) {
      this.need(n * 2);
      let s2 = "";
      for (let i = 0; i < n; i++) s2 += String.fromCharCode(this.dv.getUint16(this.p + i * 2, true));
      this.p += n * 2;
      return s2;
    }
    this.need(n);
    const s = this.dec.decode(this.b.subarray(this.p, this.p + n));
    this.p += n;
    return s;
  }
  count() {
    const n = this.u16();
    return n === 65535 ? this.u32() : n;
  }
};
function readHeader(r, warnings) {
  r.p = 8;
  const version = r.u32();
  const memo = r.str();
  const zumen = r.u32();
  r.u32();
  const gState = [], gScale = [], lState = [];
  for (let g = 0; g < 16; g++) {
    gState.push(r.u32());
    r.u32();
    gScale.push(r.f64());
    r.u32();
    const ls = [];
    for (let l = 0; l < 16; l++) {
      ls.push(r.u32());
      r.u32();
    }
    lState.push(ls);
  }
  for (let i = 0; i < 14; i++) r.u32();
  for (let i = 0; i < 5; i++) r.u32();
  r.u32();
  const maxWid = r.i32();
  r.f64();
  r.f64();
  r.f64();
  r.u32();
  r.u32();
  r.f64();
  r.f64();
  r.f64();
  r.f64();
  r.f64();
  const layerNames = [];
  for (let g = 0; g < 16; g++) {
    const a = [];
    for (let l = 0; l < 16; l++) a.push(r.str());
    layerNames.push(a);
  }
  const groupNames = [];
  for (let g = 0; g < 16; g++) groupNames.push(r.str());
  r.f64();
  r.f64();
  r.u32();
  r.f64();
  if (version >= 300) {
    r.f64();
    r.f64();
  }
  r.u32();
  r.f64();
  r.f64();
  r.f64();
  r.f64();
  r.f64();
  r.f64();
  if (version >= 300) for (let n = 0; n < 8; n++) {
    r.f64();
    r.f64();
    r.f64();
    r.u32();
  }
  else for (let n = 0; n < 4; n++) {
    r.f64();
    r.f64();
    r.f64();
  }
  if (version >= 300) {
    r.f64();
    r.f64();
    r.f64();
    r.u32();
    r.f64();
    r.f64();
    r.f64();
    r.u32();
  }
  for (let n = 0; n < 10; n++) r.f64();
  r.f64();
  const penColor = [];
  for (let n = 0; n <= 9; n++) {
    penColor.push(r.u32());
    r.u32();
  }
  const prtWidth = [];
  for (let n = 0; n <= 9; n++) {
    r.u32();
    prtWidth.push(r.u32());
    r.f64();
  }
  const ltype = [];
  for (let n = 0; n < 2; n++) ltype.push({ pat: 0, unit: 0, pitch: 0, prtPitch: 0 });
  for (let n = 2; n <= 9; n++) ltype.push({ pat: r.u32(), unit: r.u32(), pitch: r.u32(), prtPitch: r.u32() });
  for (let n = 11; n <= 15; n++) {
    r.u32();
    r.u32();
    r.u32();
    r.u32();
    r.u32();
  }
  const ltype2 = [];
  for (let n = 16; n <= 19; n++) ltype2.push({ pat: r.u32(), unit: r.u32(), pitch: r.u32(), prtPitch: r.u32() });
  r.u32();
  r.u32();
  r.u32();
  r.u32();
  r.u32();
  r.u32();
  r.u32();
  r.u32();
  r.u32();
  r.u32();
  const prtDisp = r.u32();
  const dpi = version >= 600 ? Math.floor(prtDisp / 10) % 10 === 1 ? 300 : 600 : 300;
  if (version >= 223) {
    r.u32();
    r.u32();
    r.u32();
    r.u32();
    r.u32();
    r.f64();
    r.f64();
    r.f64();
    r.f64();
    r.f64();
  }
  if (version >= 225) {
    r.f64();
    r.f64();
    r.f64();
    r.f64();
  }
  let solidColor = 8421504;
  if (version >= 230) {
    r.u32();
    solidColor = r.u32();
  }
  const sxfColor = [], sxfPrtWidth = [], sxfColorNames = [];
  const sxfLtype = [];
  if (version >= 420) {
    for (let n = 0; n <= 256; n++) {
      sxfColor.push(r.u32());
      r.u32();
    }
    for (let n = 0; n <= 256; n++) {
      sxfColorNames.push(r.str());
      r.u32();
      sxfPrtWidth.push(r.u32());
      r.f64();
    }
    for (let n = 0; n <= 32; n++) {
      r.u32();
      r.u32();
      r.u32();
      r.u32();
    }
    for (let n = 0; n <= 32; n++) {
      const name = r.str();
      const seg = r.u32();
      const pitch = [];
      for (let j = 1; j <= 10; j++) pitch.push(r.f64());
      sxfLtype.push({ name, seg, pitch });
    }
  }
  for (let i = 1; i <= 10; i++) {
    r.f64();
    r.f64();
    r.f64();
    r.u32();
  }
  r.f64();
  r.f64();
  r.f64();
  r.u32();
  r.u32();
  r.f64();
  r.f64();
  r.u32();
  for (let i = 0; i < 6; i++) r.f64();
  void ltype2;
  void warnings;
  return { version, memo, zumen, gState, gScale, lState, layerNames, groupNames, penColor, prtWidth, sxfColor, sxfPrtWidth, sxfColorNames, ltype: [...ltype, ...ltype2], sxfLtype, maxWid, dpi, solidColor };
}
function looksLikeListStart(b, p) {
  if (p + 12 > b.length) return false;
  const tag = b[p + 2] | b[p + 3] << 8;
  if (tag !== 65535) {
    const cnt = b[p] | b[p + 1] << 8;
    return cnt === 0 && p + 4 <= b.length;
  }
  const ln = b[p + 6] | b[p + 7] << 8;
  if (ln < 6 || ln > 32) return false;
  return String.fromCharCode(b[p + 8], b[p + 9], b[p + 10], b[p + 11], b[p + 12]) === "CData";
}
function findListStart(b, from) {
  for (let p = from; p + 13 < b.length; p++) {
    if (b[p + 2] === 255 && b[p + 3] === 255 && b[p + 8] === 67 && b[p + 9] === 68 && b[p + 10] === 97 && b[p + 11] === 116 && b[p + 12] === 97 && looksLikeListStart(b, p)) return p;
  }
  return -1;
}
var ObjReader = class {
  r;
  ver;
  map = [{ obj: null }];
  timeSize = 0;
  // CTime: 4 or 8 bytes, detected on the first block definition
  counts = {};
  constructor(r, ver) {
    this.r = r;
    this.ver = ver;
  }
  base() {
    const r = this.r;
    const group = r.u32(), style = r.u8(), color = r.u16();
    const width = this.ver >= 351 ? r.u16() : 0;
    const layer = r.u16(), glayer = r.u16(), flag = r.u16();
    return { group, style, color, width, layer: layer & 15, glayer: glayer & 15, flag };
  }
  sen() {
    const b = this.base(), r = this.r;
    return { ...b, t: "sen", x0: r.f64(), y0: r.f64(), x1: r.f64(), y1: r.f64() };
  }
  ten() {
    const b = this.base(), r = this.r;
    const x = r.f64(), y = r.f64(), kari = r.u32() !== 0;
    let code = 0, ang = 0, mag = 1;
    if (b.style === 100) {
      code = r.u32();
      ang = r.f64();
      mag = r.f64();
    }
    return { ...b, t: "ten", x, y, kari, code, ang, mag };
  }
  moji() {
    const b = this.base(), r = this.r;
    const x0 = r.f64(), y0 = r.f64(), x1 = r.f64(), y1 = r.f64();
    const shu = r.u32();
    const sx = r.f64(), sy = r.f64(), gap = r.f64(), ang = r.f64();
    const font = r.str(), s = r.str();
    return { ...b, t: "moji", x0, y0, x1, y1, shu, sx, sy, gap, ang, font, s };
  }
  readObject(depth) {
    const r = this.r;
    let tag = r.u16();
    let cls;
    if (tag === 0) return null;
    if (tag === 32767) {
      const big = r.u32();
      if (big & 2147483648) {
        const e = this.map[big & 2147483647];
        if (!e || !("cls" in e)) throw new CadError("corrupt", "bad class reference");
        cls = e.cls;
      } else {
        const e = this.map[big];
        return e && "obj" in e ? e.obj : null;
      }
    } else if (tag === 65535) {
      r.u16();
      const ln = r.u16();
      r.need(ln);
      cls = "";
      for (let i = 0; i < ln; i++) cls += String.fromCharCode(r.b[r.p + i]);
      r.p += ln;
      this.map.push({ cls });
    } else if (tag & 32768) {
      const e = this.map[tag & 32767];
      if (!e || !("cls" in e)) throw new CadError("corrupt", `bad class tag ${tag.toString(16)} at byte ${r.p - 2}`);
      cls = e.cls;
    } else {
      const e = this.map[tag];
      return e && "obj" in e ? e.obj : null;
    }
    const slot = this.map.length;
    this.map.push({ obj: null });
    this.counts[cls] = (this.counts[cls] ?? 0) + 1;
    let o;
    switch (cls) {
      case "CDataSen":
        o = this.sen();
        break;
      case "CDataEnko": {
        const b = this.base();
        o = { ...b, t: "enko", cx: r.f64(), cy: r.f64(), r: r.f64(), a0: r.f64(), da: r.f64(), tilt: r.f64(), flat: r.f64(), full: r.u32() !== 0 };
        break;
      }
      case "CDataTen":
        o = this.ten();
        break;
      case "CDataMoji":
        o = this.moji();
        break;
      case "CDataSolid": {
        const b = this.base();
        const p = [r.f64(), r.f64(), r.f64(), r.f64(), r.f64(), r.f64(), r.f64(), r.f64()];
        const rgb = b.color === 10 ? r.u32() : null;
        o = { ...b, t: "solid", p, rgb };
        break;
      }
      case "CDataSunpou": {
        const b = this.base();
        const sen = this.sen(), moji = this.moji();
        const extra = [];
        if (this.ver >= 420) {
          r.u16();
          extra.push(this.sen(), this.sen(), this.ten(), this.ten(), this.ten(), this.ten());
        }
        o = { ...b, t: "sunpou", sen, moji, extra };
        break;
      }
      case "CDataBlock": {
        const b = this.base();
        o = { ...b, t: "block", x: r.f64(), y: r.f64(), sx: r.f64(), sy: r.f64(), rot: r.f64(), num: r.u32() };
        break;
      }
      case "CDataList": {
        if (depth > 64) throw new CadError("corrupt", "block definitions nested too deep");
        const b = this.base();
        const num = r.u32();
        r.u32();
        this.readTime();
        const name = r.str();
        const n = r.count();
        const items = [];
        for (let i = 0; i < n; i++) {
          const c = this.readObject(depth + 1);
          if (c) items.push(c);
        }
        o = { ...b, t: "list", num, name, items };
        break;
      }
      default:
        throw new CadError("unsupported-version", `unknown JWW data class ${cls} at byte ${r.p}`);
    }
    this.map[slot] = { obj: o };
    return o;
  }
  /** CTime is 4 bytes (32 bit time_t) or 8 bytes (64 bit) depending on the compiler of the writing version:
   *  pick the size after which a CString name, an object count and a valid object tag follow */
  readTime() {
    const r = this.r;
    if (!this.timeSize) {
      const ok = (sz) => {
        const b = r.b;
        let q = r.p + sz;
        if (q >= b.length) return false;
        const n = b[q];
        if (n === 255) return false;
        q += 1 + n;
        if (q + 2 > b.length) return false;
        const cnt = b[q] | b[q + 1] << 8;
        if (cnt === 0) return true;
        if (q + 4 > b.length) return false;
        const tag = b[q + 2] | b[q + 3] << 8;
        return tag === 65535 || tag === 32767 || (tag & 32768) !== 0 && (tag & 32767) < this.map.length;
      };
      this.timeSize = ok(8) ? 8 : ok(4) ? 4 : 4;
    }
    r.need(this.timeSize);
    r.p += this.timeSize;
  }
};
var mul = (p, c) => [p[0] * c[0] + p[2] * c[1], p[1] * c[0] + p[3] * c[1], p[0] * c[2] + p[2] * c[3], p[1] * c[2] + p[3] * c[3], p[0] * c[4] + p[2] * c[5] + p[4], p[1] * c[4] + p[3] * c[5] + p[5]];
var ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function colorRef(v) {
  return [v & 255, v >> 8 & 255, v >> 16 & 255];
}
var hex2 = (n) => (n < 16 ? "0" : "") + n.toString(16);
function paperColor(v) {
  let [r, g, b] = colorRef(v);
  if (r > 240 && g > 240 && b > 240) return "#000000";
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum > 0.6) {
    const k = 0.6 / lum;
    r = Math.round(r * k);
    g = Math.round(g * k);
    b = Math.round(b * k);
  }
  return "#" + hex2(r) + hex2(g) + hex2(b);
}
var Drawer = class {
  h;
  items = [];
  warnings = /* @__PURE__ */ new Set();
  blocks = /* @__PURE__ */ new Map();
  W;
  H;
  maxItems;
  layerItems = /* @__PURE__ */ new Map();
  colors = [];
  widths = [];
  sxfColors = [];
  sxfWidths = [];
  unit;
  // mm per printer width unit
  constructor(h, maxItems) {
    this.h = h;
    const pp = PAPER[h.zumen] ?? PAPER[3];
    this.W = pp[0];
    this.H = pp[1];
    this.maxItems = maxItems;
    this.unit = h.maxWid <= -101 ? 0.01 : 25.4 / h.dpi;
    const usable = h.penColor.length === 10 && new Set(h.penColor.slice(1)).size > 3;
    for (let n = 0; n <= 9; n++) this.colors.push(usable ? paperColor(h.penColor[n]) : DEFAULT_COLORS[n]);
    for (let n = 0; n <= 9; n++) this.widths.push(this.w(h.prtWidth[n] ?? 1));
    for (let n = 0; n < h.sxfColor.length; n++) {
      this.sxfColors.push(paperColor(h.sxfColor[n]));
      this.sxfWidths.push(this.w(h.sxfPrtWidth[n] ?? 1));
    }
  }
  w(v) {
    const x = v * this.unit;
    return +Math.max(0.05, Math.min(5, x || 0.13)).toFixed(3);
  }
  layerName(g, l) {
    const gn = this.h.groupNames[g]?.trim(), ln = this.h.layerNames[g]?.[l]?.trim();
    const key = `${g.toString(16).toUpperCase()}-${l.toString(16).toUpperCase()}`;
    const label = [gn, ln].filter(Boolean).join(" / ");
    return label ? `${key} ${label}` : key;
  }
  color(o) {
    const c = o.color;
    if (c >= 1 && c <= 9) return this.colors[c];
    if (c >= 100 && c - 100 < this.sxfColors.length) return this.sxfColors[c - 100];
    return "#000000";
  }
  width(o) {
    const c = o.color;
    if (c >= 1 && c <= 9) return this.widths[c];
    if (c >= 100 && c - 100 < this.sxfWidths.length) return this.sxfWidths[c - 100];
    return 0.13;
  }
  dash(style, scale) {
    if (style <= 1) return void 0;
    const h = this.h;
    if (style >= 30 && style - 30 < h.sxfLtype.length) {
      const t = h.sxfLtype[style - 30];
      const seq = t.pitch.slice(0, Math.max(0, Math.min(10, t.seg * 2 || 0))).filter((v) => v > 0);
      return seq.length >= 2 ? seq.map((v) => +(v * scale).toPrecision(4)) : void 0;
    }
    let lt;
    if (style >= 2 && style <= 9) lt = h.ltype[style];
    else if (style >= 16 && style <= 19) lt = h.ltype[10 + (style - 16)];
    if (!lt || !lt.pat || !(lt.unit > 0)) return void 0;
    const bits = [];
    const unit = Math.min(32, lt.unit);
    for (let i = 0; i < unit; i++) bits.push(lt.pat >>> 31 - i & 1);
    let k = bits.findIndex((b, i) => b === 1 && bits[(i + unit - 1) % unit] === 0);
    if (k < 0) return void 0;
    const runs = [];
    let cur = 1, len = 0;
    for (let i = 0; i < unit; i++) {
      const b = bits[(k + i) % unit];
      if (b === cur) len++;
      else {
        runs.push(len);
        cur = b;
        len = 1;
      }
    }
    runs.push(len);
    if (runs.length % 2) runs.push(0);
    const bit = (lt.prtPitch || 10) * (25.4 / this.h.dpi) * scale;
    return runs.map((v) => +(v * bit).toPrecision(4));
  }
  push(it, layer) {
    if (this.items.length >= this.maxItems) {
      this.warnings.add(`drawing cut at ${this.maxItems} items`);
      return;
    }
    if (!saneItem(it)) {
      this.warnings.add("figures with invalid coordinates skipped");
      return;
    }
    it.layer = layer;
    this.items.push(it);
    this.layerItems.set(layer, (this.layerItems.get(layer) ?? 0) + 1);
  }
  /** coordinates are stored in paper millimetres with the origin at the paper centre (verified on samples: lines
   *  next to dimension texts measure value / layer group scale); the group scale only converts to real size */
  groupMatrix(_g) {
    return [1, 0, 0, 1, this.W / 2, this.H / 2];
  }
  draw(o, ctx, layer) {
    switch (o.t) {
      case "sen": {
        const a = ap(ctx.m, o.x0, o.y0), b = ap(ctx.m, o.x1, o.y1);
        const it = { kind: "line", pts: [a[0], a[1], b[0], b[1]], color: this.color(o), w: this.width(o) };
        const d = this.dash(o.style, 1);
        if (d) it.dash = d;
        this.push(it, layer);
        break;
      }
      case "enko":
        this.arc(o, ctx, layer);
        break;
      case "ten": {
        if (o.kari) break;
        const [x, y] = ap(ctx.m, o.x, o.y);
        if (o.code) {
          const L = 2.5 * (o.mag || 1);
          const a = o.ang + ctx.rot;
          const tx = x + Math.cos(a) * L, ty = y + Math.sin(a) * L;
          const nx = -Math.sin(a) * L / 6, ny = Math.cos(a) * L / 6;
          this.push({ kind: "fill", pts: [x, y, tx + nx, ty + ny, tx - nx, ty - ny], color: this.color(o) }, layer);
          this.warnings.add("point marker codes drawn as simple arrows");
        } else this.push({ kind: "line", pts: [x, y, x, y], color: this.color(o), w: Math.max(0.3, this.width(o) * 2) }, layer);
        break;
      }
      case "moji":
        this.text(o, ctx, layer);
        break;
      case "solid":
        this.solid(o, ctx, layer);
        break;
      case "sunpou": {
        this.draw({ ...o.sen, layer: o.layer, glayer: o.glayer }, ctx, layer);
        this.draw({ ...o.moji, layer: o.layer, glayer: o.glayer }, ctx, layer);
        for (const e of o.extra) {
          if (e.t === "sen" && e.x0 === e.x1 && e.y0 === e.y1) continue;
          if (e.t === "ten" && !e.code) continue;
          this.draw(e, ctx, layer);
        }
        break;
      }
      case "block": {
        const def = this.blocks.get(o.num);
        if (!def) {
          this.warnings.add(`block definition ${o.num} missing`);
          break;
        }
        if (ctx.stack.includes(o.num) || ctx.depth > 32) {
          this.warnings.add("recursive block reference skipped");
          break;
        }
        const c = Math.cos(o.rot), s = Math.sin(o.rot);
        const local = [c * o.sx, s * o.sx, -s * o.sy, c * o.sy, o.x, o.y];
        const child = { m: mul(ctx.m, local), tscale: ctx.tscale * Math.abs(o.sy || 1), rot: ctx.rot + o.rot, depth: ctx.depth + 1, stack: [...ctx.stack, o.num] };
        for (const e of def.items) this.draw(e, child, layer);
        break;
      }
      case "list":
        break;
    }
  }
  arc(o, ctx, layer) {
    const m = ctx.m;
    const color = this.color(o), w = this.width(o);
    const dash = this.dash(o.style, 1);
    const full = o.full || Math.abs(o.da) >= Math.PI * 2 - 1e-9;
    const flat = o.flat > 0 ? o.flat : 1;
    const sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]);
    const ortho = Math.abs(m[0] * m[2] + m[1] * m[3]) < 1e-9 * sx * sy;
    const det = m[0] * m[3] - m[1] * m[2];
    if (Math.abs(flat - 1) < 1e-9 && ortho && Math.abs(sx - sy) < 1e-9 * sx && !dash && det > 0) {
      const [cx, cy] = ap(m, o.cx, o.cy);
      const rot = Math.atan2(m[1], m[0]);
      const a0 = full ? 0 : o.a0 + o.tilt + rot;
      const a1 = full ? Math.PI * 2 : a0 + o.da;
      this.push({ kind: "arc", cx, cy, r: o.r * sx, a0, a1, color, w }, layer);
      return;
    }
    const sweep = full ? Math.PI * 2 : o.da;
    const n = arcSegs(sweep, o.r * Math.max(sx, sy), 0.05);
    const ct = Math.cos(o.tilt), st = Math.sin(o.tilt);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = (full ? 0 : o.a0) + sweep * i / n;
      const ex = o.r * Math.cos(t), ey = o.r * flat * Math.sin(t);
      const [x, y] = ap(m, o.cx + ex * ct - ey * st, o.cy + ex * st + ey * ct);
      pts.push(x, y);
    }
    const it = { kind: "line", pts, color, w };
    if (dash) it.dash = dash;
    this.push(it, layer);
  }
  text(o, ctx, layer) {
    let s = o.s;
    if (!s) return;
    if (o.x0 === 0 && o.y0 === -1e3 && o.x1 === 0 && o.y1 === -1e3) return;
    if (s.startsWith("^@BM")) {
      this.warnings.add("embedded images (^@BM) are not drawn");
      return;
    }
    s = s.replace(/\^[udcowbm]/g, "").replace(/\s+$/, "");
    if (!s.trim()) return;
    const [x, y] = ap(ctx.m, o.x0, o.y0);
    const size = (o.sy > 0 ? o.sy : 2.5) * ctx.tscale;
    const rot = o.ang * Math.PI / 180 + ctx.rot;
    const it = { kind: "text", x, y, text: s, size: +size.toPrecision(5), color: this.color(o) };
    if (Math.abs(rot) > 1e-9) it.rot = rot;
    if (o.font) it.font = o.font;
    this.push(it, layer);
  }
  solid(o, ctx, layer) {
    const color = o.color === 10 && o.rgb != null ? "#" + colorRef(o.rgb).map(hex2).join("") : this.color(o);
    const p = o.p;
    if (o.style >= 101) {
      const cx = p[0], cy = p[1], r = p[2], flat = p[3] || 1, tilt = p[4], a0 = p[5], da = p[6], kind = p[7];
      const ring = (rr, start, sweep) => {
        const n = Math.max(24, arcSegs(sweep, rr, 0.02));
        const out = [];
        const ct = Math.cos(tilt), st = Math.sin(tilt);
        for (let i = 0; i <= n; i++) {
          const t = start + sweep * i / n;
          const ex = rr * Math.cos(t), ey = rr * flat * Math.sin(t);
          const [x, y] = ap(ctx.m, cx + ex * ct - ey * st, cy + ex * st + ey * ct);
          out.push(x, y);
        }
        return out;
      };
      let rings;
      if (o.style === 101 && kind === 100) rings = [ring(r, 0, Math.PI * 2)];
      else if (o.style === 101 && kind === 0) {
        const [x, y] = ap(ctx.m, cx, cy);
        rings = [[x, y, ...ring(r, a0, da)]];
      } else if (o.style === 101) rings = [ring(r, a0, da)];
      else if (o.style === 105 || o.style === 106) {
        const full = Math.abs(da) >= Math.PI * 2 - 1e-9 || da === 0;
        const outer = ring(r, full ? 0 : a0, full ? Math.PI * 2 : da);
        const innerR = kind;
        if (full) rings = [outer, ring(innerR, 0, Math.PI * 2)];
        else {
          const inner = ring(innerR, a0, da);
          const rev = [];
          for (let i = inner.length - 2; i >= 0; i -= 2) rev.push(inner[i], inner[i + 1]);
          rings = [[...outer, ...rev]];
        }
      } else if (o.style === 111) {
        const pts2 = ring(r, kind === 100 ? 0 : a0, kind === 100 ? Math.PI * 2 : da);
        this.push({ kind: "line", pts: pts2, color, w: this.width(o) }, layer);
        return;
      } else {
        this.warnings.add(`circle solid type ${o.style} drawn as a disc`);
        rings = [ring(r, 0, Math.PI * 2)];
      }
      for (const poly of ringsToPolygons(rings)) this.push({ kind: "fill", pts: poly, color }, layer);
      return;
    }
    const pts = [];
    for (const [x, y] of [[p[0], p[1]], [p[4], p[5]], [p[6], p[7]], [p[2], p[3]]]) {
      const q = ap(ctx.m, x, y);
      pts.push(q[0], q[1]);
    }
    this.push({ kind: "fill", pts, color }, layer);
  }
};
async function readJww(bytes, onProgress, options = {}) {
  const t0 = Date.now();
  if (!sniffJww(bytes)) throw new CadError("not-format", 'not a JWW file (no "JwwData." signature)');
  if (bytes.length > 512 * 1024 * 1024) throw new CadError("too-large", "JWW larger than 512 MB");
  const warnings = [];
  const r = new Rd(bytes);
  onProgress?.("header", 0);
  let h;
  try {
    h = readHeader(r, warnings);
  } catch (e) {
    if (e instanceof CadError) throw e;
    throw new CadError("corrupt", `JWW header truncated: ${e.message}`);
  }
  if (h.version < 200 || h.version > 2e3) throw new CadError("unsupported-version", `JWW data version ${h.version} is outside the known range`);
  if (!looksLikeListStart(bytes, r.p)) {
    const q = findListStart(bytes, r.p);
    if (q < 0) throw new CadError(h.version > 702 ? "unsupported-version" : "corrupt", `JWW ${h.version}: figure data list not found after the header`);
    warnings.push(`header of version ${h.version} is ${q - r.p} bytes longer than the documented Ver.7.02 layout; extra settings skipped`);
    r.p = q;
  }
  const or = new ObjReader(r, h.version);
  const ents = [];
  const blockDefs = [];
  let complete = true;
  try {
    const n = r.count();
    for (let i = 0; i < n; i++) {
      const o = or.readObject(0);
      if (o) ents.push(o);
      if ((i & 4095) === 0) onProgress?.("figures", 0.1 + 0.6 * (i / n));
    }
    const nb = r.count();
    for (let i = 0; i < nb; i++) {
      const o = or.readObject(0);
      if (o && o.t === "list") blockDefs.push(o);
    }
    if (h.version >= 700 && r.p + 4 <= bytes.length) {
      const ni = r.u32();
      if (ni > 0) warnings.push(`${ni} embedded image file(s) not drawn`);
    }
  } catch (e) {
    if (e instanceof CadError && e.code === "unsupported-version" && ents.length === 0) throw e;
    complete = false;
    warnings.push(`figure data ended early: ${e.message} (${ents.length} figures read)`);
  }
  if (ents.length === 0 && !complete) throw new CadError("corrupt", "JWW: no figure data could be read");
  const dr = new Drawer(h, options.maxItems ?? 3e6);
  for (const b of blockDefs) {
    dr.blocks.set(b.num, b);
    const walk = (l) => {
      for (const it of l.items) if (it.t === "list") {
        dr.blocks.set(it.num, it);
        walk(it);
      }
    };
    walk(b);
  }
  let k = 0;
  for (const o of ents) {
    const aux = (o.t === "sen" || o.t === "enko") && (o.style === 9 || o.color === 9);
    const layer = aux ? AUX_LAYER : dr.layerName(o.glayer, o.layer);
    dr.draw(o, { m: dr.groupMatrix(o.glayer), tscale: 1, rot: 0, depth: 0, stack: [] }, layer);
    if ((++k & 4095) === 0) onProgress?.("drawing", 0.7 + 0.25 * (k / ents.length));
  }
  const pp = PAPER[h.zumen];
  if (!pp) warnings.push(`unknown paper size code ${h.zumen}, A3 assumed`);
  dr.push({ kind: "line", pts: [0, 0, dr.W, 0, dr.W, dr.H, 0, dr.H, 0, 0], color: "#9aa3b5", w: 0.25 }, FRAME_LAYER);
  let W = dr.W, H = dr.H;
  const bb = itemsBounds(dr.items);
  let ox = 0, oy = 0;
  if (bb && (bb[0] < -0.5 || bb[1] < -0.5 || bb[2] > W + 0.5 || bb[3] > H + 0.5)) {
    const pad = 5;
    const x0 = Math.min(0, bb[0] - pad), y0 = Math.min(0, bb[1] - pad);
    ox = -x0;
    oy = -y0;
    W = Math.max(W, bb[2] + pad) - x0;
    H = Math.max(H, bb[3] + pad) - y0;
    for (const it of dr.items) shift(it, ox, oy);
    warnings.push("drawing extends beyond the paper; the sheet covers the paper (frame layer) and the outside content");
  }
  const layers = [];
  for (let g = 0; g < 16; g++) for (let l = 0; l < 16; l++) {
    const name = dr.layerName(g, l);
    const n = dr.layerItems.get(name) ?? 0;
    const named = !!h.layerNames[g]?.[l]?.trim();
    if (!n && !named) continue;
    layers.push({ name, color: "#000000", visible: h.gState[g] !== 0 && h.lState[g][l] !== 0, items: n, scale: h.gScale[g] > 0 ? h.gScale[g] : 1 });
  }
  layers.push({ name: FRAME_LAYER, color: "#9aa3b5", visible: true, items: 1 });
  if (dr.layerItems.get(AUX_LAYER)) layers.push({ name: AUX_LAYER, color: "#808080", visible: false, items: dr.layerItems.get(AUX_LAYER) });
  const allWarn = [...warnings, ...dr.warnings];
  const sheet = {
    id: 0,
    number: "",
    name: h.memo.trim().split(/\r?\n/)[0] || `Jw_cad ${pp?.[2] ?? ""}`.trim(),
    size: { w: W, h: H },
    items: dr.items,
    viewports: [],
    completeness: complete && !dr.warnings.size ? "full" : "partial",
    warnings: allWarn,
    origin: [-dr.W / 2 - ox, -dr.H / 2 - oy]
  };
  const info = {
    format: "JWW",
    version: `${h.version} (Jw_cad ${(h.version / 100).toFixed(2)})`,
    paper: pp ? `${pp[2]} ${pp[0]} x ${pp[1]} mm` : `code ${h.zumen}`,
    memo: h.memo.trim(),
    figures: ents.length,
    blocks: dr.blocks.size,
    items: dr.items.length,
    layers: layers.length,
    scales: [...new Set(h.gScale.map((s) => `1:${+s.toPrecision(6)}`))].join(", "),
    ms: Date.now() - t0
  };
  if (or.timeSize) info.ctimeBytes = or.timeSize;
  for (const [kk, v] of Object.entries(or.counts)) info["count." + kk] = v;
  onProgress?.("done", 1);
  return { kind: "2d", sheets: [sheet], layers, info };
}
function shift(it, dx, dy) {
  switch (it.kind) {
    case "line":
    case "fill":
      for (let i = 0; i + 1 < it.pts.length; i += 2) {
        it.pts[i] += dx;
        it.pts[i + 1] += dy;
      }
      break;
    case "arc":
      it.cx += dx;
      it.cy += dy;
      break;
    case "text":
    case "image":
      it.x += dx;
      it.y += dy;
      break;
  }
}
export {
  AUX_LAYER,
  CadError,
  FRAME_LAYER,
  readJww,
  sniffJww
};
