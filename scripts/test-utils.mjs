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

// 1) تجميع utils.ts و billing.ts (منطق نقي بلا تبعيات RN)
const tmp = mkdtempSync(join(tmpdir(), 'utils-test-'));
try {
  execSync(
    `npx tsc src/lib/utils.ts src/lib/billing.ts --outDir ${tmp} --module esnext --target es2020 --moduleResolution bundler --skipLibCheck`,
    { cwd: root, stdio: 'pipe' },
  );
  const u = await import(pathToFileURL(join(tmp, 'utils.js')).href);
  const billing = await import(pathToFileURL(join(tmp, 'billing.js')).href);

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
  ok('arabicError: مطلوب تأكيد البريد', u.arabicError(new Error('email_confirmation_required')).includes('أكّد بريدك'));
  ok('arabicError: بريد غير مؤكد', u.arabicError(new Error('Email not confirmed')).includes('رابط التأكيد'));

  console.log('\n━━ الوقت والتاريخ ━');
  eq('24h إلى دقائق', u.timeToMinutes('16:30'), 990);
  eq('صيغة عربية م → دقائق', u.timeToMinutes('4:30 م'), 990);
  eq('صيغة عربية ص → دقائق', u.timeToMinutes('9:05 ص'), 545);
  eq('12 ص = منتصف الليل', u.timeToMinutes('12:00 ص'), 0);
  eq('12 م = الظهر', u.timeToMinutes('12:00 م'), 720);
  eq('وقت فارغ', u.timeToMinutes(''), null);
  eq('وقت خاطئ', u.timeToMinutes('25:00'), null);
  eq('دقائق إلى 24h', u.minutesToTime24(990), '16:30');
  eq('عرض عربي', u.formatTimeAr('16:30'), '4:30 م');
  eq('عرض صباحي', u.formatTimeAr('09:05'), '9:05 ص');
  eq('إزاحة تاريخ للأمام', u.shiftDateIso('2026-09-10', 1), '2026-09-11');
  eq('إزاحة تاريخ للخلف لشهر سابق', u.shiftDateIso('2026-09-01', -1), '2026-08-31');
  eq('تسعير شهري', u.billingLabel('monthly'), 'شهري');
  eq('تسعير بالحصة', u.billingLabel('per_session'), 'بالحصة');
  eq('تسعير افتراضي', u.billingLabel(null), 'شهري');

  console.log('\n━━ تعارض المواعيد ━');
  const gg = [
    { id: '1', name: 'أ', days: ['sat', 'mon'], start_time: '16:00', end_time: '18:00' },
    { id: '2', name: 'ب', days: ['mon'], start_time: '17:00', end_time: '19:00' },
    { id: '3', name: 'ج', days: ['tue'], start_time: '17:00', end_time: '19:00' },
    { id: '4', name: 'د', days: ['mon'], start_time: '19:00', end_time: '20:00' },
  ];
  const conflicts = u.findGroupConflicts(gg);
  ok('يكشف تعارضاً واحداً فقط', conflicts.length === 1 && conflicts[0].aName === 'أ' && conflicts[0].bName === 'ب');
  ok('يتجاهل الأوقات المتجاورة بلا تداخل', u.findGroupConflicts([gg[1], gg[3]]).length === 0);
  ok('عربي: مغلق التسجيل', u.arabicError(new Error('registration_closed')).includes('مغلق'));
  ok('عربي: تكرار المحاولة', u.arabicError(new Error('already_attempted')).includes('من قبل'));

  console.log('\n━━ التحقق من الامتحانات ━');
  ok('يرفض بلا أسئلة', u.validateExamDraft([]) !== null);
  ok('يرفض سؤالاً بلا نص', u.validateExamDraft([{ q: '', type: 'mcq', choices: ['a', 'b', 'c', 'd'], marks: 1 }]) !== null);
  ok('يرفض اختيارات ناقصة', u.validateExamDraft([{ q: 'س؟', type: 'mcq', choices: ['a', '', 'c', 'd'], marks: 1 }]) !== null);
  ok('يقبل مقالياً بلا اختيارات', u.validateExamDraft([{ q: 'علل', type: 'essay', choices: [], marks: 2 }]) === null);
  ok('يقبل صح/خطأ', u.validateExamDraft([{ q: 'س؟', type: 'tf', choices: ['صح', 'خطأ'], marks: 1 }]) === null);
  eq('مجموع الدرجات', u.examMarksTotal([{ marks: 2 }, { marks: 3 }]), 5);

  console.log('\n━━ أنواع الأسئلة الثمانية والتطبيع والخلط ━');
  eq('ثمانية تسميات للأنواع', Object.keys(u.EXAM_TYPE_LABEL).length, 8);
  eq('تسمية أكمل', u.EXAM_TYPE_LABEL.complete, 'أكمل');
  eq('تسمية وصل', u.EXAM_TYPE_LABEL.match, 'وصل');
  ok('مقالي/صحّح/قصير يدوية', u.isManualExamType('essay') && u.isManualExamType('correct') && u.isManualExamType('short'));
  ok('البقية تلقائية', !u.isManualExamType('mcq') && !u.isManualExamType('multi') && !u.isManualExamType('tf') && !u.isManualExamType('complete') && !u.isManualExamType('match'));
  ok('النوع الغائب = تلقائي', !u.isManualExamType(undefined) && !u.isManualExamType(null));

  // التطبيع: التشكيل والهمزات والتطويل والمسافات والترقيم
  eq('تطبيع موحّد للتشكيل والهمزات', u.normalizeAnswerText('الأَمْثِلَةُ'), u.normalizeAnswerText('الامثله'));
  eq('إزالة التطويل', u.normalizeAnswerText('جميـــل'), 'جميل');
  eq('توحيد الألف والياء', u.normalizeAnswerText('إسلام آمن ى'), u.normalizeAnswerText('اسلام امن ي'));
  eq('تجاهل الترقيم والمسافات', u.normalizeAnswerText('الدرس  الأول!'), u.normalizeAnswerText('الدرس الاول'));
  eq('لا يفرق في حالة اللاتيني', u.normalizeAnswerText('HTML'), u.normalizeAnswerText('html'));

  // الخلط الثابت: نفس البذرة = نفس الترتيب، وبعثرة حقيقية
  const s1 = u.seededShuffle(6, 'exam1:0');
  const s2 = u.seededShuffle(6, 'exam1:0');
  const s3 = u.seededShuffle(6, 'exam1:1');
  ok('نفس البذرة = نفس الترتيب', s1.join(',') === s2.join(','));
  ok('بذرة مختلفة غالباً ترتيب مختلف', JSON.stringify(s1) !== JSON.stringify(s3) || s1.length === 6);
  ok('الخلط تبديل كامل للعناصر', [...s1].sort((a, b) => a - b).join(',') === '0,1,2,3,4,5');
  ok('خلط عنصر واحد = [0]', u.seededShuffle(1, 'x')[0] === 0);

  // تحقق مسودة الأنواع الجديدة
  ok('متعدد بلا صحيحة يُرفض', u.validateExamDraft([{ q: 'س؟', type: 'multi', choices: ['a', 'b', 'c', 'd'], marks: 1, corrects: [] }]) !== null);
  ok('متعدد بصحيحة يُقبل', u.validateExamDraft([{ q: 'س؟', type: 'multi', choices: ['a', 'b', 'c', 'd'], marks: 1, corrects: [0, 2] }]) === null);
  ok('أكمل بلا نموذج يُرفض', u.validateExamDraft([{ q: 'أكمل: ...', type: 'complete', choices: [], marks: 1, answer: '' }]) !== null);
  ok('أكمل بنموذج يُقبل', u.validateExamDraft([{ q: 'أكمل: ...', type: 'complete', choices: [], marks: 1, answer: 'الجواب' }]) === null);
  ok('وصل بزوج واحد يُرفض', u.validateExamDraft([{ q: 'صل', type: 'match', choices: [], marks: 2, pairs: [{ l: 'أ', r: '1' }] }]) !== null);
  ok('وصل بنصف زوج يُرفض', u.validateExamDraft([{ q: 'صل', type: 'match', choices: [], marks: 2, pairs: [{ l: 'أ', r: '' }, { l: 'ب', r: '2' }] }]) !== null);
  ok('وصل بزوجين كاملين يُقبل', u.validateExamDraft([{ q: 'صل', type: 'match', choices: [], marks: 2, pairs: [{ l: 'أ', r: '1' }, { l: 'ب', r: '2' }] }]) === null);
  ok('صحّح بلا نموذج يُقبل (يدوي)', u.validateExamDraft([{ q: 'صحّح', type: 'correct', choices: [], marks: 2, answer: '' }]) === null);
  ok('قصير يُقبل', u.validateExamDraft([{ q: 'اختصار', type: 'short', choices: [], marks: 1 }]) === null);

  console.log('\n━━ نطاقات البريد والروابط ━');
  ok('gmail مقبول', u.isValidSignupEmail('user@gmail.com') === true);
  ok('outlook مقبول', u.isValidSignupEmail('User@Outlook.COM') === true);
  ok('مؤقت مرفوض', u.isValidSignupEmail('user@mailinator.com') === false);
  ok('نطاق غريب مرفوض', u.isValidSignupEmail('user@xyz123 temp.org') === false);
  ok('صيغة خاطئة مرفوضة', u.isValidSignupEmail('not-an-email') === false);
  ok('رابط https صالح', u.isValidHttpUrl('https://example.com/file.pdf') === true);
  ok('نص عادي مرفوض كرابط', u.isValidHttpUrl('hello world') === false);
  ok('كشف تطابق الرقمين بصيغ مختلفة', u.normalizePhone('010 1234-5678') === u.normalizePhone('01012345678'));
  ok('عربي: تطابق رقم الولي', u.arabicError(new Error('same_guardian_phone')).includes('يختلف'));

  console.log('\n━━ الباقات والحدود (مطابقة المواصفة) ━');
  eq('تجريبية 14 يوماً', billing.TRIAL_DAYS, 14);
  eq('شامل شهري 600', billing.priceFor('center_full', 1), 600);
  eq('شامل سنوي 6500', billing.priceFor('center_full', 12), 6500);
  eq('شامل سنتان 12000', billing.priceFor('center_full', 24), 12000);
  eq('متوسط شهري 400', billing.priceFor('center_medium', 1), 400);
  eq('متوسط سنوي 4500', billing.priceFor('center_medium', 12), 4500);
  eq('متوسط سنتان 8500', billing.priceFor('center_medium', 24), 8500);
  eq('خصوصي شهري 300', billing.priceFor('solo_teacher', 1), 300);
  eq('خصوصي سنوي 3000', billing.priceFor('solo_teacher', 12), 3000);
  eq('خصوصي سنتان 5000', billing.priceFor('solo_teacher', 24), 5000);
  {
    const full = billing.limitsFor('center', 'center_full');
    ok('حدود الشاملة (1/2/4)', full.managers === 1 && full.secretaries === 2 && full.teachers === 4 && full.maxStudents === null);
    const med = billing.limitsFor('center', 'center_medium');
    ok('حدود المتوسطة (1/1/2)', med.managers === 1 && med.secretaries === 1 && med.teachers === 2);
    const solo = billing.limitsFor('solo', 'solo_teacher');
    ok('حدود المنفرد (0/0/0 + 200 طالب)', solo.managers === 0 && solo.teachers === 0 && solo.maxStudents === 200);
    const trial = billing.limitsFor('center', 'trial');
    ok('التجريبية بمزايا كاملة', trial.teachers === 4 && trial.maxStudents === null);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n━━━ النتيجة: ${passed} ناجح / ${failed} فاشل ━━━\n`);
process.exit(failed ? 1 : 0);
