// THE WORLD TODAY - Wednesday 25 November 2026
// A one-day world news front page, drawn fully procedurally.
// Node 22, standard library only, no network, deterministic output.
// Every story below happened or was first reported on 25 Nov 2026
// (Reuters, BBC, AP, One Turn, Daily Summary, 25 Nov 2026 editions).
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---------- palette ----------
const PAPER: RGB = [246, 241, 227];
const INK: RGB = [20, 20, 20];
const NAVY: RGB = [20, 38, 74];
const RED: RGB = [164, 31, 34];
const GOLD: RGB = [178, 138, 44];
const TEAL: RGB = [18, 110, 105];
const WHITE: RGB = [255, 255, 255];
const GREY: RGB = [110, 104, 88];
const LIGHT: RGB = [232, 224, 200];
const SKY: RGB = [186, 214, 232];
const SEA: RGB = [64, 110, 148];

type RGB = [number, number, number];

// ---------- CRC32 (PNG chunks) ----------
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(rgb: Uint8Array, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // One scanline per row: filter byte 0 + raw RGB. Flat newspaper art
  // compresses far below 1 MiB at level 9.
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- canvas ----------
class Canvas {
  px: Uint8Array;
  constructor() {
    this.px = new Uint8Array(W * H * 3);
    for (let i = 0; i < W * H; i++) {
      this.px[i * 3] = PAPER[0];
      this.px[i * 3 + 1] = PAPER[1];
      this.px[i * 3 + 2] = PAPER[2];
    }
  }
  set(x: number, y: number, c: RGB): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
    const o = (iy * W + ix) * 3;
    this.px[o] = c[0];
    this.px[o + 1] = c[1];
    this.px[o + 2] = c[2];
  }
  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(W, Math.round(x + w));
    const y1 = Math.min(H, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const o = (yy * W + xx) * 3;
        this.px[o] = c[0];
        this.px[o + 1] = c[1];
        this.px[o + 2] = c[2];
      }
    }
  }
  rect(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
    this.fillRect(x, y, w, t, c);
    this.fillRect(x, y + h - t, w, t, c);
    this.fillRect(x, y, t, h, c);
    this.fillRect(x + w - t, y, t, h, c);
  }
  disc(cx: number, cy: number, r: number, c: RGB): void {
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(H - 1, Math.ceil(cy + r));
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const dx = xx - cx;
        const dy = yy - cy;
        if (dx * dx + dy * dy <= r2) this.set(xx, yy, c);
      }
    }
  }
  // Thick line: stamp discs along the segment (deterministic, round caps).
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const r = Math.max(0.6, t / 2);
    if (len < 0.01) {
      this.disc(x0, y0, r, c);
      return;
    }
    const steps = Math.max(1, Math.ceil(len / 0.45));
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      this.disc(x0 + dx * f, y0 + dy * f, r, c);
    }
  }
  polyline(pts: number[][], c: RGB, t = 1): void {
    for (let i = 0; i + 1 < pts.length; i++) {
      this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, t);
    }
  }
  // Scanline fill of a simple polygon (even-odd).
  polyFill(pts: number[][], c: RGB): void {
    let minY = H;
    let maxY = 0;
    for (const p of pts) {
      minY = Math.min(minY, Math.floor(p[1]));
      maxY = Math.max(maxY, Math.ceil(p[1]));
    }
    minY = Math.max(0, minY);
    maxY = Math.min(H - 1, maxY);
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          const f = (y - a[1]) / (b[1] - a[1]);
          xs.push(a[0] + f * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, Math.ceil(xs[k]));
        const x1 = Math.min(W - 1, Math.floor(xs[k + 1]));
        for (let x = x0; x <= x1; x++) this.set(x, y, c);
      }
    }
  }
}

