// ============================================================
// إشعارات السنتر الداخلية: بث جماعي بضغطة (صف واحد لكل رسالة)
// + عدّاد المقروء لكل إشعار
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, NoAccess, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage, OptionPicker } from '../../src/components/pickers';
import { can } from '../../src/lib/staff';
import {
  deleteNotification, fetchCenterStudentGroups, fetchGrades, fetchGroups, fetchNotificationReadCounts,
  fetchNotifications, fetchStudents, logActivity, sendNotification,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { AppNotification, Grade, Group, NotificationAudience, Student } from '../../src/lib/types';
import { arabicError, formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

export default function NotificationsScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';
  const [items, setItems] = useState<(AppNotification & { reads: number })[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [audience, setAudience] = useState<NotificationAudience>('all');
  const [audienceId, setAudienceId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [extraLinks, setExtraLinks] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!centerId) return;
    try {
      const [ns, st, g, gr, xj] = await Promise.all([
        fetchNotifications(centerId), fetchStudents(centerId),
        fetchGroups(centerId), fetchGrades(centerId),
        fetchCenterStudentGroups(centerId),
      ]);
      setExtraLinks(new Set(xj.map((r) => `${r.student_id}:${r.group_id}`)));
      const readsMap = await fetchNotificationReadCounts(ns.map((n) => n.id)).catch(() => new Map());
      const withReads = ns.map((n) => ({ ...n, reads: readsMap.get(n.id) ?? 0 }));
      setItems(withReads);
      setStudents(st); setGroups(g); setGrades(gr);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const audienceLabel = (n: AppNotification) => {
    if (n.audience === 'owners') return 'لك أنت من المطور (خاصة بالإدارة)';
    if (n.audience === 'all') return 'كل الطلاب';
    if (n.audience === 'grade') return `صف: ${grades.find((g) => g.id === n.audience_id)?.name ?? '—'}`;
    if (n.audience === 'group') return `مجموعة: ${groups.find((g) => g.id === n.audience_id)?.name ?? '—'}`;
    return `طالب: ${students.find((s) => s.id === n.audience_id)?.name ?? '—'}`;
  };

  const reachCount = () => {
    const act = students.filter((s) => s.status === 'active');
    if (audience === 'grade') return audienceId ? act.filter((s) => s.grade_id === audienceId).length : act.length;
    if (audience === 'group') {
      if (!audienceId) return act.length;
      return act.filter((s) => s.group_id === audienceId || extraLinks.has(`${s.id}:${audienceId}`)).length;
    }
    if (audience === 'student') return audienceId ? 1 : 0;
    return act.length;
  };

  if (!can(profile, 'notify')) {
    return (
      <GradientScreen>
        <BackHeader title="إشعارات الطلاب" />
        <NoAccess />
      </GradientScreen>
    );
  }

  const audienceLabelHint = () => {
    if (audience === 'all') return 'كل الطلاب';
    if (audience === 'grade') return `صف: ${grades.find((g) => g.id === audienceId)?.name ?? ''}`;
    if (audience === 'group') return `مجموعة: ${groups.find((g) => g.id === audienceId)?.name ?? ''}`;
    return `طالب: ${students.find((s) => s.id === audienceId)?.name ?? ''}`;
  };

  const openAdd = () => {
    setAudience('all'); setAudienceId(null); setTitle(''); setBody('');
    setFormError(null); setFormOpen(true);
  };

  const send = async () => {
    setFormError(null);
    if (!title.trim()) return setFormError('اكتب عنوان الإشعار');
    if (!body.trim()) return setFormError('اكتب نص الإشعار');
    if (audience !== 'all' && !audienceId) return setFormError('اختر المستهدف (صف/مجموعة/طالب)');
    setBusy(true);
    try {
      await sendNotification({ centerId, audience, audienceId, title, body });
      await logActivity(centerId, 'broadcast_sent', `${title.trim()} — ${audienceLabelHint()}`);
      setFormOpen(false);
      await load();
      Alert.alert('تم البث', `وصل الإشعار إلى ${reachCount()} طالب فور فتحهم التطبيق`);
    } catch (e) {
      setFormError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (n: AppNotification) => {
    Alert.alert('حذف الإشعار', `حذف «${n.title}» نهائياً من عند كل الطلاب؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: async () => {
          try { await deleteNotification(n.id); await load(); }
          catch (e) { Alert.alert('تعذر الحذف', arabicError(e)); }
        },
      },
    ]);
  };

  return (
    <GradientScreen>
      <BackHeader
        title="إشعارات الطلاب"
        subtitle="بث جماعي فوري ومجاني"
        right={
          <AppButton title="بث جديد" icon="add" small onPress={openAdd} />
        }
      />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : items.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="لا توجد إشعارات بعد"
          message="ابث أول إشعار وسيصل كل طلابك (أو صف/مجموعة) فور فتحهم التطبيق"
          action={<AppButton title="بث إشعار" icon="send" small onPress={openAdd} />}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Card style={styles.notifCard}>
              <View style={styles.head}>
                <View style={styles.iconWrap}>
                  <Ionicons name="notifications" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.meta}>{audienceLabel(item)} · {formatDate(item.created_at)}</Text>
                </View>
                <View style={styles.readsPill}>
                  <Ionicons name="eye" size={13} color={colors.success} />
                  <Text style={styles.readsText}>{item.reads} قرأ</Text>
                </View>
              </View>
              <Text style={styles.body} numberOfLines={3}>{item.body}</Text>
              <Pressable onPress={() => confirmDelete(item)} style={styles.delBtn}>
                <Ionicons name="trash" size={15} color={colors.danger} />
                <Text style={styles.delText}>حذف من عند الجميع</Text>
              </Pressable>
            </Card>
          )}
        />
      )}

      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>بث إشعار جديد</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <OptionPicker
                label="يصل إلى" icon="people" value={audience}
                options={[
                  { value: 'all', label: 'كل الطلاب النشطين' },
                  { value: 'grade', label: 'صف معين' },
                  { value: 'group', label: 'مجموعة معينة' },
                  { value: 'student', label: 'طالب واحد' },
                ]}
                onChange={(v) => { setAudience(v as NotificationAudience); setAudienceId(null); }}
              />
              {audience === 'grade' ? (
                <OptionPicker
                  label="الصف" icon="school" value={audienceId}
                  options={grades.map((g) => ({ value: g.id, label: g.name }))}
                  onChange={setAudienceId} placeholder="اختر الصف..."
                />
              ) : null}
              {audience === 'group' ? (
                <OptionPicker
                  label="المجموعة" icon="albums" value={audienceId}
                  options={groups.map((g) => ({ value: g.id, label: g.name, subtitle: `${g.students_count} طالب` }))}
                  onChange={setAudienceId} placeholder="اختر المجموعة..."
                />
              ) : null}
              {audience === 'student' ? (
                <OptionPicker
                  label="الطالب" icon="person" value={audienceId}
                  options={students.filter((s) => s.status === 'active').map((s) => ({ value: s.id, label: s.name }))}
                  onChange={setAudienceId} placeholder="اختر الطالب..."
                />
              ) : null}
              <FormMessage type="info" text={`سيصل إلى ${reachCount()} طالب`} />
              <AppInput label="العنوان" icon="text" placeholder="مثال: اختبار مفاجئ غداً" value={title} onChangeText={setTitle} />
              <AppInput
                label="النص" icon="document-text" placeholder="اكتب تفاصيل الإشعار..."
                value={body} onChangeText={setBody} multiline numberOfLines={4}
                style={{ minHeight: 100, textAlignVertical: 'top' }}
              />
              <FormMessage type="error" text={formError} />
              <AppButton title="بث الآن" icon="send" onPress={send} loading={busy} />
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

const styles = StyleSheet.create({
  notifCard: { marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 42, height: 42, borderRadius: radius.md,
    backgroundColor: colors.primary + '22', borderWidth: 1, borderColor: colors.primary + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  meta: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  readsPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.successBg, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  readsText: { color: colors.success, fontSize: font.xs, fontWeight: '800' },
  body: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', lineHeight: 20, marginTop: spacing.sm },
  delBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: spacing.md },
  delText: { color: colors.danger, fontSize: font.xs, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bgSoft, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xl, paddingBottom: spacing.xxl * 1.5,
    borderWidth: 1, borderColor: colors.border, maxHeight: '94%',
  },
  modalTitle: {
    color: colors.text, fontSize: font.lg, fontWeight: '900',
    textAlign: 'center', marginBottom: spacing.lg,
  },
});
