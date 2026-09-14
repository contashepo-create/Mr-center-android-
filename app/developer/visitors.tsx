// ============================================================
// الزوار وأصحاب السناتر (للمطور): عداد الأجهزة الفريدة + حجب/إلغاء
// حجب أي جهاز مسيء + آخر ظهور مسجّل لكل صاحب سنتر (لا يعتمد على IP)
// ============================================================

import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, EmptyState, LoadingView, SectionTitle, StatCard } from '../../src/components/controls';
import { DeveloperGate } from '../../src/components/DeveloperGate';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import {
  devFetchVisitorStats, devListCenterOwnerPresence, devListVisitors, devSetDeviceBlocked,
  type CenterOwnerPresence, type VisitorRow, type VisitorStats,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { arabicError, formatDate } from '../../src/lib/utils';
import { colors, font, spacing, themedStyles } from '../../src/theme';

export default function DeveloperVisitorsScreen() {
  const { profile, ready } = useSession();
  const [stats, setStats] = useState<VisitorStats | null>(null);
  const [devices, setDevices] = useState<VisitorRow[] | null>(null);
  const [presence, setPresence] = useState<CenterOwnerPresence[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, d, p] = await Promise.all([
      devFetchVisitorStats().catch(() => null),
      devListVisitors().catch(() => null),
      devListCenterOwnerPresence().catch(() => null),
    ]);
    setStats(s); setDevices(d); setPresence(p);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!ready) return <GradientScreen><BackHeader title="الزوار" /><LoadingView message="..." /></GradientScreen>;
  if (profile?.role !== 'super_admin') return <DeveloperGate />;

  const toggleBlock = async (row: VisitorRow) => {
    setBusyId(row.device_id);
    try {
      await devSetDeviceBlocked(row.device_id, !row.blocked);
      await load();
    } catch (e) { Alert.alert('تعذر التحديث', arabicError(e)); } finally { setBusyId(null); }
  };

  return (
    <GradientScreen>
      <BackHeader title="الزوار وأصحاب السناتر" subtitle="عداد الأجهزة + حجب المسيء منها + آخر ظهور لكل صاحب سنتر" />
      {loading ? <LoadingView message="جاري التحميل..." /> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <SectionTitle title="عداد الزوار" />
          {!stats ? (
            <EmptyState icon="globe-outline" title="لا توجد بيانات بعد" message="يظهر العداد بعد أول زيارة مسجّلة من أي جهاز." />
          ) : (
            <View style={styles.summary}>
              <StatCard icon="globe" value={stats.total} label="إجمالي الأجهزة" color={colors.info} />
              <StatCard icon="today" value={stats.today} label="اليوم" color={colors.success} />
              <StatCard icon="calendar" value={stats.week} label="آخر ٧ أيام" color={colors.cyan} />
            </View>
          )}

          <SectionTitle title="آخر زيارة لأصحاب السناتر" />
          {!presence || presence.length === 0 ? (
            <EmptyState icon="person-circle-outline" title="لا توجد بيانات حضور بعد" message="تظهر الزيارة بمجرد فتح صاحب السنتر للتطبيق." />
          ) : (
            presence.map((owner) => (
              <Card key={owner.account_id} style={styles.row}>
                <View style={styles.line}>
                  <Text style={styles.rowTitle}>{owner.center_name} <Text style={styles.meta}>· {owner.center_code}</Text></Text>
                  <Text style={styles.meta}>{owner.platform || '—'}</Text>
                </View>
                <Text style={styles.meta}>{owner.owner_name}</Text>
                <Text style={styles.meta}>{owner.last_seen ? `آخر زيارة: ${formatDate(owner.last_seen)}` : 'لم يفتح النسخة المحدثة بعد'}</Text>
              </Card>
            ))
          )}

          <View style={styles.rowBetween}>
            <SectionTitle title="الأجهزة المسجلة" />
            <Text style={[styles.meta, { color: colors.danger }]}>
              {devices?.filter((d) => d.blocked).length ?? 0} محجوب
            </Text>
          </View>
          {!devices || devices.length === 0 ? (
            <EmptyState icon="phone-portrait-outline" title="لا توجد أجهزة مسجلة بعد" />
          ) : (
            devices.map((d) => (
              <Card key={d.id} style={styles.row}>
                <Text style={styles.deviceId} numberOfLines={1}>{d.device_id}</Text>
                <Text style={styles.meta}>أول ظهور: {formatDate(d.first_seen)} · آخر نشاط: {formatDate(d.last_seen)}</Text>
                <View style={styles.actions}>
                  <Text style={[styles.status, { color: d.blocked ? colors.danger : colors.success }]}>
                    {d.blocked ? 'محجوب' : 'نشط'}
                  </Text>
                  <AppButton
                    title={busyId === d.device_id ? 'جارٍ...' : d.blocked ? 'إلغاء الحجب' : 'حجب الجهاز'}
                    icon={d.blocked ? 'checkmark-circle' : 'ban'}
                    small
                    variant={d.blocked ? 'outline' : 'danger'}
                    loading={busyId === d.device_id}
                    onPress={() => void toggleBlock(d)}
                  />
                </View>
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { marginBottom: spacing.sm },
  rowTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right', flex: 1 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  meta: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 4 },
  deviceId: { color: colors.text, fontSize: font.sm, textAlign: 'left', fontFamily: 'monospace' as const },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  status: { fontWeight: '900', fontSize: font.xs },
}));
