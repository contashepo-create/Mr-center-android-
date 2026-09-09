// ============================================================
// شاشة حظر الاشتراك — تظهر عند انتهاء أو إيقاف اشتراك السنتر
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, LoadingView } from '../src/components/controls';
import { GradientScreen } from '../src/components/layout';
import { useSession } from '../src/lib/session';
import { fetchPublicConfig } from '../src/lib/supabase';
import type { PublicConfig } from '../src/lib/types';
import { colors, font, radius, spacing } from '../src/theme';

export default function BlockedScreen() {
  const { subscription, refresh, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<PublicConfig>({});

  useState(() => {
    fetchPublicConfig().then(setCfg);
  });

  const suspended = subscription?.status === 'suspended';

  const recheck = async () => {
    setBusy(true);
    await refresh();
    setBusy(false);
  };

  return (
    <GradientScreen>
      <View style={styles.wrap}>
        <View style={[styles.iconWrap, { borderColor: (suspended ? colors.danger : colors.warning) + '66' }]}>
          <Ionicons name={suspended ? 'lock-closed' : 'time'} size={40} color={suspended ? colors.danger : colors.warning} />
        </View>
        <Text style={styles.title}>{suspended ? 'تم إيقاف هذا الحساب' : 'انتهى اشتراك السنتر'}</Text>
        <Text style={styles.body}>
          {suspended
            ? 'قامت إدارة التطبيق بإيقاف حساب هذا السنتر مؤقتاً. إذا كنت تعتقد أن هذا خطأ، تواصل مع إدارة التطبيق.'
            : 'انتهت صلاحية اشتراك هذا السنتر. على مسئول السنتر التواصل مع إدارة التطبيق لتجديد الاشتراك واستعادة الخدمة فوراً.'}
        </Text>

        <Card style={{ width: '100%', marginTop: spacing.xl }}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>حالة الاشتراك:</Text>
            <Text style={[styles.rowValue, { color: suspended ? colors.danger : colors.warning }]}>
              {suspended ? 'موقوف' : 'منتهي'}
            </Text>
          </View>
          {subscription?.ends_on ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>تاريخ الانتهاء:</Text>
              <Text style={styles.rowValue}>{subscription.ends_on}</Text>
            </View>
          ) : null}
          {subscription?.plan_type ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>نوع الباقة:</Text>
              <Text style={styles.rowValue}>
                {subscription.plan_type === 'monthly' ? 'شهرية' : subscription.plan_type === 'yearly' ? 'سنوية' : 'مخصصة'}
              </Text>
            </View>
          ) : null}
        </Card>

        <View style={{ width: '100%', marginTop: spacing.xl, gap: spacing.md }}>
          {cfg.contact_whatsapp ? (
            <AppButton
              title="تواصل لتجديد الاشتراك"
              icon="logo-whatsapp"
              variant="success"
              onPress={() => Linking.openURL(`https://wa.me/${cfg.contact_whatsapp}`)}
            />
          ) : null}
          <AppButton title="إعادة فحص الحالة" icon="refresh" variant="outline" onPress={recheck} loading={busy} />
          <AppButton title="تسجيل الخروج" icon="log-out" variant="ghost" onPress={signOut} />
        </View>
      </View>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  iconWrap: {
    width: 92, height: 92, borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl,
  },
  title: { color: colors.text, fontSize: font.xxl, fontWeight: '900', textAlign: 'center' },
  body: {
    color: colors.textSecondary, fontSize: font.md, textAlign: 'center',
    marginTop: spacing.md, lineHeight: 26,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowLabel: { color: colors.textSecondary, fontSize: font.md },
  rowValue: { color: colors.text, fontSize: font.md, fontWeight: '800' },
});
