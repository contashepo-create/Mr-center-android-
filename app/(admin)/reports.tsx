// ============================================================
// التقارير بأربعة تبويبات: نظرة عامة (حضور/تحصيل/درجات الشهر)
// + تقرير طالب شامل (شامل/شهري/مالي/أكاديمي + PDF)
// + الدرجات اليدوية + الحضور والاختبارات — كلها قابلة للتصدير
// ============================================================

import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, EmptyState, LoadingView, NoAccess, SectionTitle, StatCard } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { OptionPicker } from '../../src/components/pickers';
import { can, useTeacherGroupIds } from '../../src/lib/staff';
import {
  fetchAttemptsForExam, fetchAttendanceForSessions, fetchDues, fetchDuesForStudent, fetchExams,
  fetchGrades, fetchGroups, fetchHonorees, fetchManualGradesForMonth, fetchMyExamAttempts,
  fetchPaymentsForMonth, fetchPaymentsForStudent, fetchSessionsForCenterMonth, fetchStudents,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { AppExam, Due, ExamAttempt, Grade, Group, ManualGrade, Payment, Student } from '../../src/lib/types';
import { arabicError, arabicMonth, formatDate, formatMoney } from '../../src/lib/utils';
import { buildReportHtml, fetchReportBranding, shareReportPdf } from '../../src/lib/report';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: arabicMonth(i + 1) }));
const now = new Date();
const YEARS = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => ({ value: String(y), label: String(y) }));

type Tab = 'overview' | 'student' | 'grades' | 'activity';
type ReportKind = 'comprehensive' | 'monthly' | 'financial' | 'academic';
const REPORT_KINDS: { value: ReportKind; label: string }[] = [
  { value: 'comprehensive', label: 'شامل (كل شيء)' },
  { value: 'monthly', label: 'شهري (حضور ومدفوعات الشهر)' },
  { value: 'financial', label: 'مالي (مستحقات ودفعات)' },
  { value: 'academic', label: 'أكاديمي (درجات وامتحانات)' },
];

interface GroupAtt { group: Group; sessions: number; present: number; absent: number }

