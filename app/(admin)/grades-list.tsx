// ============================================================
// إدارة الصفوف الدراسية (تُستخدم لتصنيف المجموعات والطلاب)
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, EmptyState, ListItem, LoadingView } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage } from '../../src/components/pickers';
import { addGrade, deleteGrade, fetchGrades, updateGrade } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { isOwner } from '../../src/lib/staff';
import type { Grade } from '../../src/lib/types';
import { arabicError } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

export default function GradesListScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';

  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Grade | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  // المدرس: عرض فقط — الإضافة والتعديل والحذف للمالك
  const canManage = isOwner(profile);

  const load = useCallback(async () => {
    if (!centerId) return;
    try { setGrades(await fetchGrades(centerId)); } catch { /* ignore */ }
    setLoading(false);
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const add = async () => {
    if (!newName.trim()) {
      Alert.alert('تنبيه', 'اكتب اسم الصف أولاً ثم اضغط إضافة');
      return;
    }
    setBusy(true);
    try {
      await addGrade(centerId, newName);
      setNewName('');
      await load();
    } catch (e) {
      Alert.alert('تعذر الإضافة', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (g: Grade) => {
    setEditing(g); setEditName(g.name); setEditError(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setEditError(null);
    if (!editName.trim()) return setEditError('أدخل اسم الصف');
    setEditBusy(true);
    try {
      await updateGrade(editing.id, editName);
      setEditing(null);
      await load();
    } catch (e) {
      setEditError(arabicError(e));
    } finally {
      setEditBusy(false);
    }
  };

  const confirmDelete = (g: Grade) => {
    Alert.alert('حذف الصف', `حذف «${g.name}»؟ لن يتأثر الطلاب والمجموعات المرتبطة.`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: async () => {
          try { await deleteGrade(g.id); await load(); }
          catch (e) { Alert.alert('تعذر الحذف', arabicError(e)); }
        },
      },
    ]);
  };

  return (
    <GradientScreen>
      <BackHeader title="الصفوف الدراسية" subtitle={`${grades.length} صف`} />

      {/* إضافة سريعة (للمالك فقط) */}
      {canManage ? (
        <View style={styles.addRow}>
          <View style={{ flex: 1 }}>
            <AppInput
              placeholder="مثال: الصف الثالث الثانوي"
              value={newName}
              onChangeText={setNewName}
              style={{ marginBottom: 0 }}
            />
          </View>
        <Pressable style={styles.addBtn} onPress={add} disabled={busy}>
          <Ionicons name={busy ? 'sync' : 'add'} size={26} color="#052E22" />
        </Pressable>
        </View>
      ) : null}

      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : grades.length === 0 ? (
        <EmptyState
          icon="school-outline"
          title="لا توجد صفوف بعد"
          message="أضف الصفوف الدراسية لتصنيف مجموعاتك وطلابك بسهولة"
        />
      ) : (
        <FlatList
          data={grades}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ListItem
              title={item.name}
              icon="school"
              iconColor={colors.info}
              right={
                canManage ? (
                  <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                    <Pressable hitSlop={8} onPress={() => openEdit(item)} style={styles.miniBtn}>
                      <Ionicons name="create" size={16} color={colors.cyan} />
                    </Pressable>
                    <Pressable hitSlop={8} onPress={() => confirmDelete(item)} style={styles.miniBtn}>
                      <Ionicons name="trash" size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                ) : undefined
              }
            />
          )}
        />
      )}

      {/* نافذة تعديل اسم الصف */}
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>تعديل الصف الدراسي</Text>
            <AppInput
              label="اسم الصف"
              icon="school"
              placeholder="مثال: الصف الثالث الثانوي"
              value={editName}
              onChangeText={setEditName}
            />
            <FormMessage type="error" text={editError} />
            <AppButton title="حفظ التعديل" icon="checkmark" onPress={saveEdit} loading={editBusy} />
            <View style={{ height: spacing.sm }} />
            <AppButton title="إلغاء" variant="ghost" small onPress={() => setEditing(null)} />
          </View>
        </View>
      </Modal>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  addRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  addBtn: {
    width: 48, height: 48, borderRadius: radius.md,
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
    borderWidth: 1, borderColor: colors.border,
  },
  modalTitle: {
    color: colors.text, fontSize: font.lg, fontWeight: '900',
    textAlign: 'center', marginBottom: spacing.lg,
  },
});
