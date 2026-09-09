// ============================================================
// إدارة المجموعات: إنشاء/تعديل/حذف مع الأيام والمواعيد والرسوم
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, EmptyState, ListItem, LoadingView } from '../../src/components/controls';
import { GradientScreen, ScreenHeader } from '../../src/components/layout';
import { DaysPicker, FormMessage, OptionPicker } from '../../src/components/pickers';
import { deleteGroup, fetchGrades, fetchGroups, upsertGroup } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { Grade, Group } from '../../src/lib/types';
import { arabicError, formatDays, formatMoney } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

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

  const gradeName = (id: string | null) => grades.find((g) => g.id === id)?.name ?? '';

  const openAdd = () => {
    setEditing(null); setName(''); setGradeId(null); setDays([]);
    setStartTime(''); setEndTime(''); setFee(''); setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (g: Group) => {
    setEditing(g); setName(g.name); setGradeId(g.grade_id);
    setDays(g.days ?? []); setStartTime(g.start_time ?? ''); setEndTime(g.end_time ?? '');
    setFee(g.monthly_fee ? String(g.monthly_fee) : ''); setFormError(null);
    setFormOpen(true);
  };

  const save = async () => {
    setFormError(null);
    if (!name.trim()) return setFormError('أدخل اسم المجموعة');
    setBusy(true);
    try {
      await upsertGroup(centerId, {
        id: editing?.id,
        name,
        grade_id: gradeId,
        days,
        start_time: startTime.trim(),
        end_time: endTime.trim(),
        monthly_fee: Number(fee) || 0,
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
        subtitle={`${groups.length} مجموعة`}
        right={
          <Pressable style={styles.addBtn} onPress={openAdd}>
            <Ionicons name="add" size={24} color="#fff" />
          </Pressable>
        }
      />

      {loading ? (
        <LoadingView message="جاري تحميل المجموعات..." />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title="لا توجد مجموعات بعد"
          message="أنشئ مجموعاتك حسب الأيام والمواعيد، ثم أضف الطلاب إليها"
          action={<AppButton title="إنشاء مجموعة" icon="add" small onPress={openAdd} />}
        />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={() => { setLoading(true); void load(); }}
          renderItem={({ item }) => (
            <ListItem
              title={item.name}
              subtitle={[
                gradeName(item.grade_id),
                formatDays(item.days),
                item.start_time ? `${item.start_time}${item.end_time ? ' - ' + item.end_time : ''}` : '',
                item.monthly_fee ? formatMoney(item.monthly_fee) + ' شهرياً' : '',
              ].filter(Boolean).join('\n')}
              icon="albums"
              iconColor={colors.primary}
              badge={{ text: `${item.students_count} طالب`, color: colors.cyan, bg: colors.infoBg }}
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

      {/* نموذج إنشاء/تعديل مجموعة */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{editing ? 'تعديل المجموعة' : 'إنشاء مجموعة جديدة'}</Text>
            <AppInput label="اسم المجموعة" icon="albums" placeholder="مثال: مجموعة السبت والثلاثاء" value={name} onChangeText={setName} />
            <OptionPicker
              label="الصف الدراسي (اختياري)"
              icon="school"
              value={gradeId}
              options={grades.map((g) => ({ value: g.id, label: g.name }))}
              onChange={setGradeId}
              placeholder="اختر الصف..."
            />
            <DaysPicker value={days} onChange={setDays} />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <AppInput label="من الساعة" icon="time" placeholder="4:00 م" value={startTime} onChangeText={setStartTime} />
              </View>
              <View style={{ flex: 1 }}>
                <AppInput label="إلى الساعة" icon="time" placeholder="6:00 م" value={endTime} onChangeText={setEndTime} />
              </View>
            </View>
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
            <FormMessage type="error" text={formError} />
            <AppButton title={editing ? 'حفظ التعديلات' : 'إنشاء المجموعة'} icon="checkmark" onPress={save} loading={busy} />
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
  miniBtn: {
    width: 32, height: 32, borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
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
});
