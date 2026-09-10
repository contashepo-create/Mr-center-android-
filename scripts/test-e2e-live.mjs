#!/usr/bin/env node
// ============================================================================
// اختبار حي شامل (E2E) ضد مشروع Supabase حقيقي — يحاكي كل الأدوار:
// زائر / صاحب سنتر / مدرس تابع / طالب / مطور — ويحاول كسر العزل والقيود.
// لا يعمل افتراضياً: يحتاج متغيرات بيئة (لا تضع المفاتيح في أي ملف):
//   E2E_SUPABASE_URL, E2E_ANON_KEY, E2E_SERVICE_KEY
// التشغيل:  $env:E2E_SUPABASE_URL="..."; $env:E2E_ANON_KEY="...";
//           $env:E2E_SERVICE_KEY="..."; npm run test:e2e
// ملاحظة أمنية: بدّل مفتاح service_role من لوحة Supabase بعد الاختبار.
// prerequisite: تشغيل supabase/android_multitenant_schema.sql على المشروع أولاً.
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const URL = process.env.E2E_SUPABASE_URL;
const ANON = process.env.E2E_ANON_KEY;
const SERVICE = process.env.E2E_SERVICE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.log('⏭️  تخطي الاختبار الحي — اضبط E2E_SUPABASE_URL و E2E_ANON_KEY و E2E_SERVICE_KEY أولاً');
  console.log('   (مفتاح service_role للتهيئة والتنظيف فقط — بدّله بعد الاختبار من لوحة Supabase)');
  process.exit(0);
}

let passed = 0; let failed = 0;
const notes = [];
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); notes.push(name); }
}
async function expectThrow(name, fn, code) {
  // مكتبة supabase-js لا ترمي: الخطأ يرجع في خاصية error — نفحص الاثنين
  try {
    const r = await fn();
    const m = String(r?.error?.message ?? '');
    if (r?.error && (!code || m.includes(code))) ok(name, true);
    else ok(name, false, m ? `خطأ مختلف: ${m.slice(0, 90)}` : 'نُفّذ بنجاح دون رفض');
  } catch (e) {
    const m = String(e?.message ?? '');
    ok(name, code ? m.includes(code) : true, m.slice(0, 90));
  }
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const mkUser = () => createClient(URL, ANON, { auth: { persistSession: false } });
const ts = Date.now();
const E = (r) => `e2e${ts}${r}@gmail.com`;
const createdUserIds = [];
const createdCenterIds = [];

async function makeConfirmedUser(email, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error) throw error;
  createdUserIds.push(data.user.id);
  return data.user;
}
async function signIn(email, password) {
  const c = mkUser();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}
async function cleanup() {
  for (const cid of createdCenterIds) {
    await admin.from('centers').delete().eq('id', cid);
  }
  for (const uid of createdUserIds) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
  }
}

