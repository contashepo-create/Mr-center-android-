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

console.log('\n━━ eas.json ━');
const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'));
check('ملف preview يبني APK', eas.build?.preview?.android?.buildType === 'apk');
check('ملف production يبني AAB', eas.build?.production?.android?.buildType === 'app-bundle');

console.log('\n━━ package.json ━');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const dep of ['expo', 'expo-router', '@supabase/supabase-js', 'expo-file-system', 'expo-intent-launcher', 'expo-application', 'expo-secure-store']) {
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

console.log('\n━━ فحص الكود: تغطية الأدوار والمسارات ━');
const layout = readFileSync(join(root, 'app/_layout.tsx'), 'utf8');
check('الحارس يعرف super_admin', layout.includes("profile.role === 'super_admin'"));
check('الحارس يعرف center_admin', layout.includes("profile.role === 'center_admin'"));
check('الحارس يعرف student', layout.includes("profile.role === 'student'"));
check('الحارس يحظر الاشتراك المنتهي/الموقوف', layout.includes("'suspended'") && layout.includes("'expired'"));
check('استبعاد مجموعات المسارات (x)', layout.includes("startsWith('(')"));

const session = readFileSync(join(root, 'src/lib/session.tsx'), 'utf8');
check('الجلسة تحمل profile', session.includes("from('profiles')"));
check('الجلسة تحمل الاشتراك عبر RPC', session.includes("rpc('get_my_subscription')"));

const supabase = readFileSync(join(root, 'src/lib/supabase.ts'), 'utf8');
check('أولوية كلاود فلير قبل المخزن', supabase.indexOf('fetchRemoteConfig()') < supabase.indexOf("source: 'cache'"));
check('التحقق من كلاود فلير موجود في initSupabase', supabase.includes('dbConfigFromRemote(remote)'));

const updater = readFileSync(join(root, 'src/lib/updater.ts'), 'utf8');
check('تخطي التحديث في وضع التطوير', updater.includes('__DEV__'));
check('تخطي التحديث في Expo Go', updater.includes("appOwnership === 'expo'"));
check('التحديث أندرويد فقط', updater.includes("Platform.OS !== 'android'"));
check('تثبيت APK بالنوع الصحيح', updater.includes('application/vnd.android.package-archive'));

console.log(`\n━━━ النتيجة: ${passed} فحص ناجح / ${failed} فاشل ━━━\n`);
process.exit(failed ? 1 : 0);
