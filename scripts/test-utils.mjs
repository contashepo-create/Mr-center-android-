#!/usr/bin/env node
// ============================================================================
// اختبارات المنطق النقي (src/lib/utils.ts) — يعمل بلا أي تبعيات React Native
// التشغيل: node scripts/test-utils.mjs  (يُجمّع utils.ts مؤقتاً ثم يختبره)
// ============================================================================

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0; let failed = 0;

function ok(name, cond) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}
function eq(name, a, b) { ok(`${name}  [${JSON.stringify(a)} == ${JSON.stringify(b)}]`, a === b); }

// 1) تجميع utils.ts
const tmp = mkdtempSync(join(tmpdir(), 'utils-test-'));
try {
  execSync(
    `npx tsc src/lib/utils.ts --outDir ${tmp} --module esnext --target es2020 --moduleResolution bundler --skipLibCheck`,
    { cwd: root, stdio: 'pipe' },
  );
  const u = await import(pathToFileURL(join(tmp, 'utils.js')).href);

  console.log('\n━━ uuid ━');
  ok('uuid يطابق صيغة UUID v4', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(u.uuid()));
  ok('uuid متفرد', u.uuid() !== u.uuid());

  console.log('\n━━ normalizePhone ━');
  eq('أرقام عربية → لاتينية', u.normalizePhone('٠١٠١٢٣٤٥٦٧'), '0101234567');
  eq('إزالة المسافات والشرطات', u.normalizePhone('010 1234-567'), '0101234567');
  eq('إزالة الأقواس', u.normalizePhone('(010) 1234567'), '0101234567');
  eq('الإبقاء على + الدولية', u.normalizePhone('+20101234567'), '+20101234567');
  eq('إزالة الحروف', u.normalizePhone('010abc1234'), '0101234');

  console.log('\n━━ normalizeCenterCode / isValidCenterCode ━');
  eq('حروف كبيرة وإزالة مسافات', u.normalizeCenterCode(' mr c '), 'MRC');
  ok('رفض كود من حرفين (أقل من 3)', !u.isValidCenterCode('MR'));
  ok('كود إنجليزي صالح MRC7', u.isValidCenterCode('MRC7'));
  ok('كود أرقام فقط 12345', u.isValidCenterCode('12345'));
  ok('كود عربي «مستر»', u.isValidCenterCode('مستر'));
  ok('رفض الرموز', !u.isValidCenterCode('MR@1'));
  ok('رفض المسافات بعد التطبيع', !u.isValidCenterCode('M R1'));
  ok('رفض أقصر من 3', !u.isValidCenterCode('AB'));
  ok('رفض أطول من 8', !u.isValidCenterCode('ABCDEFGHI'));
  ok('كود عربي-إنجليزي مختلط', u.isValidCenterCode('مر12AB'));

  console.log('\n━━ isValidEmail / isValidPhone ━');
  ok('بريد صحيح', u.isValidEmail('a@b.com'));
  ok('رفض بريد بلا @', !u.isValidEmail('ab.com'));
  ok('رفض بريد بمسافة', !u.isValidEmail('a b@c.com'));
  ok('هاتف مصري صحيح', u.isValidPhone('01012345678'));
  ok('رفض هاتف قصير', !u.isValidPhone('123'));
  ok('هاتف دولي بـ +', u.isValidPhone('+201012345678'));

  console.log('\n━━ compareVersions ━');
  ok('1.0.10 > 1.0.2', u.compareVersions('1.0.10', '1.0.2') > 0);
  ok('1.0.2 < 1.0.10', u.compareVersions('1.0.2', '1.0.10') < 0);
  ok('متساويان', u.compareVersions('1.0.0', '1.0.0') === 0);
  ok('1.1 > 1.0.9', u.compareVersions('1.1', '1.0.9') > 0);
  ok('2.0 > 1.9.9', u.compareVersions('2.0', '1.9.9') > 0);
  ok('مقارنة مع مقطع ناقص', u.compareVersions('1.0.0', '1.0') === 0);

  console.log('\n━━ isValidSupabaseUrl ━');
  ok('رابط https صحيح', u.isValidSupabaseUrl('https://abc.supabase.co'));
  ok('رفض http', !u.isValidSupabaseUrl('http://abc.supabase.co'));
  ok('رفض نص عادي', !u.isValidSupabaseUrl('abc'));
  ok('رفض فارغ', !u.isValidSupabaseUrl(''));

  console.log('\n━━ dbConfigFromRemote ━');
  const good = u.dbConfigFromRemote({ database: { url: 'https://x.supabase.co', anon_key: 'K'.repeat(24) } });
  ok('استخراج صحيح من رد كلاود فلير', !!good && good.url === 'https://x.supabase.co');
  eq('رفض رد بلا قاعدة', u.dbConfigFromRemote({}), null);
  eq('رفض رابط http', u.dbConfigFromRemote({ database: { url: 'http://x.co', anon_key: 'k'.repeat(24) } }), null);
  eq('رفض مفتاح فارغ', u.dbConfigFromRemote({ database: { url: 'https://x.co', anon_key: '' } }), null);
  eq('رفض null', u.dbConfigFromRemote(null), null);

  console.log('\n━━ arabicMonth / formatDays / arabicError ━');
  eq('شهر 1 = يناير', u.arabicMonth(1), 'يناير');
  eq('شهر 12 = ديسمبر', u.arabicMonth(12), 'ديسمبر');
  ok('formatDays عربي', u.formatDays(['sat', 'mon']).includes('السبت'));
  ok('arabicError: invalid login', u.arabicError(new Error('Invalid login credentials')).includes('غير صحيحة'));
  ok('arabicError: كود مكرر', u.arabicError(new Error('center_code_taken')).includes('غير متاح'));
  ok('arabicError: هاتف مكرر', u.arabicError(new Error('phone_taken')).includes('مستخدم'));
  ok('arabicError: انقطاع شبكة', u.arabicError(new Error('Failed to fetch')).includes('الاتصال'));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n━━━ النتيجة: ${passed} ناجح / ${failed} فاشل ━━━\n`);
process.exit(failed ? 1 : 0);