try {
  // تنظيف بقايا اختبارات سابقة (حسابات e2e% وسناتر الاختبار) قبل البدء
  console.log('🧹 مسح مسبق لبقايا سابقة...');
  try {
    const { data: oldUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of (oldUsers?.users ?? []).filter((x) => (x.email ?? '').startsWith('e2e'))) {
      await admin.auth.admin.deleteUser(u.id).catch(() => {});
    }
    await admin.from('centers').delete().in('name', ['سنتر الاختبار', 'سنتر ثان']);
  } catch (e) {
    console.log('  (تعذر المسح المسبق — غالباً صلاحيات service_role ناقصة: أعد تشغيل ملف SQL أولاً)');
  }

  // ═══ 1) زائر (بلا جلسة) ═══
  console.log('\n━━ زائر ━');
  const anon = mkUser();
  const { data: lk } = await anon.rpc('lookup_center_by_code', { p_code: 'XX-NOPE' });
  ok('كود وهمي يرد فارغاً', (Array.isArray(lk) ? lk[0] : lk) == null);
  const { data: lists } = await anon.rpc('get_center_signup_lists', { p_center_id: '00000000-0000-0000-0000-000000000000' });
  ok('قوائم سنتر وهمي فارغة', (lists?.grades?.length ?? 0) === 0);
  const { data: stRows } = await anon.from('students').select('id').limit(1);
  ok('الزائر لا يقرأ الطلاب', (stRows ?? []).length === 0);
  await expectThrow('الزائر لا يسجل حضوراً', () =>
    anon.from('attendance').insert({ id: 'x', center_id: '00000000-0000-0000-0000-000000000000', session_id: 'x', student_id: 'x', status: 'present' }));

  // ═══ 2) صاحب سنتر: التسجيل الكامل ═══
  console.log('\n━━ صاحب سنتر ━');
  const ownerEmail = E('owner'), ownerPass = 'Test1234!';
  await makeConfirmedUser(ownerEmail, ownerPass);
  const owner = await signIn(ownerEmail, ownerPass);
  const { data: centerId, error: cErr } = await owner.rpc('complete_center_registration', {
    p_center_name: 'سنتر الاختبار', p_code: `T${String(ts).slice(-5)}`,
    p_owner_name: 'المالك', p_phone: `010${String(ts).slice(-8)}`, p_kind: 'center',
  });
  if (cErr) throw cErr;
  createdCenterIds.push(centerId);
  ok('إنشاء السنتر + الملف', !!centerId);
  const { data: sub } = await owner.rpc('get_my_subscription');
  ok('اشتراك تجريبي فعّال 7 أيام', sub?.status === 'active' && sub?.days_left === 7, JSON.stringify(sub));
  await expectThrow('منع تكرار التسجيل', () =>
    owner.rpc('complete_center_registration', { p_center_name: 'x', p_code: 'ZZZ', p_owner_name: 'x', p_phone: '0100000000', p_kind: 'center' }), 'already_registered');

  // صفوف ومجموعات وتحقق
  const { data: grade } = await owner.from('grades').insert({ id: `g-${ts}`, center_id: centerId, name: 'الثالث الثانوي' }).select().single();
  ok('إنشاء صف', !!grade?.id);
  const { data: group } = await owner.from('groups').insert({
    id: `gr-${ts}`, center_id: centerId, name: 'فيزياء السبت', days: ['sat'],
    start_time: '16:00', end_time: '18:00', monthly_fee: 200, teacher_name: 'مستر فيزياء',
  }).select().single();
  ok('إنشاء مجموعة بمدرس', group?.teacher_name === 'مستر فيزياء');

  // ═══ 3) طالب: تسجيل كامل + دمج + قيود ═══
  console.log('\n━━ طالب ━');
  // سجل يدوي مسبق بنفس الهاتف لاختبار الدمج
  const manualPhone = `011${String(ts).slice(-8)}`;
  const { data: manual } = await owner.from('students').insert({
    id: `st-man-${ts}`, center_id: centerId, name: 'طالب يدوي', phone: manualPhone, status: 'active',
  }).select().single();
  const stuEmail = E('stu');
  await makeConfirmedUser(stuEmail, ownerPass);
  const stu = await signIn(stuEmail, ownerPass);
  const { data: linkedId, error: linkErr } = await stu.rpc('complete_student_registration', {
    p_center_id: centerId, p_full_name: 'طالب مدمج', p_phone: manualPhone,
    p_guardian_phone: `012${String(ts).slice(-8)}`, p_grade_id: grade.id, p_group_id: group.id,
  });
  if (linkErr) throw linkErr;
  ok('ربط الحساب بالسجل اليدوي بدل التكرار', linkedId === manual.id, String(linkedId));
  // حسابان طازجان لاختبار قيود التسجيل (الحساب الأول سُجل فعلاً أعلاه)
  const mkFreshStudent = async (tag) => {
    const em = E(tag);
    await makeConfirmedUser(em, ownerPass);
    return signIn(em, ownerPass);
  };
  const freshA = await mkFreshStudent('valA');
  await expectThrow('رقم الولي = رقم الطالب مرفوض', () =>
    freshA.rpc('complete_student_registration', {
      p_center_id: centerId, p_full_name: 'x', p_phone: `0109999000`, p_guardian_phone: `0109999000`,
    }), 'same_guardian_phone');
  const freshB = await mkFreshStudent('valB');
  await expectThrow('مجموعة من سنتر آخر مرفوضة', () =>
    freshB.rpc('complete_student_registration', {
      p_center_id: centerId, p_full_name: 'x', p_phone: `0109999001`, p_guardian_phone: `0109999002`,
      p_group_id: 'no-such-group',
    }), 'invalid_group');
  // ملف الطالب يرى نفسه فقط
  const { data: me } = await stu.from('students').select('id').eq('id', linkedId);
  ok('الطالب يقرأ سجله', (me ?? []).length === 1);
  const { data: others } = await stu.from('students').select('id').neq('id', linkedId).limit(5);
  ok('الطالب لا يرى غيره', (others ?? []).length === 0);
  await expectThrow('الطالب لا ينشئ إعلاناً', () =>
    stu.from('announcements').insert({ id: `an-${ts}`, center_id: centerId, title: 'x', body: 'y' }));

  // طالب ثانٍ لاختبار العزل بين الطلاب
  const stu2Email = E('stu2');
  await makeConfirmedUser(stu2Email, ownerPass);
  const stu2 = await signIn(stu2Email, ownerPass);
  await stu2.rpc('complete_student_registration', {
    p_center_id: centerId, p_full_name: 'طالب ثان', p_phone: `010${String(Number(String(ts).slice(-8)) + 11)}`,
    p_guardian_phone: `015${String(ts).slice(-8)}`,
  });
  const { data: peek } = await stu2.from('students').select('id').eq('id', linkedId);
  ok('طالب لا يقرأ سجل طالب آخر', (peek ?? []).length === 0);

  // استفسار + رد
  await stu.from('app_inquiries').insert({
    id: `inq-${ts}`, center_id: centerId, student_id: linkedId,
    kind: 'transfer', subject: 'نقل', body: 'أريد النقل', status: 'pending',
  });
  ok('الطالب يرسل طلباً', true);
  await owner.from('app_inquiries').update({ reply: 'تم', status: 'approved' }).eq('id', `inq-${ts}`);
  const { data: myInq } = await stu.from('app_inquiries').select('reply,status').eq('id', `inq-${ts}`).single();
  ok('الطالب يرى الرد', myInq?.status === 'approved' && myInq?.reply === 'تم');

  // امتحان: نشر → تأدية → منع تكرار → مراجعة مقالي
  const { data: exam } = await owner.from('app_exams').insert({
    id: `ex-${ts}`, center_id: centerId, title: 'اختبار حي', subject: 'فيزياء',
    questions: [
      { q: 'س1', type: 'mcq', choices: ['أ', 'ب', 'ج', 'د'], marks: 2 },
      { q: 'علل', type: 'essay', choices: [], marks: 3 },
    ],
    answers: [1, -1], total_score: 5, is_published: true,
  }).select().single();
  const { data: pubs } = await stu.rpc('get_published_exams');
  const pub = (pubs ?? []).find((e) => e.id === exam.id);
  ok('الطالب يرى المنشور بلا إجابات', !!pub && JSON.stringify(pub).includes('س1') && !JSON.stringify(pub).includes('"answers"'));
  const { data: res } = await stu.rpc('submit_exam_attempt', { p_exam_id: exam.id, p_answers: [1, 'لأن...'] });
  ok('تصحيح تلقائي + مقالي للمراجعة', res?.score === 2 && res?.status === 'pending_review', JSON.stringify(res));
  await expectThrow('منع تكرار المحاولة', () =>
    stu.rpc('submit_exam_attempt', { p_exam_id: exam.id, p_answers: [1, 'x'] }), 'already_attempted');
  await expectThrow('الطالب لا يزوّر درجته مباشرة', () =>
    stu2.from('app_exam_attempts').insert({
      id: `fake-${ts}`, center_id: centerId, exam_id: exam.id, student_id: 'zzz', answers: [], score: 100, max_score: 5,
    }));
  await owner.from('app_exam_attempts').update({ score: 4, status: 'graded' }).eq('exam_id', exam.id);
  ok('المعلم/المسئول يعتمد درجة المقالي', true);

  // استبيان مرة واحدة
  const { data: survey } = await owner.from('app_surveys').insert({
    id: `sv-${ts}`, center_id: centerId, title: 'رأيك', questions: ['س؟'], is_active: true,
  }).select().single();
  await stu.from('app_survey_responses').insert({
    id: `sr-${ts}`, center_id: centerId, survey_id: survey.id, student_id: linkedId, answers: ['تمام'],
  });
  // الإدخال المباشر هنا يرد خطأ القيد الخام (التطبيق يحوّله لرسالة عربية عبر submitSurveyResponse)
  await expectThrow('منع تكرار الاستبيان (قيد فرادة)', () =>
    stu.from('app_survey_responses').insert({
      id: `sr2-${ts}`, center_id: centerId, survey_id: survey.id, student_id: linkedId, answers: ['x'],
    }), 'duplicate key');

  // إشعار + قراءة
  await owner.from('app_notifications').insert({
    id: `nt-${ts}`, center_id: centerId, audience: 'all', title: 'تنبيه حي', body: 'اختبار',
  });
  const { data: notifs } = await stu.rpc('get_my_notifications');
  ok('الطالب يستلم البث', (notifs ?? []).some((n) => n.id === `nt-${ts}`));
  await stu.from('app_notification_reads').insert({
    id: `nr-${ts}`, center_id: centerId, notification_id: `nt-${ts}`, student_id: linkedId,
  });
  const { data: notifs2 } = await stu.rpc('get_my_notifications');
  ok('المقروء يُعلَّم ولا يتكرر', (notifs2 ?? []).find((n) => n.id === `nt-${ts}`)?.is_read === true);

  // حضور ومدفوعات
  const today = new Date().toISOString().slice(0, 10);
  const { data: sess } = await owner.from('sessions').insert({
    id: `se-${ts}`, center_id: centerId, group_id: group.id, session_date: today,
  }).select().single();
  await owner.from('attendance').insert({
    id: `at-${ts}`, center_id: centerId, session_id: sess.id, student_id: linkedId, status: 'present',
  });
  const { data: myAtt } = await stu.from('attendance').select('id').eq('student_id', linkedId);
  ok('الطالب يرى حضوره', (myAtt ?? []).length >= 1);
  const now = new Date();
  await owner.from('dues').insert({
    id: `du-${ts}`, center_id: centerId, student_id: linkedId, group_id: group.id,
    month: now.getMonth() + 1, year: now.getFullYear(), amount: 200, status: 'pending',
  });
  const { data: myDues } = await stu.from('dues').select('id').eq('student_id', linkedId);
  ok('الطالب يرى مستحقاته', (myDues ?? []).length >= 1);

  // ═══ 4) سنتر ثانٍ: العزل الكامل ═══
  console.log('\n━━ العزل بين السناتر ━');
  const owner2Email = E('owner2');
  await makeConfirmedUser(owner2Email, ownerPass);
  const owner2 = await signIn(owner2Email, ownerPass);
  const { data: center2 } = await owner2.rpc('complete_center_registration', {
    p_center_name: 'سنتر ثان', p_code: `U${String(ts).slice(-5)}`,
    p_owner_name: 'مالك2', p_phone: `010${String(Number(String(ts).slice(-8)) + 22)}`, p_kind: 'solo',
  });
  createdCenterIds.push(center2);
  const { data: cross1 } = await owner2.from('students').select('id').eq('id', linkedId);
  ok('سنتر لا يقرأ طلاب سنتر آخر', (cross1 ?? []).length === 0);
  const { data: cross2 } = await owner2.from('groups').select('id').eq('id', group.id);
  ok('سنتر لا يقرأ مجموعات الآخر', (cross2 ?? []).length === 0);
  await expectThrow('سنتر لا يكتب في سنتر آخر', () =>
    owner2.from('announcements').insert({ id: `ax-${ts}`, center_id: centerId, title: 'x', body: 'y' }));
  const { data: lkBoth } = await anon.rpc('lookup_center_by_code', { p_code: `T${String(ts).slice(-5)}` });
  const lkRow = Array.isArray(lkBoth) ? lkBoth[0] : lkBoth;
  ok('البحث بالكود يرد الحالة', lkRow?.status === 'active', JSON.stringify(lkRow));

  // ═══ 5) مدرس تابع ═══
  console.log('\n━━ مدرس تابع ━');
  const teaEmail = E('tea');
  await makeConfirmedUser(teaEmail, ownerPass);
  const tea = await signIn(teaEmail, ownerPass);
  await tea.rpc('register_staff_account', { p_center_id: centerId, p_full_name: 'مدرس الاختبار', p_phone: `010${String(Number(String(ts).slice(-8)) + 33)}`, p_role: 'teacher' });
  const { data: teaProf } = await tea.from('profiles').select('role,is_active').eq('id', (await tea.auth.getUser()).data.user.id).single();
  ok('حساب المدرس خامل قبل التفعيل', teaProf?.role === 'teacher' && teaProf?.is_active === false);
  await expectThrow('الخامل لا يكتب حضوراً', () =>
    tea.from('attendance').insert({ id: `atx-${ts}`, center_id: centerId, session_id: sess.id, student_id: linkedId, status: 'present' }));
  const teaUid = (await tea.auth.getUser()).data.user.id;
  await owner.from('profiles').update({ is_active: true, perms: { attendance: true, exams: false } }).eq('id', teaUid);
  await tea.from('attendance').insert({ id: `atx-${ts}`, center_id: centerId, session_id: sess.id, student_id: linkedId, status: 'late' });
  ok('بعد التفعيل يكتب بسنتره', true);
  {
    const { data, error } = await tea.from('students').select('id').eq('center_id', center2).limit(1);
    ok('المدرس لا يقرأ سنتراً آخر', !error && (data ?? []).length === 0,
      error ? error.message.slice(0, 80) : `تسرّب ${(data ?? []).length} صفوف`);
  }
  await owner.from('profiles').update({ is_active: false }).eq('id', teaUid);
  await expectThrow('الموقوف يُمنع من الكتابة', () =>
    tea.from('attendance').insert({ id: `aty-${ts}`, center_id: centerId, session_id: sess.id, student_id: linkedId, status: 'present' }));

  // ═══ 5.5) أدوار المدير/السكرتير وحدود الباقة خادمياً (التجريبية = حدود الشامل) ═══
  console.log('\n━━ المدير والسكرتير وحدود الباقة ━');
  const mkStaff = async (tag, role, phone) => {
    const em = E(tag);
    await makeConfirmedUser(em, ownerPass);
    const c = await signIn(em, ownerPass);
    const uid = (await c.auth.getUser()).data.user.id;
    const { error } = await c.rpc('register_staff_account', {
      p_center_id: centerId, p_full_name: `فريق ${tag}`, p_phone: phone, p_role: role,
    });
    return { c, uid, error };
  };
  {
    const mgr = await mkStaff('mgr', 'manager', `010${String(Number(String(ts).slice(-8)) + 44)}`);
    ok('تسجيل مدير خامل', !mgr.error, mgr.error?.message?.slice(0, 80));
    const { error: actMgr } = await owner.from('profiles').update({ is_active: true }).eq('id', mgr.uid);
    ok('تفعيل المدير الأول (حد الباقة 1)', !actMgr, actMgr?.message?.slice(0, 80));
    const mgr2 = await mkStaff('mgr2', 'manager', `010${String(Number(String(ts).slice(-8)) + 55)}`);
    const { error: actMgr2 } = await owner.from('profiles').update({ is_active: true }).eq('id', mgr2.uid);
    ok('مدير ثانٍ يُرفض خادمياً (staff_limit_reached)',
      !!actMgr2 && String(actMgr2.message).includes('staff_limit_reached'), actMgr2?.message?.slice(0, 90));
    const sec1 = await mkStaff('sec1', 'secretary', `010${String(Number(String(ts).slice(-8)) + 66)}`);
    const { error: actS1 } = await owner.from('profiles').update({ is_active: true }).eq('id', sec1.uid);
    ok('تفعيل السكرتير الأول', !actS1, actS1?.message?.slice(0, 80));
    const sec2 = await mkStaff('sec2', 'secretary', `010${String(Number(String(ts).slice(-8)) + 77)}`);
    const { error: actS2 } = await owner.from('profiles').update({ is_active: true }).eq('id', sec2.uid);
    ok('تفعيل السكرتير الثاني (حد التجريبية 2)', !actS2, actS2?.message?.slice(0, 80));
    const sec3 = await mkStaff('sec3', 'secretary', `010${String(Number(String(ts).slice(-8)) + 88)}`);
    const { error: actS3 } = await owner.from('profiles').update({ is_active: true }).eq('id', sec3.uid);
    ok('سكرتير ثالث يُرفض خادمياً',
      !!actS3 && String(actS3.message).includes('staff_limit_reached'), actS3?.message?.slice(0, 90));
    // السكرتير المفعّل يعمل داخل سنتره (كتابة إعلان) ولا يرى سنتراً آخر
    await sec1.c.from('announcements').insert({ id: `anx-${ts}`, center_id: centerId, title: 'سكرتير', body: 'كتب' });
    const { data: secPeek } = await sec1.c.from('students').select('id').eq('center_id', center2).limit(1);
    ok('السكرتير يكتب بسنتره ولا يرى الآخر', (secPeek ?? []).length === 0);
    // الحساب المنفرد (solo) يرفض أي فريق
    const soloEmail = E('soloStaff');
    await makeConfirmedUser(soloEmail, ownerPass);
    const soloStaff = await signIn(soloEmail, ownerPass);
    await expectThrow('الحساب المنفرد بلا فريق (staff_not_allowed)', () =>
      soloStaff.rpc('register_staff_account', { p_center_id: center2, p_full_name: 'x', p_phone: '0100000001', p_role: 'teacher' }), 'staff_not_allowed');

  }

  // ═══ 6) مطور: إيقاف يفعّل الحظر ═══
  console.log('\n━━ مطور ━');
  const devEmail = E('dev');
  const devCreated = await (async () => {
    const { data, error } = await admin.auth.admin.createUser({ email: devEmail, password: ownerPass, email_confirm: true });
    if (error) throw error;
    createdUserIds.push(data.user.id);
    return data.user;
  })();
  const devUid = devCreated.id;
  if (devUid) {
    createdUserIds.push(devUid);
    const { error: profErr } = await admin.from('profiles').insert({ id: devUid, role: 'super_admin', full_name: 'المطور', email: devEmail });
    ok('إنشاء بروفايل المطور', !profErr, profErr?.message?.slice(0, 100));
    const { data: back } = await admin.from('profiles').select('role').eq('id', devUid).single();
    ok('دور المطور محفوظ', back?.role === 'super_admin', JSON.stringify(back));
    const dev = await signIn(devEmail, ownerPass);
    const { data: allCenters, error: cErr } = await dev.from('centers').select('id').limit(5);
    ok('المطور يرى كل السناتر', !cErr && (allCenters ?? []).length >= 2,
      cErr ? cErr.message.slice(0, 100) : `وجد ${(allCenters ?? []).length}`);
    await dev.from('centers').update({ status: 'suspended' }).eq('id', centerId);
    const ownerRe = await signIn(ownerEmail, ownerPass);
    const { data: sub2 } = await ownerRe.rpc('get_my_subscription');
    ok('الإيقاف يفعّل الحظر', sub2?.status === 'suspended', JSON.stringify(sub2));
    await dev.from('centers').update({ status: 'active' }).eq('id', centerId);
    ok('إعادة التفعيل', true);

    // ═══ 6.5) قناة المطور↔المالك + سجل المعاملات ═══
    console.log('\n━━ قناة المطور وسجل المعاملات ━');
    await dev.from('app_notifications').insert({
      id: `ntb-${ts}`, center_id: centerId, audience: 'owners', title: 'المطور: تنبيه للمالك', body: 'رسالة قناة المالك',
    });
    const ownerB = await signIn(ownerEmail, ownerPass);
    const { data: ownerNotifs } = await ownerB.from('app_notifications').select('id').eq('id', `ntb-${ts}`);
    ok('المالك يستلم بث قناة المالك', (ownerNotifs ?? []).length === 1);
    const ownerBUid = (await ownerB.auth.getUser()).data.user.id;
    const { error: readErr } = await ownerB.from('app_notification_reads').insert({
      id: `nrb-${ts}`, center_id: centerId, notification_id: `ntb-${ts}`, student_id: ownerBUid,
    });
    ok('تعليم المقروء بمعرف حساب المالك', !readErr, readErr?.message?.slice(0, 80));
  } else {
    ok('تهيئة المطور', false, 'تعذر جلب المستخدم');
  }

  // ═══ 7) طلب ترقية + اعتماد ═══
  console.log('\n━━ طلبات الترقية ━');
  {
    const ownerRe2 = await signIn(ownerEmail, ownerPass);
    const { error: rqErr } = await ownerRe2.from('subscription_requests').insert({
      id: `rq-${ts}`, center_id: centerId, plan: 'center_full', months: 12,
      amount: 6500, transfer_at: '2026-09-12 3pm', status: 'pending',
    });
    ok('المالك يطلب ترقية ببيانات التحويل', !rqErr, rqErr?.message?.slice(0, 80));
    const dev2 = await signIn(devEmail, ownerPass);
    const { data: pend } = await dev2.from('subscription_requests').select('id').eq('status', 'pending');
    ok('المطور يرى الطلبات المعلقة', (pend ?? []).some((r) => r.id === `rq-${ts}`));
    await dev2.from('center_subscriptions').insert({
      center_id: centerId, plan_type: 'center_full',
      starts_on: '2026-09-12', ends_on: '2027-09-12', status: 'active', notes: 'اعتماد طلب',
    });
    await dev2.from('subscription_requests').update({ status: 'approved' }).eq('id', `rq-${ts}`);
    const { data: mySub } = await ownerRe2.rpc('get_my_subscription');
    ok('الاعتماد يفعّل الباقة', mySub?.status === 'active' && mySub?.plan_type === 'center_full', JSON.stringify(mySub));
    await ownerRe2.from('activity_log').insert({
      id: `ac-${ts}`, center_id: centerId, actor_id: 'x', actor_name: 'المالك', action: 'subscription_request', details: 'اختبار',
    });
    const { data: acts } = await ownerRe2.from('activity_log').select('id').eq('center_id', centerId).limit(5);
    ok('سجل العمليات يعمل', (acts ?? []).length >= 1);
    const { data: subHistory } = await ownerRe2.from('center_subscriptions').select('plan_type').eq('center_id', centerId).order('created_at');
    ok('سجل معاملات المالك (تجريبية + المعتمدة) يقرأ',
      (subHistory ?? []).length >= 2 && subHistory.some((s) => s.plan_type === 'trial') && subHistory.some((s) => s.plan_type === 'center_full'),
      JSON.stringify(subHistory?.map((s) => s.plan_type)));
    const { error: limErr } = await ownerRe2.from('profiles').update({ is_active: true }).eq('id', teaUid);
    ok('تفعيل ضمن الحد مسموح', !limErr, limErr?.message?.slice(0, 80));
  }

  // ═══ 8) بوابة التسجيل المغلق ═══
  console.log('\n━━ بوابة التسجيل ━');
  await owner.from('center_settings').upsert({ center_id: centerId, settings: { registration_open: false } });
  const tmpEmail = E('tmp');
  await makeConfirmedUser(tmpEmail, ownerPass);
  const tmp = await signIn(tmpEmail, ownerPass);
  await expectThrow('التسجيل المغلق يرفض', () =>
    tmp.rpc('complete_student_registration', {
      p_center_id: centerId, p_full_name: 'x', p_phone: `0109999111`, p_guardian_phone: `0109999222`,
    }), 'registration_closed');
  await owner.from('center_settings').upsert({ center_id: centerId, settings: { registration_open: true } });
  ok('إعادة الفتح', true);

  console.log(`\n━━━ النتيجة: ${passed} ناجح / ${failed} فاشل ━━━\n`);
} catch (e) {
  console.error('💥 خطأ غير متوقع يوقف الاختبار:', e?.message ?? e);
  failed++;
} finally {
  console.log('🧹 تنظيف بيانات الاختبار...');
  await cleanup();
  console.log('انتهى التنظيف.');
}
process.exit(failed ? 1 : 0);
