// ============================================================
// إدارة الطلاب: بحث + إضافة/تعديل + فتح ملف الطالب
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import {
  AppButton, AppInput, Card, EmptyState, LoadingView, SheetHandle,
} from '../../../src/components/controls';
import { GradientScreen, ScreenHeader } from '../../../src/components/layout';
import { FormMessage, OptionPicker } from '../../../src/components/pickers';
import {
  deleteStudent, fetchGrades, fetchGroups, fetchStudents, upsertStudent,
} from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import type { Grade, Group, Student } from '../../../src/lib/types';
import { isOwner, useTeacherGroupIds } from '../../../src/lib/staff';
import { arabicError, isValidPhone, normalizePhone } from '../../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../../src/theme';

export default function StudentsScreen() {
  const { profile } = useSession();
  const params = useLocalSearchParams<{ add?: string }>();
  const centerId = profile?.center_id ?? '';

  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'active' | 'suspended' | 'archived' | 'all'>('active');
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [gradeId, setGradeId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [status, setStatus] = useState<'active' | 'suspended' | 'archived'>('active');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // تنظيف القائمة عند تغيّر السنتر حتى لا تعرض بيانات سنتر سابق
  useEffect(() => {
    setStudents([]);
    setGroups([]);
    setGrades([]);
    setFilterGroup('all');
    setLoading(true);
  }, [centerId]);

  const load = useCallback(async () => {
    if (!centerId) {
      setLoading(false);
      return;
    }
    try {
      const [s, g, gr] = await Promise.all([
        fetchStudents(centerId, search, true),
        fetchGroups(centerId),
        fetchGrades(centerId),
      ]);
      setStudents(s);
      setGroups(g);
      setGrades(gr);
    } catch {
      // يحتفظ بالقائمة الحالية
    } finally {
      setLoading(false);
    }
  }, [centerId, search]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // تأخير البحث 400ms حتى لا نضرب الخادم مع كل حرف
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // فتح نموذج الإضافة تلقائياً عند القدوم من زر سريع
  useEffect(() => {
    if (params.add === '1') {
      openAdd();
      router.setParams({ add: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.add]);

  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? 'بدون مجموعة';
  const gradeName = (id: string | null) => grades.find((g) => g.id === id)?.name ?? '';
  // المدرس: عرض وفتح ملفات فقط — الإضافة والتعديل والحذف للمالك
  const canManage = isOwner(profile);

  // المدرس: يرى طلاب مجموعاته المسندة فقط (السكرتير/المدير/المالك: الكل)
  const teacherScope = useTeacherGroupIds();

  const displayed = students
    .filter((s) => {
      if (teacherScope && (!s.group_id || !teacherScope.includes(s.group_id))) return false;
      if (filterStatus !== 'all' && s.status !== filterStatus) return false;
      if (filterGroup !== 'all' && s.group_id !== filterGroup) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ar')); // ترتيب أبجدي دائماً

  const openAdd = () => {
    setEditing(null);
    setName(''); setPhone(''); setGuardianPhone('');
    setGradeId(null); setGroupId(null); setStatus('active'); setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setName(s.name);
    setPhone(s.phone ?? '');
    setGuardianPhone(s.guardian_phone ?? '');
    setGradeId(s.grade_id);
    setGroupId(s.group_id);
    setStatus(s.status ?? 'active');
    setFormError(null);
    setFormOpen(true);
  };

  const save = async () => {
    setFormError(null);
    if (!name.trim()) return setFormError('أدخل اسم الطالب');
    if (!isValidPhone(guardianPhone)) return setFormError('رقم هاتف ولي الأمر إجباري — أدخله بشكل صحيح');
    if (phone.trim() && normalizePhone(phone) === normalizePhone(guardianPhone)) {
      return setFormError('رقم ولي الأمر يجب أن يختلف عن رقم الطالب');
    }
    setBusy(true);
    try {
      await upsertStudent(centerId, {
        id: editing?.id,
        name, phone, guardian_phone: guardianPhone,
        grade_id: gradeId, group_id: groupId,
        status,
      });
      setFormOpen(false);
      await load();
    } catch (e) {
      setFormError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (s: Student) => {
    Alert.alert('حذف الطالب', `سيتم حذف «${s.name}» وكل سجلاته نهائياً. هل أنت متأكد؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: async () => {
          try { await deleteStudent(s.id); await load(); }
          catch (e) { Alert.alert('تعذر الحذف', arabicError(e)); }
        },
      },
    ]);
  };

  return (
    <GradientScreen>
      <ScreenHeader
        title="الطلاب"
        subtitle={`${displayed.length} طالب`}
        right={
          canManage ? (
          <Pressable style={styles.addBtn} onPress={openAdd}>
            <Ionicons name="add" size={24} color="#052E22" />
          </Pressable>
          ) : undefined
        }
      />

      {/* البحث */}
      <View style={{ paddingHorizontal: spacing.lg }}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginHorizontal: spacing.sm }} />
          <TextInput
            placeholder="ابحث بالاسم أو الهاتف أو البريد..."
            placeholderTextColor={colors.textMuted}
            value={searchInput}
            onChangeText={setSearchInput}
            style={styles.searchInput}
            textAlign="right"
            returnKeyType="search"
          />
          {searchInput ? (
            <Pressable hitSlop={8} onPress={() => setSearchInput('')} style={{ marginHorizontal: spacing.sm }}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* فلتر الحالة */}
      <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {([
            { v: 'active', label: `نشط (${students.filter((s) => s.status === 'active').length})` },
            { v: 'suspended', label: `موقوف (${students.filter((s) => s.status === 'suspended').length})` },
            { v: 'archived', label: `مؤرشف (${students.filter((s) => s.status === 'archived').length})` },
            { v: 'all', label: `الكل (${students.length})` },
          ] as const).map((f) => (
            <FilterChip key={f.v} label={f.label} active={filterStatus === f.v} onPress={() => setFilterStatus(f.v)} />
          ))}
        </ScrollView>
      </View>

      {/* فلتر المجموعات */}
      <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          <FilterChip
            label={`الكل (${teacherScope ? students.filter((s) => s.group_id && teacherScope.includes(s.group_id)).length : students.length})`}
            active={filterGroup === 'all'}
            onPress={() => setFilterGroup('all')}
          />
          {(teacherScope ? groups.filter((g) => teacherScope.includes(g.id)) : groups).map((g) => (
            <FilterChip
              key={g.id}
              label={`${g.name} (${students.filter((s) => s.group_id === g.id).length})`}
              active={filterGroup === g.id}
              onPress={() => setFilterGroup(filterGroup === g.id ? 'all' : g.id)}
            />
          ))}
        </ScrollView>
      </View>

      {!loading && students.length > 0 ? (
        <Text style={styles.countLine}>
          عرض {displayed.length} من {teacherScope ? students.filter((s) => s.group_id && teacherScope.includes(s.group_id)).length : students.length} طالب
        </Text>
      ) : null}

      {loading ? (
        <LoadingView message="جاري تحميل الطلاب..." />
      ) : displayed.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={search || filterGroup !== 'all' || filterStatus !== 'all' ? 'لا توجد نتائج مطابقة' : 'لا يوجد طلاب بعد'}
          message={search || filterGroup !== 'all' || filterStatus !== 'all' ? 'جرّب بحثاً مختلفاً أو غيّر الفلاتر' : 'أضف طلابك يدوياً، أو شارك كود السنتر ليسجّلوا بأنفسهم'}
          action={<AppButton title="إضافة طالب" icon="person-add" small onPress={openAdd} />}
        />
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={() => { setLoading(true); void load(); }}
          renderItem={({ item }) => (
            <StudentCard
              student={item}
              groupLabel={groupName(item.group_id)}
              gradeLabel={gradeName(item.grade_id)}
              canManage={canManage}
              onOpen={() => router.push(`/student/${item.id}`)}
              onEdit={() => openEdit(item)}
              onDelete={() => confirmDelete(item)}
            />
          )}
        />
      )}

      {/* نموذج إضافة/تعديل طالب */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <SheetHandle />
            <Text style={styles.modalTitle}>{editing ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد'}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
            <AppInput label="اسم الطالب" icon="person" placeholder="الاسم الكامل" value={name} onChangeText={setName} />
            <AppInput label="رقم الهاتف (اختياري)" icon="call" placeholder="01xxxxxxxxx" value={phone} onChangeText={setPhone} keyboardType="phone-pad" textAlign="left" style={{ writingDirection: 'ltr' }} />
            <AppInput label="رقم ولي الأمر (إجباري)" icon="people" placeholder="01xxxxxxxxx" value={guardianPhone} onChangeText={setGuardianPhone} keyboardType="phone-pad" textAlign="left" style={{ writingDirection: 'ltr' }} />
            <OptionPicker
              label="الصف الدراسي"
              icon="school"
              value={gradeId}
              options={grades.map((g) => ({ value: g.id, label: g.name }))}
              onChange={setGradeId}
              placeholder="اختر الصف..."
            />
            <OptionPicker
              label="المجموعة"
              icon="albums"
              value={groupId}
              options={groups.map((g) => ({
                value: g.id,
                label: g.name,
                subtitle: `${g.students_count} طالب`,
              }))}
              onChange={setGroupId}
              placeholder="اختر المجموعة..."
            />
            <OptionPicker
              label="حالة الطالب"
              icon="flag"
              value={status}
              options={[
                { value: 'active', label: 'نشط' },
                { value: 'suspended', label: 'موقوف (لا يظهر في الحضور)' },
                { value: 'archived', label: 'مؤرشف (خارج القائمة)' },
              ]}
              onChange={(v) => setStatus(v as 'active' | 'suspended' | 'archived')}
            />
            <FormMessage type="error" text={formError} />
            <AppButton title={editing ? 'حفظ التعديلات' : 'إضافة الطالب'} icon="checkmark" onPress={save} loading={busy} />
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

/** شريحة فلتر مجموعة */
function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/**
 * بطاقة طالب: منطقة الفتح منفصلة تماماً عن أزرار التعديل/الحذف
 * حتى لا يفتح ملف الطالب خطأً عند الضغط على زر.
 */
function StudentCard({ student, groupLabel, gradeLabel, canManage, onOpen, onEdit, onDelete }: {
  student: Student; groupLabel: string; gradeLabel: string; canManage: boolean;
  onOpen: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const suspended = student.status !== 'active';
  const initial = (student.name ?? '؟').trim().charAt(0);
  return (
    <Card style={styles.studentCard}>
      <Pressable onPress={onOpen} style={styles.studentMain}>
        <View style={[styles.avatar, suspended && { opacity: 0.55 }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.studentTitleRow}>
            <Text style={styles.studentName} numberOfLines={1}>{student.name}</Text>
            {student.status === 'suspended' ? (
              <View style={styles.suspendedPill}>
                <Text style={styles.suspendedText}>موقوف</Text>
              </View>
            ) : student.status === 'archived' ? (
              <View style={[styles.suspendedPill, { backgroundColor: colors.textMuted + '22' }]}>
                <Text style={[styles.suspendedText, { color: colors.textMuted }]}>مؤرشف</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="albums-outline" size={13} color={colors.textMuted} />
            <Text style={styles.studentMeta} numberOfLines={1}>
              {groupLabel}{gradeLabel ? ` · ${gradeLabel}` : ''}
            </Text>
          </View>
          {student.phone ? (
            <View style={styles.metaRow}>
              <Ionicons name="call-outline" size={13} color={colors.textMuted} />
              <Text style={styles.studentPhone}>{student.phone}</Text>
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
      </Pressable>
      {canManage ? (
        <View style={styles.studentActions}>
          <Pressable hitSlop={8} onPress={onEdit} style={styles.actionBtn}>
            <Ionicons name="create" size={15} color={colors.cyan} />
            <Text style={[styles.actionText, { color: colors.cyan }]}>تعديل</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={onDelete} style={styles.actionBtn}>
            <Ionicons name="trash" size={15} color={colors.danger} />
            <Text style={[styles.actionText, { color: colors.danger }]}>حذف</Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  countLine: {
    color: colors.textMuted, fontSize: font.xs, textAlign: 'right',
    paddingHorizontal: spacing.lg, marginBottom: spacing.sm, fontWeight: '700',
  },
  avatar: {
    width: 46, height: 46, borderRadius: radius.full,
    backgroundColor: colors.primary + '26', borderWidth: 1, borderColor: colors.primary + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.text, fontSize: font.lg, fontWeight: '900' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  addBtn: {
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, marginBottom: spacing.md, minHeight: 48,
  },
  searchInput: {
    flex: 1, color: colors.text, fontSize: font.md,
    paddingVertical: spacing.sm, textAlign: 'right',
  },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, maxWidth: 220,
  },
  chipActive: { backgroundColor: colors.primary + '33', borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '700' },
  chipTextActive: { color: colors.text },
  studentCard: { marginBottom: spacing.sm, padding: spacing.md },
  studentMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  studentIcon: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.info + '1f', borderWidth: 1, borderColor: colors.info + '4d',
    alignItems: 'center', justifyContent: 'center',
  },
  studentTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  studentName: { color: colors.text, fontSize: font.md, fontWeight: '800', flexShrink: 1, textAlign: 'right' },
  suspendedPill: {
    backgroundColor: colors.dangerBg, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  suspendedText: { color: colors.danger, fontSize: font.xs, fontWeight: '800' },
  studentMeta: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 2 },
  studentPhone: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  studentActions: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md, paddingVertical: spacing.sm,
  },
  actionText: { fontSize: font.sm, fontWeight: '800' },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.bgSoft, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xl, paddingBottom: spacing.xxl * 1.5,
    borderWidth: 1, borderColor: colors.border,
    maxHeight: '92%',
  },
  modalTitle: {
    color: colors.text, fontSize: font.lg, fontWeight: '900',
    textAlign: 'center', marginBottom: spacing.lg,
  },
}));
