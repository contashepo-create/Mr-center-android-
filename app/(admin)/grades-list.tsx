// ============================================================
// إدارة الصفوف الدراسية (تُستخدم لتصنيف المجموعات والطلاب)
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppInput, Card, EmptyState, ListItem, LoadingView } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { addGrade, deleteGrade, fetchGrades } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
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

  const load = useCallback(async () => {
    if (!centerId) return;
    try { setGrades(await fetchGrades(centerId)); } catch { /* ignore */ }
    setLoading(false);
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const add = async () => {
    if (!newName.trim()) return;
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

      {/* إضافة سريعة */}
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
          <Ionicons name={busy ? 'sync' : 'add'} size={26} color="#fff" />
        </Pressable>
      </View>

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
                <Pressable hitSlop={8} onPress={() => confirmDelete(item)} style={styles.miniBtn}>
                  <Ionicons name="trash" size={16} color={colors.danger} />
                </Pressable>
              }
            />
          )}
        />
      )}
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
});
