// ============================================================
// قائمة «المزيد» لمسئول السنتر: الأقسام الإضافية + بيانات السنتر
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { Card, ListItem, SectionTitle } from '../../src/components/controls';
import { GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { fetchMyCenter } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { Center } from '../../src/lib/types';
import { colors, font, gradients, radius, spacing } from '../../src/theme';

export default function MoreScreen() {
  const { profile, signOut } = useSession();
  const [center, setCenter] = useState<Center | null>(null);

  useEffect(() => {
    if (profile?.center_id) {
      fetchMyCenter(profile.center_id).then(setCenter).catch(() => {});
    }
  }, [profile?.center_id]);

  const shareCode = async () => {
    if (!center) return;
    try {
      await Share.share({
        message: `انضم إلى «${center.name}» على تطبيق Mr Center — كود السنتر: ${center.code}\nحمّل التطبيق وسجّل كطالب بهذا الكود.`,
      });
    } catch { /* أُلغيت المشاركة */ }
  };

  const confirmSignOut = () => {
    Alert.alert('تسجيل الخروج', 'هل تريد تسجيل الخروج من حسابك؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <GradientScreen>
      <KeyboardScreen>
        {/* بطاقة السنتر وكود المشاركة */}
        <LinearGradient
          colors={gradients.primary}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.centerCard}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.centerLabel}>كود السنتر — شاركه مع طلابك</Text>
            <Text style={styles.centerCode}>{center?.code ?? '...'}</Text>
            <Text style={styles.centerName}>{center?.name ?? ''}</Text>
          </View>
          <Card style={styles.shareBtn} onPress={shareCode}>
            <Ionicons name="share-social" size={22} color={colors.primary} />
            <Text style={styles.shareText}>مشاركة</Text>
          </Card>
        </LinearGradient>

        <SectionTitle title="الأقسام" />
        <ListItem title="المدفوعات والمستحقات" subtitle="توليد الاستحقاقات الشهرية وتسجيل الدفعات" icon="wallet" iconColor={colors.cyan} onPress={() => router.push('/payments')} />
        <ListItem title="الإعلانات" subtitle="أخبار وتنبيهات تظهر لطلابك فوراً" icon="megaphone" iconColor={colors.warning} onPress={() => router.push('/announcements')} />
        <ListItem title="الصفوف الدراسية" subtitle="إدارة الصفوف المرتبطة بالمجموعات" icon="school" iconColor={colors.info} onPress={() => router.push('/grades-list')} />
        <ListItem title="الإعدادات والاشتراك" subtitle="بيانات السنتر وحالة اشتراكك" icon="settings" iconColor={colors.primary} onPress={() => router.push('/admin-settings')} />

        <SectionTitle title="عام" />
        <ListItem title="حول التطبيق" subtitle="معلومات التطبيق والتواصل" icon="information-circle" iconColor={colors.textSecondary} onPress={() => router.push('/about')} />
        <ListItem title="تسجيل الخروج" subtitle={profile?.email ?? ''} icon="log-out" iconColor={colors.danger} onPress={confirmSignOut} />
      </KeyboardScreen>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  centerCard: {
    borderRadius: radius.lg, padding: spacing.xl, marginTop: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  centerLabel: { color: 'rgba(255,255,255,0.85)', fontSize: font.sm, fontWeight: '600' },
  centerCode: {
    color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: 4, marginTop: 4,
  },
  centerName: { color: 'rgba(255,255,255,0.9)', fontSize: font.md, marginTop: 4 },
  shareBtn: { alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  shareText: { color: colors.primary, fontSize: font.xs, fontWeight: '800', marginTop: 4 },
});
