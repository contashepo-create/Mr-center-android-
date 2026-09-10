#!/usr/bin/env node
// ============================================================================
// تدقيق تطابق استدعاءات RPC في التطبيق مع تعريفاتها في مخطط القاعدة:
// يستخرج أسماء الدوال ووسائط p_* من src/lib/api.ts ويتحقق أن كل دالة
// معرّفة في supabase/android_multitenant_schema.sql بنفس الوسائط.
// يكشف كسر التوافق (مثل مناداة وسيط غير موجود في القاعدة المنشورة).
// التشغيل: node scripts/audit-rpc.mjs
// ============================================================================

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = readFileSync(join(root, 'src/lib/api.ts'), 'utf8');
const sql = readFileSync(join(root, 'supabase/android_multitenant_schema.sql'), 'utf8');

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
  // تعريف الدالة في المخطط (آخر تعريف هو الفعّال مع OR REPLACE/DROP)
  // ملاحظة: [^)]* حتى لا تمتد المطابقة لسطور GRANT التي تليها TO لا RETURNS
  const defRe = new RegExp(`FUNCTION public\\.${fn}\\s*\\(([^)]*)\\)\\s*(RETURNS|LANGUAGE)`, 'g');
  let dm; let lastParams = null;
  while ((dm = defRe.exec(sql)) !== null) lastParams = dm[1];
  check(`الدالة ${fn} معرّفة في المخطط`, lastParams !== null, 'شغّل/حدّث ملف SQL');
  if (lastParams === null) continue;
  for (const a of uniqArgs) {
    check(`  ${fn}: الوسيط ${a} موجود في التعريف`, lastParams.includes(a), 'القاعدة المنشورة أقدم من التطبيق — أعد تشغيل المخطط');
  }
}

console.log(`\n━━━ النتيجة: ${passed} ناجح / ${failed} فاشل ━━━\n`);
process.exit(failed ? 1 : 0);
