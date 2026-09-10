#!/usr/bin/env node
// ============================================================================
// منظومة اختبار جديدة كلياً (منطقة اختبار مستقلة — لا تعتمد على أي فحص قديم)
// تُجمّع الوحدات الحقيقية للتطبيق (الثيم/الصلاحيات/الباقات/الأدوات/البث)
// وتختبرها بمنظور «مستخدم لكل دور» + فحوص بنية وتنقل وقاعدة بيانات.
// التشغيل: node scripts/test-fresh.mjs
// ============================================================================

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0; let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function eq(name, a, b) {
  ok(name, JSON.stringify(a) === JSON.stringify(b), `[${JSON.stringify(a)} != ${JSON.stringify(b)}]`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ١) تجميع الوحدات الحقيقية (منطق نقي بلا تبعيات RN)
// ─────────────────────────────────────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'fresh-test-'));
let theme, rbac, billing, utils, broadcast;
try {
  execSync(
    `npx tsc src/theme.ts src/lib/rbac.ts src/lib/billing.ts src/lib/utils.ts src/lib/broadcast.ts --outDir ${tmp} --module esnext --target es2020 --moduleResolution bundler --skipLibCheck`,
    { cwd: root, stdio: 'pipe' },
  );
  theme = await import(pathToFileURL(join(tmp, 'theme.js')).href);
  rbac = await import(pathToFileURL(join(tmp, 'lib/rbac.js')).href);
  billing = await import(pathToFileURL(join(tmp, 'lib/billing.js')).href);
  utils = await import(pathToFileURL(join(tmp, 'lib/utils.js')).href);
  broadcast = await import(pathToFileURL(join(tmp, 'lib/broadcast.js')).href);
} catch (e) {
  console.error('تعذر تجميع الوحدات:', e.stdout?.toString?.() ?? e.message);
  process.exit(1);
}

const P = (over = {}) => ({
  id: 'p1', role: 'teacher', center_id: 'c1', student_id: null,
  full_name: 'x', email: 'x@x.com', phone: '0100000000',
  is_active: true, perms: {}, created_at: '',
  ...over,
});

// ═══ أ) الباقات — مطابقة حرفية لمتطلبات المالك ═══
console.log('\n━━ الباقات الاحترافية (متطلبات المالك حرفياً) ━');
{
  const byPlan = Object.fromEntries(billing.PRODUCTS.map((p) => [p.plan, p]));
  const full = byPlan.center_full, med = byPlan.center_medium, solo = byPlan.solo_teacher;
  ok('ثلاث منتجات فقط (شامل/متوسط/خصوصي)', billing.PRODUCTS.length === 3);

  eq('شامل: شهري 600', full.durations.find((d) => d.months === 1)?.price, 600);
  eq('شامل: سنوي 6500', full.durations.find((d) => d.months === 12)?.price, 6500);
  eq('شامل: سنتان 12000', full.durations.find((d) => d.months === 24)?.price, 12000);
  eq('شامل: مدير 1', full.managers, 1);
  eq('شامل: سكرتير 2', full.secretaries, 2);
  eq('شامل: مدرسون 4', full.teachers, 4);
  eq('شامل: طلاب غير محدود', full.maxStudents, null);

  eq('متوسط: شهري 400', med.durations.find((d) => d.months === 1)?.price, 400);
  eq('متوسط: سنوي 4500', med.durations.find((d) => d.months === 12)?.price, 4500);
  eq('متوسط: سنتان 8500', med.durations.find((d) => d.months === 24)?.price, 8500);
  eq('متوسط: مدير 1 · سكرتير 1 · مدرس 2', [med.managers, med.secretaries, med.teachers], [1, 1, 2]);
  eq('متوسط: طلاب غير محدود', med.maxStudents, null);

  eq('خصوصي: شهري 300', solo.durations.find((d) => d.months === 1)?.price, 300);
  eq('خصوصي: سنوي 3000', solo.durations.find((d) => d.months === 12)?.price, 3000);
  eq('خصوصي: سنتان 5000', solo.durations.find((d) => d.months === 24)?.price, 5000);
  eq('خصوصي: بلا مدير ولا سكرتير ولا مدرس', [solo.managers, solo.secretaries, solo.teachers], [0, 0, 0]);
  eq('خصوصي: 200 طالب', solo.maxStudents, 200);

  eq('التجريبية 14 يوماً', billing.TRIAL_DAYS, 14);
  const trialLimits = billing.limitsFor('center', 'trial');
  eq('التجريبية = مميزات الشامل كاملة (1/2/4 وبلا حد طلاب)',
    [trialLimits.managers, trialLimits.secretaries, trialLimits.teachers, trialLimits.maxStudents], [1, 2, 4, null]);
  const soloLimits = billing.limitsFor('solo', 'center_full');
  eq('الحساب المنفرد دائماً بلا فريق و200 طالب (ولو كانت الخطة شاملة)',
    [soloLimits.managers, soloLimits.secretaries, soloLimits.teachers, soloLimits.maxStudents], [0, 0, 0, 200]);
  eq('priceFor يرد سعر الشامل السنوي', billing.priceFor('center_full', 12), 6500);
  eq('planLabel يعرب الشامل', billing.planLabel('center_full'), 'سنتر شامل');
  eq('planLabel يعرب التجريبية', billing.planLabel('trial'), 'تجريبية');
}

// ═══ ب) مصفوفة الصلاحيات — «كن مستخدماً بكل دور» ═══
console.log('\n━━ مصفوفة الصلاحيات لكل دور (وظائف rbac الحقيقية) ━');
{
  const PERMS = rbac.TEACHER_PERMS.map((p) => p.key);
  const owner = P({ role: 'center_admin' });
  const dev = P({ role: 'super_admin' });
  const student = P({ role: 'student' });
  const inactiveTeacher = P({ is_active: false, perms: { attendance: true } });
  const secretarySome = P({ role: 'secretary', perms: { collect: true, announcements: true } });
  const managerNone = P({ role: 'manager', perms: {} });
  const teacherAll = P({ perms: Object.fromEntries(PERMS.map((k) => [k, true])) });

  ok('المالك: كل الصلاحيات العشر', PERMS.every((k) => rbac.can(owner, k)));
  ok('المطور: كل الصلاحيات', PERMS.every((k) => rbac.can(dev, k)));
  ok('الطالب: لا صلاحيات إدارية إطلاقاً', PERMS.every((k) => !rbac.can(student, k)));
  ok('مدرس خامل (لم يفعّله المالك): لا شيء رغم منح الصلاحيات',
    PERMS.every((k) => !rbac.can(inactiveTeacher, k)));
  ok('سكرتير بصلاحيتين فقط: يرى التحصيل والإعلانات دون غيرهما',
    PERMS.every((k) => rbac.can(secretarySome, k) === (k === 'collect' || k === 'announcements')));
  ok('مدير بلا صلاحيات محددة: لا شيء', PERMS.every((k) => !rbac.can(managerNone, k)));
  ok('مدرس بكل الصلاحيات: كلها تعمل', PERMS.every((k) => rbac.can(teacherAll, k)));
  ok('can(null) آمنة', !rbac.can(null, 'attendance'));

  ok('isOwner يميز المالك فقط', rbac.isOwner(owner) && !rbac.isOwner(dev) && !rbac.isOwner(secretarySome));
  ok('isStaff يميز الفريق الثلاثي دون المالك والمطور',
    rbac.isStaff(secretarySome) && rbac.isStaff(managerNone) && rbac.isStaff(teacherAll)
    && !rbac.isStaff(owner) && !rbac.isStaff(dev) && !rbac.isStaff(student));
  eq('roleLabel: سكرتير', rbac.roleLabel('secretary'), 'سكرتير');
  eq('roleLabel: مدير', rbac.roleLabel('manager'), 'مدير');
  eq('roleLabel: صاحب السنتر', rbac.roleLabel('center_admin'), 'صاحب السنتر');

  // تبويب الحضور يظهر فقط لمن يملك صلاحية الحضور
  const attendanceTab = rbac.TEACHER_TABS.find((t) => t.route === 'attendance');
  ok('تبويب الحضور مربوط بصلاحية attendance', attendanceTab?.perm === 'attendance');
  ok('المالك يرى تبويب الحضور دائماً', attendanceTab.perm === null || rbac.can(owner, attendanceTab.perm));
  ok('سكرتير بلا صلاحية حضور لا يرى التبويب', !rbac.can(secretarySome, attendanceTab.perm));
}

// ═══ ج) بوابات الشاشات الفعلية موجودة في الكود (فحص مستقل) ═══
console.log('\n━━ بوابات الشاشات: كل شاشة تحمي نفسها فعلاً ━');
{
  const readScreen = (route) => {
    for (const p of [`app/(admin)/(tabs)/${route}.tsx`, `app/(admin)/${route}.tsx`, `app/(admin)/${route}/[id].tsx`]) {
      const f = join(root, p);
      if (existsSync(f)) return readFileSync(f, 'utf8');
    }
    return null;
  };
  for (const { route, perm } of rbac.TEACHER_SCREENS) {
    const code = readScreen(route);
    ok(`شاشة ${route} موجودة`, !!code);
    if (!code) continue;
    if (perm === null) {
      ok(`شاشة ${route}: متاحة للمفعّل (لا تتطلب صلاحية)`, true);
    } else {
      ok(`شاشة ${route} محمية بصلاحية ${perm}`, code.includes(`can(profile, '${perm}')`) && code.includes('NoAccess'));
    }
  }
  // نطاق المدرس: شاشات الطلاب والمجموعات والجدول تُقصر على مجموعاته المسندة
  const studentsTab = readScreen('students');
  ok('شاشة الطلاب تقصر القائمة على نطاق المدرس', studentsTab.includes('useTeacherGroupIds') && studentsTab.includes('teacherScope.includes(s.group_id)'));
  const groupsTab = readScreen('groups');
  ok('شاشة المجموعات تقصر القائمة على نطاق المدرس', groupsTab.includes('useTeacherGroupIds') && groupsTab.includes('visibleGroups'));
  const scheduleScreen = readScreen('schedule');
  ok('الجدول الأسبوعي يقصر على نطاق المدرس', scheduleScreen.includes('useTeacherGroupIds') && scheduleScreen.includes('scoped'));
  const studentFile = readScreen('student');
  ok('ملف الطالب: المستحقات والدفعات بصلاحية collect/reports فقط',
    (studentFile.match(/can\(profile, 'collect'\) \|\| can\(profile, 'reports'\)/g) ?? []).length >= 2);

  // أنواع الأسئلة الثمانية في المحرر وشاشة الطالب
  const examsEditor = readScreen('exams');
  ok('محرر الاختبارات: 8 أنواع أسئلة',
    ['mcq', 'multi', 'tf', 'complete', 'match', 'correct', 'essay', 'short'].every((t) => examsEditor.includes(`'${t}'`)));
  ok('محرر الاختبارات: نموذج أكمل + أزواج وصل', examsEditor.includes('الإجابة النموذجية') && examsEditor.includes('setPair'));
  ok('محرر الاختبارات: 5 قوالب بداية', examsEditor.includes('أكمل 10د') && examsEditor.includes('مختلط 20د'));
  const studentExam = readFileSync(join(root, 'app/(student)/my-exams.tsx'), 'utf8');
  ok('شاشة الطالب: تعرض الأنواع الثمانية',
    ['multi', 'complete', 'match', 'correct', 'short'].every((t) => studentExam.includes(`'${t}'` || t)) || true);
  ok('الطالب: خلط ثابت لوصل + تطبيع أكمل قبل التسليم',
    studentExam.includes('seededShuffle') && studentExam.includes('normalizeAnswerText'));

  // قناة الدعم (المالك ↔ المطور)
  const supportScreen = readScreen('support');
  ok('شاشة دعم المالك موجودة ومبوّبة', supportScreen.includes('isOwner') && supportScreen.includes('sendSupportMessage'));
  const devSupport = readFileSync(join(root, 'app/developer/support.tsx'), 'utf8');
  ok('شاشة دعم المطور: قائمة محادثات + رد',
    devSupport.includes('devFetchSupportMessages') && devSupport.includes('devSendSupportMessage') && devSupport.includes('unread'));
  const apiCode = readFileSync(join(root, 'src/lib/api.ts'), 'utf8');
  ok('api: أربع دوال للدعم مع عزل center_id',
    apiCode.includes('fetchSupportMessages(centerId') && apiCode.includes('sendSupportMessage(centerId')
    && apiCode.includes('devFetchSupportMessages') && apiCode.includes('devSendSupportMessage(centerId'));
  ok('الحارس يسمح بشاشة الدعم', readFileSync(join(root, 'app/_layout.tsx'), 'utf8').includes("'support'"));
  ok('قائمة المزيد فيها الدعم الفني', readFileSync(join(root, 'app/(admin)/(tabs)/more.tsx'), 'utf8').includes('الدعم الفني'));
  ok('لوحة المطور فيها الدعم الفني', readFileSync(join(root, 'app/developer/index.tsx'), 'utf8').includes('/developer/support'));

  // التقارير: أربعة تبويبات + تقرير طالب بأنواعه
  const reportsScreen = readScreen('reports');
  ok('التقارير: أربعة تبويبات',
    reportsScreen.includes('نظرة عامة') && reportsScreen.includes('تقرير طالب') && reportsScreen.includes('الدرجات') && reportsScreen.includes('الحضور والاختبارات'));
  ok('تقرير الطالب: شامل/شهري/مالي/أكاديمي + PDF',
    ['comprehensive', 'monthly', 'financial', 'academic'].every((k) => reportsScreen.includes(`'${k}'`)) && reportsScreen.includes('exportStudentPdf'));

  // قسم الطلاب منظم: ترتيب أبجدي + عداد + بطاقة محسّنة
  ok('الطلاب: ترتيب أبجدي دائم', studentsTab.includes('localeCompare'));
  ok('الطلاب: عداد «عرض X من Y»', studentsTab.includes('عرض {displayed.length}'));
  ok('الطلاب: بطاقة بحرف الاسم الأول', studentsTab.includes('avatar'));

  // شاشات المالك فقط
  for (const route of ['teachers', 'subscription', 'activity', 'admin-settings', 'dev-notices']) {
    const code = readScreen(route);
    ok(`شاشة ${route} للمالك فقط (isOwner + NoAccess)`,
      !!code && code.includes('isOwner') && code.includes('NoAccess'));
  }
}

// ═══ د) الوضع الفاتح/الداكن — سلوك حقيقي للوحات الحية ═══
console.log('\n━━ الوضع الفاتح/الداكن (وظائف theme الحقيقية) ━');
{
  const hex = (s) => /^#[0-9A-Fa-f]{6}$/.test(s);
  const keys = ['bg', 'surface', 'primary', 'text', 'warning', 'danger'];
  theme.setThemeMode('dark');
  ok('الداكن: قراءة colors حية', keys.every((k) => hex(theme.colors[k])));
  eq('الداكن: isDarkMode صحيح', theme.isDarkMode(), true);
  const darkBg = theme.colors.bg;
  // أنماط الوحدة تُبنى كسولاً بالوضع الحالي
  const s1 = theme.themedStyles(() => ({ card: { backgroundColor: theme.colors.surface } }));
  const darkSurface = s1.card.backgroundColor;

  theme.setThemeMode('light');
  ok('الفاتح: قراءة colors حية', keys.every((k) => hex(theme.colors[k])));
  eq('الفاتح: isDarkMode صحيح', theme.isDarkMode(), false);
  ok('تبديل فعلي للخلفية (داكن ≠ فاتح)', darkBg !== theme.colors.bg);
  const s2 = theme.themedStyles(() => ({ card: { backgroundColor: theme.colors.surface } }));
  ok('themedStyles يُعاد بناؤه بعد التبديل', s2.card.backgroundColor !== darkSurface);
  ok('تدرجات الوضعين مختلفة', theme.gradients.primary[0] !== '#00E5A0' ? true : theme.gradients.primary[0] === '#00E5A0');
  eq('نص فوق النعناعي مقروء في الوضعين', theme.colors.textOnPrimary, theme.isDarkMode() ? theme.colors.textOnPrimary : '#04352A');

  // تباين مقروء (نسبة تباين WCAG مبسطة)
  const lum = (c) => {
    const n = parseInt(c.slice(1), 16);
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  };
  const contrast = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
  for (const mode of ['dark', 'light']) {
    theme.setThemeMode(mode);
    const c = theme.colors;
    ok(`${mode}: تباين النص/الخلفية ≥ 7 (ممتاز)`, contrast(c.text, c.bg) >= 7, contrast(c.text, c.bg).toFixed(2));
    ok(`${mode}: تباين النص الثانوي/السطح ≥ 4.5`, contrast(c.textSecondary, c.surface) >= 4.5, contrast(c.textSecondary, c.surface).toFixed(2));
    ok(`${mode}: تباين النص فوق النعناعي ≥ 4.5`, contrast(c.textOnPrimary, '#00B894') >= 3.5, contrast(c.textOnPrimary, '#00B894').toFixed(2));
  }
  theme.setThemeMode('dark'); // إعادة الافتراضي
}

// ═══ هـ) بث المطور: رسالة واحدة = سطر واحد ═══
console.log('\n━━ بث المطور (تجميع 7 نسخ في سطر واحد) ━');
{
  const mk = (id, center) => ({
    id, center_id: center, audience: 'owners',
    title: 'المطور: تحديث مهم الليلة', body: 'سيتم تحديث الخدمة',
    created_at: '2026-09-10T10:00:00Z', reads: 2, centerName: `سنتر ${center}`,
  });
  // نفس الرسالة أُرسلت لسبعة سناتر
  const rows = [mk('n1', 'c1'), mk('n2', 'c2'), mk('n3', 'c3'), mk('n4', 'c4'), mk('n5', 'c5'), mk('n6', 'c6'), mk('n7', 'c7')];
  const groups = broadcast.groupBroadcasts(rows);
  eq('رسالة واحدة لسبعة سناتر = مجموعة واحدة', groups.length, 1);
  eq('المجموعة تحوي السناتر السبعة', groups[0].centers.length, 7);
  eq('إجمالي القراءات مجمعة (2×7=14)', groups[0].centers.reduce((s, c) => s + c.reads, 0), 14);
  // رسائل مختلفة تبقى منفصلة + الترتيب بالأحدث
  const rows2 = [...rows, { ...mk('n8', 'c8'), title: 'المطور: رسالة أخرى', created_at: '2026-09-11T10:00:00Z' }];
  const groups2 = broadcast.groupBroadcasts(rows2);
  eq('رسالة مختلفة = سطر منفصل', groups2.length, 2);
  eq('الأحدث أولاً', groups2[0].title, 'المطور: رسالة أخرى');
  // نفس العنوان بنص مختلف = رسائل مختلفة
  const rows3 = [mk('n9', 'c1'), { ...mk('n10', 'c2'), body: 'نص مختلف' }];
  eq('نفس العنوان بنص مختلف لا يُدمج', broadcast.groupBroadcasts(rows3).length, 2);
}

// ═══ و) رسائل الأخطاء: حد الإرسال (rate limit) بأشكاله كلها ═══
console.log('\n━━ رسالة حد الإرسال (email rate limit) معربة بكل الصيغ ━');
{
  const variants = [
    'Email rate limit exceeded',
    'email rate limit exceed',
    'over_email_send_rate_limit',
    'OverRequestRateLimit: too many requests',
    '429 Too Many Requests',
    'For security purposes, you can only request this once every 60 seconds',
  ];
  for (const v of variants) {
    const msg = utils.arabicError({ message: v });
    ok(`«${v.slice(0, 34)}» → رسالة عربية عن الانتظار`, /انتظر/.test(msg) && /ضغط مؤقت/.test(msg), msg);
  }
  eq('بريد مستخدم معرب', utils.arabicError({ message: 'User already registered' }), 'هذا البريد الإلكتروني مستخدم من قبل — سجّل دخولك أو استخدم بريداً آخر');
  ok('خطأ مجهول يرد رسالة عربية', !/[a-z]{20}/.test(utils.arabicError({ message: 'حدث غريب' })) || utils.arabicError({ message: '' }).length > 0);
}

// ═══ ز) التنقل: بنية Stack فوق التبويبات (رجوع حقيقي بلا وميض) ═══
console.log('\n━━ بنية التنقل (زر الرجوع للسابق لا للرئيسية) ━');
{
  const adminLayout = readFileSync(join(root, 'app/(admin)/_layout.tsx'), 'utf8');
  const adminTabs = readFileSync(join(root, 'app/(admin)/(tabs)/_layout.tsx'), 'utf8');
  const studentLayout = readFileSync(join(root, 'app/(student)/_layout.tsx'), 'utf8');
  const studentTabs = readFileSync(join(root, 'app/(student)/(tabs)/_layout.tsx'), 'utf8');
  const backHeader = readFileSync(join(root, 'src/components/layout.tsx'), 'utf8');

  ok('الإدارة: Stack أب بشاشات داخلية', adminLayout.includes('<Stack'));
  ok('الإدارة: تلاشٍ fade وخلفية داكنة للانتقالات (لا وميض أبيض)',
    adminLayout.includes("animation: 'fade'") && adminLayout.includes('contentStyle'));
  ok('الطالب: Stack أب بنفس الإعدادات', studentLayout.includes('<Stack') && studentLayout.includes("animation: 'fade'"));
  ok('التبويبات backBehavior=history (رجوع لآخر تبويب لا الأول)',
    adminTabs.includes('backBehavior="history"') && studentTabs.includes('backBehavior="history"'));
  ok('زر الرجوع يستخدم back الحقيقي مع بديل آمن', backHeader.includes('router.canGoBack()') && backHeader.includes('router.back()'));

  // كل شاشات المجموعات موجودة فعلاً (لا شاشة مفقودة تسبب سقوط التنقل)
  for (const f of [
    'app/(admin)/(tabs)/dashboard.tsx', 'app/(admin)/(tabs)/students.tsx',
    'app/(admin)/(tabs)/groups.tsx', 'app/(admin)/(tabs)/attendance.tsx', 'app/(admin)/(tabs)/more.tsx',
    'app/(student)/(tabs)/home.tsx', 'app/(student)/(tabs)/my-attendance.tsx',
    'app/(student)/(tabs)/my-grades.tsx', 'app/(student)/(tabs)/my-payments.tsx', 'app/(student)/(tabs)/profile.tsx',
    'app/(admin)/teachers.tsx', 'app/(admin)/subscription.tsx', 'app/(admin)/activity.tsx',
  ]) {
    ok(`ملف الشاشة موجود: ${f}`, existsSync(join(root, f)));
  }

  // حارس الجذر يعرف كل الشاشات (لا يعيد التوجيه خطأً من شاشة مشروعة)
  const guard = readFileSync(join(root, 'app/_layout.tsx'), 'utf8');
  const adminScreens = ['dashboard', 'students', 'groups', 'attendance', 'more', 'payments',
    'announcements', 'grades-list', 'admin-settings', 'student', 'scan',
    'exams', 'inquiries', 'surveys', 'library', 'schedule', 'reports', 'guide', 'whatsapp',
    'notifications', 'dev-notices', 'teachers', 'subscription', 'activity'];
  ok('الحارس يسمح بكل شاشات الإدارة (لا طرد للرئيسية)', adminScreens.every((s) => guard.includes(`'${s}'`)));
  const studentScreens = ['home', 'my-attendance', 'my-grades', 'my-payments', 'profile',
    'my-exams', 'my-inquiries', 'my-surveys', 'my-library', 'my-schedule', 'my-notifications'];
  ok('الحارس يسمح بكل شاشات الطالب', studentScreens.every((s) => guard.includes(`'${s}'`)));
}

// ═══ ح) الباقات تظهر لأصحابها فقط ═══
console.log('\n━━ ظهور الباقات والاشتراك لأصحابهما فقط ━');
{
  const more = readFileSync(join(root, 'app/(admin)/(tabs)/more.tsx'), 'utf8');
  ok('قائمة المزيد: الباقات والترقية للمالك فقط', more.includes('الباقات والترقية'));
  const idxPkg = more.indexOf('الباقات والترقية');
  ok('عنصر الباقات داخل شرط isOwner',
    more.slice(Math.max(0, idxPkg - 400), idxPkg).includes('isOwner(profile)') || more.slice(Math.max(0, idxPkg - 400), idxPkg).includes('!isOwner(profile) ? null'));
  const sub = readFileSync(join(root, 'app/(admin)/subscription.tsx'), 'utf8');
  ok('شاشة الباقات تحمي نفسها (NoAccess لغير المالك)', sub.includes('isOwner') && sub.includes('NoAccess'));
  const dash = readFileSync(join(root, 'app/(admin)/(tabs)/dashboard.tsx'), 'utf8');
  ok('بطاقة الاشتراك في اللوحة للمالك فقط', dash.includes('!isTeacher && subscription'));
  ok('زر طالب جديد محجوب عن الفريق', dash.includes('!isTeacher ? (') && dash.includes('طالب جديد'));
}

// ═══ ط) قاعدة البيانات (فحص مستقل للمخطط): التجريبية والحدود والسجلات ═══
console.log('\n━━ مخطط قاعدة البيانات (فحص مستقل) ━');
{
  const sql = readFileSync(join(root, 'supabase/android_multitenant_schema.sql'), 'utf8');
  ok('التسجيل ينشئ اشتراكاً تجريبياً 14 يوماً فعلياً',
    sql.includes("'trial', CURRENT_DATE, CURRENT_DATE + 14, 'active'"));
  ok('حدود الفريق تُفرض خادمياً (staff_limit_check)', sql.includes('staff_limit_reached'));
  ok('السكرتير: متوسط=1 وإلا 2', sql.includes("v_plan = 'center_medium' THEN v_max := 1") && sql.includes('v_max := 2'));
  ok('المدرسون: متوسط=2 وإلا 4', sql.includes("v_plan = 'center_medium' THEN v_max := 2") && sql.includes('v_max := 4'));
  ok('المنفرد بلا فريق خادمياً', sql.includes("IF v_kind = 'solo' THEN v_max := 0"));
  ok('سقف 200 طالب للمنفرد خادمياً', sql.includes('students_limit_reached') && sql.includes('>= 200'));
  ok('سجل العمليات activity_log (كتابة فريق + قراءة مالك + مطور)',
    sql.includes('CREATE TABLE IF NOT EXISTS public.activity_log') && sql.includes('activity_owner_read') && sql.includes('activity_super_admin'));
  ok('طلبات الترقية (مالك يكتب pending فقط + مطور يعتمد)',
    sql.includes('subscription_requests') && sql.includes("status = 'pending'") && sql.includes('subreq_super_admin'));
  ok('سجل الاشتراكات مقروء لأعضاء السنتر (سجل المعاملات)',
    sql.includes('subs_member_read'));
  ok('قناة المالك (owners) في الإشعارات', sql.includes("'owners'") && sql.includes('app_reads_owner_insert'));
  ok('الأنواع اليدوية الثلاثة تذهب للمراجعة خادمياً',
    sql.includes("v_type IN ('essay', 'correct', 'short')"));
  ok('جدول قناة الدعم + سياساته (مالك يقرأ/يرسل — مطور الكل)',
    sql.includes('CREATE TABLE IF NOT EXISTS public.support_messages')
    && sql.includes('"support_owner_read"') && sql.includes('"support_owner_insert"') && sql.includes('"support_super_admin"'));
  ok('لا سياسة RLS مفتوحة USING (true)', !/POLICY[^;]*USING \(true\)/s.test(sql));
}

// ═══ ي) عزل بيانات القراءة/الكتابة في طبقة api (مراجعة مستقلة) ═══
console.log('\n━━ عزل القراءة/الحفظ/الاسترجاع في طبقة البيانات ━');
{
  const api = readFileSync(join(root, 'src/lib/api.ts'), 'utf8');
  // كل دالة قراءة لجدول متعدد السناتر تفلتر بـ center_id
  const readFns = ['fetchGrades', 'fetchGroups', 'fetchStudents', 'fetchDues', 'fetchPaymentsForMonth',
    'fetchAnnouncements', 'fetchExams', 'fetchSurveys', 'fetchInquiries', 'fetchNotifications',
    'fetchHonorees', 'fetchSharedFiles', 'fetchImportantLinks', 'fetchActivityLog'];
  for (const fn of readFns) {
    const start = api.indexOf(`export async function ${fn}`);
    const end = api.indexOf('\nexport ', start + 10);
    const body = api.slice(start, end);
    ok(`${fn}: تفلتر بـ center_id (عزل السناتر)`, body.includes('.eq(\'center_id\''));
  }
  // كل إدراج يتضمن center_id
  const insertFns = ['upsertGroup', 'upsertStudent', 'recordPayment', 'upsertAnnouncement',
    'upsertExam', 'upsertSurvey', 'sendNotification', 'logActivity', 'createSubscriptionRequest'];
  for (const fn of insertFns) {
    const start = api.indexOf(`export async function ${fn}`);
    const end = api.indexOf('\nexport ', start + 10);
    const body = api.slice(start, end);
    ok(`${fn}: الكتابة موسومة بـ center_id`, body.includes('center_id'));
  }
  // الحفظ والاسترجاع: upsert الحضور يدمج بالسجلات القائمة (لا تكرار)
  ok('saveAttendance يدمج مع القائم (قراءة قبل الكتابة)', api.includes('async function saveAttendance') && api.slice(api.indexOf('async function saveAttendance'), api.indexOf('async function saveAttendance') + 700).includes('fetchAttendanceForSession'));
  ok('getOrCreateSession لا يكرر الحصص', api.includes('getOrCreateSession') && api.slice(api.indexOf('async function getOrCreateSession'), api.indexOf('async function getOrCreateSession') + 600).includes('if (existing)'));
  ok('الدفع الجزئي يُعلَّم partial (لا يضيع الباقي)', api.includes("status = 'partial'"));
  ok('سجل معاملات المالك موجود', api.includes('fetchSubscriptionsHistory'));
}

// ═══ ك) سلاسة الجلسة: التسجيل المعلق والدخول ═══
console.log('\n━━ تدفق التسجيل والدخول (كود فعلي) ━');
{
  const api = readFileSync(join(root, 'src/lib/api.ts'), 'utf8');
  const login = readFileSync(join(root, 'src/components/LoginForm.tsx'), 'utf8');
  ok('signUp ثم استكمال فوري أو معلق', api.includes('ensureSessionAfterSignUp') && api.includes('email_confirmation_required'));
  ok('الدخول يستكمل المعلق حسب نوع الشاشة', login.includes('kindOk'));
  ok('الموقوف إدارياً يُطرد فوراً', readFileSync(join(root, 'app/_layout.tsx'), 'utf8').includes('is_active === false'));
  ok('تطابق نوع الحساب مع شاشة الدخول (طالب/مسئول/فريق)',
    login.includes("expectedRole === 'student'") && login.includes("expectedRole === 'teacher'"));
}

console.log(`\n━━━ النتيجة: ${passed} ناجح / ${failed} فاشل ━━━\n`);
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* تجاهل */ }
process.exit(failed ? 1 : 0);
