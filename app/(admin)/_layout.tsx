// ============================================================
// منطقة مسئول السنتر: Stack أب يشغّل شريط التبويبات والشاشات الداخلية
// — الشاشات الداخلية (المدرسون/الباقات/الملف...) تُدفع push فعلياً
// فيعمل زر الرجوع للشاشة السابقة (لا للرئيسية) بتلاشٍ داكن بلا وميض.
// ============================================================

import { Stack } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LoadingView } from '../../src/components/controls';
import { CommunicationHub } from '../../src/components/CommunicationHub';
import { useSession } from '../../src/lib/session';
import { isOwner, isStaff } from '../../src/lib/staff';
import { colors, themedStyles } from '../../src/theme';

export default function AdminLayout() {
  const { profile, ready } = useSession();

  // حماية أولية: الحارس في الجذر يوجّه الأدوار الأخرى فوراً
  if (!ready || !profile) {
    return <LoadingView message="جاري تحميل حسابك..." />;
  }
  if (!isOwner(profile) && !isStaff(profile)) {
    return <LoadingView message="جاري التوجيه..." />;
  }

  return (
    <View style={styles.root}>
      <CommunicationHub area="admin" />
      <Stack
        screenOptions={{
          headerShown: false,
          // تلاشٍ ناعم بخلفية داكنة: لا وميض أبيض عند الدفع أو الرجوع
          animation: 'fade',
          animationDuration: 180,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        {/* بقية الشاشات (teachers/subscription/student/[id]/...) تُسجل تلقائياً من الملفات */}
      </Stack>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
}));
