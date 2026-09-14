// ============================================================
// جلسة واحدة لكل حساب: تسجيل الدخول من جهاز ثانٍ يُخرج الأول تلقائياً.
// - عند الدخول: يبطل جلسات الحساب الأخرى ثم يطالب بجلسة جديدة.
// - دورياً: يتحقق الجهاز أنه لا يزال صاحب الجلسة؛ إن طُرد يخرج فوراً.
// لا يحجب المستخدم أبداً عند فشل مؤقت أو قبل تطبيق الترحيل.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from './supabase';
import { getDeviceId } from './visitors';
import { uuid } from './utils';

const KEY = 'mrcenter.session.key';
// لا نحوّل انقطاعاً عابراً في الشبكة إلى طلب RPC كل 30 ثانية يطرد المستخدم خطأً.
// يبقى فحص الجلسة الأمني فور عودة أول رد ناجح، بينما الخطأ المؤقت لا يطرد المستخدم.
const TRANSIENT_FAILURE_COOLDOWN_MS = 2 * 60 * 1000;
let retrySessionCheckAfter = 0;

function deferSessionCheck(): void {
  retrySessionCheckAfter = Date.now() + TRANSIENT_FAILURE_COOLDOWN_MS;
}

async function readKey(): Promise<string> {
  try { return (await AsyncStorage.getItem(KEY)) ?? ''; } catch { return ''; }
}

async function writeKey(key: string): Promise<void> {
  try { await AsyncStorage.setItem(KEY, key); } catch { /* تجاهل */ }
}

/** يسجل جهاز الطالب في سجل جهاز سنتره فقط، بلا تأثير على حجب الأجهزة العام. */
export async function registerMyStudentDevice(): Promise<void> {
  try {
    const device = await getDeviceId();
    if (device) await getSupabase().rpc('register_current_student_device', { p_device: device });
  } catch {
    // توافق آمن مع قواعد بيانات لم يطبّق عليها الترحيل بعد أو اتصال مؤقت.
  }
}

/**
 * يُستدعى بعد تسجيل الدخول مباشرة:
 * يبطل أي جلسة أخرى لنفس الحساب (يبقى هذا الجهاز فقط) ثم يسجل جلسة جديدة.
 */
export async function claimMySession(): Promise<void> {
  try {
    const sb = getSupabase();
    try { await sb.auth.signOut({ scope: 'others' }); } catch { /* تجاهل */ }
    // مفتاح ثابت لكل جهاز (يُنشأ مرة واحدة) — حتى لا تتغير الجلسة مع كل استدعاء
    let key = await readKey();
    if (!key) {
      key = uuid();
      await writeKey(key);
    }
    await sb.rpc('claim_session', { p_key: key });
    await registerMyStudentDevice();
  } catch {
    // لا نمنع الدخول إن لم يُطبَّق الترحيل بعد أو فشل الاتصال مؤقتاً
  }
}

/**
 * هل هذا الجهاز لا يزال صاحب الجلسة الحالية؟
 * يُرجع true عند أي فشل مؤقت (حتى لا يُحجب المستخدم بلا داعٍ).
 */
export async function isMySessionCurrent(): Promise<boolean> {
  if (Date.now() < retrySessionCheckAfter) return true;
  try {
    const key = await readKey();
    const sb = getSupabase();
    if (key) {
      const { data, error } = await sb.rpc('check_session', { p_key: key });
      if (error) {
        deferSessionCheck();
        return true;
      }
      retrySessionCheckAfter = 0;
      if (data === false) return false;
    }
    // فحص إضافي لحجب جهاز الطالب المسجل لهذا السنتر فقط. إن لم يطبّق
    // الترحيل بعد نتجاهل الخطأ كي لا نحجب مستخدماً بلا داعٍ.
    const device = await getDeviceId();
    if (device) {
      const access = await sb.rpc('check_current_student_device', { p_device: device });
      if (access.error) {
        deferSessionCheck();
        return true;
      }
      if (access.data === false) return false;
    }
    return true;
  } catch {
    deferSessionCheck();
    return true;
  }
}
