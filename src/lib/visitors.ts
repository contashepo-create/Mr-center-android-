// ============================================================
// معرّف الجهاز: يُستخدم لحماية الدخول وربط جلسة الطالب بجهازه فقط،
// ولتسجيل زيارة مجهولة واحدة لكل جهاز (تماماً كما في نسخة الويب)
// وحجب الأجهزة المسيئة من لوحة المطور.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from './supabase';
import { uuid } from './utils';

const DEVICE_KEY = 'mrcenter.device.id';
let cachedId: string | null = null;

/** معرّف الجهاز المجهول (يُنشأ مرة واحدة ويُحفظ محلياً) — يستخدم أيضاً لحماية الدخول. */
export async function getDeviceId(): Promise<string> {
  if (cachedId) return cachedId;
  try {
    let id = await AsyncStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uuid();
      await AsyncStorage.setItem(DEVICE_KEY, id);
    }
    cachedId = id;
    return id;
  } catch {
    return '';
  }
}

/** تسجيل زيارة الجهاز مرة واحدة (يُستدعى عند إقلاع التطبيق بغض النظر عن تسجيل الدخول). */
export async function trackVisit(): Promise<void> {
  try {
    const id = await getDeviceId();
    if (!id) return;
    await getSupabase().rpc('track_site_visit', { p_device_id: id });
  } catch {
    // تجاهل أي فشل — لا يعطّل إقلاع التطبيق أبداً
  }
}

/** هل هذا الجهاز محجوب من المطور؟ (يُستخدم لمنع الأجهزة المسيئة من استخدام التطبيق) */
export async function isDeviceBlocked(): Promise<boolean> {
  try {
    const id = await getDeviceId();
    if (!id) return false;
    const { data, error } = await getSupabase().rpc('is_device_blocked', { p_device_id: id });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
