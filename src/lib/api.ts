// ============================================================
// واجهة البيانات: كل استعلامات التطبيق (مصادقة + إدارة + طالب + مطور)
// كل الاستعلامات محمية بسياسات RLS على الخادم + تصفية center_id هنا
// ============================================================

import { getSupabase } from './supabase';
import { nowIso, todayIso, uuid } from './utils';
import type {
  Announcement, Attendance, AttendanceStatus, Center, CenterLookup, Due, Grade,
  Group, ManualGrade, Payment, PlanType, Profile, PublicConfig, SessionRecord, Student, Subscription,
} from './types';

// ------------------------------------------------------------
// المصادقة والتسجيل
// ------------------------------------------------------------

export async function loginWithEmail(email: string, password: string) {
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  return data;
}

export async function sendPasswordReset(email: string) {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase());
  if (error) throw error;
}

export async function lookupCenterByCode(code: string): Promise<CenterLookup | null> {
  const { data, error } = await getSupabase().rpc('lookup_center_by_code', { p_code: code });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as CenterLookup) ?? null;
}

export async function checkAvailability(email: string, phone: string): Promise<{ email_taken: boolean; phone_taken: boolean }> {
  const { data, error } = await getSupabase().rpc('check_registration_availability', {
    p_email: email.trim().toLowerCase(),
    p_phone: phone.trim(),
  });
  if (error) throw error;
  return data as { email_taken: boolean; phone_taken: boolean };
}

/** تسجيل صاحب سنتر: حساب مصادقة ثم إتمام التسجيل في معاملة خادمية واحدة */
export async function registerCenterOwner(input: {
  centerName: string; code: string; ownerName: string;
  email: string; phone: string; password: string;
}): Promise<void> {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
  });
  if (error) throw error;
  if (!data.user) throw new Error('email_taken');
  const { error: rpcError } = await sb.rpc('complete_center_registration', {
    p_center_name: input.centerName,
    p_code: input.code,
    p_owner_name: input.ownerName,
    p_phone: input.phone,
  });
  if (rpcError) throw rpcError;
}

/** تسجيل طالب جديد مع كود السنتر */
export async function registerStudent(input: {
  centerId: string; fullName: string; email: string; phone: string;
  guardianPhone: string; password: string;
}): Promise<void> {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
  });
  if (error) throw error;
  if (!data.user) throw new Error('email_taken');
  const { error: rpcError } = await sb.rpc('complete_student_registration', {
    p_center_id: input.centerId,
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_guardian_phone: input.guardianPhone,
  });
  if (rpcError) throw rpcError;
}

// ------------------------------------------------------------
// إدارة السنتر (مسئول السنتر)
// ------------------------------------------------------------

export async function fetchMyCenter(centerId: string): Promise<Center | null> {
  const { data, error } = await getSupabase()
    .from('centers').select('*').eq('id', centerId).maybeSingle();
  if (error) throw error;
  return (data as Center) ?? null;
}

export async function fetchGrades(centerId: string): Promise<Grade[]> {
  const { data, error } = await getSupabase()
    .from('grades').select('*').eq('center_id', centerId).order('created_at');
  if (error) throw error;
  return (data ?? []) as Grade[];
}

export async function addGrade(centerId: string, name: string): Promise<void> {
  const { error } = await getSupabase().from('grades').insert({
    id: uuid(), center_id: centerId, name: name.trim(),
    academic_year: '', created_at: nowIso(),
  });
  if (error) throw error;
}

