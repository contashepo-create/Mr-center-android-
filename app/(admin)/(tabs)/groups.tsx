// ============================================================
// إدارة المجموعات: إنشاء/تعديل/حذف مع الأيام والمواعيد والرسوم
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, SheetHandle } from '../../../src/components/controls';
import { GradientScreen, ScreenHeader } from '../../../src/components/layout';
import { DaysPicker, FormMessage, OptionPicker, TimePicker } from '../../../src/components/pickers';
import { deleteGroup, fetchGrades, fetchGroups, upsertGroup } from '../../../src/lib/api';
import { useTeacherGroupIds } from '../../../src/lib/staff';
import { useSession } from '../../../src/lib/session';
import { isOwner } from '../../../src/lib/staff';
import type { BillingType, Grade, Group } from '../../../src/lib/types';
import { arabicError, billingLabel, findGroupConflicts, formatDays, formatMoney, formatTimeAr, minutesToTime24, timeToMinutes } from '../../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../../src/theme';

export default function GroupsScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';

  const [groups, setGroups] = useState<Group[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [name, setName] = useState('');
  const [gradeId, setGradeId] = useState<string | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [fee, setFee] = useState('');
  const [billing, setBilling] = useState<BillingType>('monthly');
  const [weeklyPrice, setWeeklyPrice] = useState('');
  const [sessionPrice, setSessionPrice] = useState('');
  const [dueMode, setDueMode] = useState<'manual' | 'attendance'>('manual');
  const [attendanceDueAmount, setAttendanceDueAmount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!centerId) return;
    try {
      const [g, gr] = await Promise.all([fetchGroups(centerId), fetchGrades(centerId)]);
      setGroups(g);
      setGrades(gr);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // المدرس: يرى مجموعاته المسندة فقط (السكرتير/المدير/المالك: الكل)
  const teacherScope = useTeacherGroupIds();
  const visibleGroups = teacherScope ? groups.filter((g) => teacherScope.includes(g.id)) : groups;

  const gradeName = (id: string | null) => grades.find((g) => g.id === id)?.name ?? '';
  const conflicts = useMemo(() => findGroupConflicts(visibleGroups), [visibleGroups]);
  // المدرس: عرض التفاصيل فقط — الإنشاء والتعديل والحذف للمالك
  const canManage = isOwner(profile);

  const openAdd = () => {
    setEditing(null); setName(''); setGradeId(null); setDays([]);
    setStartTime(''); setEndTime(''); setFee('');
    setBilling('monthly'); setWeeklyPrice(''); setSessionPrice('');
    setDueMode('manual'); setAttendanceDueAmount('');
    setFormError(null);
    setFormOpen(true);
  };

  // تطبيع أي صيغة وقت قديمة ("4:00 م" أو "HH:MM") إلى "HH:MM"
  const to24 = (t: string | null | undefined) => {
    const m = timeToMinutes(t);
    return m === null ? '' : minutesToTime24(m);
  };

  const openEdit = (g: Group) => {
    setEditing(g); setName(g.name); setGradeId(g.grade_id);
    setDays(g.days ?? []); setStartTime(to24(g.start_time)); setEndTime(to24(g.end_time));
    setFee(g.monthly_fee ? String(g.monthly_fee) : '');
    setBilling(g.billing_type ?? 'monthly');
    setWeeklyPrice(g.weekly_price ? String(g.weekly_price) : '');
    setSessionPrice(g.session_price ? String(g.session_price) : '');
    setDueMode(g.due_mode ?? 'manual');
    setAttendanceDueAmount(g.attendance_due_amount ? String(g.attendance_due_amount) : '');
    setFormError(null);
    setFormOpen(true);
  };

  const save = async () => {
    setFormError(null);
    if (!name.trim()) return setFormError('أدخل اسم المجموعة');
    if (days.length === 0) return setFormError('اختر يوماً واحداً على الأقل للمجموعة');
    const sMin = timeToMinutes(startTime);
    const eMin = timeToMinutes(endTime);
    if ((startTime && !endTime) || (!startTime && endTime)) {
      return setFormError('حدد وقتي البداية والنهاية معاً أو اتركهما فارغين');
    }
    if (sMin !== null && eMin !== null && eMin <= sMin) {
      return setFormError('وقت النهاية يجب أن يكون بعد وقت البداية');
    }
    if (dueMode === 'attendance' && (Number(attendanceDueAmount) || 0) <= 0) {
      return setFormError('أدخل قيمة موجبة للاستحقاق عند الحضور');
    }
    setBusy(true);
    try {
      await upsertGroup(centerId, {
        id: editing?.id,
        name,
        // المدرس يُعيَّن حصراً من شاشة فريق العمل (إسناد مجموعات) — لا اختيار من هنا
        teacher_name: editing?.teacher_name ?? '',
        teacher_phone: editing?.teacher_phone ?? '',
        grade_id: gradeId,
        days,
        start_time: startTime.trim(),
        end_time: endTime.trim(),
        monthly_fee: Number(fee) || 0,
        billing_type: billing,
        weekly_price: Number(weeklyPrice) || 0,
        session_price: Number(sessionPrice) || 0,
        due_mode: dueMode,
        attendance_due_amount: Number(attendanceDueAmount) || 0,
      });
      setFormOpen(false);
      await load();
    } catch (e) {
      setFormError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (g: Group) => {
    Alert.alert(
      'حذف المجموعة',
      `سيتم حذف «${g.name}». الطلاب المرتبطون بها سيبقون لكن بدون مجموعة. متابعة؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف', style: 'destructive',
          onPress: async () => {
            try { await deleteGroup(g.id); await load(); }
            catch (e) { Alert.alert('تعذر الحذف', arabicError(e)); }
          },
        },
      ],
    );
  };

  return (
    <GradientScreen>
      <ScreenHeader
        title="المجموعات"
        subtitle={`${visibleGroups.length} مجموعة`}
        right={
          canManage ? (
              <Pressable style={styles.addBtn} onPress={openAdd}>
                <Ionicons name="add" size={24} color="#052E22" />
              </Pressable>
          ) : undefined
        }
      />

      {!loading && conflicts.length > 0 ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <FormMessage
            type="error"
            text={`تنبيه تعارض مواعيد (${conflicts.length}): ${conflicts.slice(0, 2).map((c) => `«${c.aName}» × «${c.bName}»`).join('، ')} — راجع الجدول الأسبوعي`}
          />
        </View>
      ) : null}

      {loading ? (
        <LoadingView message="جاري تحميل المجموعات..." />
      ) : visibleGroups.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title="لا توجد مجموعات بعد"
          message="أنشئ مجموعاتك حسب الأيام والمواعيد، ثم أضف الطلاب إليها"
          action={<AppButton title="إنشاء مجموعة" icon="add" small onPress={openAdd} />}
        />
      ) : (
        <FlatList
          data={visibleGroups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={() => { setLoading(true); void load(); }}
          renderItem={({ item }) => (
            <GroupCard
              group={item}
              gradeLabel={gradeName(item.grade_id)}
              canManage={canManage}
              onEdit={() => openEdit(item)}
              onDelete={() => confirmDelete(item)}
            />
          )}
        />
      )}

      {/* نموذج إنشاء/تعديل مجموعة */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <SheetHandle />
            <Text style={styles.modalTitle}>{editing ? 'تعديل المجموعة' : 'إنشاء مجموعة جديدة'}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
            <AppInput label="اسم المجموعة" icon="albums" placeholder="مثال: مجموعة السبت والثلاثاء" value={name} onChangeText={setName} />
            <Text style={styles.teacherHint}>المدرس يُعيَّن للمجموعة من شاشة «فريق العمل» بعد تفعيل الحساب وإسناد المجموعات له.</Text>
            <OptionPicker
              label="الصف الدراسي (اختياري)"
              icon="school"
              value={gradeId}
              options={grades.map((g) => ({ value: g.id, label: g.name }))}
              onChange={setGradeId}
              placeholder="اختر الصف..."
            />
            <DaysPicker value={days} onChange={setDays} />
            <TimePicker label="من الساعة" value={startTime} onChange={setStartTime} />
            <TimePicker label="إلى الساعة" value={endTime} onChange={setEndTime} />
            <OptionPicker
              label="نظام التسعير"
              icon="pricetag"
              value={billing}
              options={[
                { value: 'monthly', label: 'شهري — مبلغ ثابت كل شهر' },
                { value: 'weekly', label: 'أسبوعي — السعر × 4 أسابيع' },
                { value: 'per_session', label: 'بالحصة — السعر × عدد حصص الشهر' },
              ]}
              onChange={(v) => setBilling(v as BillingType)}
            />
            {billing === 'monthly' ? (
              <AppInput
                label="الرسوم الشهرية (ج.م)"
                icon="wallet"
                placeholder="مثال: 200"
                value={fee}
                onChangeText={setFee}
                keyboardType="numeric"
                textAlign="left"
                style={{ writingDirection: 'ltr' }}
              />
            ) : billing === 'weekly' ? (
              <AppInput
                label="سعر الأسبوع (ج.م)"
                icon="wallet"
                placeholder="مثال: 50"
                value={weeklyPrice}
                onChangeText={setWeeklyPrice}
                keyboardType="numeric"
                textAlign="left"
                style={{ writingDirection: 'ltr' }}
              />
            ) : (
              <AppInput
                label="سعر الحصة (ج.م)"
                icon="wallet"
                placeholder="مثال: 25"
                value={sessionPrice}
                onChangeText={setSessionPrice}
                keyboardType="numeric"
                textAlign="left"
                style={{ writingDirection: 'ltr' }}
              />
            )}
            <OptionPicker
              label="إنشاء الاستحقاق"
              icon="cash"
              value={dueMode}
              options={[
                { value: 'manual', label: 'يدوي من التحصيل' },
                { value: 'attendance', label: 'تلقائي عند الحضور' },
              ]}
              onChange={(v) => setDueMode(v as 'manual' | 'attendance')}
            />
            {dueMode === 'attendance' ? (
              <AppInput
                label="قيمة الاستحقاق لكل حضور (ج.م)"
                icon="wallet"
                placeholder="مثال: 25"
                value={attendanceDueAmount}
                onChangeText={setAttendanceDueAmount}
                keyboardType="numeric"
                textAlign="left"
                style={{ writingDirection: 'ltr' }}
              />
            ) : (
              <Text style={styles.teacherHint}>يُنشأ الاستحقاق اليدوي من شاشة المدفوعات للفترة التي تختارها.</Text>
            )}
            <FormMessage type="error" text={formError} />
            <AppButton title={editing ? 'حفظ التعديلات' : 'إنشاء المجموعة'} icon="checkmark" onPress={save} loading={busy} />
            <View style={{ height: spacing.sm }} />
            <AppButton title="إلغاء" variant="ghost" small onPress={() => setFormOpen(false)} />
            <View style={{ height: spacing.xl }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </GradientScreen>
  );
}

/** بطاقة مجموعة تعرض كل التفاصيل من الخارج بلا حاجة لفتح التعديل */
function GroupCard({ group, gradeLabel, canManage, onEdit, onDelete }: {
  group: Group; gradeLabel: string; canManage: boolean; onEdit: () => void; onDelete: () => void;
}) {
  const timeLabel = timeToMinutes(group.start_time) !== null
    ? `${formatTimeAr(group.start_time)}${timeToMinutes(group.end_time) !== null ? ' - ' + formatTimeAr(group.end_time) : ''}`
    : '';
  const billing = group.billing_type ?? 'monthly';
  const priceLabel = billing === 'weekly' && Number(group.weekly_price) > 0
    ? `${formatMoney(group.weekly_price)} أسبوعياً`
    : billing === 'per_session' && Number(group.session_price) > 0
      ? `${formatMoney(group.session_price)} للحصة`
      : Number(group.monthly_fee) > 0
        ? `${formatMoney(group.monthly_fee)} شهرياً`
        : '';
  return (
    <Card style={styles.groupCard}>
      <View style={styles.groupHead}>
        <View style={styles.groupIcon}>
          <Ionicons name="albums" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
          {gradeLabel ? <Text style={styles.groupGrade}>{gradeLabel}</Text> : null}
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{group.students_count} طالب</Text>
        </View>
      </View>
      <View style={styles.groupMeta}>
        <MetaLine icon="calendar" text={formatDays(group.days)} />
        {timeLabel ? <MetaLine icon="time" text={timeLabel} /> : null}
        {priceLabel ? <MetaLine icon="wallet" text={priceLabel} /> : null}
        {group.due_mode === 'attendance' ? (
          <MetaLine icon="flash" text={`استحقاق تلقائي بالحضور — ${formatMoney(group.attendance_due_amount ?? 0)}`} />
        ) : null}
        {group.teacher_name ? <MetaLine icon="person" text={`المدرس: ${group.teacher_name}`} /> : null}
      </View>
      {canManage ? (
        <View style={styles.groupActions}>
          <Pressable hitSlop={8} onPress={onEdit} style={styles.actionBtn}>
            <Ionicons name="create" size={16} color={colors.cyan} />
            <Text style={[styles.actionText, { color: colors.cyan }]}>تعديل</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={onDelete} style={styles.actionBtn}>
            <Ionicons name="trash" size={16} color={colors.danger} />
            <Text style={[styles.actionText, { color: colors.danger }]}>حذف</Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

function MetaLine({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.metaLine}>
      <Ionicons name={icon} size={15} color={colors.textMuted} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  groupCard: { marginBottom: spacing.md },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  groupIcon: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.primary + '22', borderWidth: 1, borderColor: colors.primary + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  groupName: { color: colors.text, fontSize: font.lg, fontWeight: '800', textAlign: 'right' },
  groupGrade: { color: colors.info, fontSize: font.sm, fontWeight: '700', textAlign: 'right', marginTop: 2 },
  countPill: {
    backgroundColor: colors.infoBg, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 5,
  },
  countText: { color: colors.cyan, fontSize: font.xs, fontWeight: '800' },
  groupMeta: { gap: spacing.xs, marginTop: spacing.md },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaText: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', flex: 1 },
  groupActions: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md, paddingVertical: spacing.sm,
  },
  actionText: { fontSize: font.sm, fontWeight: '800' },
  addBtn: {
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
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
  teacherHint: { color: colors.info, fontSize: font.xs, textAlign: 'right', marginBottom: spacing.md, lineHeight: 18 },
}));