// ---------- single-stroke vector font ----------
// Glyphs are polylines on a 6 (wide) x 7 (tall) unit grid. All-caps
// newspaper face: clean strokes, no bitmap pixels, legible at 300 px.
type Stroke = number[][];
const FONT: Record<string, Stroke[]> = {
  A: [[[0, 7], [2.5, 0], [5, 7]], [[1.3, 4.6], [3.7, 4.6]]],
  B: [[[0, 0], [0, 7]], [[0, 0], [3.4, 0], [4.6, 1.4], [3.4, 3.5], [0, 3.5]], [[0, 3.5], [3.4, 3.5], [4.6, 5], [3.4, 7], [0, 7]]],
  C: [[[5, 1.6], [3.4, 0], [1.6, 0], [0, 1.6], [0, 5.4], [1.6, 7], [3.4, 7], [5, 5.4]]],
  D: [[[0, 0], [0, 7]], [[0, 0], [3, 0], [5, 2], [5, 5], [3, 7], [0, 7]]],
  E: [[[0, 0], [0, 7]], [[0, 0], [4.6, 0]], [[0, 3.5], [3.4, 3.5]], [[0, 7], [4.6, 7]]],
  F: [[[0, 0], [0, 7]], [[0, 0], [4.6, 0]], [[0, 3.5], [3.4, 3.5]]],
  G: [[[5, 1.6], [3.4, 0], [1.6, 0], [0, 1.6], [0, 5.4], [1.6, 7], [3.4, 7], [5, 5.4], [5, 3.4], [3, 3.4]]],
  H: [[[0, 0], [0, 7]], [[5, 0], [5, 7]], [[0, 3.5], [5, 3.5]]],
  I: [[[2.5, 0], [2.5, 7]], [[0.6, 0], [4.4, 0]], [[0.6, 7], [4.4, 7]]],
  J: [[[2.4, 0], [5, 0], [5, 5.4], [3.4, 7], [1.4, 7], [0, 5.4]]],
  K: [[[0, 0], [0, 7]], [[5, 0], [0, 3.5], [5, 7]]],
  L: [[[0, 0], [0, 7]], [[0, 7], [5, 7]]],
  M: [[[0, 7], [0, 0], [2.5, 4], [5, 0], [5, 7]]],
  N: [[[0, 7], [0, 0], [5, 7], [5, 0]]],
  O: [[[1.6, 0], [3.4, 0], [5, 1.6], [5, 5.4], [3.4, 7], [1.6, 7], [0, 5.4], [0, 1.6], [1.6, 0]]],
  P: [[[0, 0], [0, 7]], [[0, 0], [3.4, 0], [5, 1.6], [3.4, 3.5], [0, 3.5]]],
  Q: [[[1.6, 0], [3.4, 0], [5, 1.6], [5, 5.4], [3.4, 7], [1.6, 7], [0, 5.4], [0, 1.6], [1.6, 0]], [[3, 4.6], [5.2, 7]]],
  R: [[[0, 0], [0, 7]], [[0, 0], [3.4, 0], [5, 1.6], [3.4, 3.5], [0, 3.5]], [[3, 3.5], [5, 7]]],
  S: [[[5, 1.6], [3.4, 0], [1.6, 0], [0, 1.6], [0, 3], [1.6, 3.5], [3.4, 3.5], [5, 4], [5, 5.4], [3.4, 7], [1.6, 7], [0, 5.4]]],
  T: [[[0, 0], [5, 0]], [[2.5, 0], [2.5, 7]]],
  U: [[[0, 0], [0, 5.4], [1.6, 7], [3.4, 7], [5, 5.4], [5, 0]]],
  V: [[[0, 0], [2.5, 7], [5, 0]]],
  W: [[[0, 0], [1.2, 7], [2.5, 3.4], [3.8, 7], [5, 0]]],
  X: [[[0, 0], [5, 7]], [[5, 0], [0, 7]]],
  Y: [[[0, 0], [2.5, 3.5], [5, 0]], [[2.5, 3.5], [2.5, 7]]],
  Z: [[[0, 0], [5, 0], [0, 7], [5, 7]]],
  "0": [[[1.6, 0], [3.4, 0], [5, 1.6], [5, 5.4], [3.4, 7], [1.6, 7], [0, 5.4], [0, 1.6], [1.6, 0]], [[1.4, 1.6], [3.6, 5.4]]],
  "1": [[[1.2, 1.6], [2.6, 0], [2.6, 7]], [[0.6, 7], [4.6, 7]]],
  "2": [[[0, 1.6], [1.2, 0], [3.8, 0], [5, 1.6], [5, 3], [0, 7], [5, 7]]],
  "3": [[[0, 1.2], [1.6, 0], [3.4, 0], [5, 1.6], [5, 3], [3, 3.5], [5, 4], [5, 5.4], [3.4, 7], [1.6, 7], [0, 5.8]]],
  "4": [[[4, 0], [4, 7]], [[0, 4.6], [5, 4.6]], [[4, 0], [0, 4.6]]],
  "5": [[[5, 0], [0, 0], [0, 3.4], [3.4, 3.4], [5, 5], [3.4, 7], [1.6, 7], [0, 5.4]]],
  "6": [[[5, 1.2], [3.4, 0], [1.6, 0], [0, 1.6], [0, 5.4], [1.6, 7], [3.4, 7], [5, 5.4], [5, 4], [3.4, 3.4], [1.6, 3.4], [0, 5]]],
  "7": [[[0, 0], [5, 0], [2, 7]]],
  "8": [[[1.6, 0], [3.4, 0], [5, 1.6], [5, 3], [3.4, 4], [1.6, 4], [0, 3], [0, 1.6], [1.6, 0]], [[1.6, 4], [3.4, 4], [5, 5.4], [3.4, 7], [1.6, 7], [0, 5.4], [0, 4]]],
  "9": [[[0, 5.8], [1.6, 7], [3.4, 7], [5, 5.4], [5, 1.6], [3.4, 0], [1.6, 0], [0, 1.6], [0, 3], [1.6, 3.6], [3.4, 3.6], [5, 2]]],
  ".": [[[2.5, 6.4], [2.5, 6.9]]],
  ",": [[[2.5, 5.4], [2.5, 6.8], [1.2, 7.2]]],
  ":": [[[2.5, 2], [2.5, 2.5]], [[2.5, 5.4], [2.5, 5.9]]],
  ";": [[[2.5, 2], [2.5, 2.5]], [[2.5, 5.4], [2.5, 6.8], [1.2, 7.2]]],
  "'": [[[2.6, 0], [2, 2]]],
  "-": [[[0.6, 3.5], [4.4, 3.5]]],
  "/": [[[0.6, 7], [4.4, 0]]],
  "(": [[[4, 0], [2, 1.6], [2, 5.4], [4, 7]]],
  ")": [[[1, 0], [3, 1.6], [3, 5.4], [1, 7]]],
  "+": [[[2.5, 1], [2.5, 6]], [[0, 3.5], [5, 3.5]]],
  "=": [[[0.6, 2.4], [4.4, 2.4]], [[0.6, 4.6], [4.4, 4.6]]],
  "%": [[[0.6, 7], [4.4, 0]], [[1.2, 0.6], [1.2, 1.1]], [[3.8, 5.9], [3.8, 6.4]]],
  "?": [[[1, 0.6], [4, 0], [5, 1.4], [5, 2.6], [3.6, 3.6], [2.5, 3.6], [2.5, 4.6]], [[2.5, 6.2], [2.5, 6.7]]],
  "!": [[[2.5, 0], [2.5, 4.8]], [[2.5, 6.2], [2.5, 6.7]]],
  $: [[[5, 1.6], [3.4, 0], [1.6, 0], [0, 1.6], [0, 3], [1.6, 3.5], [3.4, 3.5], [5, 4], [5, 5.4], [3.4, 7], [1.6, 7], [0, 5.4]], [[2.5, -0.4], [2.5, 7.4]]],
  "#": [[[1.6, 0], [1.2, 7]], [[3.6, 0], [3.2, 7]], [[0, 2.4], [5, 2.4]], [[0, 4.6], [5, 4.6]]],
  '"': [[[1.2, 0], [0.9, 1.8]], [[3.6, 0], [3.3, 1.8]]],
  " ": [],
};

