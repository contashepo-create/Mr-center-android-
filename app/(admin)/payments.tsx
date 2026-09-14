// ============================================================
// التحصيل وحسابات الطلاب: توليد مستحقات + تحصيل فردي/جماعي + كشف حساب
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  AppButton, AppInput, Card, EmptyState, ListItem, LoadingView, NoAccess, SectionTitle, SheetHandle, StatCard,
} from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage, OptionPicker } from '../../src/components/pickers';
import { can, useTeacherGroupIds } from '../../src/lib/staff';
import {
  fetchDues, fetchGrades, fetchGroupMembers, fetchGroups, fetchStudentAccount, fetchStudents,
  generateDuesForGroup, logActivity, recordBulkDuePayments, recordPayment, recordStudentCredit, settleStudentAccount,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { Due, Grade, Group, Student, StudentAccount } from '../../src/lib/types';
import { arabicError, arabicMonth, billingLabel, formatDate, formatMoney } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

type PickerIntent = 'collect' | 'statement';

export default function PaymentsScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [loading, setLoading] = useState(true);
  const [genGroup, setGenGroup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const teacherScope = useTeacherGroupIds();
  const visibleGroups = teacherScope ? groups.filter((g) => teacherScope.includes(g.id)) : groups;
  const groupsMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const studentsMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  // منتقي الطالب (تحصيل/كشف حساب)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerIntent, setPickerIntent] = useState<PickerIntent>('collect');
  const [pickerMethod, setPickerMethod] = useState<'search' | 'groups'>('search');
  const [studentSearch, setStudentSearch] = useState('');
  const [pickerGrade, setPickerGrade] = useState<string | null>(null);
  const [pickerGroup, setPickerGroup] = useState<string | null>(null);
  const [pickerGroupStudents, setPickerGroupStudents] = useState<Student[]>([]);

  // نافذة التحصيل
  const [collectOpen, setCollectOpen] = useState(false);
  const [collectStudentId, setCollectStudentId] = useState('');
  const [collectAccount, setCollectAccount] = useState<StudentAccount | null>(null);
  const [payTarget, setPayTarget] = useState<string>('credit');
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [collectError, setCollectError] = useState<string | null>(null);

  // كشف الحساب
  const [statementOpen, setStatementOpen] = useState(false);
  const [statementAccount, setStatementAccount] = useState<StudentAccount | null>(null);
  const [settleNotes, setSettleNotes] = useState('');

  // التحصيل الجماعي
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchGroup, setBatchGroup] = useState<string | null>(null);
  const [batchMembers, setBatchMembers] = useState<Student[]>([]);
  const [batchSelected, setBatchSelected] = useState<string[]>([]);
  const [batchNotes, setBatchNotes] = useState('');

  const load = useCallback(async () => {
    if (!centerId) return;
    try {
      const [s, gr, g, d] = await Promise.all([
        fetchStudents(centerId), fetchGrades(centerId), fetchGroups(centerId), fetchDues(centerId, month, year),
      ]);
      setStudents(s); setGrades(gr); setGroups(g); setDues(d);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [centerId, month, year]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const studentName = (id: string) => studentsMap.get(id)?.name ?? 'طالب محذوف';
  const isOrphan = (studentId: string) => !studentsMap.has(studentId);

  if (!can(profile, 'collect')) {
    return (
      <GradientScreen>
        <BackHeader title="المدفوعات والمستحقات" />
        <NoAccess />
      </GradientScreen>
    );
  }

  const generate = async () => {
    setMessage(null);
    const group = groups.find((g) => g.id === genGroup);
    if (!group) return;
    setBusy(true);
    try {
      const res = await generateDuesForGroup(centerId, group, month, year);
      if (!res.skippedNoSessions && res.created > 0) {
        await logActivity(centerId, 'dues_generated', `${res.created} مستحق لمجموعة «${group.name}» بقيمة ${formatMoney(res.amount)}`);
      }
      if (res.skippedNoSessions) {
        setMessage('التسعير بالحصة ولا توجد حصص مسجلة لهذا الشهر بعد — سجّل حضور المجموعة أولاً ثم ولّد');
      } else {
        setMessage(res.created > 0
          ? `تم توليد ${res.created} مستحق بقيمة ${formatMoney(res.amount)} لمجموعة «${group.name}»`
          : 'كل طلاب المجموعة لديهم مستحقات مسجلة لهذا الشهر بالفعل');
      }
      await load();
    } catch (e) {
      Alert.alert('تعذر التوليد', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const openPicker = (intent: PickerIntent) => {
    setPickerIntent(intent); setPickerMethod('search'); setStudentSearch('');
    setPickerGrade(null); setPickerGroup(null); setPickerGroupStudents([]);
    setPickerOpen(true);
  };

  const readAccount = async (studentId: string) => fetchStudentAccount(centerId, studentId);

  const openStudentCollection = async (studentId: string, preferredDueId = '') => {
    if (!studentsMap.has(studentId)) return Alert.alert('تعذر', 'الطالب خارج نطاق التحصيل المتاح لك.');
    setBusy(true);
    try {
      const account = await readAccount(studentId);
      const firstDue = account.dues.find((d) => d.id === preferredDueId && Number(d.remaining || 0) > 0)
        ?? account.dues.find((d) => Number(d.remaining || 0) > 0);
      setCollectStudentId(studentId);
      setCollectAccount(account);
      setPayTarget(firstDue?.id ?? 'credit');
      setPayAmount(firstDue ? String(Number(firstDue.remaining)) : '');
      setPayNotes(''); setCollectError(null);
      setCollectOpen(true);
    } catch (e) {
      Alert.alert('تعذر جلب الحساب', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const openStatement = async (studentId: string) => {
    if (!studentsMap.has(studentId)) return Alert.alert('تعذر', 'الطالب خارج نطاق التحصيل المتاح لك.');
    setBusy(true);
    try {
      setStatementAccount(await readAccount(studentId));
      setSettleNotes('');
      setStatementOpen(true);
    } catch (e) {
      Alert.alert('تعذر جلب الكشف', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const chooseStudent = async (studentId: string) => {
    setPickerOpen(false);
    if (pickerIntent === 'collect') await openStudentCollection(studentId);
    else await openStatement(studentId);
  };

  const collect = async () => {
    setCollectError(null);
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return setCollectError('أدخل مبلغاً صحيحاً أكبر من صفر');
    setBusy(true);
    try {
      if (payTarget === 'credit') {
        await recordStudentCredit({ centerId, studentId: collectStudentId, amount, month, year, notes: payNotes });
      } else {
        await recordPayment({ centerId, studentId: collectStudentId, dueId: payTarget, amount, month, year, notes: payNotes });
      }
      await logActivity(centerId, 'payment_recorded', `${studentName(collectStudentId)} — دفعة ${formatMoney(amount)}`);
      setCollectOpen(false);
      await load();
      Alert.alert('تم التحصيل', payTarget === 'credit' ? 'سُجل المبلغ رصيداً مقدماً للطالب.' : 'حُدثت حالة المستحق بنجاح.');
    } catch (e) {
      setCollectError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const openCollectForDue = (due: Due) => void openStudentCollection(due.student_id, due.id);

  const openBatch = () => {
    const first = visibleGroups[0]?.id ?? null;
    setBatchGroup(first); setBatchMembers([]); setBatchSelected([]); setBatchNotes('');
    setBatchOpen(true);
  };

  const loadBatchMembers = async (groupId: string) => {
    setBatchGroup(groupId);
    try {
      const members = await fetchGroupMembers(centerId, groupId);
      setBatchMembers(members); setBatchSelected([]);
    } catch (e) {
      Alert.alert('تعذر التحميل', arabicError(e));
    }
  };

  const batchRows = useMemo(() => batchMembers.map((student) => {
    const studentDues = dues.filter((d) => d.student_id === student.id && d.group_id === batchGroup && d.status !== 'paid');
    const collectable = studentDues.filter((d) => d.status === 'pending');
    return { student, dues: collectable, hasPartial: studentDues.some((d) => d.status === 'partial'), total: collectable.reduce((sum, d) => sum + Number(d.amount || 0), 0) };
  }), [batchMembers, dues, batchGroup]);
  const batchEligibleIds = useMemo(() => batchRows.filter((r) => r.dues.length > 0).map((r) => r.student.id), [batchRows]);
  const batchSelectedRows = useMemo(() => batchRows.filter((r) => batchSelected.includes(r.student.id) && r.dues.length > 0), [batchRows, batchSelected]);
  const batchTotal = useMemo(() => batchSelectedRows.reduce((sum, r) => sum + r.total, 0), [batchSelectedRows]);
  const toggleAllBatch = () => setBatchSelected((c) => (c.length === batchEligibleIds.length ? [] : batchEligibleIds));
  const toggleBatchStudent = (id: string) => setBatchSelected((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const saveBatch = async () => {
    if (batchSelectedRows.length === 0) return;
    setBusy(true);
    try {
      const items = batchSelectedRows.flatMap((row) => row.dues.map((d) => ({ dueId: d.id, amount: Number(d.amount) })));
      const result = await recordBulkDuePayments({ centerId, month, year, items, notes: batchNotes });
      await logActivity(centerId, 'payment_recorded', `تحصيل جماعي — ${result.count} دفعة بإجمالي ${formatMoney(result.total)}`);
      setBatchOpen(false);
      await load();
      Alert.alert('تم الحفظ', `تم تسجيل ${result.count} دفعة بإجمالي ${formatMoney(result.total)}.`);
    } catch (e) {
      Alert.alert('تعذر الحفظ', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const settle = async () => {
    const studentId = statementAccount?.student.id;
    if (!studentId) return;
    setBusy(true);
    try {
      const result = await settleStudentAccount(centerId, studentId, settleNotes);
      setStatementAccount(await readAccount(studentId));
      await load();
      Alert.alert('تمت التسوية', `رصيد مصفّر: ${formatMoney(result.creditSettled)} · مديونية مسوّاة: ${formatMoney(result.debtSettled)}.`);
    } catch (e) {
      Alert.alert('تعذر', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const paidList = dues.filter((d) => d.status === 'paid');
  const pendingList = dues.filter((d) => d.status !== 'paid');
  const paidTotal = paidList.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const pendingTotal = pendingList.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const filteredPickerStudents = useMemo(() => {
    const q = studentSearch.trim().toLocaleLowerCase('ar-EG');
    if (!q) return students.slice(0, 30);
    return students.filter((s) => `${s.name} ${s.phone ?? ''} ${s.guardian_phone ?? ''}`.toLocaleLowerCase('ar-EG').includes(q)).slice(0, 30);
  }, [studentSearch, students]);
  const pickerGroups = useMemo(() => visibleGroups.filter((g) => !pickerGrade || g.grade_id === pickerGrade), [visibleGroups, pickerGrade]);
  const collectDues = (collectAccount?.dues ?? []).filter((d) => Number(d.remaining || 0) > 0);
  const selectedCollectStudent = studentsMap.get(collectStudentId);

  return (
    <GradientScreen>
      <BackHeader
        title="المدفوعات والمستحقات"
        subtitle="تحصيل فردي أو جماعي، ورصيد مقدم يُخصم تلقائياً"
        right={
          <Pressable onPress={() => openPicker('statement')} hitSlop={8}>
            <Ionicons name="document-text-outline" size={22} color={colors.text} />
          </Pressable>
        }
      />

      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : (
        <FlatList
          data={pendingList}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <OptionPicker
                    label="الشهر"
                    value={String(month)}
                    options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: arabicMonth(i + 1) }))}
                    onChange={(v) => setMonth(Number(v))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <OptionPicker
                    label="السنة"
                    value={String(year)}
                    options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) }))}
                    onChange={(v) => setYear(Number(v))}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
                <StatCard icon="checkmark-circle" value={formatMoney(paidTotal)} label={`مسدد (${paidList.length})`} color={colors.success} />
                <StatCard icon="time" value={formatMoney(pendingTotal)} label={`معلق (${pendingList.length})`} color={colors.warning} />
              </View>

              <Card style={{ marginBottom: spacing.md }}>
                <Text style={styles.cardTitle}>خيارات التحصيل السريع</Text>
                <View style={styles.quickRow}>
                  <AppButton title="تحصيل من طالب" icon="person" small onPress={() => openPicker('collect')} />
                  <AppButton title="تحصيل جماعي" icon="people" small variant="outline" onPress={openBatch} />
                  <AppButton title="كشف حساب" icon="document-text" small variant="ghost" onPress={() => openPicker('statement')} />
                </View>
              </Card>

              <Card style={{ marginBottom: spacing.md }}>
                <Text style={styles.cardTitle}>توليد مستحقات الشهر</Text>
                <OptionPicker
                  label="اختر المجموعة"
                  icon="albums"
                  value={genGroup}
                  options={visibleGroups.map((g) => ({
                    value: g.id,
                    label: g.name,
                    subtitle: g.due_mode === 'attendance'
                      ? `استحقاق تلقائي بالحضور — ${formatMoney(g.attendance_due_amount ?? 0)}`
                      : `${g.students_count} طالب · ${formatMoney(
                        g.billing_type === 'weekly' ? g.weekly_price : g.billing_type === 'per_session' ? g.session_price : g.monthly_fee,
                      )} (${billingLabel(g.billing_type)})`,
                  }))}
                  onChange={setGenGroup}
                  placeholder="اختر المجموعة..."
                />
                {groupsMap.get(genGroup ?? '')?.due_mode === 'attendance' ? (
                  <FormMessage type="info" text="هذه المجموعة تستخدم الاستحقاق التلقائي عند الحضور — لا حاجة للتوليد اليدوي." />
                ) : (
                  <>
                    <FormMessage type="success" text={message} />
                    <AppButton
                      title={`توليد مستحقات ${arabicMonth(month)} ${year}`}
                      icon="flash"
                      onPress={generate}
                      loading={busy}
                      disabled={!genGroup}
                      small
                    />
                  </>
                )}
              </Card>

              <SectionTitle title={`مستحقات معلقة — ${arabicMonth(month)} ${year}`} />
              {pendingList.length === 0 ? (
                <Card>
                  <Text style={styles.allPaid}>🎉 لا توجد مستحقات معلقة لهذا الشهر</Text>
                </Card>
              ) : null}
            </>
          }
          renderItem={({ item }) => {
            const orphan = isOrphan(item.student_id);
            return (
              <ListItem
                title={studentName(item.student_id)}
                subtitle={`${formatMoney(item.amount)}${item.due_source === 'attendance' ? ' · استحقاق حضور' : ''}`}
                icon="time"
                iconColor={orphan ? colors.textMuted : colors.warning}
                badge={orphan
                  ? { text: 'سجل مالي محفوظ', color: colors.textMuted, bg: colors.surfaceAlt }
                  : { text: item.status === 'partial' ? 'جزئي' : 'معلق', color: colors.warning, bg: colors.warningBg }}
                right={
                  orphan ? undefined : (
                    <AppButton
                      title="تحصيل"
                      icon="cash"
                      small
                      variant="success"
                      onPress={() => openCollectForDue(item)}
                    />
                  )
                }
                onPress={orphan ? undefined : () => router.push(`/student/${item.student_id}`)}
              />
            );
          }}
          ListFooterComponent={
            paidList.length > 0 ? (
              <>
                <SectionTitle title="مستحقات مسددة" />
                {paidList.slice(0, 20).map((item) => {
                  const orphan = isOrphan(item.student_id);
                  return (
                    <ListItem
                      key={item.id}
                      title={studentName(item.student_id)}
                      subtitle={formatMoney(item.amount)}
                      icon="checkmark-circle"
                      iconColor={orphan ? colors.textMuted : colors.success}
                      badge={{ text: 'مسدد', color: colors.success, bg: colors.successBg }}
                      onPress={orphan ? undefined : () => router.push(`/student/${item.student_id}`)}
                    />
                  );
                })}
              </>
            ) : null
          }
        />
      )}

      {/* منتقي الطالب */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <SheetHandle />
            <Text style={styles.modalTitle}>{pickerIntent === 'collect' ? 'اختر طالباً للتحصيل' : 'اختر طالباً لعرض الكشف'}</Text>
            <View style={styles.quickRow}>
              <AppButton title="بحث بالاسم" small variant={pickerMethod === 'search' ? 'primary' : 'outline'} onPress={() => setPickerMethod('search')} />
              <AppButton title="من مجموعة" small variant={pickerMethod === 'groups' ? 'primary' : 'outline'} onPress={() => setPickerMethod('groups')} />
            </View>
            {pickerMethod === 'search' ? (
              <>
                <TextInput
                  placeholder="اكتب الاسم أو الهاتف"
                  placeholderTextColor={colors.textMuted}
                  value={studentSearch}
                  onChangeText={setStudentSearch}
                  style={styles.searchInput}
                  textAlign="right"
                  autoFocus
                />
                <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                  {filteredPickerStudents.length === 0 ? (
                    <EmptyState title="لا توجد نتائج" />
                  ) : filteredPickerStudents.map((s) => (
                    <Pressable key={s.id} style={styles.pickRow} onPress={() => void chooseStudent(s.id)}>
                      <Text style={styles.pickName}>{s.name}</Text>
                      <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : (
              <>
                <OptionPicker
                  label="الصف"
                  value={pickerGrade}
                  options={grades.map((g) => ({ value: g.id, label: g.name }))}
                  onChange={(v) => { setPickerGrade(v); setPickerGroup(null); setPickerGroupStudents([]); }}
                  placeholder="اختر الصف..."
                />
                <OptionPicker
                  label="المجموعة"
                  value={pickerGroup}
                  options={pickerGroups.map((g) => ({ value: g.id, label: g.name }))}
                  onChange={(v) => { setPickerGroup(v); void fetchGroupMembers(centerId, v).then(setPickerGroupStudents); }}
                  placeholder="اختر المجموعة..."
                />
                <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                  {pickerGroup && pickerGroupStudents.length === 0 ? (
                    <EmptyState title="لا يوجد طلاب نشطون في المجموعة" />
                  ) : pickerGroupStudents.map((s) => (
                    <Pressable key={s.id} style={styles.pickRow} onPress={() => void chooseStudent(s.id)}>
                      <Text style={styles.pickName}>{s.name}</Text>
                      <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            <View style={{ height: spacing.sm }} />
            <AppButton title="إلغاء" variant="ghost" small onPress={() => setPickerOpen(false)} />
          </View>
        </View>
      </Modal>

      {/* نافذة التحصيل */}
      <Modal visible={collectOpen} transparent animationType="slide" onRequestClose={() => setCollectOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <SheetHandle />
            <Text style={styles.modalTitle}>تسجيل تحصيل{selectedCollectStudent ? ` — ${selectedCollectStudent.name}` : ''}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {collectAccount ? (
                <View style={styles.summaryRow}>
                  <Stat t="رصيد مقدم" v={collectAccount.summary.credit_balance} />
                  <Stat t="مبلغ مستحق" v={collectAccount.summary.amount_due} />
                  <Stat t="صافي الحساب" v={collectAccount.summary.net_balance} />
                </View>
              ) : null}
              <OptionPicker
                label="يوجّه التحصيل إلى"
                icon="link"
                value={payTarget}
                options={[
                  { value: 'credit', label: 'رصيد مقدم للطالب (بلا مستحق)' },
                  ...collectDues.map((d) => ({
                    value: d.id,
                    label: d.due_source === 'attendance' ? 'استحقاق حضور' : `${arabicMonth(d.month)} ${d.due_year}`,
                    subtitle: `المتبقي ${formatMoney(d.remaining)}`,
                  })),
                ]}
                onChange={(v) => {
                  setPayTarget(v);
                  const chosen = collectDues.find((d) => d.id === v);
                  setPayAmount(chosen ? String(Number(chosen.remaining)) : '');
                }}
              />
              <AppInput label="المبلغ المحصل" icon="cash" value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" textAlign="left" style={{ writingDirection: 'ltr' }} />
              <AppInput label="ملاحظات (اختياري)" icon="document-text" value={payNotes} onChangeText={setPayNotes} placeholder="مثال: دفع ولي الأمر نقداً" />
              {payTarget === 'credit' ? (
                <FormMessage type="info" text="يسجل هذا المبلغ كرصيد دائن يُخصم تلقائياً من أي مستحق قائم لاحقاً." />
              ) : null}
              <FormMessage type="error" text={collectError} />
              <AppButton title="تسجيل التحصيل" icon="checkmark" variant="success" onPress={collect} loading={busy} />
              <View style={{ height: spacing.sm }} />
              <AppButton title="عرض كشف الحساب" icon="document-text" variant="outline" small onPress={() => { setCollectOpen(false); void openStatement(collectStudentId); }} />
              <View style={{ height: spacing.sm }} />
              <AppButton title="إلغاء" variant="ghost" small onPress={() => setCollectOpen(false)} />
              <View style={{ height: spacing.xl }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* التحصيل الجماعي */}
      <Modal visible={batchOpen} transparent animationType="slide" onRequestClose={() => setBatchOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <SheetHandle />
            <Text style={styles.modalTitle}>تحصيل جماعي سريع</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <OptionPicker
                label="المجموعة"
                icon="albums"
                value={batchGroup}
                options={visibleGroups.map((g) => ({ value: g.id, label: g.name }))}
                onChange={loadBatchMembers}
                placeholder="اختر المجموعة..."
              />
              {batchGroup ? (
                <>
                  <View style={styles.batchHeadRow}>
                    <Text style={styles.batchHeadText}>المحدد: {batchSelectedRows.length} طالب · {formatMoney(batchTotal)}</Text>
                    <AppButton
                      title={batchSelected.length === batchEligibleIds.length && batchEligibleIds.length > 0 ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                      small variant="outline" onPress={toggleAllBatch}
                    />
                  </View>
                  <FormMessage type="info" text="المستحقات المعلقة كاملة القيمة فقط تظهر هنا. المستحق الجزئي يُحصّل من ملف الطالب لضمان المبلغ الصحيح." />
                  {batchRows.length === 0 ? (
                    <EmptyState title="لا يوجد طلاب في هذه المجموعة" />
                  ) : batchRows.map((row) => (
                    <Pressable
                      key={row.student.id}
                      style={[styles.batchRow, !row.dues.length && { opacity: 0.5 }]}
                      onPress={() => row.dues.length && toggleBatchStudent(row.student.id)}
                      disabled={!row.dues.length}
                    >
                      <Ionicons
                        name={batchSelected.includes(row.student.id) ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={row.dues.length ? colors.primary : colors.textMuted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickName}>{row.student.name}</Text>
                        <Text style={styles.batchMeta}>
                          {row.dues.length ? `${row.dues.length} مستحق · ${formatMoney(row.total)}` : row.hasPartial ? 'يوجد مستحق جزئي' : 'لا يوجد مستحق كامل'}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                  <AppInput label="ملاحظة مشتركة (اختياري)" value={batchNotes} onChangeText={setBatchNotes} placeholder="تظهر في كل دفعة محفوظة" />
                </>
              ) : (
                <FormMessage type="info" text="اختر مجموعة لعرض كل طلابها." />
              )}
              <AppButton
                title={busy ? 'جاري الحفظ...' : `حفظ تحصيل ${batchSelectedRows.length} طالب`}
                icon="checkmark"
                variant="success"
                onPress={saveBatch}
                loading={busy}
                disabled={batchSelectedRows.length === 0}
              />
              <View style={{ height: spacing.sm }} />
              <AppButton title="إلغاء" variant="ghost" small onPress={() => setBatchOpen(false)} />
              <View style={{ height: spacing.xl }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* كشف حساب الطالب */}
      <Modal visible={statementOpen} transparent animationType="slide" onRequestClose={() => setStatementOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <SheetHandle />
            <Text style={styles.modalTitle}>كشف حساب{statementAccount ? ` — ${statementAccount.student.name}` : ''}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {statementAccount ? (
                <>
                  <View style={styles.summaryRow}>
                    <Stat t="رصيد دائن" v={statementAccount.summary.credit_balance} />
                    <Stat t="مديونية" v={statementAccount.summary.amount_due} />
                    <Stat t="الصافي" v={statementAccount.summary.net_balance} />
                  </View>
                  <SectionTitle title="المستحقات" />
                  {statementAccount.dues.length === 0 ? (
                    <Text style={styles.hint}>لا توجد مستحقات.</Text>
                  ) : statementAccount.dues.map((d) => (
                    <ListItem
                      key={d.id}
                      title={d.due_source === 'attendance' ? 'استحقاق حضور' : `${arabicMonth(d.month)} ${d.due_year}`}
                      subtitle={`القيمة ${formatMoney(d.amount)} · نقدي ${formatMoney(d.cash_paid)} · من الرصيد ${formatMoney(d.credit_applied)} · المتبقي ${formatMoney(d.remaining)}`}
                      icon={d.status === 'paid' ? 'checkmark-circle' : 'time'}
                      iconColor={d.status === 'paid' ? colors.success : colors.warning}
                    />
                  ))}
                  <SectionTitle title="التحصيلات المقدمة والرصيد" />
                  {statementAccount.credits.length === 0 ? (
                    <Text style={styles.hint}>لا يوجد رصيد مقدم مسجل.</Text>
                  ) : statementAccount.credits.map((c) => (
                    <ListItem
                      key={c.id}
                      title={`${formatMoney(c.amount)} — ${formatDate(c.payment_date)}`}
                      subtitle={`خُصم للمستحقات ${formatMoney(c.applied_to_dues)} · المتبقي ${formatMoney(c.remaining)}${c.notes ? ' · ' + c.notes : ''}`}
                      icon="wallet"
                      iconColor={colors.info}
                    />
                  ))}
                  <SectionTitle title="تسوية الحساب إلى صفر" />
                  <Text style={styles.hint}>تُستخدم فقط للإعفاء أو تصحيح الرصيد. لا تُسجل دفعة جديدة ولا تُكرر إيراد التحصيل.</Text>
                  <AppInput label="سبب التسوية (اختياري)" value={settleNotes} onChangeText={setSettleNotes} placeholder="مثال: إلغاء رصيد بموافقة الإدارة" />
                  <AppButton
                    title="تسوية الحساب إلى صفر"
                    icon="close-circle"
                    variant="danger"
                    loading={busy}
                    disabled={Number(statementAccount.summary.credit_balance || 0) <= 0 && Number(statementAccount.summary.amount_due || 0) <= 0}
                    onPress={() => Alert.alert(
                      'تأكيد تسوية الحساب',
                      'ستُصفّر المديونية أو الرصيد المتبقي كتسوية موثقة، من دون تسجيل دفعة أو إيراد جديد. متابعة؟',
                      [{ text: 'إلغاء', style: 'cancel' }, { text: 'تأكيد التسوية', style: 'destructive', onPress: () => void settle() }],
                    )}
                  />
                </>
              ) : (
                <LoadingView message="جاري تحميل الكشف..." />
              )}
              <View style={{ height: spacing.sm }} />
              <AppButton title="إغلاق" variant="ghost" small onPress={() => setStatementOpen(false)} />
              <View style={{ height: spacing.xl }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </GradientScreen>
  );
}

function Stat({ t, v }: { t: string; v: number }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{t}</Text>
      <Text style={[styles.statValue, { color: v < 0 ? colors.danger : colors.text }]}>{formatMoney(v)}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  cardTitle: {
    color: colors.text, fontSize: font.md, fontWeight: '800',
    marginBottom: spacing.md, textAlign: 'right',
  },
  allPaid: {
    color: colors.success, fontSize: font.md, fontWeight: '700', textAlign: 'center',
  },
  quickRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  hint: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginBottom: spacing.md },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bgSoft, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xl, paddingBottom: spacing.xxl * 1.5,
    borderWidth: 1, borderColor: colors.border, maxHeight: '92%',
  },
  modalTitle: {
    color: colors.text, fontSize: font.lg, fontWeight: '900',
    textAlign: 'center', marginBottom: spacing.md,
  },
  searchInput: {
    color: colors.text, fontSize: font.md,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  pickRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pickName: { color: colors.text, fontSize: font.md, fontWeight: '700', textAlign: 'right' },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statLabel: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'center', marginBottom: 2 },
  statValue: { fontSize: font.md, fontWeight: '900', textAlign: 'center' },
  batchHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  batchHeadText: { color: colors.text, fontSize: font.sm, fontWeight: '700' },
  batchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  batchMeta: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
}));
