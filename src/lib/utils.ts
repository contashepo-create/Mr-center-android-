// ============================================================
// أدوات مساعدة: مولد معرفات، تطبيع الهاتف/الكود، تواريخ، رسائل الأخطاء
// ============================================================

/** توليد UUID نصي (متوافق مع المعرفات النصية في مخطط الموقع) */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** تطبيع رقم الهاتف: إزالة المسافات والرموز، تحويل الأرقام العربية للاتينية */
export function normalizePhone(input: string): string {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  let out = '';
  for (const ch of input.trim()) {
    const idx = arabicDigits.indexOf(ch);
    if (idx >= 0) { out += String(idx); continue; }
    if (/[0-9+]/.test(ch)) out += ch;
  }
  return out;
}

/** تطبيع كود السنتر: حروف كبيرة إنجليزية أو عربية وأرقام فقط، بدون مسافات */
export function normalizeCenterCode(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

/** التحقق من صيغة كود السنتر: 3-8 حروف/أرقام (إنجليزي أو عربي) */
export function isValidCenterCode(code: string): boolean {
  return /^[A-Z0-9\u0621-\u064A]{3,8}$/.test(code);
}

/** التحقق من صيغة البريد الإلكتروني */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** التحقق من رقم هاتف مصري/دولي (8 إلى 15 رقم) */
export function isValidPhone(phone: string): boolean {
  const p = normalizePhone(phone).replace(/^\+/, '');
  return /^\d{8,15}$/.test(p);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export function arabicMonth(month: number): string {
  return AR_MONTHS[(month - 1 + 12) % 12];
}

const AR_DAYS: Record<string, string> = {
  sat: 'السبت', sun: 'الأحد', mon: 'الاثنين', tue: 'الثلاثاء',
  wed: 'الأربعاء', thu: 'الخميس', fri: 'الجمعة',
};

export const WEEK_DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;

export function arabicDay(key: string): string {
  return AR_DAYS[key] ?? key;
}

export function formatDays(days: string[]): string {
  if (!days || days.length === 0) return '—';
  return days.map(arabicDay).join(' · ');
}

/** تنسيق تاريخ ISO إلى "١٢ مارس ٢٠٢٦" بصيغة عربية بسيطة */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getDate()} ${arabicMonth(d.getMonth() + 1)} ${d.getFullYear()}`;
}

/** تنسيق المبلغ بالجنيه */
export function formatMoney(amount: number | null | undefined): string {
  const n = amount ?? 0;
  return `${n.toLocaleString('en-EG', { maximumFractionDigits: 2 })} ج.م`;
}

/** التحقق من صيغة رابط قاعدة البيانات */
export function isValidSupabaseUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' && u.hostname.length > 3;
  } catch {
    return false;
  }
}

/** استخراج مفاتيح قاعدة البيانات من ردّ كلاود فلير */
export function dbConfigFromRemote(remote: unknown): { url: string; anonKey: string } | null {
  const db = (remote as { database?: { url?: string; anon_key?: string } } | null)?.database;
  if (!db) return null;
  const url = (db.url ?? '').trim();
  const key = (db.anon_key ?? '').trim();
  if (url && key && isValidSupabaseUrl(url)) return { url, anonKey: key };
  return null;
}

/** مقارنة أرقام الإصدارات النصية: "1.0.10" أكبر من "1.0.2" */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

/** تحويل رسائل أخطاء Supabase إلى رسائل عربية مفهومة */
export function arabicError(err: unknown): string {
  const msg = String((err as any)?.message ?? err ?? '').toLowerCase();
  if (!msg) return 'حدث خطأ غير متوقع، حاول مرة أخرى';
  if (msg.includes('invalid login')) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
  if (msg.includes('email not confirmed')) return 'يجب تأكيد البريد الإلكتروني أولاً';
  if (msg.includes('user already registered') || msg.includes('already been registered'))
    return 'هذا البريد الإلكتروني مستخدم من قبل — سجّل دخولك أو استخدم بريداً آخر';
  if (msg.includes('password') && msg.includes('at least'))
    return 'كلمة المرور قصيرة — يجب ألا تقل عن 6 أحرف';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch'))
    return 'تعذر الاتصال بالخادم — تحقق من الإنترنت وحاول مجدداً';
  if (msg.includes('center_code_taken') || msg.includes('centers_code') || msg.includes('code_taken'))
    return 'هذا الكود غير متاح — اختر كوداً آخر';
  if (msg.includes('phone_taken') || msg.includes('profiles_phone'))
    return 'رقم الهاتف مستخدم من قبل — لا يمكن تكراره';
  if (msg.includes('email_taken'))
    return 'البريد الإلكتروني مستخدم من قبل';
  if (msg.includes('center_not_found') || msg.includes('invalid_center_code'))
    return 'كود السنتر غير صحيح — تأكد من الكود مع إدارة السنتر';
  if (msg.includes('center_suspended')) return 'هذا السنتر موقوف حالياً — تواصل مع إدارة التطبيق';
  if (msg.includes('row-level security')) return 'ليس لديك صلاحية لتنفيذ هذا الإجراء';
  if (msg.includes('duplicate key')) return 'البيانات مسجلة من قبل ولا يمكن تكرارها';
  return (err as any)?.message ?? 'حدث خطأ غير متوقع، حاول مرة أخرى';
}
