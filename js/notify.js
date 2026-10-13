// مركز التنبيهات: جرس بالترويسة + لوحة + إشعار منبثق + صوت. يعتمد على onSnapshot على استعلامات صغيرة فقط.
// watches: [{ kind: 'booking'|'application', q: استعلام Firestore, label?: نص صف «بانتظار إجراء», tab?: رقم التبويب }]
// go(tab): ينقل لتبويب (الأدمن/الصالون) أو يعيد تحميل الصفحة (الموظفة، tab = 0).
import { alertsFromSnapshot, pendingCount } from './notify-logic.js';

const SOUND_KEY = 'moaed.notify.sound';
const css = `.nf-wrap{position:relative;display:inline-block;margin-inline-end:6px}
.nf-wrap button{padding:6px 10px;font-size:15px;line-height:1}
.nf-badge{display:inline-block;min-width:18px;padding:0 5px;margin-inline-start:4px;border-radius:9px;background:var(--bad,#c0392b);color:#fff;font-size:12px;line-height:18px;text-align:center}
.nf-badge[hidden]{display:none}
.nf-panel{position:absolute;top:calc(100% + 8px);inset-inline-end:0;width:min(340px,86vw);max-height:70vh;overflow:auto;background:var(--card,#fff);border:1px solid var(--line,#EBDCE3);border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.14);padding:10px;z-index:50}
.nf-panel[hidden]{display:none}
.nf-item{display:block;width:100%;text-align:start;border:0;background:transparent;border-radius:10px;padding:9px 10px;font-weight:400;font-size:14px}
.nf-item:hover{background:var(--soft,#F8E3EC)}.nf-item small{display:block;color:var(--mute,#7A6571)}
.nf-h{font-size:13px;color:var(--mute,#7A6571);margin:6px 10px 2px}
.nf-toasts{position:fixed;bottom:16px;inset-inline-start:16px;display:flex;flex-direction:column;gap:8px;z-index:60;max-width:min(340px,90vw)}
.nf-toast{background:var(--ac,#B83A6B);color:#fff;border-radius:12px;padding:11px 14px;font-size:14px;box-shadow:0 6px 20px rgba(0,0,0,.2);cursor:pointer}`;

export function startNotifier({ F, db, role, ctx = {}, header, watches, go = () => {} }) {
  if (!header || !watches?.length) return () => {};
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const wrap = document.createElement('span'); wrap.className = 'nf-wrap';
  wrap.innerHTML = '<button type="button" id="nfSound" aria-label="الصوت"></button> <button type="button" id="nfBell" aria-label="التنبيهات" aria-expanded="false">🔔<span class="nf-badge" id="nfBadge" hidden></span></button><div class="nf-panel" id="nfPanel" hidden role="region" aria-label="التنبيهات"></div>';
  const slot = header.querySelector('span'); if (slot) slot.prepend(wrap); else header.appendChild(wrap);
  const toasts = document.createElement('div'); toasts.className = 'nf-toasts'; toasts.setAttribute('aria-live', 'polite'); document.body.appendChild(toasts);
  const $ = (id) => wrap.querySelector('#' + id);

  let soundOn = true; try { soundOn = localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) {}
  let ac = null; const audio = () => { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} return ac; };
  const beep = () => {
    if (!soundOn) return; const c = audio(); if (!c || c.state !== 'running') return;
    [[880, 0], [660, 0.18]].forEach(([f, t]) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0.0001, c.currentTime + t); g.gain.exponentialRampToValueAtTime(0.18, c.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t + 0.16); o.connect(g).connect(c.destination); o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.17); });
  };
  const paintSound = () => { $('nfSound').textContent = soundOn ? '🔊' : '🔇'; $('nfSound').title = soundOn ? 'الصوت مفعّل' : 'الصوت مطفأ'; };
  paintSound();
  $('nfSound').onclick = () => { soundOn = !soundOn; try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (e) {} paintSound(); if (soundOn) { audio(); beep(); } };
  // المتصفح يمنع الصوت قبل أي نقرة بالصفحة؛ أول نقرة تفتح الصوت
  document.addEventListener('click', () => audio(), { once: true });

  const pend = watches.map(() => null), recent = []; let unseen = 0, broken = false; const baseTitle = document.title;
  const paint = () => {
    const pending = pend.reduce((n, x) => n + (x || 0), 0), n = pending || unseen;
    $('nfBadge').textContent = n > 99 ? '99+' : n; $('nfBadge').hidden = !n;
    document.title = (unseen ? `(${unseen}) ` : '') + baseTitle;
    const p = $('nfPanel'); p.textContent = '';
    const add = (cls, text, sub, onclick) => { const e = document.createElement(onclick ? 'button' : 'div'); e.className = cls; if (onclick) { e.type = 'button'; e.onclick = onclick; } e.textContent = text; if (sub) { const s = document.createElement('small'); s.textContent = sub; e.appendChild(s); } p.appendChild(e); };
    const rows = watches.map((w, i) => ({ w, n: pend[i] })).filter((x) => x.n && x.w.label);
    if (rows.length) { add('nf-h', 'بانتظار إجراءك'); rows.forEach(({ w, n: k }) => add('nf-item', `${w.label}: ${k}`, '', () => { p.hidden = true; go(w.tab); })); }
    add('nf-h', 'آخر التنبيهات');
    if (!recent.length) add('nf-item m', 'لا جديد منذ فتحتِ الصفحة.');
    recent.slice(0, 20).forEach((a) => add('nf-item', a.text, new Date(a.at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }), () => { p.hidden = true; go(a.tab); }));
    if (broken) add('nf-h', 'تعذّر الاتصال الفوري، حدّثي الصفحة.');
  };
  const toast = (a) => { const t = document.createElement('div'); t.className = 'nf-toast'; t.textContent = a.text; t.onclick = () => { t.remove(); go(a.tab); }; toasts.appendChild(t); setTimeout(() => t.remove(), 9000); };
  $('nfBell').onclick = (e) => { e.stopPropagation(); const p = $('nfPanel'); p.hidden = !p.hidden; $('nfBell').setAttribute('aria-expanded', String(!p.hidden)); if (!p.hidden) { unseen = 0; paint(); } };
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) { $('nfPanel').hidden = true; $('nfBell').setAttribute('aria-expanded', 'false'); } });

  const seen = new Set(), unsubs = watches.map((w, i) => {
    const prev = new Map(); let baseline = true;
    return F.onSnapshot(w.q, (snap) => {
      const changes = snap.docChanges().map((c) => ({ type: c.type, id: c.doc.id, data: c.doc.data() }));
      const list = alertsFromSnapshot(role, w.kind, changes, prev, baseline, ctx).filter((a) => !seen.has(a.id)); baseline = false;
      pend[i] = pendingCount(role, w.kind, snap.docs.map((d) => d.data()));
      list.forEach((a) => { seen.add(a.id); a.at = Date.now(); recent.unshift(a); unseen++; toast(a); });
      if (list.length) { beep(); if ($('nfPanel').hidden === false) unseen = 0; }
      paint();
    }, () => { broken = true; paint(); });
  });
  paint();
  return () => unsubs.forEach((u) => u());
}
