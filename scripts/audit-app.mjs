#!/usr/bin/env node
// ============================================================================
// تدقيق سلامة ملفات التطبيق (app.json / eas.json / package.json + فحوص كود)
// التشغيل: node scripts/audit-app.mjs
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0; let failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}

console.log('\n━━ app.json ━');
const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
check('اسم الحزمة الأندرويد ثابت', appJson.expo.android?.package === 'com.mrcenter.app');
check('versionCode رقم صحيح ≥ 1', Number.isInteger(appJson.expo.android?.versionCode) && appJson.expo.android.versionCode >= 1);
check('إذن تثبيت الحزم (للتحديث الذاتي)', (appJson.expo.android?.permissions ?? []).includes('REQUEST_INSTALL_PACKAGES'));
check('إذن الإنترنت', (appJson.expo.android?.permissions ?? []).includes('INTERNET'));
check('رابط عامل كلاود فلير مضبوط في extra.configUrl', typeof appJson.expo.extra?.configUrl === 'string' && appJson.expo.extra.configUrl.length > 0);
check('extra لا يحوي مفاتيح حقيقية مسربة (فارغة افتراضياً)',
  !appJson.expo.extra?.supabaseAnonKey && appJson.expo.extra?.supabaseAnonKey !== undefined);
check('أيقونة التطبيق موجودة التعريف', appJson.expo.icon === './assets/icon.png');
check('ملحق الكاميرا لمسح الباركود', (appJson.expo.plugins ?? []).some((p) => p === 'expo-camera' || p?.[0] === 'expo-camera'));

console.log('\n━━ eas.json ━');
const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'));
check('ملف preview يبني APK', eas.build?.preview?.android?.buildType === 'apk');
check('ملف production يبني AAB', eas.build?.production?.android?.buildType === 'app-bundle');

console.log('\n━━ package.json ━');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const dep of ['expo', 'expo-router', '@supabase/supabase-js', 'expo-file-system', 'expo-intent-launcher', 'expo-application', 'expo-secure-store', 'expo-camera', 'react-native-svg', 'react-native-qrcode-svg', 'expo-print', 'expo-sharing', 'expo-clipboard', 'expo-notifications']) {
  check(`تبعية ${dep}`, !!pkg.dependencies[dep]);
}
check('نقطة الدخول index.ts', pkg.main === 'index.ts');

