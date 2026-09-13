// ============================================================
// ملف الطالب لدى مسئول السنتر: بيانات + مجموعة + درجات + دفعات
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, ListItem, LoadingView, SectionTitle, SheetHandle, StatCard } from '../../../src/components/controls';
import { BackHeader, GradientScreen } from '../../../src/components/layout';
import { FormMessage, OptionPicker } from '../../../src/components/pickers';
import {
  addManualGrade, addStudentToGroup, deleteManualGrade, fetchDuesForStudent, fetchExams, fetchGrades, fetchGradesForStudent,
  fetchGroups, fetchHonorees, fetchMyAttendance, fetchMyCenter, fetchMyExamAttempts, fetchPaymentsForStudent, fetchStudentById,
  fetchStudentGroups, logActivity, recordPayment, removeStudentFromGroup, updateStudentGroup, type Honoree,
} from '../../../src/lib/api';
import { guardianReportText, openWhatsApp } from '../../../src/lib/whatsapp';
import { useSession } from '../../../src/lib/session';
import { can, isOwner } from '../../../src/lib/staff';
import { buildReportHtml, fetchReportBranding, shareReportPdf } from '../../../src/lib/report';
import type { Attendance, Due, ExamAttempt, Grade, Group, ManualGrade, Payment, Student } from '../../../src/lib/types';
import { arabicError, arabicMonth, formatDate, formatDays, formatMoney, formatTimeAr } from '../../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../../src/theme';

