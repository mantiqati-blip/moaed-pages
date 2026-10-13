// حجز الأوقات بدون سيرفر: كل موظفة ويوم لهما وثيقة schedules/{staffId}_{YYYY-MM-DD} فيها خريطة cells.
// كل خلية = ١٥ دقيقة (المفتاح = رقم الخلية من منتصف الليل). الحجز يكتب خلاياه داخل Transaction فيفشل الثاني إن تعارضا.
export const CELL = 15;
export const TZ_MS = 3 * 36e5;                                  // بغداد UTC+3
export function validDuration(min) { return Number.isInteger(min) && min > 0 && min % CELL === 0; }
export function cellKeys(startMin, durationMin) {
  if (!validDuration(durationMin) || startMin % CELL !== 0 || startMin < 0) throw new Error('BAD_TIME');
  const first = startMin / CELL, n = durationMin / CELL;
  return Array.from({ length: n }, (_, i) => String(first + i));
}
export const taken = (cells, keys) => keys.filter((k) => cells && cells[k] !== undefined);
export function toEpoch(dateStr, startMin) {                      // "2026-10-12" + دقائق => ملّي ثانية UTC (الوقت بتوقيت بغداد)
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) + startMin * 60000 - TZ_MS;
}
export const scheduleId = (staffId, dateStr) => `${staffId}_${dateStr}`;
