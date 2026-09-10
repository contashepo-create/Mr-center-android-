// ============================================================
// الإشعارات الفورية (Expo Push): تسجيل رمز الجهاز لحساب المستخدم
// ليصله تنبيه حتى والتطبيق مغلق (عبر عامل كلاود فلير المجدول).
// فشل التسجيل صامت دائماً — لا يعطل أي تدفق.
// ============================================================

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getSupabase, isSupabaseReady } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** يسجل رمز الدفع للجهاز في profiles.push_token (مرة واحدة لكل دخول) */
export async function registerPushToken(): Promise<void> {
  try {
    if (Platform.OS === 'web' || !isSupabaseReady()) return;
    // بلا معرف مشروع EAS لا توجد رموز دفع أصلاً — نخرج قبل طلب إذن النظام
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId
      ?? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    if (!projectId) return;
    const { status: existing } = await Notifications.getPermissionsAsync();
    const status = existing === 'granted'
      ? existing
      : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token) return;
    const { data: sess } = await getSupabase().auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return;
    await getSupabase().from('profiles').update({ push_token: token }).eq('id', uid);
  } catch {
    // صامت — الإشعارات الداخلية داخل التطبيق تعمل بدونه
  }
}