console.log('\n━━ فحص الكود: منع التسريبات والأخطاء الشائعة ━');
function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== 'node_modules' && e !== '.git') yield* walk(p); }
    else if (/\.(ts|tsx)$/.test(e)) yield p;
  }
}
const srcFiles = [...walk(join(root, 'src')), ...walk(join(root, 'app'))];
check(`عدد ملفات الكود معقول (${srcFiles.length})`, srcFiles.length >= 30);
for (const f of srcFiles) {
  const code = readFileSync(f, 'utf8');
  const rel = f.replace(root + '/', '');
  if (/service_role|SERVICE_ROLE/.test(code)) { failed++; console.log(`  ❌ مفتاح service_role في ${rel}`); }
  if (/password_hash/i.test(code) && rel.includes('register')) { failed++; console.log(`  ❌ تعامل مباشر مع كلمة المرور في ${rel}`); }
  if (/console\.log\(/.test(code) && !rel.startsWith('scripts/')) { failed++; console.log(`  ❌ console.log متروك في ${rel}`); }
}
check('لا مفاتيح service_role في أي كود', true);
check('بلا مفاتيح حقيقية في worker.js (عناصر نائبة فقط)', (() => {
  const code = readFileSync(join(root, 'cloudflare/worker.js'), 'utf8');
  return code.includes('PASTE-YOUR-ANON-KEY-HERE') && !code.includes('eyJhbGciOi');
})());

console.log('\n━━ فحص الكود: تغطية الأدوار والمسارات ━');
const layout = readFileSync(join(root, 'app/_layout.tsx'), 'utf8');
check('الحارس يعرف super_admin', layout.includes("profile.role === 'super_admin'"));
check('الحارس يعرف المالك والفريق', layout.includes('isOwner(profile)') && layout.includes('isStaff(profile)'));
check('الحارس يعرف student', layout.includes("profile.role === 'student'"));
check('الحارس يحظر الاشتراك المنتهي/الموقوف', layout.includes("'suspended'") && layout.includes("'expired'"));
check('استبعاد مجموعات المسارات (x)', layout.includes("startsWith('(')"));

const session = readFileSync(join(root, 'src/lib/session.tsx'), 'utf8');
check('الجلسة تحمل profile', session.includes("from('profiles')"));
check('الجلسة تحمل الاشتراك عبر RPC', session.includes("rpc('get_my_subscription')"));

console.log('\n━━ فحص الكود: بوابة المطور ━');
const devLayout = readFileSync(join(root, 'app/developer/_layout.tsx'), 'utf8');
check('تخطيط المطور Stack خالص (البوابة في الصفحات لا فيه)', devLayout.includes('<Stack') && !devLayout.includes('AppInput') && !devLayout.includes('TextInput'));
const gate = readFileSync(join(root, 'src/components/DeveloperGate.tsx'), 'utf8');
check('البوابة تستخدم دخول البريد', gate.includes('loginWithEmail'));
check('حقل بريد البوابة يفتح الكيبورد تلقائياً', gate.includes('autoFocus'));
for (const p of ['index.tsx', 'connection.tsx', 'centers.tsx', 'subscriptions.tsx', 'app-info.tsx']) {
  const code = readFileSync(join(root, 'app/developer', p), 'utf8');
  if (code.includes('DeveloperGate') && code.includes("role !== 'super_admin'")) { passed++; console.log(`  ✅ ${p} محمية بالبوابة`); }
  else { failed++; console.log(`  ❌ ${p} غير محمية بالبوابة`); }
}

console.log('\n━━ فحص الكود: تأكيد البريد واستكمال التسجيل ━');
const apiCode = readFileSync(join(root, 'src/lib/api.ts'), 'utf8');
check('إشارة مطلوب تأكيد البريد', apiCode.includes('email_confirmation_required'));
check('دالة استكمال سنتر معلق', apiCode.includes('completePendingCenter'));
check('دالة استكمال طالب معلق', apiCode.includes('completePendingStudent'));
const loginForm = readFileSync(join(root, 'src/components/LoginForm.tsx'), 'utf8');
check('الدخول يستكمل التسجيل المعلق', loginForm.includes('loadPendingRegistration') && loginForm.includes('clearPendingRegistration'));
for (const p of ['app/auth/register-center.tsx', 'app/auth/register-student.tsx']) {
  const code = readFileSync(join(root, p), 'utf8');
  if (code.includes('savePendingRegistration') && code.includes('email_confirmation_required')) { passed++; console.log(`  ✅ ${p} تحفظ المعلق للتأكيد`); }
  else { failed++; console.log(`  ❌ ${p} لا تحفظ المعلق للتأكيد`); }
}

const supabase = readFileSync(join(root, 'src/lib/supabase.ts'), 'utf8');
check('أولوية كلاود فلير قبل المخزن', supabase.indexOf('fetchRemoteConfig()') < supabase.indexOf("source: 'cache'"));
check('التحقق من كلاود فلير موجود في initSupabase', supabase.includes('dbConfigFromRemote(remote)'));

console.log('\n━━ فحص الكود: باركود الحضور ━');
const qrLib = readFileSync(join(root, 'src/lib/qr.ts'), 'utf8');
check('مكتبة الباركود مشفرة ببادئة خاصة', qrLib.includes('MRC1.') && qrLib.includes('decodeStudentQr'));
check('شاشة المسح موجودة وتعزل السناتر', readFileSync(join(root, 'app/(admin)/scan.tsx'), 'utf8').includes('لا يخص سنترك'));
check('بطاقة باركود الطالب في الرئيسية', readFileSync(join(root, 'app/(student)/(tabs)/home.tsx'), 'utf8').includes('encodeStudentQr'));
check('منتقي الوقت بالأرقام', readFileSync(join(root, 'src/components/pickers.tsx'), 'utf8').includes('TimePicker'));
check('تعديل الصف متاح', readFileSync(join(root, 'src/lib/api.ts'), 'utf8').includes('updateGrade'));

console.log('\n━━ فحص الكود: الأقسام الجديدة ━');
for (const p of ['app/(admin)/exams.tsx', 'app/(admin)/inquiries.tsx', 'app/(admin)/surveys.tsx', 'app/(admin)/library.tsx', 'app/(admin)/schedule.tsx', 'app/(admin)/reports.tsx', 'app/(admin)/guide.tsx']) {
  const code = readFileSync(join(root, p), 'utf8');
  if (code.length > 2000) { passed++; console.log(`  ✅ ${p}`); }
  else { failed++; console.log(`  ❌ ${p} ناقصة`); }
}
for (const p of ['app/(student)/my-exams.tsx', 'app/(student)/my-inquiries.tsx', 'app/(student)/my-surveys.tsx', 'app/(student)/my-library.tsx', 'app/(student)/my-schedule.tsx']) {
  const code = readFileSync(join(root, p), 'utf8');
  if (code.length > 2000) { passed++; console.log(`  ✅ ${p}`); }
  else { failed++; console.log(`  ❌ ${p} ناقصة`); }
}
check('حارس المسارات يعرف شاشات الإدارة الجديدة',
  layout.includes("'exams'") && layout.includes("'reports'") && layout.includes("'inquiries'")
  && layout.includes("'teachers'") && layout.includes("'my-notifications'"));
check('زر الرجوع يعود للسابق مع بديل آمن',
  readFileSync(join(root, 'src/components/layout.tsx'), 'utf8').includes('canGoBack'));
check('حارس المسارات يعرف شاشات الطالب الجديدة',
  layout.includes("'my-inquiries'") && layout.includes("'surveys'") && layout.includes("'library'"));
check('الامتحان يدعم صح/خطأ ومقالي ومعاينة', (() => {
  const code = readFileSync(join(root, 'app/(admin)/exams.tsx'), 'utf8');
  return code.includes("'tf'") && code.includes("'essay'") && code.includes('معاينة الورقة');
})());
check('الطالب يؤدي كل الأنواع ويرى المراجعة', (() => {
  const code = readFileSync(join(root, 'app/(student)/my-exams.tsx'), 'utf8');
  return code.includes("'essay'") && code.includes('قيد مراجعة المعلم');
})());
check('التكريم باختيار من قائمة مفلترة', readFileSync(join(root, 'app/(admin)/library.tsx'), 'utf8').includes('honoreeStudentId'));
check('التقرير الشامل بأقسام الموقع', readFileSync(join(root, 'app/(admin)/student/[id].tsx'), 'utf8').includes('كشف الحساب'));
check('باركود السنتر (ترميز/فك/عرض/مسح)', (() => {
  const qr = readFileSync(join(root, 'src/lib/qr.ts'), 'utf8');
  return qr.includes('encodeCenterQr') && qr.includes('decodeCenterQr')
    && readFileSync(join(root, 'app/(admin)/(tabs)/more.tsx'), 'utf8').includes('encodeCenterQr')
    && readFileSync(join(root, 'app/auth/register-student.tsx'), 'utf8').includes('decodeCenterQr');
})());
check('تسجيل الطالب بصف ومجموعة من قوائم آمنة', (() => {
  const code = readFileSync(join(root, 'app/auth/register-student.tsx'), 'utf8');
  return code.includes('fetchSignupLists') && code.includes('gradeId') && code.includes('groupId');
})());
check('تكامل واتساب (مكتبة + شاشة + أزرار الملف)', (() => {
  const lib = readFileSync(join(root, 'src/lib/whatsapp.ts'), 'utf8');
  return lib.includes('wa.me') && lib.includes('toWaNumber')
    && readFileSync(join(root, 'app/(admin)/whatsapp.tsx'), 'utf8').includes('openWhatsApp')
    && readFileSync(join(root, 'app/(admin)/student/[id].tsx'), 'utf8').includes('sendGuardianReport');
})());
check('تواصل المطور واتساب مع السناتر', readFileSync(join(root, 'app/developer/centers.tsx'), 'utf8').includes('openWhatsApp'));
check('بث المطور (خمس قنوات + تسليم خادمي بلا حساب على الهاتف)', (() => {
  const code = readFileSync(join(root, 'app/developer/broadcast.tsx'), 'utf8');
  return code.includes('developerBroadcastNotification')
    && ['center', 'all_owners', 'all_owners_students', 'all_students', 'staff'].every((c) => code.includes(`'${c}'`))
    && code.includes('recipient_accounts');
})());
check('صندوق إشعارات المطور (لصاحب السنتر أو الموظف النشط عبر RPC)', (() => {
  const code = readFileSync(join(root, 'app/(admin)/dev-notices.tsx'), 'utf8');
  return code.includes('fetchMyDeveloperNotifications') && code.includes('markDeveloperNotificationRead') && code.includes('isStaff');
})());
check('تسجيل رمز الدفع عند الدخول', readFileSync(join(root, 'src/lib/session.tsx'), 'utf8').includes('registerPushToken'));
check('العامل يدعم التذكير المجدول والفوري', (() => {
  const code = readFileSync(join(root, 'cloudflare/worker.js'), 'utf8');
  return code.includes('scheduled') && code.includes('/push/notify') && code.includes('lessonReminders');
})());
check('حقل المدرس في نموذج المجموعة', readFileSync(join(root, 'app/(admin)/(tabs)/groups.tsx'), 'utf8').includes('teacher_name'));
check('شاشة دخول مستقلة للمدرس', (() => {
  const code = readFileSync(join(root, 'app/auth/login-teacher.tsx'), 'utf8');
  return code.includes("expectedRole=\"teacher\"") && layout.includes('isStaff(profile)');
})());
check('دخول المدرس (تسجيل + قبول دخول + تفعيل)', (() => {
  const reg = readFileSync(join(root, 'app/auth/register-teacher.tsx'), 'utf8');
  const login = readFileSync(join(root, 'src/components/LoginForm.tsx'), 'utf8');
  return reg.includes('حصراً') && !reg.includes('registerStaffAccount') && login.includes("role === 'teacher'");
})());
check('شاشة المدرسين (تفعيل/صلاحيات/إسناد)', (() => {
  const code = readFileSync(join(root, 'app/(admin)/teachers.tsx'), 'utf8');
  return code.includes('setTeacherPerms') && code.includes('assignTeacherGroups') && code.includes('setTeacherActive');
})());
check('بوابات صلاحيات المدرس على الشاشات', (() => {
  // attendance داخل (tabs) والباقي شاشات داخلية على مستوى (admin)
  const readAdminScreen = (n) => {
    for (const p of [`app/(admin)/(tabs)/${n}.tsx`, `app/(admin)/${n}.tsx`]) {
      try { return readFileSync(join(root, p), 'utf8'); } catch { /* التالي */ }
    }
    throw new Error(`screen not found: ${n}`);
  };
  const files = ['attendance', 'scan', 'exams', 'inquiries', 'surveys', 'library', 'reports', 'payments', 'announcements', 'notifications']
    .map(readAdminScreen);
  return files.every((c) => c.includes('NoAccess') && c.includes("can(profile,"));
})());
check('خريطة شاشات المدرس مطابقة للبوابات الفعلية', (() => {
  const staff = readFileSync(join(root, 'src/lib/rbac.ts'), 'utf8');
  const mapRe = /\{\s*route:\s*'([^']+)'\s*,\s*perm:\s*'([a-z_]+)'/g;
  let m; let okAll = true;
  while ((m = mapRe.exec(staff)) !== null) {
    const [, route, perm] = m;
    let code = '';
    for (const p of [`app/(admin)/(tabs)/${route}.tsx`, `app/(admin)/${route}.tsx`]) {
      try { code = readFileSync(join(root, p), 'utf8'); break; } catch { /* التالي */ }
    }
    if (!code.includes(`can(profile, '${perm}')`)) okAll = false;
  }
  return okAll;
})());
check('الطالب متعدد المجموعات (ربط + عرض)', (() => {
  const api = readFileSync(join(root, 'src/lib/api.ts'), 'utf8');
  return api.includes('fetchGroupMembers') && api.includes('addStudentToGroup')
    && readFileSync(join(root, 'app/(student)/my-schedule.tsx'), 'utf8').includes('fetchStudentGroups');
})());
check('المدرس عرض فقط للقوائم (منع افتراضي)', (() => {
  const st = readFileSync(join(root, 'app/(admin)/(tabs)/students.tsx'), 'utf8');
  const gr = readFileSync(join(root, 'app/(admin)/(tabs)/groups.tsx'), 'utf8');
  const gl = readFileSync(join(root, 'app/(admin)/grades-list.tsx'), 'utf8');
  return st.includes('canManage') && gr.includes('canManage') && gl.includes('canManage');
})());
check('اللوحة تخفي الاشتراك والإجراءات عن المدرس', (() => {
  const code = readFileSync(join(root, 'app/(admin)/(tabs)/dashboard.tsx'), 'utf8');
  return code.includes('!isTeacher && subscription') && code.includes("label=\"طالب جديد\"");
})());
check('ملف الطالب: القوائم للمالك فقط', readFileSync(join(root, 'app/(admin)/student/[id].tsx'), 'utf8').includes('isOwner(profile)'));
check('إشعارات المطور محجوبة عن المدرس', readFileSync(join(root, 'app/(admin)/dev-notices.tsx'), 'utf8').includes('NoAccess'));
check('أدوار الفريق معممة (مدير/سكرتير)', (() => {
  const staff = readFileSync(join(root, 'src/lib/rbac.ts'), 'utf8');
  return staff.includes('STAFF_ROLES') && staff.includes('manager') && staff.includes('isOwner')
    && readFileSync(join(root, 'app/(admin)/teachers.tsx'), 'utf8').includes('setTeacherPerms');
})());
check('الباقات (منتجات + طلب ترقية للمالك + اعتماد المطور)', (() => {
  const billing = readFileSync(join(root, 'src/lib/billing.ts'), 'utf8');
  return billing.includes('center_full') && billing.includes('600')
    && readFileSync(join(root, 'app/(admin)/subscription.tsx'), 'utf8').includes('createSubscriptionRequest')
    && readFileSync(join(root, 'app/developer/subscriptions.tsx'), 'utf8').includes('devFetchPendingRequests');
})());
check('سجل العمليات (كتابة + عرض)', (() => {
  const api = readFileSync(join(root, 'src/lib/api.ts'), 'utf8');
  return api.includes('logActivity') && api.includes('fetchActivityLog')
    && readFileSync(join(root, 'app/(admin)/activity.tsx'), 'utf8').includes('ACTION_LABEL');
})());
check('تفاصيل السنتر للمطور', readFileSync(join(root, 'app/developer/center-detail.tsx'), 'utf8').includes('roleLabel'));
check('حول التطبيق بمميزات كاملة', readFileSync(join(root, 'app/about.tsx'), 'utf8').includes('APP_FEATURES'));
check('منع تطابق رقمي الطالب والولي', (() => {
  const a = readFileSync(join(root, 'app/auth/register-student.tsx'), 'utf8');
  const b = readFileSync(join(root, 'app/(admin)/(tabs)/students.tsx'), 'utf8');
  return a.includes('يجب أن يختلف عن رقم هاتفك') && b.includes('يجب أن يختلف عن رقم الطالب');
})());
check('بث الإشعارات (إرسال + شاشة طالب + شارة)', (() => {
  const admin = readFileSync(join(root, 'app/(admin)/notifications.tsx'), 'utf8');
  const mine = readFileSync(join(root, 'app/(student)/my-notifications.tsx'), 'utf8');
  return admin.includes('sendNotification') && admin.includes('reads')
    && mine.includes('markNotificationRead')
    && readFileSync(join(root, 'app/(student)/(tabs)/home.tsx'), 'utf8').includes('unreadCount');
})());
check('مكتبة النسخ الاحتياطي موجودة', readFileSync(join(root, 'src/lib/backup.ts'), 'utf8').includes('exportCenterBackup'));
check('مكتبة التقارير PDF موجودة', readFileSync(join(root, 'src/lib/report.ts'), 'utf8').includes('shareReportPdf'));
check('الحضور لا ينشئ حصة قبل الحفظ', readFileSync(join(root, 'app/(admin)/(tabs)/attendance.tsx'), 'utf8').includes('findSession'));
check('المسح اليدوي يعمل بلا إذن كاميرا', (() => {
  const code = readFileSync(join(root, 'app/(admin)/scan.tsx'), 'utf8');
  const manualIdx = code.indexOf(") : mode === 'manual' ? (");
  const deniedIdx = code.indexOf(") : !permission.granted ? (");
  return manualIdx > 0 && deniedIdx > 0 && manualIdx < deniedIdx;
})());
check('الدخول يطابق نوع المعلق مع الشاشة', readFileSync(join(root, 'src/components/LoginForm.tsx'), 'utf8').includes('kindOk'));
check('الموقوف يُطرد والحارس يوجّه المطور', layout.includes('is_active === false') && layout.includes("root !== 'about'"));
check('زر نسخ رسالة الخطأ', readFileSync(join(root, 'src/components/pickers.tsx'), 'utf8').includes('expo-clipboard'));
check('الكاميرا بلا أطفال (طبقة عائمة منفصلة)', (() => {
  const code = readFileSync(join(root, 'app/(admin)/scan.tsx'), 'utf8');
  const open = code.indexOf('<CameraView');
  const closed = code.indexOf('/>', open);
  const overlay = code.indexOf('طبقة الإطار فوق الكاميرا');
  return open > 0 && closed > open && overlay > closed;
})());
check('لوحة المطور: كل Hooks قبل البوابة', (() => {
  const code = readFileSync(join(root, 'app/developer/index.tsx'), 'utf8');
  return code.indexOf('const load = useCallback') < code.indexOf("!== 'super_admin') return");
})());

