// ============================================================
// إعدادات مسئول السنتر: بيانات السنتر + حالة الاشتراك + الحساب
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, ListItem, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { fetchMyCenter } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { fetchPublicConfig } from '../../src/lib/supabase';
import type { Center, PublicConfig } from '../../src/lib/types';
import { formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

export default function AdminSettingsScreen() {
  const { profile, subscription, signOut, refresh } = useSession();
  const [center, setCenter] = useState<Center | null>(null);
  const [cfg, setCfg] = useState<PublicConfig>({});

  useEffect(() => {
    if (profile?.center_id) {
      fetchMyCenter(profile.center_id).then(setCenter).catch(() => {});
    }
    fetchPublicConfig().then(setCfg);
    void refresh();
  }, [profile?.center_id, refresh]);

  const shareCode = async () => {
    if (!center) return;
    try {
      await Share.share({
        message: `انضم إلى «${center.name}» على تطبيق Mr Center — كود السنتر: ${center.code}`,
      });
    } catch { /* ignore */ }
  };

  const confirmSignOut = () => {
    Alert.alert('تسجيل الخروج', 'هل تريد تسجيل الخروج؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: signOut },
    ]);
  };

  const subColor = subscription?.status === 'active' ? colors.success
    : subscription?.status === 'suspended' ? colors.danger : colors.warning;

  return (
    <GradientScreen>
      <BackHeader title="الإعدادات والاشتراك" />
      <KeyboardScreen>
        {/* بيانات السنتر */}
        <SectionTitle title="بيانات السنتر" />
        <Card>
          <Row label="اسم السنتر" value={center?.name ?? '—'} />
          <Row label="كود السنتر" value={center?.code ?? '—'} highlight />
          <Row label="اسم المسئول" value={center?.owner_name ?? '—'} />
          <Row label="تاريخ التسجيل" value={formatDate(center?.created_at)} />
          <View style={{ marginTop: spacing.md }}>
            <AppButton title="مشاركة كود السنتر" icon="share-social" variant="accent" small onPress={shareCode} />
          </View>
          <Text style={styles.note}>
            كود السنتر ثابت وفريد — يستخدمه طلابك عند التسجيل لأول مرة للانضمام لسنترك.
          </Text>
        </Card>

        {/* الاشتراك */}
        <SectionTitle title="اشتراكك" />
        <Card>
          <View style={styles.subHeader}>
            <Ionicons
              name={subscription?.status === 'active' ? 'checkmark-circle' : 'alert-circle'}
              size={26}
              color={subColor}
            />
            <Text style={[styles.subStatus, { color: subColor }]}>
              {subscription?.status === 'active' ? 'اشتراكك فعّال'
                : subscription?.status === 'suspended' ? 'اشتراكك موقوف'
                : subscription?.status === 'expired' ? 'اشتراكك منتهي' : 'غير معروف'}
            </Text>
          </View>
          {subscription?.plan_type ? (
            <Row label="نوع الباقة" value={
              subscription.plan_type === 'monthly' ? 'شهرية'
                : subscription.plan_type === 'yearly' ? 'سنوية' : 'مخصصة'
            } />
          ) : null}
          {subscription?.ends_on ? <Row label="تاريخ الانتهاء" value={subscription.ends_on} /> : null}
          {subscription?.days_left !== null && subscription?.days_left !== undefined ? (
            <Row label="الأيام المتبقية" value={`${subscription.days_left} يوم`} />
          ) : null}
          <Text style={styles.note}>
            إدارة الاشتراكات وتجديدها تتم من قبل إدارة التطبيق.
            {cfg.contact_whatsapp ? ' تواصل معنا عبر واتساب من صفحة «حول التطبيق».' : ''}
          </Text>
          <View style={{ marginTop: spacing.sm }}>
            <AppButton title="حول التطبيق والتواصل" icon="information-circle" variant="outline" small onPress={() => router.push('/about')} />
          </View>
        </Card>

        {/* الحساب */}
        <SectionTitle title="حسابك" />
        <ListItem
          title={profile?.full_name ?? ''}
          subtitle={profile?.email ?? ''}
          icon="person-circle"
          iconColor={colors.primary}
        />
        <ListItem
          title="تسجيل الخروج"
          icon="log-out"
          iconColor={colors.danger}
          onPress={confirmSignOut}
        />
      </KeyboardScreen>
    </GradientScreen>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && { color: colors.cyan, letterSpacing: 2 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.textSecondary, fontSize: font.md },
  rowValue: { color: colors.text, fontSize: font.md, fontWeight: '800' },
  subHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.md,
  },
  subStatus: { fontSize: font.lg, fontWeight: '900' },
  note: {
    color: colors.textMuted, fontSize: font.xs, marginTop: spacing.md,
    textAlign: 'right', lineHeight: 18,
  },
});
