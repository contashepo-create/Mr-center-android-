#!/usr/bin/env node
// ============================================================================
// تدقيق أمني آلي لمخطط قاعدة البيانات (supabase/android_multitenant_schema.sql)
// يتحقق من ثوابت الأمان الحرجة ويرفض أي تراجع مستقبلي:
//   • العزل بـ center_id موجود لكل الجداول المشتركة
//   • لا سياسات واسعة USING (true)
//   • قائمة legacy_admins البيضاء (وليس «بلا ملف = أدمن»)
//   • حماية كود السنتر وحالة الإيقاف
//   • قيود الفرادة (الكود/البريد/الهاتف)
//   • صلاحيات تنفيذ دوال RPC
//   • سلامة بنية الملف (معاملة one-shot وعلامات الدوال)
// التشغيل: node scripts/audit-sql.mjs
// ============================================================================

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = readFileSync(join(root, 'supabase/android_multitenant_schema.sql'), 'utf8');

let passed = 0; let failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}
const has = (s) => sql.includes(s);
const re = (r) => r.test(sql);

console.log('\n━━ ١) سلامة البنية ━');
check('معاملة واحدة (BEGIN ... COMMIT)', /^\s*BEGIN;/m.test(sql) && /\bCOMMIT;/m.test(sql));
check('علامات $$ متوازنة', (sql.match(/\$\$/g) || []).length % 2 === 0);
check('لا يحوي DROP TABLE نهائي', !/DROP\s+TABLE\s+/i.test(sql));
check('لا يحوي DELETE جماعي بلا WHERE', !/DELETE\s+FROM\s+public\.\w+\s*;/i.test(sql));

console.log('\n━━ ٢) الجداول الأساسية لتعدد السناتر ━');
for (const t of ['centers', 'profiles', 'center_subscriptions', 'app_config']) {
  check(`جدول ${t} يُنشأ مع RLS`,
    has(`CREATE TABLE IF NOT EXISTS public.${t}`) && has(`ENABLE ROW LEVEL SECURITY`) && re(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`)));
}

console.log('\n━━ ٣) العزل بـ center_id في الجداول المشتركة ━');
const shared = ['grades', 'groups', 'students', 'dues', 'payments', 'sessions', 'attendance', 'announcements', 'manual_grades'];
for (const t of shared) {
  check(`${t}: عمود center_id + RLS`,
    re(new RegExp(`ALTER TABLE public\\.${t}\\s+ADD COLUMN IF NOT EXISTS center_id`)) &&
    re(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`)));
}

console.log('\n━━ ٤) منع السياسات الواسعة الخطرة ━');
check('لا توجد سياسة USING (true) إطلاقاً', !/USING\s*\(\s*true\s*\)/i.test(sql));
check('لا توجد WITH CHECK (true) إطلاقاً', !/WITH\s+CHECK\s*\(\s*true\s*\)/i.test(sql));
for (const t of shared) {
  check(`إزالة السياسة القديمة الواسعة عن ${t}`,
    has(`DROP POLICY IF EXISTS "authenticated full access" ON public.${t}`));
}

console.log('\n━━ ٥) عزل الطالب: قراءة نفسه فقط ━');
for (const [tbl, pol] of [
  ['students', 'students_self_read'],
  ['dues', 'dues_self_read'],
  ['payments', 'payments_self_read'],
  ['attendance', 'attendance_self_read'],
  ['manual_grades', 'manual_grades_self_read'],
]) {
  check(`${tbl}: سياسة ${pol} بـ my_student_id()`,
    has(`CREATE POLICY "${pol}" ON public.${tbl} FOR SELECT`) &&
    re(new RegExp(`"${pol}"[\\s\\S]{0,300}my_student_id\\(\\)`)));
}
check('members يقرأون بيانات سنترهم فقط (groups/grades/sessions)',
  ['groups', 'grades', 'sessions', 'announcements'].every((t) =>
    re(new RegExp(`"${t}_member_read"[\\s\\S]{0,300}my_center_id\\(\\)`))));

console.log('\n━━ ٦) القائمة البيضاء للنظام القديم (سد ثغرة «بلا ملف = أدمن») ━');
check('بذر legacy_admins من حسابات ما قبل الترحيل',
  has(`INSERT INTO public.app_config (key, value)`) && has(`'legacy_admins'`) && has(`FROM auth.users`));
