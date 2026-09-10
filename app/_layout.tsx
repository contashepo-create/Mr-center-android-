// ============================================================
// الجذر: مزوّد الجلسة + حارس التوجيه حسب الصلاحية وحالة الاشتراك
// ============================================================

import { Stack, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../src/lib/session';
import { isOwner, isStaff } from '../src/lib/staff';
import { getSupabase } from '../src/lib/supabase';
import { GradientScreen } from '../src/components/layout';
import { UpdateManager } from '../src/components/UpdateManager';
import { ThemeProvider, useTheme } from '../src/lib/themeContext';
import { colors, font, spacing, themedStyles } from '../src/theme';

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

    // حساب موقوف إدارياً: خروج فوري بدل البقاء داخل التطبيق
    if (profile.is_active === false) {
      getSupabase().auth.signOut().catch(() => {});
      router.replace('/');
      return;
    }

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
      const allowed = ['home', 'my-attendance', 'my-grades', 'my-payments', 'profile', 'about',
        'my-exams', 'my-inquiries', 'my-surveys', 'my-library', 'my-schedule', 'my-notifications'];
      if (!root || root === 'index' || inAuth || inDev || !allowed.includes(root)) {
        router.replace('/home');
      }
    } else if (isOwner(profile) || isStaff(profile)) {
      const allowed = ['dashboard', 'students', 'groups', 'attendance', 'more', 'payments',
        'announcements', 'grades-list', 'admin-settings', 'student', 'about', 'scan',
        'exams', 'inquiries', 'surveys', 'library', 'schedule', 'reports', 'guide', 'whatsapp', 'notifications', 'dev-notices', 'teachers', 'subscription', 'activity'];
      if (!root || root === 'index' || inAuth || inDev || !allowed.includes(root)) {
        router.replace('/dashboard');
      }
    } else if (profile.role === 'super_admin') {
      // المطور: موطنه لوحة التحكم — وأي شاشة أخرى (عدا حول) تُعاد للوحة
      if ((!root || root === 'index' || inAuth || !inDev) && root !== 'about' && root !== 'blocked') {
        router.replace('/developer');
      }
    }
  }, [ready, session, profile, subscription, segments, router]);

  if (!ready) return <BootSplash />;

  return (
    <>
      <Stack screenOptions={{
        headerShown: false,
        // تلاشي ناعم بخلفية داكنة: بلا وميض أبيض ولا حركة مفاجئة
        animation: 'fade',
        contentStyle: { backgroundColor: colors.bg },
      }}>
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
        <ThemeProvider>
          {/* AppShell يستهلك الثيم حتى يعاد رسم الشجرة كاملة عند التبديل */}
          <AppShell />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppShell() {
  useTheme();
  return (
    <SessionProvider>
      <RouterGuard />
    </SessionProvider>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bootLogo: { width: 110, height: 110, borderRadius: 28 },
  bootTitle: { color: colors.text, fontSize: font.xxl, fontWeight: '800', marginTop: spacing.lg },
}));