// ---------- text ----------
const cv = new Canvas();

function textWidth(s: string, size: number): number {
  const unit = size / 7;
  let w = 0;
  for (const ch of s.toUpperCase()) w += ch === " " ? 6 * unit : 6.4 * unit;
  return w - 0.4 * unit;
}

function drawText(x: number, y: number, s: string, size: number, c: RGB, bold = false): void {
  const unit = size / 7;
  const thick = Math.max(1, Math.round(size * (bold ? 0.22 : 0.15)));
  let cx = x;
  for (const raw of s.toUpperCase()) {
    const glyph = FONT[raw];
    if (glyph) {
      for (const stroke of glyph) {
        const pts = stroke.map((p) => [cx + p[0] * unit, y + p[1] * unit]);
        cv.polyline(pts, c, thick);
      }
    }
    cx += 6.4 * unit;
  }
}

function drawTextCentred(cx: number, y: number, s: string, size: number, c: RGB, bold = false): void {
  drawText(cx - textWidth(s, size) / 2, y, s, size, c, bold);
}

function wrap(s: string, size: number, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (textWidth(trial, size) <= maxW || !cur) cur = trial;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawPara(x: number, y: number, s: string, size: number, maxW: number, c: RGB, lh: number, bold = false): number {
  const lines = wrap(s, size, maxW);
  for (let i = 0; i < lines.length; i++) drawText(x, y + i * lh, lines[i], size, c, bold);
  return y + lines.length * lh;
}

function badge(x: number, y: number, label: string, fill: RGB): number {
  const w = textWidth(label, 10) + 12;
  cv.fillRect(x, y, w, 15, fill);
  drawText(x + 6, y + 3.5, label, 10, WHITE, true);
  return w;
}

function rule(x: number, y: number, w: number, c: RGB = INK, t = 2): void {
  cv.fillRect(x, y, w, t, c);
}

// ---------- the 35 stories (all first reported 25 Nov 2026) ----------
interface Main {
  kicker: string;
  head: string;
  body: string;
  src: string;
  kind: number; // 0 rocket, 1 tanker, 2 refinery
}
const MAINS: Main[] = [
  {
    kicker: "SPACE - CHINA / PAKISTAN",
    head: "PAKISTAN'S FIRST ASTRONAUT REACHES CHINA'S SPACE STATION",
    body: "Shenzhou-24 lifts off with three crew for Tiangong, carrying the first Pakistani in orbit.",
    src: "BBC - 25 NOV",
    kind: 0,
  },
  {
    kicker: "ENERGY - STRAIT OF HORMUZ",
    head: "MINES HIT TANKERS IN THE STRAIT OF HORMUZ",
    body: "Iran's Guards say two tankers were hit by mines in the busiest oil chokepoint. Unconfirmed.",
    src: "REUTERS / ONE TURN - 25 NOV",
    kind: 1,
  },
  {
    kicker: "WAR - SAUDI ARABIA / YEMEN",
    head: "HOUTHIS STRIKE SAUDI REFINERY AND RIYADH TOWER",
    body: "Houthis say they hit the Ras Tanura refinery and Riyadh's financial district; 11 hurt.",
    src: "REUTERS - 25 NOV",
    kind: 2,
  },
];

interface Med {
  n: number;
  head: string;
  body: string;
  src: string;
  tag: string;
  tagFill: RGB;
}
const CONF: RGB = [18, 110, 105];
const OFF: RGB = [20, 38, 74];
const REP: RGB = [164, 31, 34];
const MEDS: Med[] = [
  { n: 1, head: "HUAWEI GUILTY IN US TRIAL", body: "Brooklyn jury convicts Huawei of stealing trade secrets and bank fraud, but acquits it of racketeering.", src: "REUTERS / BBC", tag: "CONFIRMED", tagFill: CONF },
  { n: 2, head: "CHINA PROBES SHANGHAI CHIEF", body: "Beijing investigates Chen Jining, Shanghai chief and Politburo member - the fourth top leader probed since 2025.", src: "REUTERS", tag: "OFFICIAL", tagFill: OFF },
  { n: 3, head: "CARTAGENA SIEGE ENDS", body: "Colombian forces storm a Cartagena supermarket and free every remaining hostage; one captor is killed.", src: "DAILY SUMMARY", tag: "CONFIRMED", tagFill: CONF },
  { n: 4, head: "UKRAINE HITS 2 SAMARA REFINERIES", body: "Drones set fire to the Syzran and Kuibyshev refineries, 800 km inside Russia. One person is killed.", src: "KYIV INDEPENDENT", tag: "REPORTED", tagFill: REP },
  { n: 5, head: "MARKETS SLIDE ON TARIFF FEARS", body: "Asian stocks tumble as Washington readies new tariffs on 16 partners. Nikkei falls 2.76%, Seoul 5.3%.", src: "REUTERS", tag: "CONFIRMED", tagFill: CONF },
  { n: 6, head: "SENEGAL GETS AFRICA CUP BACK", body: "The sports court hands the CAN-2025 title back to Senegal, ruling against Morocco after the disputed final.", src: "NPR / BBC", tag: "CONFIRMED", tagFill: CONF },
  { n: 7, head: "DEMOCRATS TAKE 259 HOUSE SEATS", body: "Democrats secure a House majority of at least 259 seats, the final midterm counts confirm.", src: "ONE TURN", tag: "REPORTED", tagFill: REP },
  { n: 8, head: "ABREGO GARCIA LEAVES US FOR SPAIN", body: "Salvadoran migrant Kilmar Abrego Garcia flies to Spain, ending the long deportation battle.", src: "BBC / REUTERS", tag: "CONFIRMED", tagFill: CONF },
  { n: 9, head: "PUIGDEMONT TO RETURN 12 DEC", body: "Catalan separatist Carles Puigdemont will return to Spain on 12 December, ending nearly a decade in exile.", src: "REUTERS", tag: "CONFIRMED", tagFill: CONF },
  { n: 10, head: "NVIDIA TUMBLES AGAIN", body: "Nvidia shares fall about 7% as lawmakers question Trump's role in bringing back CEO Jensen Huang.", src: "REUTERS", tag: "CONFIRMED", tagFill: CONF },
];

const MORE: string[] = [
  "JAVA MINE FLOOD: 26-29 MINERS TRAPPED",
  "GULF PLANE CRASH KILLS 6, INCL. 2 BOYS",
  "N KOREA EXPELS SWISS DIPLOMAT",
  "UK WARNS FIRMS OF RUSSIAN SABOTAGE",
  "UKRAINE NEEDS 115 BN EUROS IN 2027",
  "RUSSIA: 500,000 WAR DEAD IN OWN DATA",
  "GAZA STRIKE KILLS HAMAS SECURITY CHIEF",
  "SPAIN HEADS FOR SNAP ELECTION",
  "TRUMP PARDONS TURKEYS FREEDOM, FEATHERS",
  "US CONFIDENCE AT NEAR 2-YEAR HIGH",
  "STORM TO HIT US EAST COAST FOR THANKSGIVING",
  "ANTHROPIC BELOW IPO PRICE, $200 BN LOST",
  "HERA PROBE RETURNS TO ASTEROID CRASH SITE",
  "HONG KONG MARKS YEAR SINCE TAI PO FIRE",
  "ZAMBIA CHARGES OPPOSITION CHIEF WITH TREASON",
  "DR CONGO PLANE MISSING, REBELS CLAIM HIT",
  "SUDAN: KHARTOUM DRONE STRIKES CONDEMNED",
  "ZIMBABWE WARRANT FOR MUGABE'S SON",
  "BULGARIA STOPS MIGRANT BOAT, 35 ABOARD",
  "JORDAN DEATH SENTENCE OVER OFFICER KILLING",
  "AUSTRALIA-SOLOMON ISLANDS TREATY SIGNED",
  "VENEZUELA REVEALS $237.5 BN PUBLIC DEBT",
];

const TIMELINE: [string, string][] = [
  ["00:00", "HOUTHIS ON ADEN"],
  ["01:19", "UKRAINE 115 BN"],
  ["01:31", "CHEN PROBE"],
  ["02:17", "PLANE CRASH"],
  ["04:48", "UK WARNING"],
  ["06:01", "WAGE +36%"],
  ["07:02", "CARTAGENA FREE"],
  ["08:08", "JAVA MINE"],
];

const STATS: [string, string, string][] = [
  ["305", "DRONES DOWNED", "OVERNIGHT, RUSSIA"],
  ["500,000", "RUSSIAN WAR DEAD", "MOSCOW'S OWN DATA"],
  ["115 BN", "EUROS UKRAINE", "NEEDS FOR 2027"],
  ["259", "DEMOCRAT SEATS", "IN THE US HOUSE"],
  ["+36%", "GARMENT WAGE RISE", "IN BANGLADESH"],
  ["29", "MINERS TRAPPED", "IN JAVA MINE"],
];

const REGIONS: [string, RGB][] = [
  ["MIDDLE EAST", [164, 31, 34]],
  ["EUROPE", [20, 38, 74]],
  ["EAST ASIA", [178, 138, 44]],
  ["SOUTH ASIA", [18, 110, 105]],
  ["SE ASIA", [64, 110, 148]],
  ["N AMERICA", [110, 60, 120]],
  ["LATIN AM", [200, 110, 40]],
  ["AFRICA", [60, 120, 60]],
  ["PACIFIC", [30, 90, 130]],
];

// ---------- pictograms for the three lead panels ----------
function drawRocket(x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, NAVY);
  // stars
  const stars: [number, number][] = [[0.12, 0.18], [0.3, 0.1], [0.55, 0.22], [0.78, 0.12], [0.9, 0.3], [0.2, 0.42], [0.85, 0.55], [0.45, 0.08]];
  for (const s of stars) cv.disc(x + s[0] * w, y + s[1] * h, 2.2, WHITE);
  // planet arc
  cv.disc(x + w * 0.82, y + h * 0.95, 34, TEAL);
  cv.disc(x + w * 0.82, y + h * 0.95, 26, [30, 140, 132]);
  // rocket body
  const bx = x + w * 0.42;
  const by = y + h * 0.16;
  cv.polyFill([[bx, by + 52], [bx + 8, by + 18], [bx + 16, by], [bx + 24, by + 18], [bx + 32, by + 52]], WHITE);
  cv.polyFill([[bx + 8, by + 52], [bx + 24, by + 52], [bx + 28, by + 66], [bx + 4, by + 66]], RED);
  cv.polyFill([[bx - 2, by + 44], [bx + 8, by + 38], [bx + 8, by + 58]], RED);
  cv.polyFill([[bx + 24, by + 38], [bx + 34, by + 44], [bx + 24, by + 58]], RED);
  cv.disc(bx + 16, by + 24, 5, SKY);
  // flame
  cv.polyFill([[bx + 10, by + 66], [bx + 16, by + 88], [bx + 22, by + 66]], GOLD);
  cv.polyFill([[bx + 13, by + 66], [bx + 16, by + 78], [bx + 19, by + 66]], [230, 120, 40]);
  // ground line
  cv.fillRect(x, y + h - 6, w, 6, GOLD);
}