export default function StudentFileScreen() {
  const { id, pay } = useLocalSearchParams<{ id: string; pay?: string }>();
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';

  const [student, setStudent] = useState<Student | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [grades, setGrades] = useState<ManualGrade[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [attendanceCount, setAttendanceCount] = useState({ present: 0, absent: 0 });
  const [attRows, setAttRows] = useState<(Attendance & { sessions?: { session_date?: string } | null })[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [gradeDefs, setGradeDefs] = useState<Grade[]>([]);
  const [honors, setHonors] = useState<Honoree[]>([]);
  const [centerName, setCenterName] = useState('السنتر');
  const [examTitles, setExamTitles] = useState<Record<string, string>>({});
  const [extraGroups, setExtraGroups] = useState<string[]>([]);
  const [addGroupId, setAddGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // نموذج الدفعة
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDueId, setPayDueId] = useState<string | null>(null);
  const [payNotes, setPayNotes] = useState('');
  // نموذج الدرجة
  const [gradeOpen, setGradeOpen] = useState(false);
  const [gradeTitle, setGradeTitle] = useState('');
  const [gradeScore, setGradeScore] = useState('');
  const [gradeMax, setGradeMax] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [s, g, gr, p, d, att, ex, gd, ho, c, xg, exAll] = await Promise.all([
        fetchStudentById(id),
        fetchGroups(centerId),
        fetchGradesForStudent(id),
        fetchPaymentsForStudent(id),
        fetchDuesForStudent(id),
        fetchMyAttendance(id),
        fetchMyExamAttempts(id),
        fetchGrades(centerId),
        fetchHonorees(centerId),
        fetchMyCenter(centerId),
        fetchStudentGroups(id),
        fetchExams(centerId).catch(() => []),
      ]);
      setExamTitles(Object.fromEntries(exAll.map((e) => [e.id, e.title])));
      setCenterName(c?.name ?? 'السنتر');
      setExtraGroups(xg.map((r) => r.group_id));
      setAddGroupId(null);
      setStudent(s);
      setGroups(g);
      setGrades(gr);
      setPayments(p);
      setDues(d);
      setAttRows(att);
      setAttempts(ex);
      setGradeDefs(gd);
      setHonors(ho.filter((h) => h.student_id === id));
      let present = 0; let absent = 0;
      for (const a of att) {
        if (a.status === 'present' || a.status === 'late') present++;
        else if (a.status === 'absent') absent++;
      }
      setAttendanceCount({ present, absent });
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [id, centerId]);

  useFocusEffect(useCallback(() => {
    void load().then(() => {
      // فتح نموذج التحصيل تلقائياً إذا جئنا من زر «تحصيل»
      if (pay) {
        setPayDueId(pay);
        setPayOpen(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]));

  const groupName = groups.find((g) => g.id === student?.group_id)?.name ?? 'بدون مجموعة';

  const changeGroup = async (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    try {
      await updateStudentGroup(id!, groupId === 'none' ? null : groupId, group?.grade_id ?? student?.grade_id ?? null);
      await load();
    } catch (e) {
      Alert.alert('تعذر النقل', arabicError(e));
    }
  };

  const savePayment = async () => {
    setFormError(null);
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return setFormError('أدخل مبلغاً صحيحاً');
    const due = dues.find((d) => d.id === payDueId);
    const now = new Date();
    setBusy(true);
    try {
      await recordPayment({
        centerId,
        studentId: id!,
        dueId: payDueId,
        amount,
        month: due?.month ?? now.getMonth() + 1,
        year: due?.due_year ?? now.getFullYear(),
        notes: payNotes,
      });
      setPayOpen(false);
      setPayAmount(''); setPayNotes(''); setPayDueId(null);
      await logActivity(centerId, 'payment_recorded', `${student?.name} — دفعة ${formatMoney(amount)}`);
      await load();
      Alert.alert('تم التحصيل', `تم تسجيل دفعة ${formatMoney(amount)} بنجاح`);
    } catch (e) {
      setFormError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const saveGrade = async () => {
    setFormError(null);
    const score = Number(gradeScore);
    const max = Number(gradeMax) || 0;
    if (isNaN(score) || score < 0) return setFormError('أدخل الدرجة بشكل صحيح');
    if (max <= 0) return setFormError('أدخل الدرجة النهائية (من كام)');
    if (score > max) return setFormError(`الدرجة (${score}) تتجاوز النهائية (${max}) — راجع الرقم`);
    const now = new Date();
    setBusy(true);
    try {
      await addManualGrade({
        centerId,
        studentId: id!,
        title: gradeTitle || 'تقييم',
        score, maxScore: max,
        month: now.getMonth() + 1, year: now.getFullYear(),
      });
      setGradeOpen(false);
      setGradeTitle(''); setGradeScore(''); setGradeMax('');
      await load();
    } catch (e) {
      setFormError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const avgText = () => {
    const valid = grades.filter((g) => Number(g.max_score) > 0);
    if (valid.length === 0) return undefined;
    const pct = valid.reduce((s, g) => s + (Number(g.score) / Number(g.max_score)) * 100, 0) / valid.length;
    return `${pct.toFixed(1)}%`;
  };

  const sendGuardianReport = async () => {
    if (!student) return;
    if (!student.guardian_phone) {
      Alert.alert('لا يوجد رقم', 'سجّل رقم ولي الأمر أولاً من تعديل بيانات الطالب');
      return;
    }
    const msg = guardianReportText({
      centerName, studentName: student.name,
      pendingTotal: pendingDues.reduce((s, d) => s + (Number(d.amount) || 0), 0),
      pendingCount: pendingDues.length,
      present: attendanceCount.present, absent: attendanceCount.absent,
      avgText: avgText(),
    });
    const ok = await openWhatsApp(student.guardian_phone, msg);
    if (!ok) Alert.alert('تعذر الفتح', 'رقم ولي الأمر غير صالح أو واتساب غير مثبت');
  };

  const sendStudentNotice = async () => {
    if (!student) return;
    if (!student.phone) {
      Alert.alert('لا يوجد رقم', 'هذا الطالب بلا رقم هاتف مسجل');
      return;
    }
    const ok = await openWhatsApp(student.phone, `${centerName}\nمرحباً ${student.name} — رسالة من إدارة سنترك.`);
    if (!ok) Alert.alert('تعذر الفتح', 'رقم الطالب غير صالح أو واتساب غير مثبت');
  };

  /** تقرير شامل زي الموقع: ترويسة + عدادات + درجات + كشف حساب + حضور + نشاط + تكريم */
  const shareReport = async () => {
    if (!student) return;
    try {
      const myGroup = groups.find((g) => g.id === student.group_id);
      const gradeLabel = gradeDefs.find((g) => g.id === student.grade_id)?.name ?? '—';
      const totalDue = dues.reduce((s, d) => s + (Number(d.amount) || 0), 0);
      const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const balance = totalDue - totalPaid;
      const totalAtt = attendanceCount.present + attendanceCount.absent;
      const rate = totalAtt > 0 ? Math.round((attendanceCount.present / totalAtt) * 100) + '%' : '—';
      const dueStatus = (d: Due) => (d.status === 'paid' ? 'مسدد' : d.status === 'partial' ? 'جزئي' : 'غير مدفوع');
      const html = buildReportHtml(
        `تقرير شامل: ${student.name}`,
        [
          `الصف: ${gradeLabel}`, `المجموعة: ${myGroup?.name ?? '—'}`,
          myGroup ? `المواعيد: ${formatDays(myGroup.days)} ${formatTimeAr(myGroup.start_time)}` : '',
          `هاتف: ${student.phone ?? '—'}`,
        ].filter(Boolean).join(' · '),
        [
          {
            title: 'الملخص',
            headers: ['البيان', 'القيمة'],
            rows: [
              ['نسبة الحضور', `${rate} (${attendanceCount.present} حاضر / ${attendanceCount.absent} غائب)`],
              ['إجمالي المستحق', formatMoney(totalDue)],
              ['إجمالي المدفوع', formatMoney(totalPaid)],
              ['الرصيد المتبقي', formatMoney(balance)],
              ['عدد التقييمات', String(grades.length)],
              ['مرات التكريم', String(honors.length)],
            ],
          },
          {
            title: 'الدرجات اليدوية',
            headers: ['التقييم', 'الدرجة', 'الشهر'],
            rows: grades.map((g) => [g.title, `${g.score}/${g.max_score}`, `${arabicMonth(g.month)} ${g.grade_year}`]),
          },
          {
            title: 'الامتحانات الإلكترونية',
            headers: ['الامتحان', 'الدرجة', 'الحالة'],
            rows: attempts.map((a) => [
              formatDate(a.created_at),
              a.status === 'pending_review' ? 'قيد المراجعة' : `${a.score}/${a.max_score}`,
              a.status === 'pending_review' ? 'معلقة' : 'معلنة',
            ]),
          },
          {
            title: 'كشف الحساب (مستحقات)',
            headers: ['الفترة', 'المبلغ', 'الحالة'],
            rows: dues.map((d) => [`${arabicMonth(d.month)} ${d.due_year}`, formatMoney(d.amount), dueStatus(d)]),
          },
          {
            title: 'سجل الدفعات',
            headers: ['المبلغ', 'التاريخ', 'ملاحظات'],
            rows: payments.map((p) => [formatMoney(p.amount), formatDate(p.payment_date), p.notes ?? '']),
          },
          {
            title: `الحضور (آخر ${Math.min(attRows.length, 12)})`,
            headers: ['التاريخ', 'الحالة'],
            rows: [...attRows]
              .sort((a, b) => ((a.sessions?.session_date ?? '') < (b.sessions?.session_date ?? '') ? 1 : -1))
              .slice(0, 12)
              .map((a) => [
                formatDate(a.sessions?.session_date ?? a.created_at),
                a.status === 'present' ? 'حاضر' : a.status === 'late' ? 'متأخر' : 'غائب',
              ]),
          },
          {
            title: 'التكريمات',
            headers: ['التكريم', 'التاريخ'],
            rows: honors.map((h) => [h.details ?? h.name, formatDate(h.created_at)]),
          },
        ],
        { name: profile?.full_name, branding: await fetchReportBranding(centerId) },
      );
      await shareReportPdf(html, `تقرير ${student.name}`);
    } catch (e) {
      Alert.alert('تعذر التقرير', arabicError(e));
    }
  };

  if (loading) {
    return <GradientScreen><LoadingView message="جاري تحميل ملف الطالب..." /></GradientScreen>;
  }
  if (!student) {
    return (
      <GradientScreen>
        <BackHeader title="ملف الطالب" />
        <View style={{ padding: spacing.xl }}>
          <Text style={{ color: colors.textSecondary, textAlign: 'center', lineHeight: 22 }}>
            تعذر العثور على هذا الطالب — ربما حُذف من جهاز آخر أو القائمة قديمة
          </Text>
          <View style={{ height: spacing.lg }} />
          <AppButton
            title="إعادة المحاولة"
            icon="refresh"
            small
            onPress={() => { setLoading(true); void load(); }}
          />
          <View style={{ height: spacing.sm }} />
          <AppButton title="رجوع للقائمة" variant="ghost" small onPress={() => router.back()} />
        </View>
      </GradientScreen>
    );
  }

  const pendingDues = dues.filter((d) => d.status !== 'paid');

  const buildHistory = () => {
    const events: { date: string; text: string; color: string }[] = [
      ...attRows.slice(0, 60).map((a) => ({
        date: a.sessions?.session_date ?? a.created_at.slice(0, 10),
        text: a.status === 'present' ? 'حاضر في حصة' : a.status === 'late' ? 'متأخر عن حصة' : 'غائب عن حصة',
        color: a.status === 'absent' ? colors.danger : a.status === 'late' ? colors.warning : colors.success,
      })),
      ...payments.slice(0, 60).map((p) => ({
        date: p.payment_date, text: `دفعة ${formatMoney(p.amount)}`, color: colors.success,
      })),
      ...grades.slice(0, 60).map((g) => ({
        date: g.created_at.slice(0, 10), text: `${g.title}: ${g.score}/${g.max_score}`, color: colors.warning,
      })),
    ];
    return events.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);
  };

  return (
    <GradientScreen>
      <BackHeader title="ملف الطالب" subtitle={student.name} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* البيانات الأساسية */}
        <Card>
          <View style={styles.nameRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{student.name.trim().charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{student.name}</Text>
              <Text style={styles.subInfo}>{student.phone ?? 'بدون هاتف'}</Text>
              {student.guardian_phone ? <Text style={styles.subInfo}>ولي الأمر: {student.guardian_phone}</Text> : null}
              {student.email ? <Text style={styles.subInfo}>{student.email}</Text> : null}
            </View>
          </View>
          {!isOwner(profile) ? (
            <Text style={styles.subInfo}>
              المجموعة: {groups.find((g) => g.id === student.group_id)?.name ?? 'بدون مجموعة'}
            </Text>
          ) : (
            <OptionPicker
              label="المجموعة الأساسية"
              icon="albums"
              value={student.group_id ?? 'none'}
              options={[
                { value: 'none', label: 'بدون مجموعة' },
                ...groups.map((g) => ({ value: g.id, label: g.name, subtitle: formatMoney(g.monthly_fee) })),
              ]}
              onChange={changeGroup}
            />
          )}
          <Text style={styles.subLabel}>مجموعات إضافية (مواد أخرى عند مدرسين مختلفين)</Text>
          {extraGroups.length === 0 ? (
            <Text style={styles.dimText}>غير منضم لمجموعات إضافية</Text>
          ) : extraGroups.map((gid) => (
            <View key={gid} style={styles.extraRow}>
              <Text style={styles.extraName} numberOfLines={1}>
                {groups.find((g) => g.id === gid)?.name ?? 'مجموعة'}
              </Text>
              {isOwner(profile) ? (
                <Pressable
                  hitSlop={8}
                  onPress={async () => {
                    try { await removeStudentFromGroup(id!, gid); await load(); }
                    catch (e) { Alert.alert('تعذر الإزالة', arabicError(e)); }
                  }}
                >
                  <Ionicons name="close-circle" size={20} color={colors.danger} />
                </Pressable>
              ) : null}
            </View>
          ))}
          {isOwner(profile) ? (
            <>
              <View style={{ height: spacing.sm }} />
              <OptionPicker
                label="إضافة لمجموعة"
                icon="add-circle"
                value={addGroupId}
                options={groups
                  .filter((g) => g.id !== student.group_id && !extraGroups.includes(g.id))
                  .map((g) => ({ value: g.id, label: g.name }))}
                onChange={async (v) => {
                  setAddGroupId(v);
                  try { await addStudentToGroup(centerId, id!, v); await load(); }
                  catch (e) { Alert.alert('تعذر الإضافة', arabicError(e)); }
                }}
                placeholder="اختر مجموعة إضافية..."
              />
            </>
          ) : null}
        </Card>

        {/* ملخص */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <StatCard icon="checkmark-done" value={attendanceCount.present} label="حضور" color={colors.success} />
          <StatCard icon="close-circle" value={attendanceCount.absent} label="غياب" color={colors.danger} />
          <StatCard icon="time" value={pendingDues.length} label="مستحق معلق" color={colors.warning} />
        </View>

        {/* إجراءات (حسب صلاحيات المدرس) */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          {can(profile, 'collect') ? (
            <View style={{ flex: 1 }}>
              <AppButton title="تسجيل دفعة" icon="cash" small variant="success" onPress={() => { setPayOpen(true); setFormError(null); }} />
            </View>
          ) : null}
          {can(profile, 'grades') ? (
            <View style={{ flex: 1 }}>
              <AppButton title="إضافة درجة" icon="star" small variant="accent" onPress={() => { setGradeOpen(true); setFormError(null); }} />
            </View>
          ) : null}
        </View>
        {can(profile, 'reports') ? (
          <View style={{ marginTop: spacing.sm }}>
            <AppButton title="تقرير الطالب (PDF)" icon="print" small variant="outline" onPress={shareReport} />
          </View>
        ) : null}
        {can(profile, 'notify') ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <AppButton title="واتساب ولي الأمر" icon="logo-whatsapp" small variant="success" onPress={() => sendGuardianReport()} />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton title="واتساب الطالب" icon="chatbox" small variant="outline" onPress={() => sendStudentNotice()} />
            </View>
          </View>
        ) : null}

        {/* المستحقات المعلقة — تظهر لمن يملك التحصيل أو التقارير فقط */}
        {(can(profile, 'collect') || can(profile, 'reports')) ? (<>
        <SectionTitle title="المستحقات المعلقة" />
        {pendingDues.length === 0 ? (
          <Card><Text style={styles.okText}>✅ لا توجد مستحقات معلقة</Text></Card>
        ) : pendingDues.map((d) => (
          <ListItem
            key={d.id}
            title={`${arabicMonth(d.month)} ${d.due_year}`}
            subtitle={formatMoney(d.amount)}
            icon="time"
            iconColor={colors.warning}
            right={can(profile, 'collect') ? (
              <AppButton title="تحصيل" small variant="success" onPress={() => { setPayDueId(d.id); setPayAmount(String(d.amount)); setPayOpen(true); }} />
            ) : undefined}
          />
        ))}
        </>) : null}

        {/* الدرجات */}
        <SectionTitle title={`الدرجات (${grades.length})`} />
        {grades.length === 0 ? (
          <Card><Text style={styles.dimText}>لا توجد درجات مسجلة بعد</Text></Card>
        ) : grades.slice(0, 15).map((g) => (
          <ListItem
            key={g.id}
            title={g.title}
            subtitle={`${arabicMonth(g.month)} ${g.grade_year}`}
            icon="star"
            iconColor={colors.warning}
            badge={{
              text: `${g.score}/${g.max_score}`,
              color: g.score >= g.max_score * 0.5 ? colors.success : colors.danger,
              bg: g.score >= g.max_score * 0.5 ? colors.successBg : colors.dangerBg,
            }}
            right={can(profile, 'grades') ? (
              <Ionicons
                name="trash" size={16} color={colors.danger}
                onPress={() => {
                  Alert.alert('حذف الدرجة', `حذف «${g.title}»؟`, [
                    { text: 'إلغاء', style: 'cancel' },
                    { text: 'حذف', style: 'destructive', onPress: async () => { await deleteManualGrade(g.id); await load(); } },
                  ]);
                }}
              />
            ) : undefined}
          />
        ))}

        {/* المحاولات الإلكترونية */}
        <SectionTitle title={`الامتحانات الإلكترونية (${attempts.length})`} />
        {attempts.length === 0 ? (
          <Card><Text style={styles.dimText}>لم يؤدِ أي امتحان إلكتروني بعد</Text></Card>
        ) : attempts.slice(0, 10).map((a) => (
          <ListItem
            key={a.id}
            title={`${examTitles[a.exam_id] ?? 'امتحان'} (${formatDate(a.created_at)})`}
            subtitle={`${a.score}/${a.max_score}`}
            icon="document-text"
            iconColor={Number(a.score) >= Number(a.max_score) * 0.5 ? colors.success : colors.danger}
          />
        ))}

        {/* سجل النشاط */}
        <SectionTitle title="سجل النشاط (الأحدث)" />
        {buildHistory().length === 0 ? (
          <Card><Text style={styles.dimText}>لا نشاط مسجل بعد</Text></Card>
        ) : buildHistory().map((h, i) => (
          <View key={i} style={styles.historyRow}>
            <View style={[styles.historyDot, { backgroundColor: h.color }]} />
            <Text style={styles.historyText}>{h.text}</Text>
            <Text style={styles.historyDate}>{formatDate(h.date)}</Text>
          </View>
        ))}

        {/* سجل الدفعات — لنفس الصلاحيتين */}
        {(can(profile, 'collect') || can(profile, 'reports')) ? (<>
        <SectionTitle title={`سجل الدفعات (${payments.length})`} />
        {payments.length === 0 ? (
          <Card><Text style={styles.dimText}>لا توجد دفعات مسجلة</Text></Card>
        ) : payments.slice(0, 15).map((p) => (
          <ListItem
            key={p.id}
            title={formatMoney(p.amount)}
            subtitle={`${arabicMonth(p.month)} ${p.payment_year} · ${formatDate(p.payment_date)}`}
            icon="cash"
            iconColor={colors.success}
          />
        ))}
        </>) : null}
      </ScrollView>

      {/* نموذج الدفعة */}
      <Modal visible={payOpen} transparent animationType="slide" onRequestClose={() => setPayOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <SheetHandle />
            <Text style={styles.modalTitle}>تسجيل دفعة — {student.name}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
            <OptionPicker
              label="ربط بمستحق (اختياري)"
              icon="link"
              value={payDueId}
              options={pendingDues.map((d) => ({
                value: d.id,
                label: `${arabicMonth(d.month)} ${d.due_year}`,
                subtitle: formatMoney(d.amount),
              }))}
              onChange={(v) => {
                setPayDueId(v);
                const due = dues.find((d) => d.id === v);
                if (due) setPayAmount(String(due.amount));
              }}
              placeholder="دفعة حرة بدون مستحق..."
            />
            <AppInput label="المبلغ (ج.م)" icon="cash" placeholder="مثال: 200" value={payAmount} onChangeText={setPayAmount} keyboardType="numeric" textAlign="left" style={{ writingDirection: 'ltr' }} />
            <AppInput label="ملاحظات (اختياري)" icon="document-text" placeholder="مثال: دفع كاش" value={payNotes} onChangeText={setPayNotes} />
            <FormMessage type="error" text={formError} />
            <AppButton title="تأكيد التحصيل" icon="checkmark" variant="success" onPress={savePayment} loading={busy} />
            <View style={{ height: spacing.sm }} />
            <AppButton title="إلغاء" variant="ghost" small onPress={() => setPayOpen(false)} />
            <View style={{ height: spacing.xl }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* نموذج الدرجة */}
      <Modal visible={gradeOpen} transparent animationType="slide" onRequestClose={() => setGradeOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <SheetHandle />
            <Text style={styles.modalTitle}>إضافة درجة — {student.name}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
            <AppInput label="عنوان التقييم" icon="star" placeholder="مثال: اختبار شهر مارس" value={gradeTitle} onChangeText={setGradeTitle} />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <AppInput label="الدرجة" icon="trophy" placeholder="18" value={gradeScore} onChangeText={setGradeScore} keyboardType="numeric" textAlign="left" style={{ writingDirection: 'ltr' }} />
              </View>
              <View style={{ flex: 1 }}>
                <AppInput label="من (النهائية)" icon="ribbon" placeholder="20" value={gradeMax} onChangeText={setGradeMax} keyboardType="numeric" textAlign="left" style={{ writingDirection: 'ltr' }} />
              </View>
            </View>
            <FormMessage type="error" text={formError} />
            <AppButton title="حفظ الدرجة" icon="checkmark" variant="accent" onPress={saveGrade} loading={busy} />
            <View style={{ height: spacing.sm }} />
            <AppButton title="إلغاء" variant="ghost" small onPress={() => setGradeOpen(false)} />
            <View style={{ height: spacing.xl }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  avatar: {
    width: 60, height: 60, borderRadius: radius.full,
    backgroundColor: colors.primary + '33', borderWidth: 2, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.text, fontSize: font.xxl, fontWeight: '900' },
  name: { color: colors.text, fontSize: font.lg, fontWeight: '900', textAlign: 'right' },
  subInfo: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 2 },
  okText: { color: colors.success, fontSize: font.md, fontWeight: '700', textAlign: 'center' },
  dimText: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  subLabel: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '700', textAlign: 'right', marginTop: spacing.md, marginBottom: spacing.xs },
  extraRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.xs,
  },
  extraName: { flex: 1, color: colors.text, fontSize: font.sm, fontWeight: '700', textAlign: 'right' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  historyDot: { width: 10, height: 10, borderRadius: radius.full },
  historyText: { flex: 1, color: colors.text, fontSize: font.sm, textAlign: 'right' },
  historyDate: { color: colors.textMuted, fontSize: font.xs },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bgSoft, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xl, paddingBottom: spacing.xxl * 1.5,
    borderWidth: 1, borderColor: colors.border, maxHeight: '92%',
  },
  modalTitle: {
    color: colors.text, fontSize: font.lg, fontWeight: '900',
    textAlign: 'center', marginBottom: spacing.lg,
  },
}));
