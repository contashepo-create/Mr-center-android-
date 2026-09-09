// ============================================================
// خدمة التحديث الذاتي عبر كلاود فلير:
// يقارن رقم إصدار التطبيق بما يرد من العامل، وعند وجود إصدار
// أحدث يحمّل الـ APK ويفتح مثبّت النظام ليثبّته فوق القديم.
// (نظام أندرويد فقط — التوزيع المباشر خارج المتجر)
// ============================================================

import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import { fetchRemoteConfig, type RemoteConfig } from './config';
import { getLastRemoteConfig } from './supabase';

export interface UpdateInfo {
  latest_version: string;
  version_code: number;
  apk_url: string;
  force_update: boolean;
  changelog: string;
}

/** مقارنة أرقام الإصدارات النصية "1.0.10" مقابل "1.0.2" */
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

function currentVersionCode(): number {
  const raw = Application.nativeBuildVersion ?? '0';
  const n = parseInt(String(raw), 10);
  return Number.isNaN(n) ? 0 : n;
}

function currentVersionName(): string {
  return Application.nativeApplicationVersion
    ?? Constants.expoConfig?.version
    ?? '0.0.0';
}

/** هل التحديث الذاتي مفعل في بيئة التشغيل الحالية؟ */
export function isSelfUpdateSupported(): boolean {
  if (__DEV__) return false;                         // وضع التطوير
  if (Platform.OS !== 'android') return false;       // أندرويد فقط
  if (Constants.appOwnership === 'expo') return false; // داخل Expo Go
  return true;
}

/**
 * فحص وجود تحديث: يعتمد على رد كلاود فلير المجلوب عند الإقلاع،
 * ويعيد الاستعلام مباشرة إن لم يكن متاحاً بعد.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isSelfUpdateSupported()) return null;
  let remote: RemoteConfig | null = getLastRemoteConfig();
  if (!remote) {
    remote = await fetchRemoteConfig();
  }
  const u = remote?.update;
  if (!u?.apk_url) return null;

  const latestCode = Number(u.version_code ?? 0);
  const currentCode = currentVersionCode();
  // المقارنة الأساسية برقم البناء، والاحتياطية برقم الإصدار النصي
  const newerByCode = latestCode > 0 && latestCode > currentCode;
  const newerByName = u.latest_version
    ? compareVersions(u.latest_version, currentVersionName()) > 0
    : false;
  if (!newerByCode && !newerByName) return null;

  return {
    latest_version: u.latest_version ?? `${latestCode}`,
    version_code: latestCode,
    apk_url: u.apk_url,
    force_update: u.force_update === true,
    changelog: u.changelog ?? '',
  };
}

/**
 * تحميل ملف APK من كلاود فلير (R2) ثم فتح مثبّت النظام.
 * @param onProgress نسبة التقدم من 0 إلى 1
 */
export async function downloadAndInstall(
  apkUrl: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const target = `${FileSystem.documentDirectory}mr-center-update.apk`;

  // حذف أي نسخة سابقة ناقصة
  try { await FileSystem.deleteAsync(target, { idempotent: true }); } catch { /* ignore */ }

  const resumable = FileSystem.createDownloadResumable(
    apkUrl,
    target,
    {},
    (progress) => {
      const total = progress.totalBytesExpectedToWrite;
      if (total > 0) onProgress(progress.totalBytesWritten / total);
    },
  );
  const result = await resumable.downloadAsync();
  if (!result || result.status !== 200) {
    throw new Error('فشل تحميل ملف التحديث — تحقق من الإنترنت وحاول مجدداً');
  }

  // تحويل المسار لعنوان محتوى يقبله مثبّت النظام
  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION — السماح للمثبّت بقراءة الملف
    type: 'application/vnd.android.package-archive',
  });
}

/** الإصدار الحالي المعروض للمستخدم */
export function getCurrentVersionLabel(): string {
  return `${currentVersionName()} (${currentVersionCode()})`;
}
