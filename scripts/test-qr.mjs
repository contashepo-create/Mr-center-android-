#!/usr/bin/env node
// ============================================================================
// اختبارات باركود الطالب (src/lib/qr.ts) — ترميز/فك + رفض الدخيل والمعبث
// التشغيل: node scripts/test-qr.mjs
// ============================================================================

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0; let failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}

const tmp = mkdtempSync(join(tmpdir(), 'qr-test-'));
try {
  execSync(
    `npx tsc src/lib/qr.ts --outDir ${tmp} --module esnext --target es2020 --moduleResolution bundler --skipLibCheck`,
    { cwd: root, stdio: 'pipe' },
  );
  const q = await import(pathToFileURL(join(tmp, 'qr.js')).href);

  const cid = '11111111-2222-4333-8555-666666666666';
  const sid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const day = '2026-09-10';

  console.log('\n━━ ترميز وفك الباركود ━');
  const code = q.encodeStudentQr(cid, sid, day);
  ok('الترميز يبدأ ببادئة التطبيق', code.startsWith('MRC1.'));
  ok('الترميز لا يحوي معرفات مكشوفة', !code.includes(cid) && !code.includes(sid));
  const back = q.decodeStudentQr(code);
  ok('فك صحيح يعيد السنتر والطالب واليوم', back?.centerId === cid && back?.studentId === sid && back?.day === day);
  ok('باركود اليوم طازج', q.isQrFresh(back, day) === true);
  const arCode = q.encodeCenterQr(cid, 'MRC7', 'سنتر المستقبل للفيزياء');
  const arBack = q.decodeCenterQr(arCode);
  ok('باركود السنتر عربي يُفك بالاسم', arBack?.code === 'MRC7' && arBack?.name === 'سنتر المستقبل للفيزياء');
  ok('باركود الأمس مرفوض اليوم', q.isQrFresh(q.decodeStudentQr(q.encodeStudentQr(cid, sid, '2026-09-09')), day) === false);

  console.log('\n━━ رفض الدخيل والمعبث ━');
  ok('يرفض نصاً عادياً', q.decodeStudentQr('hello world') === null);
  ok('يرفض رابطاً', q.decodeStudentQr('https://example.com/x') === null);
  ok('يرفض باركود QR خارجي', q.decodeStudentQr('WIFI:S:home;T:WPA;P:123;;') === null);
  ok('يرفض الفارغ', q.decodeStudentQr('') === null);
  ok('يرفض بادئة بلا محتوى', q.decodeStudentQr('MRC1.') === null);
  const tampered = code.slice(0, -2) + (code.endsWith('AA') ? 'BB' : 'AA');
  ok('يرفض المحتوى المعبث به', q.decodeStudentQr(tampered) === null);
  const other = q.encodeStudentQr('00000000-0000-4000-8000-000000000000', sid, day);
  ok('سنتر مختلف يعطي ترميزاً مختلفاً', other !== code);
  const backOther = q.decodeStudentQr(other);
  ok('ويُفك بمعرف سنتره الصحيح', backOther?.centerId === '00000000-0000-4000-8000-000000000000');
  ok('فك متسامح مع المسافات حول الرمز', q.decodeStudentQr(`  ${code}\n`)?.studentId === sid);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n━━━ النتيجة: ${passed} ناجح / ${failed} فاشل ━━━\n`);
process.exit(failed ? 1 : 0);
