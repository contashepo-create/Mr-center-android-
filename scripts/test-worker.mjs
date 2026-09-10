#!/usr/bin/env node
// ============================================================================
// اختبارات عامل كلاود فلير (cloudflare/worker.js) — محاكاة كاملة للطلبات
// التشغيل: node scripts/test-worker.mjs
// ============================================================================

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = (await import(pathToFileURL(join(root, 'cloudflare/worker.js')).href)).default;

let passed = 0; let failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}

const BASE = 'https://mr-center-config.example.workers.dev';

console.log('\n━━ مسارات العامل ━');

// /config — الاستعلام الرئيسي
{
  const res = await worker.fetch(new Request(`${BASE}/config`));
  const body = await res.json();
  ok('GET /config يرد 200', res.status === 200);
  ok('يحتوي database', !!body.database);
  ok('يحتوي update', !!body.update);
  ok('database بها url و anon_key', typeof body.database.url === 'string' && typeof body.database.anon_key === 'string');
  ok('update به latest_version و version_code', typeof body.update.latest_version === 'string' && typeof body.update.version_code === 'number');
  ok('update به apk_url', typeof body.update.apk_url === 'string' && body.update.apk_url.startsWith('https://'));
  ok('force_update قيمة منطقية', typeof body.update.force_update === 'boolean');
  ok('ok=true', body.ok === true);
  ok('ترويسة CORS تسمح بالجميع', res.headers.get('Access-Control-Allow-Origin') === '*');
  ok('Cache-Control قصير (≤ 60 ثانية)', (res.headers.get('Cache-Control') ?? '').includes('max-age=60'));
  ok('المحتوى JSON', (res.headers.get('Content-Type') ?? '').includes('application/json'));
}

// / الجذر يعادل /config
{
  const res = await worker.fetch(new Request(`${BASE}/`));
  const body = await res.json();
  ok('GET / يعيد نفس بنية الإعدادات', res.status === 200 && !!body.database && !!body.update);
}

// /version
{
  const res = await worker.fetch(new Request(`${BASE}/version`));
  const body = await res.json();
  ok('GET /version يحتوي update فقط', res.status === 200 && !!body.update && !body.database);
}

// /database
{
  const res = await worker.fetch(new Request(`${BASE}/database`));
  const body = await res.json();
  ok('GET /database يحتوي database فقط', res.status === 200 && !!body.database && !body.update);
}

// مسار غير موجود
{
  const res = await worker.fetch(new Request(`${BASE}/nope`));
  ok('مسار مجهول يرد 404', res.status === 404);
  const body = await res.json();
  ok('الرد خطأ منظم', body.ok === false);
}

// OPTIONS (CORS preflight)
{
  const res = await worker.fetch(new Request(`${BASE}/config`, { method: 'OPTIONS' }));
  ok('OPTIONS يرد 204', res.status === 204);
  ok('يسمح بـ GET', (res.headers.get('Access-Control-Allow-Methods') ?? '').includes('GET'));
}

// /push/notify — الحماية بالسيكرت قبل أي إرسال
{
  const noSecret = await worker.fetch(new Request(`${BASE}/push/notify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokens: [], title: 'x' }),
  }), {});
  ok('الدفع بلا سيكرت مرفوض 403', noSecret.status === 403);
  const badBody = await worker.fetch(new Request(`${BASE}/push/notify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-push-secret': 'wrong' },
    body: 'not-json{{{',
  }), { PUSH_SECRET: 'right' });
  const badJson = await badBody.json();
  ok('سيكرت خاطئ مرفوض', badBody.status === 403 && badJson.ok === false);
  const emptyTokens = await worker.fetch(new Request(`${BASE}/push/notify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-push-secret': 'right' },
    body: JSON.stringify({ tokens: ['junk'], title: '' }),
  }), { PUSH_SECRET: 'right' });
  ok('توكنات/عنوان فارغ مرفوض 400', emptyTokens.status === 400);
}

// اختبار منطقي: انسجام أرقام الإصدار في العامل مع app.json
{
  const { readFileSync } = await import('node:fs');
  const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
  const res = await worker.fetch(new Request(`${BASE}/config`));
  const { update } = await res.json();
  const appVersion = appJson.expo.version;
  const appCode = appJson.expo.android.versionCode;
  ok(
    `إصدار العامل (${update.latest_version}/${update.version_code}) متوافق مع التطبيق (${appVersion}/${appCode})`,
    update.latest_version === appVersion && update.version_code === appCode,
  );
}

console.log(`\n━━━ النتيجة: ${passed} ناجح / ${failed} فاشل ━━━\n`);
process.exit(failed ? 1 : 0);