const updater = readFileSync(join(root, 'src/lib/updater.ts'), 'utf8');
check('تخطي التحديث في وضع التطوير', updater.includes('__DEV__'));
check('تخطي التحديث في Expo Go', updater.includes("appOwnership === 'expo'"));
check('التحديث أندرويد فقط', updater.includes("Platform.OS !== 'android'"));
check('تثبيت APK بالنوع الصحيح', updater.includes('application/vnd.android.package-archive'));

console.log('\n━━ فحص الكود: بنية التنقل الجديدة (رجوع حقيقي بلا وميض) ━');
check('(admin) تخطيط Stack أب (تبويبات + شاشات داخلية)',
  readFileSync(join(root, 'app/(admin)/_layout.tsx'), 'utf8').includes('<Stack'));
check('(admin) الرجوع بتلاشٍ داكن (fade + contentStyle داكن)', (() => {
  const c = readFileSync(join(root, 'app/(admin)/_layout.tsx'), 'utf8');
  return c.includes("animation: 'fade'") && c.includes('contentStyle');
})());
check('(student) تخطيط Stack أب مثل الإدارة', (() => {
  const c = readFileSync(join(root, 'app/(student)/_layout.tsx'), 'utf8');
  return c.includes('<Stack') && c.includes("animation: 'fade'") && c.includes('contentStyle');
})());
check('(admin) تبويبات داخل (tabs) مع backBehavior=history',
  readFileSync(join(root, 'app/(admin)/(tabs)/_layout.tsx'), 'utf8').includes('backBehavior="history"'));
