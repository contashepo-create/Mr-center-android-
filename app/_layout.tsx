// ============================================================
// الجذر: مزوّد الجلسة + حارس التوجيه حسب الصلاحية وحالة الاشتراك
// ============================================================

import { Stack, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../src/lib/session';
import { GradientScreen } from '../src/components/layout';
import { UpdateManager } from '../src/components/UpdateManager';
import { colors, font, spacing } from '../src/theme';

function BootSplash() {
  return (
    <GradientScreen>
      <View style={styles.boot}>
        <Image source={require('../assets/icon.png')} style={styles.bootLogo} resizeMode="contain" />
        <Text style={styles.bootTitle}>Mr Center</Text>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
      </View>
    </GradientScreen>
  );
}

/** حارس المسارات: يوجه كل مستخدم لمنطقته حسب صلاحيته واشتراكه */
function RouterGuard() {
  const { ready, configured, session, profile, subscription } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    // استبعاد مجلدات التجميع (admin)/(student) من المسار المرئي
    const visible = segments.filter((s) => s && !String(s).startsWith('('));
    const root = visible[0] as string | undefined;
    const inAuth = root === 'auth';
    const inDev = root === 'developer';

    // بدون جلسة: المتاح هو الترحيب والمصادقة وحول التطبيق وبوابة المطور
    if (!session) {
      if (!root || root === 'index' || inAuth || root === 'about' || inDev) return;
      router.replace('/');
      return;
    }

    // بجلسة لكن بلا ملف شخصي بعد: اسمح بالتواجد في المصادقة لإكمال التسجيل
    if (!profile) return;

    // الاشتراك منتهي/موقوف (لغير المطور) → شاشة الحظر
    const blocked = profile.role !== 'super_admin'
      && subscription
      && (subscription.status === 'suspended' || subscription.status === 'expired');
    if (blocked) {
      if (root !== 'blocked' && root !== 'about') router.replace('/blocked');
      return;
    }

    // توجيه حسب الصلاحية
    if (profile.role === 'student') {
      const allowed = ['home', 'my-attendance', 'my-grades', 'my-payments', 'profile', 'about'];
      if (!root || root === 'index' || inAuth || inDev || !allowed.includes(root)) {
        router.replace('/home');
      }
    } else if (profile.role === 'center_admin') {
      const allowed = ['dashboard', 'students', 'groups', 'attendance', 'more', 'payments',
        'announcements', 'grades-list', 'admin-settings', 'student', 'about'];
      if (!root || root === 'index' || inAuth || inDev || !allowed.includes(root)) {
        router.replace('/dashboard');
      }
    } else if (profile.role === 'super_admin') {
      // المطور: موطنه لوحة التحكم
      if (!root || root === 'index' || inAuth) router.replace('/developer');
    }
  }, [ready, session, profile, subscription, segments, router]);

  if (!ready) return <BootSplash />;

  return (
    <>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_left' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="about" />
        <Stack.Screen name="blocked" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="developer" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="(student)" />
      </Stack>
      {/* فحص التحديث التلقائي عبر كلاود فلير */}
      <UpdateManager />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <RouterGuard />
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bootLogo: { width: 110, height: 110, borderRadius: 28 },
  bootTitle: { color: colors.text, fontSize: font.xxl, fontWeight: '800', marginTop: spacing.lg },
});
