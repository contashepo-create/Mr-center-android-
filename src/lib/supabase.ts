// ============================================================
// عميل قاعدة البيانات الديناميكي
// يسأل كلاود فلير عن المفاتيح عند كل تشغيل — فإن غيّرها المطور
// هناك تبعتها كل الأجهزة تلقائياً، أياً كانت منصة قاعدة البيانات.
// ============================================================

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  builtinConfig,
  cacheConfig,
  dbConfigFromRemote,
  fetchRemoteConfig,
  loadSavedConfig,
  type RemoteConfig,
  type SupabaseConfig,
} from './config';
import type { PublicConfig } from './types';

let client: SupabaseClient | null = null;
let activeConfig: SupabaseConfig | null = null;
let lastRemoteConfig: RemoteConfig | null = null;

export function getActiveConfig(): SupabaseConfig | null {
  return activeConfig;
}

/** آخر رد وصل من كلاود فلير (تستخدمه خدمة التحديث أيضاً) */
export function getLastRemoteConfig(): RemoteConfig | null {
  return lastRemoteConfig;
}

export function isSupabaseReady(): boolean {
  return client !== null;
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error('تعذر الاتصال بقاعدة البيانات — لم يتم ضبط مفاتيح الربط بعد');
  }
  return client;
}

function buildClient(cfg: SupabaseConfig): SupabaseClient {
  return createClient(cfg.url, cfg.anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

/**
 * تهيئة الاتصال عند تشغيل التطبيق بالترتيب:
 *  ١) مفاتيح يدوية للمطور على هذا الجهاز
 *  ٢) كلاود فلير (المصدر المركزي لكل العملاء)
 *  ٣) آخر إعدادات ناجحة مخزنة (وضع عدم الاتصال)
 *  ٤) المفاتيح المدمجة في التطبيق
 */
export async function initSupabase(): Promise<'ready' | 'missing'> {
  // ١) اليدوية أولاً
  const saved = await loadSavedConfig();
  if (saved?.source === 'override') {
    await applyConfig(saved);
    return 'ready';
  }

  // ٢) استعلام كلاود فلير (مع رجوع تلقائي لآخر رد ناجح عند انقطاع الشبكة)
  const remote = await fetchRemoteConfig();
  if (remote) {
    lastRemoteConfig = remote;
    const db = dbConfigFromRemote(remote);
    if (db) {
      const cfg: SupabaseConfig = { url: db.url, anonKey: db.anonKey, source: 'cloudflare' };
      await applyConfig(cfg);
      await cacheConfig(db.url, db.anonKey); // تخزين للعمل دون إنترنت لاحقاً
      return 'ready';
    }
  }

  // ٣) آخر إعدادات مخزنة
  if (saved) {
    await applyConfig({ ...saved, source: 'cache' });
    return 'ready';
  }

  // ٤) المدمجة كملاذ أخير
  const builtin = builtinConfig();
  if (builtin) {
    await applyConfig(builtin);
    return 'ready';
  }

  client = null;
  activeConfig = null;
  return 'missing';
}

/** تبديل الإعدادات فورياً (يدوي من المطور) */
export async function applyConfig(cfg: SupabaseConfig): Promise<void> {
  activeConfig = cfg;
  client = buildClient(cfg);
}

/** جلب صف الإعدادات العامة من قاعدة البيانات (محتوى صفحة «حول التطبيق»...) */
export async function fetchPublicConfig(): Promise<PublicConfig> {
  try {
    const { data, error } = await getSupabase()
      .from('app_config')
      .select('value')
      .eq('key', 'public_config')
      .maybeSingle();
    if (error) return {};
    return (data?.value ?? {}) as PublicConfig;
  } catch {
    return {};
  }
}
