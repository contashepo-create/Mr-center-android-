// ============================================================
// منطق بث المطور: تجميع نفس الرسالة المرسة لعدة سناتر في سطر
// واحد مع عدد السناتر وعدد القراءات — ولمعاينة التفاصيل نافذة.
// (مستخرج في مكتبة نقية ليختبر آلياً)
// ============================================================

import type { AppNotification } from './types';

export interface BroadcastGroup {
  key: string;
  title: string;
  body: string;
  audience: string;
  created_at: string;
  centers: { id: string; name: string; reads: number; notifId: string }[];
}

/**
 * يجمع صفوف الإشعارات المتطابقة (نفس العنوان والنص) في مجموعة واحدة
 * مهما كان عدد السناتر التي وصلتها — فتظهر في القائمة سطراً واحداً.
 */
export function groupBroadcasts(rows: (AppNotification & { reads: number; centerName: string })[]): BroadcastGroup[] {
  const map = new Map<string, BroadcastGroup>();
  for (const r of rows) {
    const key = `${r.title}\n${r.body}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key, title: r.title, body: r.body,
        audience: (r as { audience?: string }).audience ?? '',
        created_at: r.created_at, centers: [],
      };
      map.set(key, g);
    }
    g.centers.push({ id: r.center_id, name: r.centerName, reads: r.reads, notifId: r.id });
    if (r.created_at > g.created_at) g.created_at = r.created_at;
  }
  return [...map.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
