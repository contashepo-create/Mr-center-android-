// ============================================================
// النسخ الاحتياطي: تجميع بيانات السنتر كاملة في ملف JSON ومشاركته
// (لا حذف ولا تعديل — تصدير آمن للقراءة فقط)
// ============================================================

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getSupabase } from './supabase';

const TABLES = [
  'grades', 'groups', 'students', 'dues', 'payments', 'sessions',
  'attendance', 'announcements', 'manual_grades', 'app_exams',
  'app_exam_attempts', 'app_inquiries', 'app_surveys',
  'app_survey_responses', 'honorees', 'shared_files',
  'important_links', 'center_settings', 'center_subscriptions',
  'subscription_requests', 'activity_log', 'student_groups', 'teacher_groups',
];

/** يجمع كل صفوف السنتر من كل الجداول (بالتوازي للسرعة) */
export async function gatherCenterBackup(centerId: string): Promise<Record<string, unknown[]>> {
  const sb = getSupabase();
  const out: Record<string, unknown[]> = {};
  const results = await Promise.all([
    sb.from('centers').select('*').eq('id', centerId).maybeSingle(),
    ...TABLES.map((t) => sb.from(t).select('*').eq('center_id', centerId).limit(5000)),
  ]);
  const [center, ...rest] = results;
  if (center.error) throw center.error;
  out['centers'] = center.data ? [center.data] : [];
  rest.forEach((r, i) => {
    if (r.error) throw r.error;
    out[TABLES[i]] = (r.data ?? []) as unknown[];
  });
  return out;
}

/** يحفظ النسخة كملف JSON ويفتح نافذة المشاركة */
export async function exportCenterBackup(centerId: string, centerName: string, tag: string): Promise<string> {
  const payload = {
    app: 'mr-center',
    tag,
    center_id: centerId,
    exported_at: new Date().toISOString(),
    data: await gatherCenterBackup(centerId),
  };
  const safe = centerName.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 30) || 'center';
  const name = `mrcenter-${tag}-${safe}-${new Date().toISOString().slice(0, 10)}.json`;
  const uri = FileSystem.documentDirectory + name;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload));
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing_unavailable');
  await Sharing.shareAsync(uri, { dialogTitle: 'نسخة احتياطية لبيانات السنتر' });
  return name;
}
