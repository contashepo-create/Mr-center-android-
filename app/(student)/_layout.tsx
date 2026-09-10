// ============================================================
// تبويبات الطالب مع حارس الصلاحية
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';
import { LoadingView } from '../../src/components/controls';
import { useSession } from '../../src/lib/session';
import { colors } from '../../src/theme';

export default function StudentTabsLayout() {
  const { profile, ready } = useSession();

  if (!ready || !profile) {
    return <LoadingView message="جاري تحميل حسابك..." />;
  }
  if (profile.role !== 'student') {
    return <LoadingView message="جاري التوجيه..." />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.cyan,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="my-attendance"
        options={{
          title: 'الحضور',
          tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-done" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="my-grades"
        options={{
          title: 'درجاتي',
          tabBarIcon: ({ color, size }) => <Ionicons name="star" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="my-payments"
        options={{
          title: 'المدفوعات',
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'حسابي',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
      {/* شاشات داخلية مخفية من شريط التبويبات */}
      <Tabs.Screen name="my-exams" options={{ href: null }} />
      <Tabs.Screen name="my-inquiries" options={{ href: null }} />
      <Tabs.Screen name="my-surveys" options={{ href: null }} />
      <Tabs.Screen name="my-library" options={{ href: null }} />
      <Tabs.Screen name="my-schedule" options={{ href: null }} />
      <Tabs.Screen name="my-notifications" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bgSoft,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 62,
    paddingBottom: 8,
    paddingTop: 6,
    // العربية: الرئيسية يميناً دائماً مهما كانت لغة الجهاز
    direction: 'rtl',
  },
  tabLabel: { fontSize: 11, fontWeight: '700' },
});
