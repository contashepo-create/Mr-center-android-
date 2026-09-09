// ============================================================
// خدمة إعدادات الاتصال — كلاود فلير هو الوسيط المركزي
//
// ترتيب أولوية مفاتيح قاعدة البيانات عند تشغيل التطبيق:
//  1) مفاتيح يدوية أدخلها المطور على هذا الجهاز (للتجربة)
//  2) استعلام كلاود فلير (المصدر المركزي — يتغير لكل العملاء فوراً)
//  3) آخر إعدادات ناجحة مخزنة مؤقتاً (عند انقطاع الإنترنت عن كلاود فلير)
//  4) الإعدادات المدمجة داخل التطبيق (app.json → extra) كملاذ أخير
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const KEY_OVERRIDE = 'mrcenter.cfg.override';
const KEY_CACHE = 'mrcenter.cfg.cache';
const KEY_REMOTE = 'mrcenter.remote.config';

// ------------------------------------------------------------
// الأنواع
// ------------------------------------------------------------

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  source: 'override' | 'cloudflare' | 'cache' | 'builtin';
}

/** رد كلاود فلير: قاعدة البيانات + معلومات التحديث */
export interface RemoteConfig {
  database?: {
    provider?: string;
    url?: string;
    anon_key?: string;
  };
  update?: {
    latest_version?: string;
    version_code?: number;
    apk_url?: string;
    force_update?: boolean;
    changelog?: string;
  };
}

/** رابط عامل كلاود فلير — الثابت الوحيد في التطبيق (يُضبط من app.json extra.configUrl) */
export function getConfigUrl(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
  const url = (extra.configUrl ?? '').trim();
  // تجاهل قيمة العنصر النائب إن لم يضبطها المطور بعد
  if (!url || url.includes('YOUR-SUBDOMAIN')) return '';
  return url;
}

// ------------------------------------------------------------
// التحقق والإعدادات المدمجة
// ------------------------------------------------------------

export { isValidSupabaseUrl, dbConfigFromRemote } from './utils';
import { isValidSupabaseUrl } from './utils';

export function builtinConfig(): SupabaseConfig | null {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
  const url = (extra.supabaseUrl ?? '').trim();
  const anonKey = (extra.supabaseAnonKey ?? '').trim();
  if (url && anonKey && isValidSupabaseUrl(url)) {
    return { url, anonKey, source: 'builtin' };
  }
  return null;
}

// ------------------------------------------------------------
// التخزين المحلي
// ------------------------------------------------------------

export async function loadSavedConfig(): Promise<SupabaseConfig | null> {
  try {
    const override = await AsyncStorage.getItem(KEY_OVERRIDE);
    if (override) {
      const parsed = JSON.parse(override) as SupabaseConfig;
      if (parsed?.url && parsed?.anonKey) return { ...parsed, source: 'override' };
    }
    const cache = await AsyncStorage.getItem(KEY_CACHE);
    if (cache) {
      const parsed = JSON.parse(cache) as SupabaseConfig;
      if (parsed?.url && parsed?.anonKey) return { ...parsed, source: 'cache' };
    }
  } catch {
    // تجاهل
  }
  return null;
}

export const resolveConfig = loadSavedConfig;

export async function saveOverrideConfig(url: string, anonKey: string): Promise<void> {
  const cfg: SupabaseConfig = { url: url.trim(), anonKey: anonKey.trim(), source: 'override' };
  await AsyncStorage.setItem(KEY_OVERRIDE, JSON.stringify(cfg));
}

export async function cacheConfig(url: string, anonKey: string): Promise<void> {
  const cfg: SupabaseConfig = { url: url.trim(), anonKey: anonKey.trim(), source: 'cache' };
  await AsyncStorage.setItem(KEY_CACHE, JSON.stringify(cfg));
}

export async function clearOverrideConfig(): Promise<void> {
  await AsyncStorage.multiRemove([KEY_OVERRIDE]);
}

export async function clearAllConfig(): Promise<void> {
  await AsyncStorage.multiRemove([KEY_OVERRIDE, KEY_CACHE, KEY_REMOTE]);
}

// ------------------------------------------------------------
// استعلام كلاود فلير
// ------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** يجلب الإعدادات من كلاود فلير (أو من الكاش إن لم يوجد رابط/إنترنت) */
export async function fetchRemoteConfig(): Promise<RemoteConfig | null> {
  const configUrl = getConfigUrl();
  if (!configUrl) return loadCachedRemoteConfig();
  try {
    const res = await withTimeout(fetch(configUrl, { headers: { Accept: 'application/json' } }), 9000);
    if (!res.ok) throw new Error(`http_${res.status}`);
    const data = (await res.json()) as RemoteConfig;
    await AsyncStorage.setItem(KEY_REMOTE, JSON.stringify(data));
    return data;
  } catch {
    // انقطاع الإنترنت أو كلاود فلير — نستخدم آخر رد ناجح
    return loadCachedRemoteConfig();
  }
}

export async function loadCachedRemoteConfig(): Promise<RemoteConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_REMOTE);
    if (raw) return JSON.parse(raw) as RemoteConfig;
  } catch {
    // تجاهل
  }
  return null;
}