function drawTanker(x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, SEA);
  // sky band
  cv.fillRect(x, y, w, h * 0.34, [214, 228, 238]);
  cv.disc(x + w * 0.82, y + h * 0.16, 15, [240, 200, 90]);
  // sea waves
  for (let i = 0; i < 4; i++) {
    const wy = y + h * (0.55 + i * 0.13);
    cv.polyline([[x + 6, wy], [x + w * 0.25, wy - 5], [x + w * 0.5, wy], [x + w * 0.75, wy - 5], [x + w - 6, wy]], WHITE, 2);
  }
  // tanker hull
  cv.polyFill([[x + w * 0.08, y + h * 0.5], [x + w * 0.9, y + h * 0.5], [x + w * 0.84, y + h * 0.68], [x + w * 0.14, y + h * 0.68]], [90, 30, 30]);
  cv.fillRect(x + w * 0.14, y + h * 0.36, w * 0.2, h * 0.14, WHITE);
  cv.fillRect(x + w * 0.38, y + h * 0.42, w * 0.3, h * 0.08, [200, 60, 40]);
  cv.fillRect(x + w * 0.7, y + h * 0.4, w * 0.06, h * 0.1, WHITE);
  // spiked mine
  const mx = x + w * 0.72;
  const my = y + h * 0.82;
  cv.disc(mx, my, 9, INK);
  for (let a = 0; a < 8; a++) {
    const ang = (a * Math.PI) / 4;
    cv.line(mx, my, mx + Math.cos(ang) * 15, my + Math.sin(ang) * 15, INK, 2);
  }
  cv.disc(mx, my, 9, INK);
  cv.disc(mx - 3, my - 3, 2.5, GREY);
}

