// ============================================================
// التقارير: حضور/تحصيل/درجات لشهر مختار + تصدير PDF
// ============================================================

import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, EmptyState, LoadingView, NoAccess, SectionTitle, StatCard } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { OptionPicker } from '../../src/components/pickers';
import { can, useTeacherGroupIds } from '../../src/lib/staff';
import {
  fetchAttendanceForSessions, fetchDues, fetchGroups, fetchManualGradesForMonth,
  fetchPaymentsForMonth, fetchSessionsForCenterMonth, fetchStudents,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { Group } from '../../src/lib/types';
import { arabicError, arabicMonth, formatDate, formatMoney } from '../../src/lib/utils';
import { buildReportHtml, shareReportPdf } from '../../src/lib/report';
import { colors, font, radius, spacing } from '../../src/theme';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: arabicMonth(i + 1) }));
const now = new Date();
const YEARS = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => ({ value: String(y), label: String(y) }));

interface GroupAtt { group: Group; sessions: number; present: number; absent: number }

export default function ReportsScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [att, setAtt] = useState<GroupAtt[]>([]);
  const [collected, setCollected] = useState(0);
  const [pending, setPending] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [gradesAvg, setGradesAvg] = useState<{ name: string; avg: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const teacherScope = useTeacherGroupIds();
  const visibleAtt = teacherScope ? att.filter((a) => teacherScope.includes(a.group.id)) : att;

  const load = useCallback(async () => {
    if (!centerId) return;
    setLoading(true);
    try {
      const m = Number(month);
      const y = Number(year);
      const [gs, st, sessions, dues, pays, grades] = await Promise.all([
        fetchGroups(centerId),
        fetchStudents(centerId),
        fetchSessionsForCenterMonth(centerId, m, y),
        fetchDues(centerId, m, y),
        fetchPaymentsForMonth(centerId, m, y),
        fetchManualGradesForMonth(centerId, m, y),
      ]);
      const bySession = new Map(sessions.map((s) => [s.id, s]));
      const attRows = await fetchAttendanceForSessions(sessions.map((s) => s.id));
      const perGroup = new Map<string, { sessions: Set<string>; present: number; absent: number }>();
      for (const s of sessions) {
        if (!perGroup.has(s.group_id)) perGroup.set(s.group_id, { sessions: new Set(), present: 0, absent: 0 });
        perGroup.get(s.group_id)!.sessions.add(s.id);
      }
      for (const a of attRows) {
        const sess = bySession.get(a.session_id);
        if (!sess) continue;
        const g = perGroup.get(sess.group_id);
        if (!g) continue;
        if (a.status === 'present' || a.status === 'late') g.present++;
        else g.absent++;
      }
      setAtt(gs.map((g) => ({
        group: g,
        sessions: perGroup.get(g.id)?.sessions.size ?? 0,
        present: perGroup.get(g.id)?.present ?? 0,
        absent: perGroup.get(g.id)?.absent ?? 0,
      })));
      setCollected(pays.reduce((s, p) => s + (Number(p.amount) || 0), 0));
      const pend = dues.filter((d) => d.status !== 'paid');
      setPending(pend.reduce((s, d) => s + (Number(d.amount) || 0), 0));
      setPendingCount(pend.length);
      const byStudent = new Map<string, { sum: number; count: number }>();
      for (const g of grades) {
        const e = byStudent.get(g.student_id) ?? { sum: 0, count: 0 };
        if (Number(g.max_score) > 0) {
          e.sum += (Number(g.score) / Number(g.max_score)) * 100;
          e.count++;
        }
        byStudent.set(g.student_id, e);
      }
      const nameOf = (id: string) => st.find((s) => s.id === id)?.name ?? 'طالب محذوف';
      setGradesAvg([...byStudent.entries()]
        .filter(([, e]) => e.count > 0)
        .map(([id, e]) => ({ name: nameOf(id), avg: (e.sum / e.count).toFixed(1) + '%', count: e.count }))
        .sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg))
        .slice(0, 30));
    } catch (e) {
      Alert.alert('تعذر التحميل', arabicError(e));
    } finally {
      setLoading(false);
    }
  }, [centerId, month, year]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!can(profile, 'reports')) {
    return (
      <GradientScreen>
        <BackHeader title="التقارير" />
        <NoAccess />
      </GradientScreen>
    );
  }

  const exportPdf = async () => {
    try {
      const html = buildReportHtml(
        `تقرير ${arabicMonth(Number(month))} ${year}`,
        `تحصيل ${formatMoney(collected)} · معلق ${formatMoney(pending)} (${pendingCount})`,
        [
          {
            title: 'الحضور حسب المجموعة',
            headers: ['المجموعة', 'حصص', 'حاضر', 'غائب', 'النسبة'],
            rows: visibleAtt.map((a) => {
              const total = a.present + a.absent;
              const pct = total > 0 ? Math.round((a.present / total) * 100) + '%' : '—';
              return [a.group.name, String(a.sessions), String(a.present), String(a.absent), pct];
            }),
          },
          {
            title: 'متوسطات الدرجات',
            headers: ['الطالب', 'المتوسط', 'تقييمات'],
            rows: gradesAvg.map((g) => [g.name, g.avg, String(g.count)]),
          },
        ],
      );
      await shareReportPdf(html, `تقرير ${arabicMonth(Number(month))} ${year}`);
    } catch (e) {
      Alert.alert('تعذر التصدير', arabicError(e));
    }
  };

  return (
    <GradientScreen>
      <BackHeader
        title="التقارير"
        subtitle="حضور وتحصيل ودرجات"
        right={<AppButton title="PDF" icon="print" small onPress={exportPdf} />}
      />
      <View style={{ paddingHorizontal: spacing.lg }}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <OptionPicker label="الشهر" value={month} options={MONTHS} onChange={setMonth} />
          </View>
          <View style={{ flex: 1 }}>
            <OptionPicker label="السنة" value={year} options={YEARS} onChange={setYear} />
          </View>
        </View>
      </View>
      {loading ? (
        <LoadingView message="جاري حساب التقرير..." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatCard icon="cash" value={formatMoney(collected)} label="مُحصل" color={colors.success} />
            <StatCard icon="time" value={formatMoney(pending)} label={`معلق (${pendingCount})`} color={colors.warning} />
          </View>

          <SectionTitle title="الحضور حسب المجموعة" />
          {visibleAtt.length === 0 ? (
            <Card><Text style={styles.dimText}>لا توجد مجموعات</Text></Card>
          ) : visibleAtt.map((a) => {
            const total = a.present + a.absent;
            const pct = total > 0 ? Math.round((a.present / total) * 100) : 0;
            return (
              <Card key={a.group.id} style={styles.attCard}>
                <View style={styles.attHead}>
                  <Text style={styles.attName} numberOfLines={1}>{a.group.name}</Text>
                  <Text style={[styles.attPct, { color: pct >= 75 ? colors.success : pct >= 50 ? colors.warning : colors.danger }]}>
                    {total > 0 ? pct + '%' : '—'}
                  </Text>
                </View>
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: pct >= 75 ? colors.success : pct >= 50 ? colors.warning : colors.danger }]} />
                </View>
                <Text style={styles.attMeta}>{a.sessions} حصص · {a.present} حاضر · {a.absent} غائب</Text>
              </Card>
            );
          })}

          <SectionTitle title={`متوسطات الدرجات (${gradesAvg.length})`} />
          {gradesAvg.length === 0 ? (
            <Card><Text style={styles.dimText}>لا توجد درجات مسجلة لهذا الشهر — {formatDate(`${year}-${String(month).padStart(2, '0')}-01`)}</Text></Card>
          ) : gradesAvg.map((g, i) => (
            <View key={i} style={styles.gradeRow}>
              <Text style={styles.gradeRank}>{i + 1}</Text>
              <Text style={styles.gradeName} numberOfLines={1}>{g.name}</Text>
              <Text style={styles.gradeAvg}>{g.avg}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  dimText: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  attCard: { marginBottom: spacing.sm },
  attHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  attName: { color: colors.text, fontSize: font.md, fontWeight: '800', flex: 1, textAlign: 'right' },
  attPct: { fontSize: font.lg, fontWeight: '900' },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, marginTop: spacing.sm, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  attMeta: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: spacing.xs },
  gradeRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  gradeRank: {
    width: 30, height: 30, borderRadius: radius.full, textAlign: 'center', textAlignVertical: 'center',
    backgroundColor: colors.primary + '22', color: colors.text, fontWeight: '800',
  },
  gradeName: { flex: 1, color: colors.text, fontSize: font.md, fontWeight: '700', textAlign: 'right' },
  gradeAvg: { color: colors.success, fontSize: font.md, fontWeight: '900' },
});