check('(student) تبويبات داخل (tabs) مع backBehavior=history',
  readFileSync(join(root, 'app/(student)/(tabs)/_layout.tsx'), 'utf8').includes('backBehavior="history"'));
check('شاشات التبويبات الخمس للمسئول موجودة في (tabs)', (() => {
  for (const n of ['dashboard', 'students', 'groups', 'attendance', 'more']) {
    try { readFileSync(join(root, `app/(admin)/(tabs)/${n}.tsx`)); } catch { return false; }
  }
  return true;
})());
check('شاشات التبويبات الخمس للطالب موجودة في (tabs)', (() => {
  for (const n of ['home', 'my-attendance', 'my-grades', 'my-payments', 'profile']) {
    try { readFileSync(join(root, `app/(student)/(tabs)/${n}.tsx`)); } catch { return false; }
  }
  return true;
})());

console.log('\n━━ فحص الكود: الوضع الفاتح والداكن ━');
check('مزوّد الثيم موجود ويحفظ الاختيار', (() => {
  const c = readFileSync(join(root, 'src/lib/themeContext.tsx'), 'utf8');
  return c.includes('ThemeProvider') && c.includes('AsyncStorage') && c.includes('mrcenter.theme.mode');
})());
check('لوحتا الألوان (داكن + فاتح) في الثيم', (() => {
  const c = readFileSync(join(root, 'src/theme.ts'), 'utf8');
  return c.includes('const LIGHT: Palette') && c.includes('const DARK: Palette') && c.includes('themedStyles');
})());
check('كل الأنماط تتبع الثيم (لا StyleSheet.create عارية على مستوى الوحدة)', (() => {
  const files = [...walk(join(root, 'app')), ...walk(join(root, 'src'))];
  return files.every((f) => !readFileSync(f, 'utf8').includes('const styles = StyleSheet.create('));
})());
check('شريط الحالة يتبع الوضع في GradientScreen', (() => {
  const c = readFileSync(join(root, 'src/components/layout.tsx'), 'utf8');
  return c.includes("barStyle={colors.isDark ? 'light-content' : 'dark-content'}");
})());
check('لا أثر بنفسجي قديم في الكود', (() => {
  const files = [...walk(join(root, 'app')), ...walk(join(root, 'src'))];
  return files.every((f) => !readFileSync(f, 'utf8').includes('124,58,237'));
})());
check('زر تبديل الوضع في الترحيب', readFileSync(join(root, 'app/index.tsx'), 'utf8').includes('ThemeIconButton'));
check('تبديل الوضع في قائمة المزيد', readFileSync(join(root, 'app/(admin)/(tabs)/more.tsx'), 'utf8').includes('ThemeToggleRow'));
check('تبديل الوضع في حساب الطالب', readFileSync(join(root, 'app/(student)/(tabs)/profile.tsx'), 'utf8').includes('ThemeToggleRow'));
check('تبديل الوضع في صفحة حول التطبيق', readFileSync(join(root, 'app/about.tsx'), 'utf8').includes('ThemeToggleRow'));
check('app.json يدعم الوضعين (automatic)', JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo.userInterfaceStyle === 'automatic');