function drawRefinery(x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, [58, 40, 34]);
  cv.disc(x + w * 0.78, y + h * 0.2, 14, [240, 200, 90]);
  // towers
  cv.fillRect(x + w * 0.1, y + h * 0.3, w * 0.1, h * 0.62, [200, 200, 200]);
  cv.fillRect(x + w * 0.26, y + h * 0.45, w * 0.12, h * 0.47, [170, 170, 170]);
  cv.fillRect(x + w * 0.46, y + h * 0.22, w * 0.08, h * 0.7, [220, 220, 220]);
  cv.polyFill([[x + w * 0.6, y + h * 0.92], [x + w * 0.68, y + h * 0.5], [x + w * 0.76, y + h * 0.92]], [150, 150, 150]);
  cv.fillRect(x + w * 0.82, y + h * 0.55, w * 0.1, h * 0.37, [180, 180, 180]);
  // pipes
  cv.line(x + w * 0.1, y + h * 0.6, x + w * 0.9, y + h * 0.6, [210, 210, 210], 4);
  // flames
  const flame = (fx: number, fy: number, s: number): void => {
    cv.polyFill([[fx - s, fy], [fx, fy - s * 1.8], [fx + s, fy], [fx + s * 0.5, fy - s * 0.7], [fx, fy - s * 0.3], [fx - s * 0.5, fy - s * 0.7]], [240, 120, 30]);
    cv.polyFill([[fx - s * 0.45, fy], [fx, fy - s], [fx + s * 0.45, fy]], [250, 200, 60]);
  };
  flame(x + w * 0.15, y + h * 0.3, 10);
  flame(x + w * 0.5, y + h * 0.22, 12);
  flame(x + w * 0.72, y + h * 0.5, 9);
  // smoke
  cv.disc(x + w * 0.5, y + h * 0.08, 8, [120, 120, 120]);
  cv.disc(x + w * 0.56, y + h * 0.04, 6, [140, 140, 140]);
  cv.fillRect(x, y + h - 6, w, 6, GOLD);
}

