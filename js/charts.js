// رسوم بيانية للأدمن والصالون: حجوزات حسب اليوم، الدخل حسب اليوم، أكثر الخدمات (وأكثر الصالونات للأدمن).
// منطق الحساب نقي وبلا DOM (يُختبر في functions/charts.test.js)؛ والرسم SVG/HTML بلا مكتبات خارجية.
// اليوم بتوقيت بغداد (UTC+3) كبقية النظام. حجز «محسوب» = مكتمل وليس وقتًا مغلقًا (نفس finance.counted).
import { counted } from './finance.js';

const TZ = 3 * 36e5, DAY = 864e5;
export const RANGES = [7, 14, 30];
export const dayOf = (t) => new Date(t + TZ).toISOString().slice(0, 10);
// قائمة أيام مرتبة من الأقدم إلى اليوم (n يوم تنتهي باليوم الحالي)
export function dayList(n, now = Date.now()) {
  const end = Date.UTC(...dayOf(now).split('-').map((x, i) => (i === 1 ? x - 1 : +x)));
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * DAY).toISOString().slice(0, 10));
}
// حجز فعلي: ليس وقتًا مغلقًا ولا ملغيًا
export const active = (b) => b.source !== 'blocked' && b.status !== 'cancelled';
const inDays = (b, set) => Number.isFinite(b.start) && set.has(dayOf(b.start));
export const serviceRevenue = (b) => (b.servicesTotal || 0) - (b.discount || 0);      // دخل الصالون من الخدمات
export const platformIncome = (b) => (b.customerFee || 0) + (b.salonCut || 0);        // دخل المنصة (رسم الزبونة + الاستقطاع)

function perDay(bookings, n, now, keep, val) {
  const days = dayList(n, now), set = new Set(days), m = Object.fromEntries(days.map((d) => [d, 0]));
  for (const b of bookings) if (keep(b) && inDays(b, set)) m[dayOf(b.start)] += val(b);
  return days.map((date) => ({ date, value: m[date] }));
}
export const bookingsPerDay = (bookings, n = 14, now = Date.now()) => perDay(bookings, n, now, active, () => 1);
export const incomePerDay = (bookings, n = 14, now = Date.now(), pick = serviceRevenue) => perDay(bookings, n, now, counted, pick);

