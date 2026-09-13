// ============================================================
// منطقة الطالب: Stack أب يشغّل شريط التبويبات والشاشات الداخلية
// (الاختبارات/الإشعارات/الجدول...) — رجوع حقيقي للسابق بتلاشٍ داكن.
// ============================================================

import { Stack } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LoadingView } from '../../src/components/controls';
import { CommunicationHub } from '../../src/components/CommunicationHub';
import { useSession } from '../../src/lib/session';
import { colors, themedStyles } from '../../src/theme';

export default function StudentLayout() {
  const { profile, ready } = useSession();

  // حماية أولية: الحارس في الجذر يوجّه الأدوار الأخرى فوراً
  if (!ready || !profile) {
    return <LoadingView message="جاري تحميل حسابك..." />;
  }
  if (profile.role !== 'student') {
    return <LoadingView message="جاري التوجيه..." />;
  }

  return (
    <View style={styles.root}>
      <CommunicationHub area="student" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          animationDuration: 180,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
}));