const PICTOS = [drawRocket, drawTanker, drawRefinery];

// ---------- layout ----------
function drawMasthead(): void {
  cv.fillRect(0, 0, W, 10, NAVY);
  drawTextCentred(512, 18, "THE WORLD TODAY", 50, NAVY, true);
  rule(24, 80, 976, RED, 3);
  drawTextCentred(512, 88, "WEDNESDAY, 25 NOVEMBER 2026", 24, RED, true);
  drawTextCentred(512, 118, "35 STORIES  -  9 REGIONS  -  EVERY ONE DATED  -  ALL FIRST REPORTED 25 NOV 2026", 12, INK, true);
  rule(24, 140, 976, INK, 2);
}

function drawTimeline(): void {
  drawText(24, 150, "TIMELINE - UTC, 25 NOV 2026", 12, NAVY, true);
  const y0 = 176;
  cv.fillRect(24, y0, 976, 2, NAVY);
  const n = TIMELINE.length;
  for (let i = 0; i < n; i++) {
    const cx = 70 + (i * 884) / (n - 1);
    cv.disc(cx, y0 + 1, 5, RED);
    drawTextCentred(cx, y0 + 12, TIMELINE[i][0], 11, RED, true);
    const lbl = wrap(TIMELINE[i][1], 9, 118);
    for (let j = 0; j < lbl.length; j++) drawTextCentred(cx, y0 + 28 + j * 11, lbl[j], 9, INK);
  }
}

