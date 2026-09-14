// ============================================================
// تقريري الشامل: بيانات الطالب + الحضور + الدرجات + المستحقات
// والدفعات في شاشة واحدة، مع تصدير PDF (مطابق لصفحة الويب student/report)
// ============================================================

import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, LoadingView, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import {
  fetchDuesForStudent, fetchGradesForStudent, fetchMyAttendance, fetchPaymentsForStudent, fetchStudentById,
} from '../../src/lib/api';
import { buildReportHtml, fetchReportBranding, shareReportPdf } from '../../src/lib/report';
import { useSession } from '../../src/lib/session';
import type { Attendance, Due, ManualGrade, Payment, SessionRecord, Student } from '../../src/lib/types';
import { arabicError, arabicMonth, formatDate, formatMoney } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

export default function MyReportScreen() {
  const { profile } = useSession();
  const [student, setStudent] = useState<Student | null>(null);
  const [attendance, setAttendance] = useState<(Attendance & { sessions?: SessionRecord | null })[]>([]);
  const [grades, setGrades] = useState<ManualGrade[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.student_id) { setLoading(false); return; }
    try {
      const [st, a, g, d, p] = await Promise.all([
        fetchStudentById(profile.student_id),
        fetchMyAttendance(profile.student_id),
        fetchGradesForStudent(profile.student_id),
        fetchDuesForStudent(profile.student_id),
        fetchPaymentsForStudent(profile.student_id),
      ]);
      setStudent(st);
      setAttendance(a);
      setGrades(g);
      setDues(d);
      setPayments(p);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [profile?.student_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const present = attendance.filter((a) => a.status === 'present' || a.status === 'late').length;
  const absent = attendance.filter((a) => a.status === 'absent').length;
  const pendingDues = dues.filter((d) => d.status !== 'paid');
  const avg = grades.length
    ? Math.round((grades.reduce((s, g) => s + (Number(g.score) / Math.max(1, Number(g.max_score))) * 100, 0) / grades.length))
    : null;
  const dueStatusLabel = (d: Due) => (d.status === 'paid' ? 'مدفوع' : d.status === 'partial' ? 'جزئي' : 'معلق');

  const print = async () => {
    setBusy(true);
    try {
      const branding = await fetchReportBranding(profile?.center_id);
      const html = buildReportHtml(
        `تقرير الطالب ${student?.name ?? profile?.full_name ?? ''}`,
        'تقرير شامل — خاص بالطالب',
        [
          {
            title: 'البيانات',
            headers: ['البند', 'القيمة'],
            rows: [
              ['الاسم', student?.name ?? profile?.full_name ?? '—'],
              ['الهاتف', student?.phone ?? '—'],
              ['ولي الأمر', student?.guardian_phone ?? '—'],
              ['البريد', profile?.email ?? student?.email ?? '—'],
            ],
          },
          {
            title: 'الحضور',
            headers: ['البند', 'القيمة'],
            rows: [
              ['سجلات الحضور', String(attendance.length)],
              ['حاضر/متأخر', String(present)],
              ['غائب', String(absent)],
            ],
          },
          {
            title: 'الدرجات',
            headers: ['التقييم', 'الدرجة', 'النسبة', 'التاريخ'],
            rows: grades.map((g) => [
              g.title,
              `${g.score}/${g.max_score}`,
              `${Math.round((Number(g.score) / Math.max(1, Number(g.max_score))) * 100)}%`,
              formatDate(g.created_at),
            ]),
          },
          {
            title: 'المستحقات',
            headers: ['الفترة', 'المبلغ', 'الحالة'],
            rows: dues.map((d) => [`${arabicMonth(d.month)} ${d.due_year}`, formatMoney(d.amount), dueStatusLabel(d)]),
          },
          {
            title: 'الدفعات',
            headers: ['التاريخ', 'المبلغ', 'ملاحظات'],
            rows: payments.map((p) => [formatDate(p.payment_date), formatMoney(p.amount), p.notes ?? '—']),
          },
        ],
        { name: profile?.full_name, branding },
      );
      await shareReportPdf(html, `تقرير ${student?.name ?? profile?.full_name ?? 'الطالب'}`);
    } catch (e) {
      Alert.alert('تعذر إنشاء التقرير', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GradientScreen>
      <BackHeader title="تقريري الشامل" subtitle="بياناتك وحضورك ودرجاتك ومستحقاتك في مكان واحد" />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : (
        <KeyboardScreen>
          <View style={styles.statsRow}>
            <Stat label="حاضر/متأخر" value={String(present)} color={colors.success} />
            <Stat label="غائب" value={String(absent)} color={colors.danger} />
            <Stat label="متوسط الدرجات" value={avg === null ? '—' : `${avg}%`} color={colors.info} />
          </View>

          <AppButton title="تصدير PDF" icon="document-text" variant="outline" onPress={print} loading={busy} />

          <SectionTitle title="البيانات" />
          <Card>
            <Row label="الاسم" value={student?.name ?? profile?.full_name ?? '—'} />
            <Row label="الهاتف" value={student?.phone ?? '—'} />
            <Row label="ولي الأمر" value={student?.guardian_phone ?? '—'} />
            <Row label="البريد" value={profile?.email ?? student?.email ?? '—'} last />
          </Card>

          <SectionTitle title={`الدرجات (${grades.length})`} />
          {grades.length === 0 ? (
            <Card><Text style={styles.dimText}>لا توجد درجات مسجلة بعد</Text></Card>
          ) : grades.map((g) => (
            <Card key={g.id} style={styles.rowCard}>
              <View style={styles.between}>
                <Text style={styles.itemTitle}>{g.title}</Text>
                <Text style={styles.itemValue}>{g.score}/{g.max_score}</Text>
              </View>
              <Text style={styles.itemMeta}>{formatDate(g.created_at)}</Text>
            </Card>
          ))}

          <SectionTitle title={`المستحقات (${pendingDues.length} معلق)`} />
          {dues.length === 0 ? (
            <Card><Text style={styles.dimText}>لا توجد مستحقات مسجلة</Text></Card>
          ) : dues.map((d) => (
            <Card key={d.id} style={styles.rowCard}>
              <View style={styles.between}>
                <Text style={styles.itemTitle}>{arabicMonth(d.month)} {d.due_year}</Text>
                <Text style={[styles.itemValue, { color: d.status === 'paid' ? colors.success : d.status === 'partial' ? colors.warning : colors.danger }]}>
                  {formatMoney(d.amount)}
                </Text>
              </View>
              <Text style={styles.itemMeta}>{dueStatusLabel(d)}</Text>
            </Card>
          ))}

          <SectionTitle title={`الدفعات (${payments.length})`} />
          {payments.length === 0 ? (
            <Card><Text style={styles.dimText}>لا توجد دفعات مسجلة</Text></Card>
          ) : payments.map((p) => (
            <Card key={p.id} style={styles.rowCard}>
              <View style={styles.between}>
                <Text style={styles.itemTitle}>{formatDate(p.payment_date)}</Text>
                <Text style={[styles.itemValue, { color: colors.success }]}>{formatMoney(p.amount)}</Text>
              </View>
              {p.notes ? <Text style={styles.itemMeta}>{p.notes}</Text> : null}
            </Card>
          ))}
        </KeyboardScreen>
      )}
    </GradientScreen>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  statValue: { fontSize: font.lg, fontWeight: '900' },
  statLabel: { color: colors.textMuted, fontSize: font.xs, marginTop: 4 },
  dimText: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.textSecondary, fontSize: font.md },
  rowValue: { color: colors.text, fontSize: font.md, fontWeight: '800', maxWidth: '60%' },
  rowCard: { marginBottom: spacing.sm },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  itemValue: { color: colors.text, fontSize: font.md, fontWeight: '900' },
  itemMeta: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 4 },
}));
