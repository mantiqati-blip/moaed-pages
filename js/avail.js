import { cellKeys, taken, toEpoch } from './cells.js';
export const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export const fmt = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
// الأوقات المتاحة ليوم: شبكة ٣٠ دقيقة + بداية كل وقت يلي نهاية حجز موجود. cellsByStaff = { staffId: خلايا اليوم }
export function slotsFor({ open, close, durationMin, cellsByStaff, date, now }) {
  const o = hm(open), c = hm(close), cand = new Set();
  for (let m = o; m + durationMin <= c; m += 30) cand.add(m);
  for (const cells of Object.values(cellsByStaff)) for (const k of Object.keys(cells || {})) {
    const n = Number(k) + 1; if (cells[String(n)] !== undefined) continue;
    const m = n * 15; if (m >= o && m + durationMin <= c) cand.add(m);
  }
  const out = [];
  for (const m of [...cand].sort((a, b) => a - b)) {
    if (toEpoch(date, m) <= now + 5 * 60000) continue;
    const keys = cellKeys(m, durationMin);
    const staff = Object.entries(cellsByStaff).filter(([, cells]) => !taken(cells, keys).length).map(([id]) => id);
    if (staff.length) out.push({ m, staff });
  }
  return out;
}