function drawStats(): void {
  const y0 = 232;
  const bw = 158;
  const gap = 6;
  for (let i = 0; i < STATS.length; i++) {
    const x = 24 + i * (bw + gap);
    cv.fillRect(x, y0, bw, 68, NAVY);
    cv.fillRect(x, y0, bw, 4, GOLD);
    drawTextCentred(x + bw / 2, y0 + 12, STATS[i][0], STATS[i][0].length > 6 ? 22 : 28, WHITE, true);
    drawTextCentred(x + bw / 2, y0 + 44, STATS[i][1], 10, GOLD, true);
    drawTextCentred(x + bw / 2, y0 + 56, STATS[i][2], 9, WHITE);
  }
}

function drawRegions(): void {
  const y0 = 308;
  const segW = 976 / REGIONS.length;
  for (let i = 0; i < REGIONS.length; i++) {
    const x = 24 + i * segW;
    cv.fillRect(x, y0, segW - 2, 22, REGIONS[i][1]);
    drawTextCentred(x + (segW - 2) / 2, y0 + 6, REGIONS[i][0], 10, WHITE, true);
  }
}

function drawMains(): void {
  const y0 = 338;
  const cw = 320;
  const gap = 8;
  for (let i = 0; i < MAINS.length; i++) {
    const x = 24 + i * (cw + gap);
    const m = MAINS[i];
    cv.rect(x, y0, cw, 240, INK, 2);
    PICTOS[m.kind](x + 2, y0 + 2, cw - 4, 96);
    drawText(x + 10, y0 + 102, m.kicker, 10, RED, true);
    const hy = drawPara(x + 10, y0 + 116, m.head, 15, cw - 20, INK, 18, true);
    drawPara(x + 10, hy + 4, m.body, 10, cw - 20, INK, 12);
    cv.fillRect(x + 10, y0 + 216, cw - 20, 1, GREY);
    drawText(x + 10, y0 + 222, m.src, 9, GREY, true);
  }
}

function drawMeds(): void {
  drawText(24, 586, "TEN MORE STORIES OF THE DAY", 14, NAVY, true);
  rule(24, 604, 976, NAVY, 2);
  const colW = 484;
  for (let i = 0; i < MEDS.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 24 + col * (colW + 8);
    const y = 612 + row * 42;
    const m = MEDS[i];
    cv.fillRect(x, y, 26, 26, RED);
    drawTextCentred(x + 13, y + 8, String(m.n), 12, WHITE, true);
    drawText(x + 34, y + 1, m.head, 12, INK, true);
    badge(x + colW - 88, y + 0, m.tag, m.tagFill);
    drawPara(x + 34, y + 18, m.body, 9, colW - 34, INK, 11);
  }
}

// ---------- 22 more + world map + footer ----------
const MORE_SHORT: string[] = [
  "JAVA MINE FLOOD: 29 TRAPPED",
  "GULF PLANE CRASH KILLS 6",
  "N KOREA EXPELS SWISS DIPLOMAT",
  "UK WARNS FIRMS OF SABOTAGE",
  "UKRAINE NEEDS 115 BN EUROS",
  "RUSSIA: 500,000 WAR DEAD",
  "GAZA STRIKE KILLS HAMAS CHIEF",
  "SPAIN HEADS FOR SNAP ELECTION",
  "TRUMP PARDONS 2 TURKEYS",
  "US CONFIDENCE NEAR 2-YEAR HIGH",
  "STORM TO HIT US EAST COAST",
  "ANTHROPIC BELOW IPO PRICE",
  "HERA PROBE AT ASTEROID SITE",
  "HONG KONG: YEAR SINCE TAI PO FIRE",
  "ZAMBIA: TREASON CHARGE",
  "DR CONGO PLANE MISSING",
  "SUDAN: KHARTOUM STRIKES CONDEMNED",
  "ZIMBABWE WARRANT FOR MUGABE'S SON",
  "BULGARIA STOPS MIGRANT BOAT",
  "JORDAN DEATH SENTENCE",
  "AUSTRALIA-SOLOMON TREATY SIGNED",
  "VENEZUELA: $237.5 BN DEBT",
];

function drawMore(): void {
  drawText(24, 828, "22 MORE STORIES - NUMBERED 11 TO 32", 13, NAVY, true);
  rule(24, 844, 616, NAVY, 2);
  const y0 = 852;
  for (let i = 0; i < MORE_SHORT.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 24 + col * 308;
    const y = y0 + row * 11;
    drawText(x, y, String(11 + i) + ".", 9, RED, true);
    drawText(x + 26, y, MORE_SHORT[i], 9, INK);
  }
}

