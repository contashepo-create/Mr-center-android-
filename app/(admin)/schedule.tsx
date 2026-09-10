// ============================================================
// الجدول الأسبوعي المنشور: حصص كل يوم + تنبيه تعارض المواعيد
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, EmptyState, LoadingView, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { fetchGroups } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { Group } from '../../src/lib/types';
import { arabicDay, arabicError, findGroupConflicts, formatMoney, formatTimeAr, timeToMinutes, WEEK_DAYS } from '../../src/lib/utils';
import { buildReportHtml, shareReportPdf } from '../../src/lib/report';
import { colors, font, radius, spacing } from '../../src/theme';

export default function ScheduleScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!centerId) return;
    try { setGroups(await fetchGroups(centerId)); } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const conflicts = findGroupConflicts(groups);
  const byDay = WEEK_DAYS.map((d) => ({
    day: d,
    items: groups
      .filter((g) => (g.days ?? []).includes(d))
      .sort((a, b) => (timeToMinutes(a.start_time) ?? 9999) - (timeToMinutes(b.start_time) ?? 9999)),
  })).filter((d) => d.items.length > 0);
  const dateless = groups.filter((g) => !(g.days ?? []).length);
  const priceOf = (g: Group) => {
    const b = g.billing_type ?? 'monthly';
    if (b === 'weekly') return `${formatMoney(g.weekly_price)} أسبوعياً`;
    if (b === 'per_session') return `${formatMoney(g.session_price)} للحصة`;
    return `${formatMoney(g.monthly_fee)} شهرياً`;
  };

  const exportPdf = async () => {
    try {
      const html = buildReportHtml('الجدول الأسبوعي', `${groups.length} مجموعة`,       byDay.map((d) => ({
        title: arabicDay(d.day),
        headers: ['المجموعة', 'الموعد', 'الرسوم'],
        rows: d.items.map((g) => [
          g.name,
          timeToMinutes(g.start_time) !== null
            ? `${formatTimeAr(g.start_time)}${timeToMinutes(g.end_time) !== null ? ' - ' + formatTimeAr(g.end_time) : ''}`
            : '—',
          priceOf(g),
        ]),
      })));
      await shareReportPdf(html, 'الجدول الأسبوعي');
    } catch (e) {
      Alert.alert('تعذر التصدير', arabicError(e));
    }
  };

  return (
    <GradientScreen>
      <BackHeader
        title="الجدول الأسبوعي"
        subtitle={byDay.length > 0 ? `${byDay.length} أيام دراسية` : 'جدول الحصص'}
        right={byDay.length > 0 ? (
          <AppButton title="PDF" icon="print" small onPress={exportPdf} />
        ) : undefined}
      />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="لا توجد مجموعات بعد"
          message="أنشئ مجموعاتك بأيامها ومواعيدها وسيُبنى الجدول تلقائياً هنا"
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {conflicts.length > 0 ? (
            <Card style={styles.conflictCard}>
              <View style={styles.conflictHead}>
                <Ionicons name="warning" size={20} color={colors.danger} />
                <Text style={styles.conflictTitle}>تعارض مواعيد ({conflicts.length})</Text>
              </View>
              {conflicts.map((c, i) => (
                <Text key={i} style={styles.conflictText}>
                  «{c.aName}» × «{c.bName}» — {c.days}
                </Text>
              ))}
            </Card>
          ) : null}
          {dateless.length > 0 ? (
            <>
              <SectionTitle title={`بلا أيام محددة (${dateless.length})`} />
              {dateless.map((g) => (
                <Card key={g.id} style={styles.slotCard}>
                  <Text style={styles.slotName}>{g.name} — حدد أيامها من شاشة المجموعات لتظهر في الجدول</Text>
                </Card>
              ))}
            </>
          ) : null}
          {byDay.map((d) => (
            <View key={d.day}>
              <SectionTitle title={arabicDay(d.day)} />
              {d.items.map((g) => (
                <Card key={g.id} style={styles.slotCard}>
                  <View style={styles.slotHead}>
                    <View style={styles.timePill}>
                      <Text style={styles.timeText}>
                        {timeToMinutes(g.start_time) !== null
                          ? `${formatTimeAr(g.start_time)}${timeToMinutes(g.end_time) !== null ? ' - ' + formatTimeAr(g.end_time) : ''}`
                          : 'بدون موعد'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.slotName} numberOfLines={1}>{g.name}</Text>
                      <Text style={styles.slotMeta}>
                        {g.students_count} طالب · {priceOf(g)}{g.teacher_name ? ` · ${g.teacher_name}` : ''}
                      </Text>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  conflictCard: {
    borderColor: colors.danger + '66', backgroundColor: colors.dangerBg, marginBottom: spacing.md,
  },
  conflictHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  conflictTitle: { color: colors.danger, fontSize: font.md, fontWeight: '800' },
  conflictText: { color: colors.danger, fontSize: font.sm, textAlign: 'right', lineHeight: 22 },
  slotCard: { marginBottom: spacing.sm },
  slotHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  timePill: {
    backgroundColor: colors.primary + '22', borderWidth: 1, borderColor: colors.primary + '55',
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  timeText: { color: colors.text, fontSize: font.sm, fontWeight: '800' },
  slotName: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  slotMeta: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
});
