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
  // ⚠️ لا تضع مفاتيح حقيقية هنا أبداً — املأها في نسختك عند النشر فقط
  // (القيم الحقيقية تعيش في لوحة Cloudflare للعامل المنشور، لا في الريبو)
  url: "https://YOUR-PROJECT.supabase.co",    // ← رابط قاعدة البيانات (Project URL)
  anon_key: "PASTE-YOUR-ANON-KEY-HERE",       // ← مفتاح الوصول العام (anon public key)
};

// ┌─────────────────────────────────────────────────────────────┐
// │  2) إعدادات تحديث التطبيق — عدّل هنا عند إصدار نسخة جديدة    │
// └─────────────────────────────────────────────────────────────┘
const UPDATE = {
  latest_version: "1.1.0",                    // ← رقم الإصدار الأحدث (مثل 1.0.1)
  version_code: 2,                            // ← رقم البناء الأحدث (عدد صحيح يزيد دائماً: 1, 2, 3...)
  apk_url: "https://YOUR-R2-PUBLIC-URL/mr-center.apk",  // ← رابط تحميل ملف APK الأحدث
  force_update: false,                        // true = إجبار المستخدم على التحديث قبل الاستمرار
  changelog: "وضع فاتح/داكن كامل + إصلاح زر الرجوع والتنقل + شاشة إعلانات ونوافذ حديثة + إصلاحات الصلاحيات والبث",   // ← ما الجديد في هذا الإصدار (يظهر للمستخدم)
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

/**
 * إرسال دفعات Expo Push — يحتاج env:
 *   SUPABASE_URL + SUPABASE_SERVICE_KEY (قراءة متجاوزة لـ RLS من الخادم فقط)
 *   PUSH_SECRET (مفتاح مشترك لمسار /push/notify — لا تضعه في التطبيق)
 */
async function expoPush(messages) {
  if (!messages.length) return { sent: 0 };
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });
  return { sent: messages.length, status: res.status };
}

function sbHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

/** تذكير الحصص: مجموعات يومها اليوم وتبدأ خلال ~75 دقيقة ← دفع لطلابها */
async function lessonReminders(env) {
  const now = new Date();
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  // الأوقات مخزنة بتوقيت السنتر المحلي — اضبط TZ_OFFSET_MINUTES (مصر: 120 شتاءً / 180 صيفاً)
  const offset = Number(env.TZ_OFFSET_MINUTES || 120);
  const localNow = new Date(now.getTime() + offset * 60000);
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const todayKey = dayNames[localNow.getUTCDay()];
  const nowMin = localNow.getUTCHours() * 60 + localNow.getUTCMinutes();
  const H = sbHeaders(env);
  const base = env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1";

  const gRes = await fetch(`${base}/groups?select=id,center_id,name,start_time,days&days=cs.{${todayKey}}`, { headers: H });
  if (!gRes.ok) return { error: "groups_fetch_failed" };
  const groups = await gRes.json();
  const upcoming = groups.filter((g) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec((g.start_time || "").trim());
    if (!m) return false;
    const start = Number(m[1]) * 60 + Number(m[2]);
    const diff = start - nowMin;
    return diff >= 50 && diff <= 80; // نافذة التذكير (قبل الحصة بساعة بتوقيت السنتر المحلي)
  });
  if (!upcoming.length) return { sent: 0, reason: "no_upcoming" };

  let messages = [];
  for (const g of upcoming) {
    const sRes = await fetch(
      `${base}/students?select=id&center_id=eq.${g.center_id}&group_id=eq.${g.id}&status=eq.active&limit=1000`,
      { headers: H },
    );
    const jRes = await fetch(
      `${base}/student_groups?select=student_id&center_id=eq.${g.center_id}&group_id=eq.${g.id}&limit=5000`,
      { headers: H },
    );
    if (!sRes.ok) continue;
    const students = await sRes.json();
    const extra = jRes.ok ? await jRes.json() : [];
    const ids = [...new Set([
      ...students.map((s) => s.id),
      ...extra.map((r) => r.student_id),
    ])];
    if (!ids.length) continue;
    const pRes = await fetch(
      `${base}/profiles?select=push_token&center_id=eq.${g.center_id}&student_id=in.(${ids.join(",")})&limit=1000`,
      { headers: H },
    );
    if (!pRes.ok) continue;
    const tokens = [...new Set((await pRes.json()).map((p) => p.push_token).filter((t) => t && t.startsWith("ExponentPushToken")))];

    messages.push(...tokens.map((to) => ({
      to,
      sound: "default",
      title: `حصتك بعد ساعة: ${g.name}`,
      body: "جهّز نفسك — حصتك ستبدأ خلال ساعة تقريباً",
      data: { kind: "lesson_reminder", group_id: g.id },
    })));
  }
  return expoPush(messages);
}

export default {
  // Cron: فعّله من لوحة Cloudflare (Triggers ← Cron: كل 15 دقيقة) لتذكير الحصص
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      lessonReminders(env).catch((e) => ({ error: String(e && e.message || e) })),
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: HEADERS });
    }

    // إرسال فوري (يُستدعى من Webhook قاعدة البيانات عند إشعار جديد):
    // POST /push/notify  { "tokens": [...], "title": "...", "body": "..." }
    // مع ترويسة  x-push-secret: نفس PUSH_SECRET
    if (url.pathname === "/push/notify" && request.method === "POST") {
      if (!env.PUSH_SECRET || request.headers.get("x-push-secret") !== env.PUSH_SECRET) {
        return jsonResponse({ ok: false, error: "forbidden" }, 403);
      }
      try {
        const { tokens, title, body } = await request.json();
        const clean = [...new Set(Array.isArray(tokens) ? tokens : [])]
          .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken")).slice(0, 500);
        if (!clean.length || !title) return jsonResponse({ ok: false, error: "bad_request" }, 400);
        const out = await expoPush(clean.map((to) => ({
          to, sound: "default", title: String(title).slice(0, 60), body: String(body || "").slice(0, 180),
          data: { kind: "broadcast" },
        })));
        return jsonResponse({ ok: true, ...out });
      } catch {
        return jsonResponse({ ok: false, error: "bad_request" }, 400);
      }
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
