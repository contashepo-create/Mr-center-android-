// ============================================================
// ملف الطالب لدى مسئول السنتر: بيانات + مجموعة + درجات + دفعات
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, ListItem, LoadingView, SectionTitle, StatCard } from '../../../src/components/controls';
import { BackHeader, GradientScreen } from '../../../src/components/layout';
import { FormMessage, OptionPicker } from '../../../src/components/pickers';
import {
  addManualGrade, deleteManualGrade, fetchDuesForStudent, fetchGradesForStudent,
  fetchGroups, fetchMyAttendance, fetchPaymentsForStudent, fetchStudentById,
  recordPayment, updateStudentGroup,
} from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import type { Due, Group, ManualGrade, Payment, Student } from '../../../src/lib/types';
import { arabicError, arabicMonth, formatDate, formatMoney } from '../../../src/lib/utils';
import { colors, font, radius, spacing } from '../../../src/theme';

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
      const [s, g, gr, p, d, att] = await Promise.all([
        fetchStudentById(id),
        fetchGroups(centerId),
        fetchGradesForStudent(id),
        fetchPaymentsForStudent(id),
        fetchDuesForStudent(id),
        fetchMyAttendance(id),
      ]);
      setStudent(s);
      setGroups(g);
      setGrades(gr);
      setPayments(p);
      setDues(d);
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
        year: due?.year ?? now.getFullYear(),
        notes: payNotes,
      });
      setPayOpen(false);
      setPayAmount(''); setPayNotes(''); setPayDueId(null);
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

  if (loading) {
    return <GradientScreen><LoadingView message="جاري تحميل ملف الطالب..." /></GradientScreen>;
  }
  if (!student) {
    return (
      <GradientScreen>
        <BackHeader title="ملف الطالب" />
        <View style={{ padding: spacing.xl }}>
          <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>تعذر العثور على هذا الطالب</Text>
        </View>
      </GradientScreen>
    );
  }

  const pendingDues = dues.filter((d) => d.status !== 'paid');

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
          <OptionPicker
            label="المجموعة"
            icon="albums"
            value={student.group_id ?? 'none'}
            options={[
              { value: 'none', label: 'بدون مجموعة' },
              ...groups.map((g) => ({ value: g.id, label: g.name, subtitle: formatMoney(g.monthly_fee) })),
            ]}
            onChange={changeGroup}
          />
        </Card>

        {/* ملخص */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <StatCard icon="checkmark-done" value={attendanceCount.present} label="حضور" color={colors.success} />
          <StatCard icon="close-circle" value={attendanceCount.absent} label="غياب" color={colors.danger} />
          <StatCard icon="time" value={pendingDues.length} label="مستحق معلق" color={colors.warning} />
        </View>

        {/* إجراءات */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <View style={{ flex: 1 }}>
            <AppButton title="تسجيل دفعة" icon="cash" small variant="success" onPress={() => { setPayOpen(true); setFormError(null); }} />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton title="إضافة درجة" icon="star" small variant="accent" onPress={() => { setGradeOpen(true); setFormError(null); }} />
          </View>
        </View>

        {/* المستحقات المعلقة */}
        <SectionTitle title="المستحقات المعلقة" />
        {pendingDues.length === 0 ? (
          <Card><Text style={styles.okText}>✅ لا توجد مستحقات معلقة</Text></Card>
        ) : pendingDues.map((d) => (
          <ListItem
            key={d.id}
            title={`${arabicMonth(d.month)} ${d.year}`}
            subtitle={formatMoney(d.amount)}
            icon="time"
            iconColor={colors.warning}
            right={<AppButton title="تحصيل" small variant="success" onPress={() => { setPayDueId(d.id); setPayAmount(String(d.amount)); setPayOpen(true); }} />}
          />
        ))}

        {/* الدرجات */}
        <SectionTitle title={`الدرجات (${grades.length})`} />
        {grades.length === 0 ? (
          <Card><Text style={styles.dimText}>لا توجد درجات مسجلة بعد</Text></Card>
        ) : grades.slice(0, 15).map((g) => (
          <ListItem
            key={g.id}
            title={g.title}
            subtitle={`${arabicMonth(g.month)} ${g.year}`}
            icon="star"
            iconColor={colors.warning}
            badge={{
              text: `${g.score}/${g.max_score}`,
              color: g.score >= g.max_score * 0.5 ? colors.success : colors.danger,
              bg: g.score >= g.max_score * 0.5 ? colors.successBg : colors.dangerBg,
            }}
            right={
              <Ionicons
                name="trash" size={16} color={colors.danger}
                onPress={() => {
                  Alert.alert('حذف الدرجة', `حذف «${g.title}»؟`, [
                    { text: 'إلغاء', style: 'cancel' },
                    { text: 'حذف', style: 'destructive', onPress: async () => { await deleteManualGrade(g.id); await load(); } },
                  ]);
                }}
              />
            }
          />
        ))}

        {/* سجل الدفعات */}
        <SectionTitle title={`سجل الدفعات (${payments.length})`} />
        {payments.length === 0 ? (
          <Card><Text style={styles.dimText}>لا توجد دفعات مسجلة</Text></Card>
        ) : payments.slice(0, 15).map((p) => (
          <ListItem
            key={p.id}
            title={formatMoney(p.amount)}
            subtitle={`${arabicMonth(p.month)} ${p.year} · ${formatDate(p.payment_date)}`}
            icon="cash"
            iconColor={colors.success}
          />
        ))}
      </ScrollView>

      {/* نموذج الدفعة */}
      <Modal visible={payOpen} transparent animationType="slide" onRequestClose={() => setPayOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>تسجيل دفعة — {student.name}</Text>
            <OptionPicker
              label="ربط بمستحق (اختياري)"
              icon="link"
              value={payDueId}
              options={pendingDues.map((d) => ({
                value: d.id,
                label: `${arabicMonth(d.month)} ${d.year}`,
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
          </View>
        </View>
      </Modal>

      {/* نموذج الدرجة */}
      <Modal visible={gradeOpen} transparent animationType="slide" onRequestClose={() => setGradeOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>إضافة درجة — {student.name}</Text>
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
          </View>
        </View>
      </Modal>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
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
});
