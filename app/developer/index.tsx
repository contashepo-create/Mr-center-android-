// ============================================================
// لوحة تحكم المطور الرئيسية: إحصائيات النظام + أقسام التحكم
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Card, ListItem, LoadingView, SectionTitle, StatCard } from '../../src/components/controls';
import { DeveloperGate } from '../../src/components/DeveloperGate';
import { GradientScreen, KeyboardScreen, ScreenHeader } from '../../src/components/layout';
import { devFetchCenters, devFetchProfilesCount } from '../../src/lib/api';
import { getActiveConfig } from '../../src/lib/supabase';
import { useSession } from '../../src/lib/session';
import { colors, font, gradients, radius, spacing } from '../../src/theme';

export default function DeveloperHome() {
  const { profile, ready, signOut } = useSession();
  const [centers, setCenters] = useState(0);
  const [users, setUsers] = useState({ total: 0, byRole: {} as Record<string, number> });
  const cfg = getActiveConfig();

  // كل الـ Hooks أولاً قبل أي خروج مبكر (قواعد Hooks)
  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([devFetchCenters(), devFetchProfilesCount()]);
      setCenters(c.length);
      setUsers(p);
    } catch { /* ignore */ }
  }, []);

  useFocusEffect(useCallback(() => {
    if (ready && profile?.role === 'super_admin') void load();
  }, [load, ready, profile?.role]));

  if (!ready) {
    return (
      <GradientScreen>
        <LoadingView message="..." />
      </GradientScreen>
    );
  }
  if (profile?.role !== 'super_admin') return <DeveloperGate />;

  const confirmSignOut = () => {
    Alert.alert('تسجيل الخروج', 'خروج المطور؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <GradientScreen>
      <ScreenHeader title="لوحة تحكم المطور" subtitle={profile?.email ?? ''} />
      <KeyboardScreen>
        <LinearGradient
          colors={gradients.primary}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Ionicons name="rocket" size={30} color="#052E22" />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>مرحباً أيها المطور</Text>
            <Text style={styles.heroSub} numberOfLines={1}>
              متصل بـ: {cfg ? cfg.url.replace('https://', '') : '—'}
            </Text>
          </View>
        </LinearGradient>

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <StatCard icon="business" value={centers} label="سنتر مسجل" color={colors.cyan} onPress={() => router.push('/developer/centers')} />
          <StatCard icon="people" value={users.total} label="مستخدم" color={colors.info} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <StatCard icon="person-circle" value={users.byRole['center_admin'] ?? 0} label="مسئول سنتر" color={colors.primary} />
          <StatCard icon="school" value={users.byRole['student'] ?? 0} label="طالب" color={colors.success} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <StatCard
            icon="briefcase"
            value={(users.byRole['teacher'] ?? 0) + (users.byRole['manager'] ?? 0) + (users.byRole['secretary'] ?? 0)}
            label="فريق (مدرس/مدير/سكرتير)"
            color={colors.warning}
          />
          <StatCard icon="person" value={users.byRole['super_admin'] ?? 0} label="مطور" color={colors.danger} />
        </View>

        <SectionTitle title="التحكم في النظام" />
        <ListItem
          title="مفاتيح الربط بقاعدة البيانات"
          subtitle="إدخال مفاتيح Supabase + نشر التغيير لجميع العملاء فوراً"
          icon="key"
          iconColor={colors.warning}
          onPress={() => router.push('/developer/connection')}
        />
        <ListItem
          title="إدارة السناتر"
          subtitle="عرض كل السناتر وإيقاف/تفعيل أي منها"
          icon="business"
          iconColor={colors.cyan}
          onPress={() => router.push('/developer/centers')}
        />
        <ListItem
          title="اشتراكات السناتر"
          subtitle="باقات احترافية + اعتماد طلبات الترقية"
          icon="card"
          iconColor={colors.success}
          onPress={() => router.push('/developer/subscriptions')}
        />
        <ListItem
          title="صفحة «حول التطبيق»"
          subtitle="تعديل محتوى الصفحة وبيانات التواصل والرسالة العامة"
          icon="information-circle"
          iconColor={colors.info}
          onPress={() => router.push('/developer/app-info')}
        />
        <ListItem
          title="بث المطور"
          subtitle="إشعار للجميع أو الأصحاب أو سنتر معين + تتبع القراءة"
          icon="megaphone"
          iconColor={colors.danger}
          onPress={() => router.push('/developer/broadcast')}
        />

        <SectionTitle title="حسابك" />
        <ListItem title="تسجيل خروج المطور" icon="log-out" iconColor={colors.danger} onPress={confirmSignOut} />
      </KeyboardScreen>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.lg, padding: spacing.xl, marginTop: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  heroTitle: { color: '#052E22', fontSize: font.lg, fontWeight: '900', textAlign: 'right' },
  heroSub: { color: 'rgba(4,46,34,0.8)', fontSize: font.xs, marginTop: 2, textAlign: 'right' },
});