export default function ReportsScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';
  const [tab, setTab] = useState<Tab>('overview');
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));

  // بيانات النظرة العامة
  const [att, setAtt] = useState<GroupAtt[]>([]);
  const [collected, setCollected] = useState(0);
  const [pending, setPending] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [gradesAvg, setGradesAvg] = useState<{ name: string; avg: string; count: number }[]>([]);
  const [monthGrades, setMonthGrades] = useState<ManualGrade[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [gradeDefs, setGradeDefs] = useState<Grade[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [exams, setExams] = useState<AppExam[]>([]);
  const [allAttempts, setAllAttempts] = useState<ExamAttempt[]>([]);
  const [attByStudent, setAttByStudent] = useState<{ student: Student; present: number; late: number; absent: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const teacherScope = useTeacherGroupIds();

  // تقرير الطالب
  const [srGrade, setSrGrade] = useState<string>('all');
  const [srGroup, setSrGroup] = useState<string>('all');
  const [srStudentId, setSrStudentId] = useState<string | null>(null);
  const [srKind, setSrKind] = useState<ReportKind>('comprehensive');
  const [srData, setSrData] = useState<{
    student: Student; dues: Due[]; payments: Payment[]; grades: ManualGrade[]; attempts: ExamAttempt[];
    honors: { name: string; details: string | null; created_at: string }[];
    att: { present: number; late: number; absent: number };
  } | null>(null);
  const [srBusy, setSrBusy] = useState(false);

  const m = Number(month);
  const y = Number(year);

  const load = useCallback(async () => {
    if (!centerId) return;
    setLoading(true);
    try {
      const [gs, st, gdefs, sessions, dues, pays, grades, ex, honors] = await Promise.all([
        fetchGroups(centerId),
        fetchStudents(centerId),
        fetchGrades(centerId),
        fetchSessionsForCenterMonth(centerId, m, y),
        fetchDues(centerId, m, y),
        fetchPaymentsForMonth(centerId, m, y),
        fetchManualGradesForMonth(centerId, m, y),
        fetchExams(centerId).catch(() => [] as AppExam[]),
        fetchHonorees(centerId).catch(() => []),
      ]);
      setStudents(st); setGroups(gs); setGradeDefs(gdefs); setExams(ex);
      const bySession = new Map(sessions.map((s) => [s.id, s]));
      const attRows = await fetchAttendanceForSessions(sessions.map((s) => s.id));
      // حضور لكل مجموعة
      const perGroup = new Map<string, { sessions: Set<string>; present: number; absent: number }>();
      for (const s of sessions) {
        if (!perGroup.has(s.group_id)) perGroup.set(s.group_id, { sessions: new Set(), present: 0, absent: 0 });
        perGroup.get(s.group_id)!.sessions.add(s.id);
      }
      // حضور لكل طالب (لتبويب النشاط)
      const perStudent = new Map<string, { present: number; late: number; absent: number }>();
      for (const a of attRows) {
        const e = perStudent.get(a.student_id) ?? { present: 0, late: 0, absent: 0 };
        if (a.status === 'present') e.present++;
        else if (a.status === 'late') e.late++;
        else e.absent++;
        perStudent.set(a.student_id, e);
      }
      setAttByStudent(st.map((s) => ({ student: s, ...(perStudent.get(s.id) ?? { present: 0, late: 0, absent: 0 }) }))
        .filter((r) => r.present + r.late + r.absent > 0));
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
      setMonthGrades(grades);
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
      // كل محاولات امتحانات الشهر (لتبويب النشاط)
      const ids = new Set(ex.map((e) => e.id));
      const attempts = (await Promise.all(ex.map((e) => fetchAttemptsForExam(e.id).catch(() => [] as ExamAttempt[]))))
        .flat().filter((a) => ids.has(a.exam_id) && new Date(a.created_at).getMonth() + 1 === m && new Date(a.created_at).getFullYear() === y);
      setAllAttempts(attempts);
      void honors;
    } catch (e) {
      Alert.alert('تعذر التحميل', arabicError(e));
    } finally {
      setLoading(false);
    }
  }, [centerId, m, y]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!can(profile, 'reports')) {
    return (
      <GradientScreen>
        <BackHeader title="التقارير" />
        <NoAccess />
      </GradientScreen>
    );
  }

  const visibleAtt = teacherScope ? att.filter((a) => teacherScope.includes(a.group.id)) : att;
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? 'طالب';

  // تقرير الطالب: قوائم مفلترة
  const srGroups = srGrade === 'all' ? groups : groups.filter((g) => g.grade_id === srGrade);
  const srStudents = srGroup === 'all'
    ? (srGrade === 'all' ? students : students.filter((s) => s.grade_id === srGrade))
    : students.filter((s) => s.group_id === srGroup);
  const teacherStudentIds = (() => {
    if (!teacherScope) return null;
    const ids = new Set<string>();
    for (const s of students) if (s.group_id && teacherScope.includes(s.group_id)) ids.add(s.id);
    return ids;
  })();
  const srFiltered = srStudents.filter((s) => s.status === 'active' && (!teacherStudentIds || teacherStudentIds.has(s.id)));

  const loadStudentReport = async (sid: string) => {
    setSrBusy(true);
    try {
      const student = students.find((s) => s.id === sid);
      if (!student) return;
      const [dues, payments, grades, attempts, honors] = await Promise.all([
        fetchDuesForStudent(sid),
        fetchPaymentsForStudent(sid),
        fetchManualGradesForMonth(centerId, m, y).then((all) => all.filter((g) => g.student_id === sid)),
        fetchMyExamAttempts(sid),
        fetchHonorees(centerId).then((all) => all.filter((h) => h.student_id === sid)),
      ]);
      const sessions = await fetchSessionsForCenterMonth(centerId, m, y);
      const attRows = (await fetchAttendanceForSessions(sessions.map((s) => s.id))).filter((a) => a.student_id === sid);
      const ac = { present: 0, late: 0, absent: 0 };
      for (const a of attRows) {
        if (a.status === 'present') ac.present++;
        else if (a.status === 'late') ac.late++;
        else ac.absent++;
      }
      setSrData({ student, dues, payments, grades, attempts, honors, att: ac });
    } catch (e) {
      Alert.alert('تعذر بناء التقرير', arabicError(e));
    } finally {
      setSrBusy(false);
    }
  };

  const exportStudentPdf = async () => {
    if (!srData) return;
    const { student, dues, payments, grades, attempts, honors, att } = srData;
    const gradeLabel = groups.find((g) => g.id === student.group_id)?.name ?? '—';
    const totalDue = dues.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const totalAtt = att.present + att.late + att.absent;
    const rate = totalAtt > 0 ? Math.round(((att.present + att.late) / totalAtt) * 100) + '%' : '—';
    const dueStatus = (d: Due) => (d.status === 'paid' ? 'مسدد' : d.status === 'partial' ? 'جزئي' : 'غير مدفوع');
    const kindLabel = REPORT_KINDS.find((k) => k.value === srKind)?.label ?? '';
    const sections = [];
    sections.push({
      title: 'الملخص',
      headers: ['البيان', 'القيمة'],
      rows: [
        ['نسبة الحضور', `${rate} (${att.present} حاضر · ${att.late} متأخر · ${att.absent} غائب)`],
        ['إجمالي المستحق', formatMoney(totalDue)],
        ['إجمالي المدفوع', formatMoney(totalPaid)],
        ['الرصيد', formatMoney(totalDue - totalPaid)],
        ['التقييمات هذا الشهر', String(grades.length)],
        ['مرات التكريم', String(honors.length)],
      ],
    });
    if (srKind === 'comprehensive' || srKind === 'academic') {
      sections.push({
        title: 'الدرجات اليدوية',
        headers: ['التقييم', 'الدرجة', 'الشهر'],
        rows: grades.map((g) => [g.title, `${g.score}/${g.max_score}`, `${arabicMonth(g.month)} ${g.grade_year}`]),
      });
      sections.push({
        title: 'الامتحانات الإلكترونية',
        headers: ['التاريخ', 'الدرجة', 'الحالة'],
        rows: attempts.map((a) => [
          formatDate(a.created_at),
          a.status === 'pending_review' ? 'قيد المراجعة' : `${a.score}/${a.max_score}`,
          a.status === 'pending_review' ? 'معلقة' : 'معلنة',
        ]),
      });
      sections.push({
        title: 'التكريمات',
        headers: ['التكريم', 'التاريخ'],
        rows: honors.map((h) => [h.details ?? h.name, formatDate(h.created_at)]),
      });
    }
    if (srKind === 'comprehensive' || srKind === 'financial') {
      sections.push({
        title: 'كشف الحساب (مستحقات)',
        headers: ['الفترة', 'المبلغ', 'الحالة'],
        rows: dues.map((d) => [`${arabicMonth(d.month)} ${d.due_year}`, formatMoney(d.amount), dueStatus(d)]),
      });
      sections.push({
        title: 'سجل الدفعات',
        headers: ['المبلغ', 'التاريخ', 'ملاحظات'],
        rows: payments.map((p) => [formatMoney(p.amount), formatDate(p.payment_date), p.notes ?? '']),
      });
    }
    try {
      const branding = await fetchReportBranding(centerId);
      const html = buildReportHtml(
        `تقرير ${kindLabel}: ${student.name}`,
        `المجموعة: ${gradeLabel} · شهر ${arabicMonth(m)} ${y}`,
        sections,
        { name: profile?.full_name, branding },
      );
      await shareReportPdf(html, `تقرير ${student.name}`);
    } catch (e) {
      Alert.alert('تعذر التصدير', arabicError(e));
    }
  };

  const exportOverviewPdf = async () => {
    try {
      const html = buildReportHtml(
        `تقرير ${arabicMonth(m)} ${y}`,
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
        { name: profile?.full_name, branding: await fetchReportBranding(centerId) },
      );
      await shareReportPdf(html, `تقرير ${arabicMonth(m)} ${y}`);
    } catch (e) {
      Alert.alert('تعذر التصدير', arabicError(e));
    }
  };

  const exportGradesPdf = async () => {
    try {
      const html = buildReportHtml(
        `الدرجات اليدوية — ${arabicMonth(m)} ${y}`,
        `${monthGrades.length} تقييم`,
        [{
          title: 'الدرجات',
          headers: ['الطالب', 'التقييم', 'الدرجة'],
          rows: monthGrades.map((g) => [nameOf(g.student_id), g.title, `${g.score}/${g.max_score}`]),
        }],
        { name: profile?.full_name, branding: await fetchReportBranding(centerId) },
      );
      await shareReportPdf(html, `درجات ${arabicMonth(m)} ${y}`);
    } catch (e) {
      Alert.alert('تعذر التصدير', arabicError(e));
    }
  };

  const exportActivityPdf = async () => {
    try {
      const html = buildReportHtml(
        `الحضور والاختبارات — ${arabicMonth(m)} ${y}`,
        `${attByStudent.length} طالب لهم حضور هذا الشهر`,
        [
          {
            title: 'الحضور حسب الطالب',
            headers: ['الطالب', 'حاضر', 'متأخر', 'غائب', 'النسبة'],
            rows: attByStudent.map((r) => {
              const t = r.present + r.late + r.absent;
              return [r.student.name, String(r.present), String(r.late), String(r.absent), t > 0 ? Math.round(((r.present + r.late) / t) * 100) + '%' : '—'];
            }),
          },
          {
            title: 'محاولات الاختبارات الإلكترونية',
            headers: ['الطالب', 'الامتحان', 'الدرجة', 'الحالة'],
            rows: allAttempts.map((a) => [
              nameOf(a.student_id),
              exams.find((e) => e.id === a.exam_id)?.title ?? '—',
              a.status === 'pending_review' ? '؟' : `${a.score}/${a.max_score}`,
              a.status === 'pending_review' ? 'قيد المراجعة' : 'معلنة',
            ]),
          },
        ],
        { name: profile?.full_name, branding: await fetchReportBranding(centerId) },
      );
      await shareReportPdf(html, `نشاط ${arabicMonth(m)} ${y}`);
    } catch (e) {
      Alert.alert('تعذر التصدير', arabicError(e));
    }
  };

  return (
    <GradientScreen>
      <BackHeader
        title="التقارير"
        subtitle="حضور · تحصيل · درجات · تقرير طالب"
        right={
          <AppButton
            title="PDF"
            icon="print"
            small
            onPress={() => {
              if (tab === 'overview') void exportOverviewPdf();
              else if (tab === 'student') void exportStudentPdf();
              else if (tab === 'grades') void exportGradesPdf();
              else void exportActivityPdf();
            }}
          />
        }
      />
      <View style={{ paddingHorizontal: spacing.lg }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
          <FilterChip label="نظرة عامة" active={tab === 'overview'} onPress={() => setTab('overview')} />
          <FilterChip label="تقرير طالب" active={tab === 'student'} onPress={() => setTab('student')} />
          <FilterChip label="الدرجات" active={tab === 'grades'} onPress={() => setTab('grades')} />
          <FilterChip label="الحضور والاختبارات" active={tab === 'activity'} onPress={() => setTab('activity')} />
        </View>
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

          {/* ═══ تبويب النظرة العامة ═══ */}
          {tab === 'overview' ? (
            <>
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
                <Card><Text style={styles.dimText}>لا توجد درجات مسجلة لهذا الشهر</Text></Card>
              ) : gradesAvg.map((g, i) => (
                <View key={i} style={styles.gradeRow}>
                  <Text style={styles.gradeRank}>{i + 1}</Text>
                  <Text style={styles.gradeName} numberOfLines={1}>{g.name}</Text>
                  <Text style={styles.gradeAvg}>{g.avg}</Text>
                </View>
              ))}
            </>
          ) : null}

          {/* ═══ تبويب تقرير الطالب ═══ */}
          {tab === 'student' ? (
            <>
              <SectionTitle title="اختر الطالب ونوع التقرير" />
              <OptionPicker
                label="الصف"
                icon="school"
                value={srGrade}
                options={[{ value: 'all', label: 'كل الصفوف' }, ...gradeDefs.map((g) => ({ value: g.id, label: g.name }))]}
                onChange={(v) => { setSrGrade(v); setSrGroup('all'); setSrStudentId(null); setSrData(null); }}
                placeholder="كل الصفوف..."
              />
              <OptionPicker
                label="المجموعة"
                icon="albums"
                value={srGroup}
                options={[{ value: 'all', label: 'كل المجموعات' }, ...srGroups.map((g) => ({ value: g.id, label: g.name }))]}
                onChange={(v) => { setSrGroup(v); setSrStudentId(null); setSrData(null); }}
                placeholder="كل المجموعات..."
              />
              <OptionPicker
                label="الطالب"
                icon="person"
                value={srStudentId}
                options={srFiltered.slice(0, 300).map((s) => ({ value: s.id, label: s.name }))}
                onChange={(v) => { setSrStudentId(v); if (v) void loadStudentReport(v); }}
                placeholder="اختر طالباً..."
              />
              <OptionPicker
                label="نوع التقرير"
                icon="document-text"
                value={srKind}
                options={REPORT_KINDS}
                onChange={(v) => setSrKind(v as ReportKind)}
              />
              {srBusy ? <LoadingView message="جاري بناء التقرير..." /> : null}
              {srData ? (
                <>
                  <SectionTitle title={`تقرير: ${srData.student.name}`} />
                  <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                    <StatCard icon="checkmark-circle" value={
                      (srData.att.present + srData.att.late + srData.att.absent) > 0
                        ? Math.round(((srData.att.present + srData.att.late) / (srData.att.present + srData.att.late + srData.att.absent)) * 100) + '%'
                        : '—'
                    } label={`حضور (${srData.att.present + srData.att.late}/${srData.att.present + srData.att.late + srData.att.absent})`} color={colors.success} />
                    <StatCard icon="wallet" value={formatMoney(
                      srData.dues.reduce((s, d) => s + (Number(d.amount) || 0), 0)
                      - srData.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
                    )} label="الرصيد" color={colors.warning} />
                  </View>
                  <View style={{ height: spacing.md }} />
                  <AppButton title="تصدير PDF" icon="print" onPress={() => void exportStudentPdf()} />
                </>
              ) : !srBusy ? (
                <Card><Text style={styles.dimText}>اختر طالباً لبناء تقريره — شامل أو شهري أو مالي أو أكاديمي</Text></Card>
              ) : null}
            </>
          ) : null}

          {/* ═══ تبويب الدرجات ═══ */}
          {tab === 'grades' ? (
            <>
              <SectionTitle title={`الدرجات اليدوية — ${arabicMonth(m)} ${y} (${monthGrades.length})`} />
              {monthGrades.length === 0 ? (
                <Card><Text style={styles.dimText}>لا توجد درجات يدوية مسجلة هذا الشهر</Text></Card>
              ) : monthGrades.map((g, i) => (
                <View key={g.id ?? i} style={styles.gradeRow}>
                  <Text style={styles.gradeRank}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gradeName} numberOfLines={1}>{nameOf(g.student_id)}</Text>
                    <Text style={styles.gradeSub}>{g.title}</Text>
                  </View>
                  <Text style={styles.gradeAvg}>{g.score}/{g.max_score}</Text>
                </View>
              ))}
            </>
          ) : null}

          {/* ═══ تبويب الحضور والاختبارات ═══ */}
          {tab === 'activity' ? (
            <>
              <SectionTitle title={`الحضور حسب الطالب — ${arabicMonth(m)} ${y} (${attByStudent.length})`} />
              {attByStudent.length === 0 ? (
                <Card><Text style={styles.dimText}>لا يوجد حضور مسجل هذا الشهر</Text></Card>
              ) : attByStudent.map((r) => {
                const t = r.present + r.late + r.absent;
                const pct = t > 0 ? Math.round(((r.present + r.late) / t) * 100) : 0;
                return (
                  <View key={r.student.id} style={styles.gradeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.gradeName} numberOfLines={1}>{r.student.name}</Text>
                      <Text style={styles.gradeSub}>{r.present} حاضر · {r.late} متأخر · {r.absent} غائب</Text>
                    </View>
                    <Text style={[styles.gradeAvg, { color: pct >= 75 ? colors.success : pct >= 50 ? colors.warning : colors.danger }]}>{pct}%</Text>
                  </View>
                );
              })}
              <SectionTitle title={`محاولات الاختبارات (${allAttempts.length})`} />
              {allAttempts.length === 0 ? (
                <Card><Text style={styles.dimText}>لا توجد محاولات هذا الشهر</Text></Card>
              ) : allAttempts.map((a) => (
                <View key={a.id} style={styles.gradeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gradeName} numberOfLines={1}>{nameOf(a.student_id)}</Text>
                    <Text style={styles.gradeSub}>{exams.find((e) => e.id === a.exam_id)?.title ?? '—'} · {formatDate(a.created_at)}</Text>
                  </View>
                  <Text style={[styles.gradeAvg, { color: a.status === 'pending_review' ? colors.warning : Number(a.score) >= Number(a.max_score) * 0.5 ? colors.success : colors.danger }]}>
                    {a.status === 'pending_review' ? '؟' : `${a.score}/${a.max_score}`}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </GradientScreen>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[stylesLocal.chip, active && stylesLocal.chipActive]}>
      <Text style={[stylesLocal.chipText, active && stylesLocal.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
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
  gradeSub: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  gradeAvg: { color: colors.success, fontSize: font.md, fontWeight: '900' },
}));

const stylesLocal = themedStyles(() => StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary + '33', borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '800' },
  chipTextActive: { color: colors.text },
}));