console.log('\n━━ فحص الكود: تحسينات هذه الجلسة ━');
check('بث المطور بقنوات خادمية موثقة بدل تجميع محلي للسجل القديم', (() => {
  const api = readFileSync(join(root, 'src/lib/api.ts'), 'utf8');
  const types = readFileSync(join(root, 'src/lib/types.ts'), 'utf8');
  return api.includes("rpc('developer_broadcast_notification'")
    && api.includes('fetchMyDeveloperNotifications') && api.includes('markDeveloperNotificationRead')
    && types.includes('DeveloperBroadcastChannel') && types.includes('DeveloperBroadcastResult');
})());
check('النوافذ المنبثقة الحديثة (DetailSheet) مستخدمة في الإعلانات', (() => {
  const sheet = readFileSync(join(root, 'src/components/DetailSheet.tsx'), 'utf8');
  const admin = readFileSync(join(root, 'app/(admin)/announcements.tsx'), 'utf8');
  const student = readFileSync(join(root, 'app/(student)/(tabs)/home.tsx'), 'utf8');
  return sheet.includes('DetailSheet') && admin.includes('DetailSheet') && student.includes('AnnouncementCard');
})());
check('سجل معاملات المالك (تاريخ الاشتراكات) في صفحة الباقات', (() => {
  const api = readFileSync(join(root, 'src/lib/api.ts'), 'utf8');
  const ui = readFileSync(join(root, 'app/(admin)/subscription.tsx'), 'utf8');
  return api.includes('fetchSubscriptionsHistory') && ui.includes('سجل المعاملات مع المطور');
})());
check('رسالة حد الإرسال معربة وموسعة', (() => {
  const c = readFileSync(join(root, 'src/lib/utils.ts'), 'utf8');
  return c.includes('over_request_rate_limit') && c.includes('once every 60 seconds') && c.includes('429');
})());
check('الإصدار مرفوع 1.1.0 مع versionCode 2', (() => {
  const j = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
  return j.expo.version === '1.1.0' && j.expo.android.versionCode === 2;
})());

console.log(`\n━━━ النتيجة: ${passed} فحص ناجح / ${failed} فاشل ━━━\n`);
process.exit(failed ? 1 : 0);
