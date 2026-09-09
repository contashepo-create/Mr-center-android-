// ============================================================
// اشتراكات السناتر (للمطور): تفعيل باقة شهرية/سنوية/مخصصة لأي سنتر
// ============================================================

import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppButton, Card, EmptyState, LoadingView, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { OptionPicker } from '../../src/components/pickers';
import {
  devFetchCenters, devSetCenterStatus, devUpsertSubscription, type CenterWithSub,
} from '../../src/lib/api';
import { arabicError } from '../../src/lib/utils';
import { colors, font, spacing } from '../../src/theme';

const PLANS = [
  { value: 'monthly', label: 'شهرية — 30 يوم', months: 1 },
  { value: 'yearly', label: 'سنوية — 365 يوم', months: 12 },
  { value: 'custom', label: 'مخصصة — بمدة تختارها', months: 0 },
];

const DURATIONS = [
  { value: '1', label: 'شهر واحد' },
  { value: '3', label: '3 أشهر' },
  { value: '6', label: '6 أشهر' },
  { value: '12', label: 'سنة كاملة' },
  { value: '24', label: 'سنتان' },
];

export default function DevSubscriptionsScreen() {
  const [centers, setCenters] = useState<CenterWithSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>('monthly');
  const [duration, setDuration] = useState<string>('1');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setCenters(await devFetchCenters()); } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const selected = centers.find((c) => c.id === selectedId);

  const activate = async () => {
    if (!selected) return;
    const planInfo = PLANS.find((p) => p.value === plan)!;
    const months = plan === 'custom' ? Number(duration) : planInfo.months;
    setBusy(true);
    try {
      await devUpsertSubscription({ centerId: selected.id, planType: plan as any, months, status: 'active' });
      await devSetCenterStatus(selected.id, 'active');
      Alert.alert('تم التفعيل', `تم تفعيل اشتراك «${selected.name}» لمدة ${months} شهر`);
      await load();
    } catch (e) {
      Alert.alert('خطأ', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const suspend = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await devUpsertSubscription({ centerId: selected.id, planType: 'custom', months: 0, status: 'suspended', notes: 'إيقاف من المطور' });
      await devSetCenterStatus(selected.id, 'suspended');
      Alert.alert('تم الإيقاف', `تم إيقاف اشتراك «${selected.name}»`);
      await load();
    } catch (e) {
      Alert.alert('خطأ', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GradientScreen>
      <BackHeader title="اشتراكات السناتر" subtitle="تحكم كامل في الباقات" />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : (
        <KeyboardScreen>
          {/* حالة السناتر */}
          <SectionTitle title="اختر السنتر" />
          <OptionPicker
            icon="business"
            value={selectedId}
            options={centers.map((c) => ({
              value: c.id,
              label: `${c.name} (${c.code})`,
              subtitle: c.latest_sub
                ? `حتى ${c.latest_sub.ends_on} · ${c.latest_sub.status === 'active' ? 'فعّال' : 'موقوف/منتهي'}`
                : 'بدون اشتراك',
            }))}
            onChange={setSelectedId}
            placeholder="اختر سنتراً لإدارة اشتراكه..."
          />

          {selected ? (
            <>
              <Card style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                  <Text style={styles.dim}>الحالة الحالية:</Text>
                  <Text style={[styles.state, {
                    color: selected.status === 'active' && selected.latest_sub?.status === 'active'
                      ? colors.success : colors.danger,
                  }]}>
                    {selected.status === 'active' && selected.latest_sub?.status === 'active' ? 'فعّال' : 'موقوف/منتهي'}
                  </Text>
                </View>
                {selected.latest_sub ? (
                  <>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                      <Text style={styles.dim}>الباقة:</Text>
                      <Text style={styles.value}>
                        {selected.latest_sub.plan_type === 'monthly' ? 'شهرية'
                          : selected.latest_sub.plan_type === 'yearly' ? 'سنوية' : 'مخصصة'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={styles.dim}>تنتهي في:</Text>
                      <Text style={styles.value}>{selected.latest_sub.ends_on}</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.dim}>لا يوجد سجل اشتراك لهذا السنتر</Text>
                )}
              </Card>

              <SectionTitle title="تفعيل / تجديد الاشتراك" />
              <Card>
                <OptionPicker
                  label="نوع الباقة"
                  icon="card"
                  value={plan}
                  options={PLANS.map((p) => ({ value: p.value, label: p.label }))}
                  onChange={setPlan}
                />
                {plan === 'custom' ? (
                  <OptionPicker
                    label="المدة"
                    icon="time"
                    value={duration}
                    options={DURATIONS}
                    onChange={setDuration}
                  />
                ) : null}
                <AppButton
                  title="تفعيل / تجديد الآن"
                  icon="checkmark-circle"
                  variant="success"
                  onPress={activate}
                  loading={busy}
                />
                <View style={{ height: spacing.sm }} />
                <AppButton
                  title="إيقاف الاشتراك"
                  icon="pause-circle"
                  variant="danger"
                  onPress={suspend}
                  loading={busy}
                />
              </Card>
            </>
          ) : centers.length === 0 ? (
            <EmptyState icon="business-outline" title="لا توجد سناتر بعد" />
          ) : null}
        </KeyboardScreen>
      )}
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  dim: { color: colors.textSecondary, fontSize: font.md },
  value: { color: colors.text, fontSize: font.md, fontWeight: '800' },
  state: { fontSize: font.md, fontWeight: '900' },
});
