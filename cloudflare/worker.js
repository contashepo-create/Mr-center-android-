// ============================================================================
//  ☁️ Mr Center — عامل Cloudflare المركزي (Config + Update Server)
// ----------------------------------------------------------------------------
//  هذا العامل هو «الوسيط» الوحيد الذي يسأله التطبيق عند كل تشغيل:
//    ١) من أين يقرأ مفاتيح قاعدة البيانات؟  ← يجيب بها فوراً
//    ٢) هل يوجد إصدار أحدث من التطبيق؟        ← يجيب برقم الإصدار ورابط الـ APK
//
//  ✦ لتغيير قاعدة البيانات لجميع العملاء (Supabase أو أي منصة أخرى):
//      عدّل قسم DATABASE أدناه فقط ثم Deploy — كل الأجهزة تتبع تلقائياً.
//  ✦ لإصدار تحديث جديد للتطبيق:
//      ارفع ملف APK الجديد (مثلاً على Cloudflare R2) ثم عدّل قسم UPDATE
//      (ارفع latest_version و version_code وضع رابط APK الجديد) ثم Deploy.
//
//  ⚠️ هذا العامل لا يخزن أي بيانات مستخدمين — هو مجرد «لافتة إرشاد» تقرأها
//     الأجهزة. أما بيانات الطلاب والسناتر فهي في قاعدة البيانات محمية بـ RLS.
// ============================================================================

// ┌─────────────────────────────────────────────────────────────┐
// │  1) إعدادات قاعدة البيانات — عدّل هنا عند التبديل لأي منصة   │
// └─────────────────────────────────────────────────────────────┘
const DATABASE = {
  provider: "supabase",                       // اسم المنصة (للتسجيل فقط)
  url: "https://YOUR-PROJECT.supabase.co",    // ← رابط قاعدة البيانات (Project URL)
  anon_key: "PASTE-YOUR-ANON-KEY-HERE",       // ← مفتاح الوصول العام (anon public key)
};

// ┌─────────────────────────────────────────────────────────────┐
// │  2) إعدادات تحديث التطبيق — عدّل هنا عند إصدار نسخة جديدة    │
// └─────────────────────────────────────────────────────────────┘
const UPDATE = {
  latest_version: "1.0.0",                    // ← رقم الإصدار الأحدث (مثل 1.0.1)
  version_code: 1,                            // ← رقم البناء الأحدث (عدد صحيح يزيد دائماً: 1, 2, 3...)
  apk_url: "https://YOUR-R2-PUBLIC-URL/mr-center.apk",  // ← رابط تحميل ملف APK الأحدث
  force_update: false,                        // true = إجبار المستخدم على التحديث قبل الاستمرار
  changelog: "تحسينات في الأداء وإصلاحات عامة",   // ← ما الجديد في هذا الإصدار (يظهر للمستخدم)
};

// ============================================================================
//  لا تعدّل ما تحت هذا الخط إلا إذا كنت تعرف ماذا تفعل
// ============================================================================

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  // كاش قصير جداً: سرعة عالية مع وصول التغييرات خلال دقيقة واحدة على الأكثر
  "Cache-Control": "public, max-age=60",
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), { status, headers: HEADERS });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: HEADERS });
    }

    // الاستعلام الرئيسي — كل ما يحتاجه التطبيق في رد واحد
    // GET /config  (و / للتيسير)
    if (url.pathname === "/config" || url.pathname === "/") {
      return jsonResponse({
        ok: true,
        timestamp: new Date().toISOString(),
        database: DATABASE,
        update: UPDATE,
      });
    }

    // استعلام التحديث منفصلاً إن احتجته لاحقاً — GET /version
    if (url.pathname === "/version") {
      return jsonResponse({ ok: true, update: UPDATE });
    }

    // استعلام قاعدة البيانات منفصلاً — GET /database
    if (url.pathname === "/database") {
      return jsonResponse({ ok: true, database: DATABASE });
    }

    return jsonResponse({ ok: false, error: "not_found" }, 404);
  },
};
