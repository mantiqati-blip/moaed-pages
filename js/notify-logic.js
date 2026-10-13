// منطق التنبيهات (بدون Firebase) حتى يمكن اختباره. الواجهة بـ js/notify.js.
// role: admin | owner | staff. kind: booking | application | payreq | support | announce.
// change: { type: 'added' | 'modified' | 'removed', data, prev }  (prev = بيانات الوثيقة قبل التغيير إن وُجدت)
// ctx: { staffId } للموظفة. تُرجع { text, tab } أو null إذا ما يستحق تنبيهًا.
const who = (d) => (d && d.customerName ? ' من ' + d.customerName : '');

export function classify(role, kind, change, ctx = {}) {
  const { type, data, prev } = change;
  if (type === 'removed' || !data) return null;
  if (kind === 'support') {                                  // الأدمن: محادثة دعم صارت بانتظار ردّه. الصالون: رد جديد من الإدارة
    if (role === 'admin' && data.awaitingAdmin && (type === 'added' || !prev?.awaitingAdmin || prev.lastAt !== data.lastAt)) return { text: 'رسالة دعم' + (data.salonName ? ' من ' + data.salonName : ''), tab: 9 };
    if (role === 'owner' && type === 'added' && data.from === 'admin') return { text: 'رد جديد من الإدارة', tab: 8 };
    return null;
  }
  if (kind === 'announce') {
    if (role !== 'admin' && type === 'added' && data.active) return { text: 'إعلان من الإدارة: ' + (data.title || ''), tab: 8 };
    return null;
  }
  if (role === 'admin') {
    if (kind === 'application' && type === 'added') return { text: 'طلب انضمام جديد' + (data.salonName ? ': ' + data.salonName : ''), tab: 7 };
    if (kind === 'booking' && data.status === 'pending_admin' && (type === 'added' || prev?.status !== 'pending_admin')) return { text: 'حجز بانتظار قرارك' + who(data), tab: 4 };
    return null;
  }
  if (kind === 'payreq') {                                   // رد الإدارة على طلب تسديد الصالون
    if (role === 'owner' && type === 'modified' && prev?.status === 'pending') {
      if (data.status === 'approved') return { text: 'تم تأكيد استلام تسديدك', tab: 5 };
      if (data.status === 'rejected') return { text: 'رُفض طلب تسديدك' + (data.decision ? ': ' + data.decision : ''), tab: 5 };
    }
    return null;
  }
  if (kind !== 'booking') return null;
  const online = data.source === 'online';
  if (role === 'owner') {
    if (type === 'added' && online && data.status === 'confirmed') return { text: 'حجز جديد' + who(data), tab: 4 };
    if (type === 'modified' && prev) {
      if (data.status === 'cancel_requested' && prev.status !== 'cancel_requested') return { text: 'طلب إلغاء' + who(data), tab: 4 };
      if (online && data.status === 'confirmed' && prev.status === 'confirmed' && prev.start !== data.start) return { text: 'زبونة غيّرت موعدها' + who(data), tab: 4 };
    }
    return null;
  }
  if (role === 'staff') {
    const mine = data.staffId === ctx.staffId, wasMine = prev?.staffId === ctx.staffId;
    if (type === 'added' && online && mine && data.status === 'confirmed') return { text: 'حجز جديد لك' + who(data), tab: 0 };
    if (type === 'modified' && prev) {
      if (mine && !wasMine) return { text: 'حجز نُقل إليك' + who(data), tab: 0 };
      if (!mine && wasMine) return { text: 'حجز نُقل عنك' + who(data), tab: 0 };
      if (mine && data.status === 'confirmed' && prev.status === 'confirmed' && prev.start !== data.start) return { text: 'تغيّر موعد حجز' + who(data), tab: 0 };
      if (mine && data.status === 'cancelled' && prev.status !== 'cancelled') return { text: 'حجز أُلغي' + who(data), tab: 0 };
    }
  }
  return null;
}

// عدد العناصر التي تنتظر إجراءً (يظهر على الجرس). null = الدور ما عنده «بانتظار إجراء».
export function pendingCount(role, kind, docs) {
  if (role === 'admin') return docs.length;                                              // الاستعلام نفسه مفلتر على الحالة
  if (role === 'owner' && kind === 'booking') return docs.filter((d) => d.status === 'cancel_requested').length;
  return null;
}

// يُرجع قائمة التنبيهات من لقطة جديدة. أول لقطة (baseline) لا تنبّه أبدًا، فقط تحفظ الحالة.
export function alertsFromSnapshot(role, kind, changes, prevMap, baseline, ctx) {
  const out = [];
  for (const c of changes) {
    const prev = prevMap.get(c.id);
    if (!baseline) { const a = classify(role, kind, { type: c.type, data: c.data, prev }, ctx); if (a) out.push({ ...a, id: kind + ':' + c.id + ':' + a.text }); }
    if (c.type === 'removed') prevMap.delete(c.id); else prevMap.set(c.id, c.data);
  }
  return out;
}
