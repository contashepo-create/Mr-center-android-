// ============================================================
// مدفوعات الطالب: المستحقات المعلقة + سجل الدفعات
// ============================================================

import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, ListItem, LoadingView, SectionTitle, StatCard } from '../../src/components/controls';
import { GradientScreen, ScreenHeader } from '../../src/components/layout';
import { fetchDuesForStudent, fetchPaymentsForStudent } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { Due, Payment } from '../../src/lib/types';
import { arabicMonth, formatDate, formatMoney } from '../../src/lib/utils';
import { colors, font, spacing } from '../../src/theme';

export default function MyPaymentsScreen() {
  const { profile } = useSession();
  const [dues, setDues] = useState<Due[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.student_id) return;
    try {
      const [d, p] = await Promise.all([
        fetchDuesForStudent(profile.student_id),
        fetchPaymentsForStudent(profile.student_id),
      ]);
      setDues(d);
      setPayments(p);
    } catch { /* ignore */ }
    setLoading(false);
  }, [profile?.student_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const pending = dues.filter((d) => d.status !== 'paid');
  const pendingTotal = pending.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const paidTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  return (
    <GradientScreen>
      <ScreenHeader title="مدفوعاتي" subtitle="مستحقاتك وسجل دفعاتك" />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
            <StatCard icon="time" value={formatMoney(pendingTotal)} label={`معلق (${pending.length})`} color={colors.warning} />
            <StatCard icon="checkmark-circle" value={formatMoney(paidTotal)} label={`إجمالي مدفوع (${payments.length})`} color={colors.success} />
          </View>

          <SectionTitle title={`مستحقات معلقة (${pending.length})`} />
          {pending.length === 0 ? (
            <Card style={{ marginBottom: spacing.sm }}>
              <Text style={styles.dim}>✅ لا توجد مستحقات معلقة عليك</Text>
            </Card>
          ) : (
            pending.map((d) => (
              <ListItem
                key={d.id}
                title={`${arabicMonth(d.month)} ${d.year}`}
                subtitle={formatMoney(d.amount)}
                icon="time"
                iconColor={colors.warning}
                badge={{ text: 'معلق', color: colors.warning, bg: colors.warningBg }}
              />
            ))
          )}

          <SectionTitle title={`سجل الدفعات (${payments.length})`} />
          {payments.length === 0 ? (
            <Card style={{ marginBottom: spacing.sm }}>
              <Text style={styles.dim}>لا توجد دفعات مسجلة بعد</Text>
            </Card>
          ) : (
            payments.map((p) => (
              <ListItem
                key={p.id}
                title={formatMoney(p.amount)}
                subtitle={`${arabicMonth(p.month)} ${p.year} · ${formatDate(p.payment_date)}`}
                icon="checkmark-circle"
                iconColor={colors.success}
              />
            ))
          )}
        </ScrollView>
      )}
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  dim: { color: colors.textMuted, textAlign: 'center', fontSize: font.sm },
});