export async function deleteGrade(id: string): Promise<void> {
  const { error } = await getSupabase().from('grades').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchGroups(centerId: string): Promise<Group[]> {
  const { data, error } = await getSupabase()
    .from('groups').select('*').eq('center_id', centerId).order('name');
  if (error) throw error;
  return (data ?? []) as Group[];
}

export async function upsertGroup(centerId: string, group: Partial<Group> & { name: string }): Promise<void> {
  const payload = {
    center_id: centerId,
    name: group.name.trim(),
    grade_id: group.grade_id ?? null,
    days: group.days ?? [],
    start_time: group.start_time ?? '',
    end_time: group.end_time ?? '',
    monthly_fee: group.monthly_fee ?? 0,
  };
  if (group.id) {
    const { error } = await getSupabase().from('groups').update(payload).eq('id', group.id);
    if (error) throw error;
  } else {
    const { error } = await getSupabase().from('groups').insert({ id: uuid(), ...payload, students_count: 0 });
    if (error) throw error;
  }
}

export async function deleteGroup(id: string): Promise<void> {
  const { error } = await getSupabase().from('groups').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchStudents(centerId: string, search?: string): Promise<Student[]> {
  let q = getSupabase().from('students').select('*')
    .eq('center_id', centerId).neq('status', 'archived')
    .order('created_at', { ascending: false }).limit(500);
  if (search && search.trim()) {
    q = q.or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Student[];
}

export async function fetchStudentById(id: string): Promise<Student | null> {
  const { data, error } = await getSupabase()
    .from('students').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Student) ?? null;
}

export async function upsertStudent(centerId: string, s: Partial<Student> & { name: string }): Promise<void> {
  const payload = {
    center_id: centerId,
    name: s.name.trim(),
    phone: s.phone?.trim() || null,
    guardian_phone: s.guardian_phone?.trim() || null,
    grade_id: s.grade_id ?? null,
    group_id: s.group_id ?? null,
    status: s.status ?? 'active',
    notes: s.notes?.trim() || null,
    updated_at: nowIso(),
  };
  if (s.id) {
    const { error } = await getSupabase().from('students').update(payload).eq('id', s.id);
    if (error) throw error;
  } else {
    const { error } = await getSupabase().from('students')
      .insert({ id: uuid(), created_at: nowIso(), ...payload });
    if (error) throw error;
  }
}

export async function deleteStudent(id: string): Promise<void> {
  const { error } = await getSupabase().from('students').delete().eq('id', id);
  if (error) throw error;
}

// ---------- الحصص والحضور ----------

export async function getOrCreateSession(centerId: string, groupId: string, date: string): Promise<SessionRecord> {
  const sb = getSupabase();
  const { data: existing, error: findErr } = await sb.from('sessions')
    .select('*').eq('center_id', centerId).eq('group_id', groupId)
    .eq('session_date', date).maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing as SessionRecord;
  const { data, error } = await sb.from('sessions').insert({
    id: uuid(), center_id: centerId, group_id: groupId,
    session_date: date, start_time: '', end_time: '', created_at: nowIso(),
  }).select('*').single();
  if (error) throw error;
  return data as SessionRecord;
}

export async function fetchAttendanceForSession(sessionId: string): Promise<Attendance[]> {
  const { data, error } = await getSupabase()
    .from('attendance').select('*').eq('session_id', sessionId);
  if (error) throw error;
  return (data ?? []) as Attendance[];
}

export async function saveAttendance(
  centerId: string, sessionId: string,
  records: { student_id: string; status: AttendanceStatus }[],
): Promise<void> {
  const existing = await fetchAttendanceForSession(sessionId);
  const byStudent = new Map(existing.map((a) => [a.student_id, a]));
  const upserts = records.map((r) => ({
    id: byStudent.get(r.student_id)?.id ?? uuid(),
    center_id: centerId,
    session_id: sessionId,
    student_id: r.student_id,
    status: r.status,
    created_at: byStudent.get(r.student_id)?.created_at ?? nowIso(),
  }));
  if (upserts.length === 0) return;
  const { error } = await getSupabase().from('attendance').upsert(upserts);
  if (error) throw error;
}

// ---------- المدفوعات والمستحقات ----------

export async function fetchDues(centerId: string, month: number, year: number): Promise<Due[]> {
  const { data, error } = await getSupabase().from('dues').select('*')
    .eq('center_id', centerId).eq('month', month).eq('year', year);
  if (error) throw error;
  return (data ?? []) as Due[];
}

/** توليد استحقاقات شهرية لكل طلاب مجموعة (يتجاوز الموجود مسبقاً) */
export async function generateDuesForGroup(centerId: string, group: Group, month: number, year: number): Promise<number> {
  const students = await fetchStudents(centerId);
  const inGroup = students.filter((s) => s.group_id === group.id && s.status === 'active');
  if (inGroup.length === 0) return 0;
  const existing = await fetchDues(centerId, month, year);
  const existingKeys = new Set(existing.map((d) => d.student_id));
  const rows = inGroup
    .filter((s) => !existingKeys.has(s.id))
    .map((s) => ({
      id: uuid(), center_id: centerId, student_id: s.id, group_id: group.id,
      month, year, amount: group.monthly_fee, status: 'pending', created_at: nowIso(),
    }));
  if (rows.length > 0) {
    const { error } = await getSupabase().from('dues').insert(rows);
    if (error) throw error;
  }
  return rows.length;
}

export async function fetchPaymentsForStudent(studentId: string): Promise<Payment[]> {
  const { data, error } = await getSupabase().from('payments').select('*')
    .eq('student_id', studentId).order('payment_date', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as Payment[];
}

export async function fetchDuesForStudent(studentId: string): Promise<Due[]> {
  const { data, error } = await getSupabase().from('dues').select('*')
    .eq('student_id', studentId).order('year', { ascending: false }).order('month', { ascending: false }).limit(60);
  if (error) throw error;
  return (data ?? []) as Due[];
}

export async function recordPayment(input: {
  centerId: string; studentId: string; dueId?: string | null;
  amount: number; month: number; year: number; notes?: string;
}): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from('payments').insert({
    id: uuid(), center_id: input.centerId, student_id: input.studentId,
    due_id: input.dueId ?? null, amount: input.amount,
    payment_date: todayIso(), month: input.month, year: input.year,
    notes: input.notes?.trim() || null, created_at: nowIso(),
  });
  if (error) throw error;
  if (input.dueId) {
    await sb.from('dues').update({ status: 'paid' }).eq('id', input.dueId);
  }
}

export async function updateStudentGroup(studentId: string, groupId: string | null, gradeId: string | null): Promise<void> {
  const { error } = await getSupabase().from('students')
    .update({ group_id: groupId, grade_id: gradeId, updated_at: nowIso() }).eq('id', studentId);
  if (error) throw error;
}

// ---------- الدرجات اليدوية ----------

export async function fetchGradesForStudent(studentId: string): Promise<ManualGrade[]> {
  const { data, error } = await getSupabase().from('manual_grades').select('*')
    .eq('student_id', studentId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as ManualGrade[];
}

export async function addManualGrade(input: {
  centerId: string; studentId: string; title: string;
  score: number; maxScore: number; month: number; year: number; notes?: string;
}): Promise<void> {
  const { error } = await getSupabase().from('manual_grades').insert({
    id: uuid(), center_id: input.centerId, student_id: input.studentId,
    title: input.title.trim() || 'تقييم', score: input.score, max_score: input.maxScore,
    month: input.month, year: input.year, notes: input.notes?.trim() || null,
    created_at: nowIso(),
  });
  if (error) throw error;
}

export async function deleteManualGrade(id: string): Promise<void> {
  const { error } = await getSupabase().from('manual_grades').delete().eq('id', id);
  if (error) throw error;
}

// ---------- الإعلانات ----------

export async function fetchAnnouncements(centerId: string): Promise<Announcement[]> {
  const { data, error } = await getSupabase().from('announcements').select('*')
    .eq('center_id', centerId)
    .order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as Announcement[];
}

export async function upsertAnnouncement(centerId: string, a: Partial<Announcement> & { title: string; body: string }): Promise<void> {
  const payload = { title: a.title.trim(), body: a.body.trim(), pinned: a.pinned ?? false };
  if (a.id) {
    const { error } = await getSupabase().from('announcements').update(payload).eq('id', a.id);
    if (error) throw error;
  } else {
    const { error } = await getSupabase().from('announcements')
      .insert({ id: uuid(), center_id: centerId, created_at: nowIso(), ...payload });
    if (error) throw error;
  }
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await getSupabase().from('announcements').delete().eq('id', id);
  if (error) throw error;
}

// ---------- إحصائيات لوحة مسئول السنتر ----------

export interface AdminStats {
  students: number;
  groups: number;
  presentToday: number;
  absentToday: number;
  unpaidDues: number;
  paidThisMonth: number;
}

export async function fetchAdminStats(centerId: string): Promise<AdminStats> {
  const sb = getSupabase();
  const today = todayIso();
  const now = new Date();
  const [students, groups, dues, paid] = await Promise.all([
    sb.from('students').select('id', { count: 'exact', head: true })
      .eq('center_id', centerId).eq('status', 'active'),
    sb.from('groups').select('id', { count: 'exact', head: true }).eq('center_id', centerId),
    sb.from('dues').select('id', { count: 'exact', head: true })
      .eq('center_id', centerId).eq('status', 'pending'),
    sb.from('payments').select('amount')
      .eq('center_id', centerId).eq('month', now.getMonth() + 1).eq('year', now.getFullYear()),
  ]);
  const { data: todaySessions } = await sb.from('sessions').select('id')
    .eq('center_id', centerId).eq('session_date', today);
  const sessionIds = (todaySessions ?? []).map((s) => s.id);
  let presentToday = 0;
  let absentToday = 0;
  if (sessionIds.length > 0) {
    const { data: att } = await sb.from('attendance').select('status').in('session_id', sessionIds);
    for (const a of att ?? []) {
      if (a.status === 'present' || a.status === 'late') presentToday++;
      else if (a.status === 'absent') absentToday++;
    }
  }
  const paidThisMonth = (paid.data ?? []).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
  return {
    students: students.count ?? 0,
    groups: groups.count ?? 0,
    presentToday,
    absentToday,
    unpaidDues: dues.count ?? 0,
    paidThisMonth,
  };
}

// ------------------------------------------------------------
// بوابة الطالب
// ------------------------------------------------------------

export async function fetchMyAttendance(studentId: string): Promise<(Attendance & { sessions?: SessionRecord | null })[]> {
  const { data, error } = await getSupabase().from('attendance')
    .select('*, sessions(session_date, group_id)')
    .eq('student_id', studentId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as (Attendance & { sessions?: SessionRecord | null })[];
}

// ------------------------------------------------------------
// لوحة المطور
// ------------------------------------------------------------

export interface CenterWithSub extends Center {
  latest_sub?: Pick<Subscription, 'plan_type' | 'ends_on' | 'status'> | null;
  students_count?: number;
}

export async function devFetchCenters(): Promise<CenterWithSub[]> {
  const sb = getSupabase();
  const { data: centers, error } = await sb.from('centers').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  const { data: subs } = await sb.from('center_subscriptions').select('*').order('ends_on', { ascending: false });
  const { data: students } = await sb.from('students').select('center_id');
  const subByCenter = new Map<string, Subscription>();
  for (const s of (subs ?? []) as Subscription[]) {
    if (!subByCenter.has(s.center_id)) subByCenter.set(s.center_id, s);
  }
  const countByCenter = new Map<string, number>();
  for (const st of (students ?? []) as { center_id: string | null }[]) {
    if (st.center_id) countByCenter.set(st.center_id, (countByCenter.get(st.center_id) ?? 0) + 1);
  }
  return ((centers ?? []) as Center[]).map((c) => ({
    ...c,
    latest_sub: subByCenter.get(c.id) ?? null,
    students_count: countByCenter.get(c.id) ?? 0,
  }));
}

export async function devSetCenterStatus(centerId: string, status: 'active' | 'suspended'): Promise<void> {
  const { error } = await getSupabase().from('centers').update({ status }).eq('id', centerId);
  if (error) throw error;
}

export async function devUpsertSubscription(input: {
  centerId: string; planType: PlanType; months: number; status: 'active' | 'suspended'; notes?: string;
}): Promise<void> {
  const starts = new Date();
  const ends = new Date();
  ends.setMonth(ends.getMonth() + input.months);
  const { error } = await getSupabase().from('center_subscriptions').insert({
    center_id: input.centerId,
    plan_type: input.planType,
    starts_on: starts.toISOString().slice(0, 10),
    ends_on: ends.toISOString().slice(0, 10),
    status: input.status,
    notes: input.notes?.trim() || null,
  });
  if (error) throw error;
}

export async function devFetchPublicConfig(): Promise<PublicConfig> {
  const { data, error } = await getSupabase()
    .from('app_config').select('value').eq('key', 'public_config').maybeSingle();
  if (error) throw error;
  return (data?.value ?? {}) as PublicConfig;
}

export async function devSavePublicConfig(cfg: PublicConfig): Promise<void> {
  const { error } = await getSupabase().from('app_config')
    .upsert({ key: 'public_config', value: cfg, updated_at: nowIso() });
  if (error) throw error;
}

export async function devFetchProfilesCount(): Promise<{ total: number; byRole: Record<string, number> }> {
  const { data, error } = await getSupabase().from('profiles').select('role');
  if (error) throw error;
  const byRole: Record<string, number> = {};
  for (const p of (data ?? []) as Pick<Profile, 'role'>[]) {
    byRole[p.role] = (byRole[p.role] ?? 0) + 1;
  }
  return { total: data?.length ?? 0, byRole };
}