// أكثر الخدمات طلبًا (عدد الحجوزات الفعلية التي تضمنتها)، مع دخلها من الحجوزات المكتملة فقط
export function topServices(bookings, n = 14, now = Date.now(), limit = 5) {
  const set = new Set(dayList(n, now)), m = new Map();
  for (const b of bookings) {
    if (!active(b) || !inDays(b, set)) continue;
    for (const s of Array.isArray(b.services) ? b.services : []) {
      const k = String(s?.name ?? '').trim(); if (!k) continue;
      const r = m.get(k) || { name: k, count: 0, revenue: 0 }; r.count++;
      if (counted(b)) r.revenue += Number(s.price) || 0; m.set(k, r);
    }
  }
  return [...m.values()].sort((a, b) => b.count - a.count || b.revenue - a.revenue || a.name.localeCompare(b.name, 'ar')).slice(0, limit);
}
// للأدمن: أكثر الصالونات حجوزًا (names = { salonId: اسم })
export function topSalons(bookings, n = 14, now = Date.now(), names = {}, limit = 5) {
  const set = new Set(dayList(n, now)), m = new Map();
  for (const b of bookings) if (active(b) && inDays(b, set)) m.set(b.salonId, (m.get(b.salonId) || 0) + 1);
  return [...m].map(([id, count]) => ({ name: names[id] || id || '—', count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar')).slice(0, limit);
}
export const sum = (a) => a.reduce((s, x) => s + x.value, 0);
// أعلى قيمة «لطيفة» لمحور الرسم (1/2/5 × 10^k)
export function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n).toLocaleString('en');
// أعمدة عمودية SVG. items: [{date, value}]؛ fmt لتنسيق القيمة. الاتجاه من الأقدم (يسار) إلى اليوم (يمين).
const trim = (x) => String(Math.round(x * 10) / 10);
export const compact = (n) => (n >= 1e6 ? trim(n / 1e6) + ' م' : n >= 1e3 ? trim(n / 1e3) + ' ألف' : String(n));
export function barsSVG(items, { fmt = num, short = null, label = '' } = {}) {
  const W = 640, H = 240, L = 8, R = 8, T = 22, B = 30, pw = W - L - R, ph = H - T - B, n = items.length;
  const max = niceMax(Math.max(0, ...items.map((i) => i.value))), slot = pw / n, bw = Math.max(3, Math.min(34, slot * 0.62));
  const every = n <= 10 ? 1 : n <= 16 ? 2 : Math.ceil(n / 8);
  const grid = [0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${T + ph - ph * f}" y2="${T + ph - ph * f}" stroke="var(--line)" stroke-width="1"/>`).join('');
  const bars = items.map((it, i) => {
    const h = it.value > 0 ? Math.max(2, (it.value / max) * ph) : 0, x = L + slot * i + (slot - bw) / 2, y = T + ph - h;
    return `<g><title>${esc(it.date)}: ${esc(fmt(it.value))}</title>${h ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="var(--ac)"/>` : ''}`
      + (n <= (short ? 10 : 14) && it.value > 0 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="11" fill="var(--ink)">${esc((short || fmt)(it.value))}</text>` : '')
      + ((n - 1 - i) % every === 0 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--mute)">${esc(it.date.slice(5))}</text>` : '') + '</g>';
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(label)}" style="display:block;max-width:100%;font-family:inherit" direction="ltr">${grid}${bars}</svg>`;
}
// أعمدة أفقية HTML (للخدمات/الصالونات): items: [{name, count}]
export function hbarsHTML(items, { unit = 'حجز' } = {}) {
  if (!items.length) return '<div class="m">لا توجد بيانات في هذه الفترة.</div>';
  const max = Math.max(...items.map((i) => i.count));
  return items.map((i) => `<div style="margin:9px 0"><div class="s"><span>${esc(i.name)}</span><b>${num(i.count)} ${unit}</b></div>`
    + `<div style="background:var(--soft);border-radius:8px;height:10px;margin-top:4px"><div style="width:${Math.max(3, (i.count / max) * 100).toFixed(1)}%;height:100%;background:var(--ac);border-radius:8px"></div></div></div>`).join('');
}
// صفحة الإحصائيات كاملة. mode: 'salon' (دخل الخدمات) أو 'admin' (دخل المنصة + أكثر الصالونات)
export function renderStats(bookings, { days = 14, now = Date.now(), mode = 'salon', salons = {}, money = (x) => num(x) + ' د.ع' } = {}) {
  const pick = mode === 'admin' ? platformIncome : serviceRevenue;
  const bk = bookingsPerDay(bookings, days, now), inc = incomePerDay(bookings, days, now, pick), svc = topServices(bookings, days, now, 5);
  const totalB = sum(bk), totalI = sum(inc), top = svc[0];
  const card = (t, v, sub = '') => `<div class="row" style="flex:1 1 150px;text-align:center;margin:0"><div class="m">${t}</div><div style="font-size:22px;font-weight:700;color:var(--ac)">${v}</div>${sub ? `<div class="m">${sub}</div>` : ''}</div>`;
  const rng = RANGES.map((d) => `<button data-d="${d}" class="${d === days ? 'on' : ''}" aria-pressed="${d === days}">آخر ${d} يومًا</button>`).join(' ');
  const incTitle = mode === 'admin' ? 'دخل المنصة حسب اليوم (رسوم الخدمة + الاستقطاع، للحجوزات المكتملة)' : 'الدخل حسب اليوم (إيراد الخدمات للحجوزات المكتملة)';
  return `<div class="row s"><b>الإحصائيات</b><span>${rng}</span></div>`
    + `<div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0">${card('الحجوزات', num(totalB))}${card(mode === 'admin' ? 'دخل المنصة' : 'الدخل', money(totalI))}${card('أكثر خدمة', top ? esc(top.name) : '—', top ? num(top.count) + ' حجز' : '')}</div>`
    + `<div class="row"><b>الحجوزات حسب اليوم</b><div class="m">غير شامل الملغاة والأوقات المغلقة، حسب تاريخ الموعد.</div>${barsSVG(bk, { label: 'الحجوزات حسب اليوم، المجموع ' + totalB })}</div>`
    + `<div class="row"><b>${incTitle}</b>${barsSVG(inc, { fmt: money, short: compact, label: 'الدخل حسب اليوم، المجموع ' + money(totalI) })}</div>`
    + `<div class="row"><b>أكثر الخدمات طلبًا</b>${hbarsHTML(svc)}</div>`
    + (mode === 'admin' ? `<div class="row"><b>أكثر الصالونات حجوزًا</b>${hbarsHTML(topSalons(bookings, days, now, salons, 5))}</div>` : '');
}
