#!/usr/bin/env node
// ============================================================================
// تدقيق تطابق استدعاءات RPC في التطبيق مع تعريفاتها في مخطط القاعدة:
// يستخرج أسماء الدوال ووسائط p_* من src/lib/api.ts ويتحقق أن كل دالة
// معرّفة في supabase/android_multitenant_schema.sql بنفس الوسائط.
// يكشف كسر التوافق (مثل مناداة وسيط غير موجود في القاعدة المنشورة).
// التشغيل: node scripts/audit-rpc.mjs
// ============================================================================

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = readFileSync(join(root, 'src/lib/api.ts'), 'utf8');

// نقرأ المخطط الأساسي ثم كل ترحيلات supabase/*.sql بترتيب التاريخ (بادئة الاسم)
// ونلحقها ببعضها؛ فالدوال التي تُعرَّف فقط في ترحيل لاحق (مثل بث المطور) تُعتبر
// معرَّفة أيضاً، ومع أخذ آخر تعريف يفوز عند إعادة تعريف دالة في ترحيل أحدث.
const supabaseDir = join(root, 'supabase');
const migrationFiles = readdirSync(supabaseDir)
  .filter((f) => f.endsWith('.sql') && f !== 'android_multitenant_schema.sql')
  .sort();
const sql = [
  readFileSync(join(supabaseDir, 'android_multitenant_schema.sql'), 'utf8'),
  ...migrationFiles.map((f) => readFileSync(join(supabaseDir, f), 'utf8')),
].join('\n');

let passed = 0; let failed = 0;
function check(name, cond, hint = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${hint ? ` — ${hint}` : ''}`); }
}

console.log('\n━━ تطابق RPC: التطبيق ← القاعدة ━');
// sb.rpc('name', { p_a, p_b }) — نلتقط الاسم ومفاتيح الكائن
const callRe = /\.rpc\(\s*'([a-z_]+)'\s*(,\s*\{([\s\S]*?)\})?\)/g;
let m;
const seen = new Set();
while ((m = callRe.exec(api)) !== null) {
  const fn = m[1];
  if (seen.has(fn)) continue;
  seen.add(fn);
  const argBlock = m[3] ?? '';
  const args = [...argBlock.matchAll(/p_[a-z_0-9]+/g)].map((x) => x[0]);
  const uniqArgs = [...new Set(args)];
  // تعريف الدالة في المخطط — قد تُعاد كتابتها بمعاملات مختلفة عبر الترحيلات
  // (تحميل زائد باسم واحد في PostgreSQL)، لذا نجمع كل تعريفاتها ونقبل أي
  // تعريف واحد يحوي كل وسائط الاستدعاء بدل افتراض أن آخرها هو الوحيد الصالح.
  // ملاحظة: [^)]* حتى لا تمتد المطابقة لسطور GRANT التي تليها TO لا RETURNS
  const defRe = new RegExp(`FUNCTION public\\.${fn}\\s*\\(([^)]*)\\)\\s*(RETURNS|LANGUAGE)`, 'g');
  let dm; const overloads = [];
  while ((dm = defRe.exec(sql)) !== null) overloads.push(dm[1]);
  check(`الدالة ${fn} معرّفة في المخطط`, overloads.length > 0, 'شغّل/حدّث ملف SQL');
  if (overloads.length === 0) continue;
  const matching = overloads.find((params) => uniqArgs.every((a) => params.includes(a)));
  for (const a of uniqArgs) {
    check(`  ${fn}: الوسيط ${a} موجود في التعريف`, matching !== undefined && matching.includes(a), 'القاعدة المنشورة أقدم من التطبيق — أعد تشغيل المخطط');
  }
}

console.log(`\n━━━ النتيجة: ${passed} ناجح / ${failed} فاشل ━━━\n`);
process.exit(failed ? 1 : 0);
