// ============================================================
// إدارة الطلاب: بحث + إضافة/تعديل + فتح ملف الطالب
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, FlatList, Modal, Pressable, StyleSheet, Text, View,
} from 'react-native';
import {
  AppButton, AppInput, Card, EmptyState, ListItem, LoadingView,
} from '../../src/components/controls';
import { GradientScreen, ScreenHeader } from '../../src/components/layout';
import { FormMessage, OptionPicker } from '../../src/components/pickers';
import {
  deleteStudent, fetchGrades, fetchGroups, fetchStudents, upsertStudent,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { Grade, Group, Student } from '../../src/lib/types';
import { arabicError } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

export default function StudentsScreen() {
  const { profile } = useSession();
  const params = useLocalSearchParams<{ add?: string }>();
  const centerId = profile?.center_id ?? '';

  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [gradeId, setGradeId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!centerId) return;
    try {
      const [s, g, gr] = await Promise.all([
        fetchStudents(centerId, search),
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

  // فتح نموذج الإضافة تلقائياً عند القدوم من زر سريع
  useEffect(() => {
    if (params.add === '1') {
      openAdd();
      router.setParams({ add: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.add]);

  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? 'بدون مجموعة';

  const openAdd = () => {
    setEditing(null);
    setName(''); setPhone(''); setGuardianPhone('');
    setGradeId(null); setGroupId(null); setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setName(s.name);
    setPhone(s.phone ?? '');
    setGuardianPhone(s.guardian_phone ?? '');
    setGradeId(s.grade_id);
    setGroupId(s.group_id);
    setFormError(null);
    setFormOpen(true);
  };

  const save = async () => {
    setFormError(null);
    if (!name.trim()) return setFormError('أدخل اسم الطالب');
    setBusy(true);
    try {
      await upsertStudent(centerId, {
        id: editing?.id,
        name, phone, guardian_phone: guardianPhone,
        grade_id: gradeId, group_id: groupId,
        status: editing?.status ?? 'active',
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
        subtitle={`${students.length} طالب`}
        right={
          <Pressable style={styles.addBtn} onPress={openAdd}>
            <Ionicons name="add" size={24} color="#fff" />
          </Pressable>
        }
      />

      {/* البحث */}
      <View style={{ paddingHorizontal: spacing.lg }}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginHorizontal: spacing.sm }} />
          <AppInput
            placeholder="ابحث بالاسم أو الهاتف أو البريد..."
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
        </View>
      </View>

      {loading ? (
        <LoadingView message="جاري تحميل الطلاب..." />
      ) : students.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={search ? 'لا توجد نتائج مطابقة' : 'لا يوجد طلاب بعد'}
          message={search ? 'جرّب كلمات بحث مختلفة' : 'أضف طلابك يدوياً، أو شارك كود السنتر ليسجّلوا بأنفسهم'}
          action={<AppButton title="إضافة طالب" icon="person-add" small onPress={openAdd} />}
        />
      ) : (
        <FlatList
          data={students}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={() => { setLoading(true); void load(); }}
          renderItem={({ item }) => (
            <ListItem
              title={item.name}
              subtitle={`${groupName(item.group_id)}${item.phone ? ` · ${item.phone}` : ''}`}
              icon="person"
              iconColor={item.status === 'active' ? colors.info : colors.textMuted}
              badge={item.status !== 'active' ? { text: 'موقوف', color: colors.danger, bg: colors.dangerBg } : undefined}
              onPress={() => router.push(`/student/${item.id}`)}
              right={
                <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                  <Pressable hitSlop={8} onPress={() => openEdit(item)} style={styles.miniBtn}>
                    <Ionicons name="create" size={16} color={colors.cyan} />
                  </Pressable>
                  <Pressable hitSlop={8} onPress={() => confirmDelete(item)} style={styles.miniBtn}>
                    <Ionicons name="trash" size={16} color={colors.danger} />
                  </Pressable>
                </View>
              }
            />
          )}
        />
      )}

      {/* نموذج إضافة/تعديل طالب */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{editing ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد'}</Text>
            <AppInput label="اسم الطالب" icon="person" placeholder="الاسم الكامل" value={name} onChangeText={setName} />
            <AppInput label="رقم الهاتف (اختياري)" icon="call" placeholder="01xxxxxxxxx" value={phone} onChangeText={setPhone} keyboardType="phone-pad" textAlign="left" style={{ writingDirection: 'ltr' }} />
            <AppInput label="رقم ولي الأمر (اختياري)" icon="people" placeholder="01xxxxxxxxx" value={guardianPhone} onChangeText={setGuardianPhone} keyboardType="phone-pad" textAlign="left" style={{ writingDirection: 'ltr' }} />
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
            <FormMessage type="error" text={formError} />
            <AppButton title={editing ? 'حفظ التعديلات' : 'إضافة الطالب'} icon="checkmark" onPress={save} loading={busy} />
            <View style={{ height: spacing.sm }} />
            <AppButton title="إلغاء" variant="ghost" small onPress={() => setFormOpen(false)} />
          </View>
        </View>
      </Modal>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, marginBottom: spacing.md, minHeight: 48,
  },
  searchInput: { flex: 1, paddingVertical: spacing.sm },
  miniBtn: {
    width: 32, height: 32, borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
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
});