function drawMap(): void {
  const mx = 656;
  const my = 828;
  const mw = 344;
  const mh = 143;
  cv.rect(mx, my, mw, mh, INK, 2);
  cv.fillRect(mx + 2, my + 2, mw - 4, 18, NAVY);
  drawTextCentred(mx + mw / 2, my + 5, "WHERE IT HAPPENED - 25 NOV 2026", 10, WHITE, true);
  const px = (lon: number, lat: number): [number, number] => [
    mx + ((lon + 170) / 360) * mw,
    my + 22 + ((75 - lat) / 130) * (mh - 24),
  ];
  const land: RGB = [196, 188, 158];
  const conts: [number, number][][] = [
    [[-168, 66], [-140, 70], [-125, 72], [-110, 73], [-95, 80], [-80, 73], [-70, 62], [-55, 47], [-70, 42], [-75, 35], [-80, 26], [-90, 21], [-97, 16], [-105, 20], [-115, 28], [-125, 40], [-125, 49], [-140, 60], [-155, 58], [-165, 60]],
    [[-80, 10], [-75, 5], [-60, 5], [-50, 0], [-35, -8], [-40, -20], [-48, -28], [-58, -35], [-65, -45], [-70, -55], [-73, -40], [-70, -20], [-80, -5]],
    [[-17, 15], [-10, 35], [0, 36], [10, 37], [20, 32], [32, 31], [35, 28], [43, 12], [51, 11], [48, 0], [40, -10], [35, -20], [32, -29], [20, -35], [12, -18], [9, 4], [-8, 5]],
    [[30, 70], [45, 68], [60, 69], [75, 73], [90, 75], [110, 76], [130, 72], [150, 70], [170, 66], [178, 65], [162, 60], [158, 52], [142, 50], [140, 40], [130, 35], [127, 40], [120, 32], [110, 20], [105, 10], [100, 8], [95, 15], [90, 22], [80, 13], [75, 8], [70, 20], [60, 25], [55, 26], [50, 29], [43, 12], [40, 20], [35, 28], [30, 36]],
    [[-10, 36], [-9, 43], [-2, 48], [0, 51], [5, 53], [8, 57], [10, 59], [18, 56], [21, 55], [28, 60], [30, 70], [40, 68], [45, 60], [40, 55], [30, 45], [28, 40], [23, 36], [19, 40], [12, 44], [8, 44], [3, 42], [-2, 37]],
    [[113, -22], [114, -30], [115, -35], [124, -33], [129, -32], [137, -35], [142, -38], [147, -39], [150, -37], [153, -27], [146, -19], [142, -11], [136, -12], [132, -12], [126, -14], [122, -17]],
  ];
  for (const c of conts) cv.polyFill(c.map((p) => px(p[0], p[1])), land);
  // numbered pins: 1 Riyadh, 2 Hormuz, 3 China, 4 Samara, 5 Cartagena, 6 Java, 7 Senegal, 8 Gaza
  const pins: [number, number, string][] = [
    [46, 23, "1"], [58, 27, "2"], [116, 30, "3"], [50, 53, "4"],
    [-75, 10, "5"], [107, -7, "6"], [-17, 15, "7"], [33, 32, "8"],
  ];
  for (const p of pins) {
    const [x, y] = px(p[0], p[1]);
    // Nudge the three Middle East pins apart so their numbers stay legible.
    const dx = p[2] === "1" ? 4 : p[2] === "2" ? 12 : p[2] === "8" ? -10 : 0;
    const dy = p[2] === "1" ? 10 : p[2] === "2" ? 0 : p[2] === "8" ? -8 : 0;
    cv.disc(x + dx, y + dy, 6, RED);
    drawTextCentred(x + dx, y + dy - 4, p[2], 8, WHITE, true);
  }
}

function drawFooter(): void {
  rule(24, 976, 976, INK, 2);
  cv.fillRect(24, 982, 976, 34, NAVY);
  drawTextCentred(512, 988, "DATE CHECK: EVERY STORY ABOVE HAPPENED OR WAS FIRST REPORTED ON WEDNESDAY 25 NOVEMBER 2026.", 10, WHITE, true);
  drawTextCentred(512, 1001, "SOURCES: REUTERS, BBC, AP, ONE TURN, DAILY SUMMARY, KYIV INDEPENDENT, NPR - NO STORY FROM ANOTHER DAY.", 10, GOLD, true);
}

function main(): void {
  drawMasthead();
  drawTimeline();
  drawStats();
  drawRegions();
  drawMains();
  drawMeds();
  drawMore();
  drawMap();
  drawFooter();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(outDir, { recursive: true });
  const png = encodePNG(cv.px, W, H);
  writeFileSync(outDir + "/entry.png", png);
}

main();