check('is_legacy_admin يفحص العضوية في القائمة البيضاء',
  re(/is_legacy_admin\(\)[\s\S]{0,400}legacy_admins[\s\S]{0,200}auth\.uid\(\)/));
check('is_legacy_admin لا يعتمد على «بلا ملف شخصي»',
  !re(/is_legacy_admin\(\)[\s\S]{0,500}NOT EXISTS \(SELECT 1 FROM public\.profiles/));

console.log('\n━━ ٧) حماية ثوابت السنتر (سد ثغرة إعادة التفعيل الذاتي) ━');
check('مشغل guard_center_code موجود ومفعّل', has('CREATE TRIGGER trg_guard_center_code'));
check('حماية الكود (code_is_fixed)', has('RAISE EXCEPTION \'code_is_fixed\''));
check('حماية حالة الإيقاف (status_managed_by_developer)', has('RAISE EXCEPTION \'status_managed_by_developer\''));
check('حماية هوية الملف الشخصي (identity_protected)', has('RAISE EXCEPTION \'identity_protected\''));

console.log('\n━━ ٨) قيود الفرادة العالمية ━');
check('كود السنتر فريد (upper)', has('CREATE UNIQUE INDEX IF NOT EXISTS centers_code_unique'));
check('البريد فريد على مستوى النظام', has('profiles_email_unique'));
check('الهاتف فريد على مستوى النظام', has('profiles_phone_unique'));

console.log('\n━━ ٩) صلاحيات دوال RPC ━');
check('lookup_center_by_code متاح للزائر (قبل التسجيل)',
  has('GRANT EXECUTE ON FUNCTION public.lookup_center_by_code(TEXT) TO anon, authenticated'));
check('check_registration_availability متاح للزائر',
  has('GRANT EXECUTE ON FUNCTION public.check_registration_availability(TEXT, TEXT) TO anon, authenticated'));
check('complete_center_registration للمصادقين فقط',
  has('GRANT EXECUTE ON FUNCTION public.complete_center_registration(TEXT, TEXT, TEXT, TEXT) TO authenticated')
  && !has('complete_center_registration(TEXT, TEXT, TEXT, TEXT) TO anon,'));
check('complete_student_registration للمصادقين فقط',
  has('GRANT EXECUTE ON FUNCTION public.complete_student_registration(UUID, TEXT, TEXT, TEXT) TO authenticated')
  && !has('complete_student_registration(UUID, TEXT, TEXT, TEXT) TO anon,'));
check('get_my_subscription للمصادقين فقط',
  has('GRANT EXECUTE ON FUNCTION public.get_my_subscription() TO authenticated'));

console.log('\n━━ ١٠) منطق التسجيل الحساس ━');
check('رسالة الكود المكرر (center_code_taken)', has('EXCEPTION \'center_code_taken\''));
check('رسالة الهاتف المكرر (phone_taken)', has('EXCEPTION \'phone_taken\''));
check('رفض السنتر الموقوف عند تسجيل الطالب', has('EXCEPTION \'center_suspended\''));
check('إنشاء اشتراك تجريبي تلقائي للسنتر الجديد', has('اشتراك تجريبي'));
check('حظر تكرار التسجيل لنفس الحساب (already_registered)', has('EXCEPTION \'already_registered\''));

console.log('\n━━ ١١) app_config — قراءة عامة مقيدة ━');
check('قراءة عامة لصف public_config فقط',
  has(`CREATE POLICY "app_config_public_read" ON public.app_config FOR SELECT TO anon, authenticated`)
  && has(`USING (key = 'public_config')`));
check('الكتابة للمطور فقط', has('"app_config_super_admin"'));

console.log('\n━━ ١٢) دوال العزل الأساسية موجودة ━');
for (const fn of ['my_role()', 'my_center_id()', 'my_student_id()', 'is_legacy_admin()', 'center_is_active(UUID)', 'admin_owns_center(UUID)', 'get_my_subscription()', 'guard_profile_identity()', 'sync_group_student_count()']) {
  const base = fn.split('(')[0];
  check(`دالة ${base}`, re(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${base}\\s*\\(`)));
}

console.log(`\n━━━ النتيجة: ${passed} فحص ناجح / ${failed} فاشل ━━━\n`);
process.exit(failed ? 1 : 0);
