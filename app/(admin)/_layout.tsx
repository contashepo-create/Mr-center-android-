// ============================================================
// تبويبات مسئول السنتر مع حارس الصلاحية وشارة حالة الاشتراك
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LoadingView } from '../../src/components/controls';
import { useSession } from '../../src/lib/session';
import { can, isOwner, isStaff, TEACHER_TABS } from '../../src/lib/staff';
import { colors, font, radius, spacing } from '../../src/theme';

function SubscriptionBanner() {
  const { subscription } = useSession();
  if (!subscription || subscription.status !== 'active') return null;
  const days = subscription.days_left;
  if (days === null || days > 7) return null;
  return (
    <View style={styles.banner}>
      <Ionicons name="time" size={14} color={colors.warning} />
      <Text style={styles.bannerText}>
        تبقى {days === 0 ? 'أقل من يوم' : `${days} أيام`} على انتهاء اشتراكك — جدد من صفحة الإعدادات
      </Text>
    </View>
  );
}

export default function AdminTabsLayout() {
  const { profile, ready } = useSession();

  if (!ready || !profile) {
    return <LoadingView message="جاري تحميل حسابك..." />;
  }
  if (!isOwner(profile) && !isStaff(profile)) {
    return <LoadingView message="جاري التوجيه..." />;
  }
  // تبويبات المدرس تُخفى حسب صلاحياته (الشاشات تحمي نفسها أيضاً)
  const tabVisible = (route: string) => {
    const t = TEACHER_TABS.find((x) => x.route === route);
    if (!t) return true;
    return t.perm === null || can(profile, t.perm);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {isOwner(profile) ? <SubscriptionBanner /> : null}
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
          name="dashboard"
          options={{
            title: 'الرئيسية',
            tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="students"
          options={{
            title: 'الطلاب',
            tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="groups"
          options={{
            title: 'المجموعات',
            tabBarIcon: ({ color, size }) => <Ionicons name="albums" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="attendance"
          options={{
            title: 'الحضور',
            tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-done" size={size} color={color} />,
            ...(tabVisible('attendance') ? {} : { href: null }),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'المزيد',
            tabBarIcon: ({ color, size }) => <Ionicons name="menu" size={size} color={color} />,
          }}
        />
        {/* شاشات داخلية مخفية من شريط التبويبات */}
        <Tabs.Screen name="payments" options={{ href: null }} />
        <Tabs.Screen name="announcements" options={{ href: null }} />
        <Tabs.Screen name="grades-list" options={{ href: null }} />
        <Tabs.Screen name="admin-settings" options={{ href: null }} />
        <Tabs.Screen name="student/[id]" options={{ href: null }} />
        <Tabs.Screen name="scan" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="subscription" options={{ href: null }} />
        <Tabs.Screen name="activity" options={{ href: null }} />
        <Tabs.Screen name="exams" options={{ href: null }} />
        <Tabs.Screen name="inquiries" options={{ href: null }} />
        <Tabs.Screen name="surveys" options={{ href: null }} />
        <Tabs.Screen name="library" options={{ href: null }} />
        <Tabs.Screen name="schedule" options={{ href: null }} />
        <Tabs.Screen name="reports" options={{ href: null }} />
        <Tabs.Screen name="guide" options={{ href: null }} />
        <Tabs.Screen name="whatsapp" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        <Tabs.Screen name="dev-notices" options={{ href: null }} />
      </Tabs>
    </View>
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
  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, backgroundColor: colors.warningBg,
    borderBottomWidth: 1, borderBottomColor: colors.warning + '44',
    paddingVertical: 6, paddingHorizontal: spacing.md,
  },
  bannerText: { color: colors.warning, fontSize: font.xs, fontWeight: '700' },
});
