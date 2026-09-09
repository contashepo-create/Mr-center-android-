// ============================================================
// إدارة الإعلانات: نشر/تثبيت/حذف — تظهر للطلاب فوراً
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, EmptyState, ListItem, LoadingView } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage } from '../../src/components/pickers';
import { deleteAnnouncement, fetchAnnouncements, upsertAnnouncement } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { Announcement } from '../../src/lib/types';
import { arabicError, formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

export default function AnnouncementsScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';

  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!centerId) return;
    try { setItems(await fetchAnnouncements(centerId)); } catch { /* ignore */ }
    setLoading(false);
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openAdd = () => {
    setEditing(null); setTitle(''); setBody(''); setPinned(false); setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditing(a); setTitle(a.title); setBody(a.body); setPinned(a.pinned); setFormError(null);
    setFormOpen(true);
  };

  const save = async () => {
    setFormError(null);
    if (!title.trim()) return setFormError('أدخل عنوان الإعلان');
    if (!body.trim()) return setFormError('أدخل نص الإعلان');
    setBusy(true);
    try {
      await upsertAnnouncement(centerId, { id: editing?.id, title, body, pinned });
      setFormOpen(false);
      await load();
    } catch (e) {
      setFormError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (a: Announcement) => {
    Alert.alert('حذف الإعلان', `حذف «${a.title}»؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: async () => {
          try { await deleteAnnouncement(a.id); await load(); }
          catch (e) { Alert.alert('تعذر الحذف', arabicError(e)); }
        },
      },
    ]);
  };

  return (
    <GradientScreen>
      <BackHeader
        title="الإعلانات"
        subtitle={`${items.length} إعلان`}
        right={
          <Pressable style={styles.addBtn} onPress={openAdd}>
            <Ionicons name="add" size={24} color="#fff" />
          </Pressable>
        }
      />

      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : items.length === 0 ? (
        <EmptyState
          icon="megaphone-outline"
          title="لا توجد إعلانات"
          message="انشر أول إعلان وسيظهر لجميع طلابك في التطبيق فوراً"
          action={<AppButton title="إعلان جديد" icon="megaphone" small onPress={openAdd} />}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={() => { setLoading(true); void load(); }}
          renderItem={({ item }) => (
            <ListItem
              title={item.title}
              subtitle={`${item.body}\n${formatDate(item.created_at)}`}
              icon="megaphone"
              iconColor={item.pinned ? colors.warning : colors.info}
              badge={item.pinned ? { text: 'مثبت', color: colors.warning, bg: colors.warningBg } : undefined}
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

      {/* نموذج إعلان */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{editing ? 'تعديل الإعلان' : 'إعلان جديد'}</Text>
            <AppInput label="عنوان الإعلان" icon="megaphone" placeholder="مثال: موعد اختبار الشهر" value={title} onChangeText={setTitle} />
            <AppInput
              label="نص الإعلان"
              icon="document-text"
              placeholder="اكتب تفاصيل الإعلان..."
              value={body}
              onChangeText={setBody}
              multiline
              numberOfLines={4}
              style={{ minHeight: 100, textAlignVertical: 'top' }}
            />
            <Pressable style={styles.pinRow} onPress={() => setPinned((v) => !v)}>
              <Ionicons name={pinned ? 'checkbox' : 'square-outline'} size={22} color={colors.warning} />
              <Text style={styles.pinText}>تثبيت الإعلان أعلى القائمة</Text>
            </Pressable>
            <FormMessage type="error" text={formError} />
            <AppButton title={editing ? 'حفظ التعديلات' : 'نشر الإعلان'} icon="send" onPress={save} loading={busy} />
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
  pinRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.md, paddingVertical: spacing.xs,
  },
  pinText: { color: colors.text, fontSize: font.md, fontWeight: '600' },
});
