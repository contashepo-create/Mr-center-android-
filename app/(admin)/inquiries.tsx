// ============================================================
// الطلبات والاستفسارات: موافقة/رفض/رد على رسائل الطلاب
// (تسجيل · نقل مجموعة · سؤال · أخرى)
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, NoAccess, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage } from '../../src/components/pickers';
import { can } from '../../src/lib/staff';
import { fetchGroups, fetchInquiries, fetchStudents, replyInquiry, resolveStudentTransfer } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { AppInquiry, Group, InquiryStatus, Student } from '../../src/lib/types';
import { arabicError, formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

const KINDS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  question: { label: 'سؤال', icon: 'help-circle', color: colors.info },
  transfer: { label: 'نقل مجموعة', icon: 'swap-horizontal', color: colors.warning },
  registration: { label: 'تسجيل', icon: 'person-add', color: colors.success },
  other: { label: 'أخرى', icon: 'chatbox', color: colors.textMuted },
};

const STATUS_LABEL: Record<InquiryStatus, string> = {
  pending: 'بانتظار الرد', answered: 'تم الرد', approved: 'مقبول', rejected: 'مرفوض', closed: 'مغلق',
};
const STATUS_COLOR: Record<InquiryStatus, string> = {
  pending: colors.warning, answered: colors.info, approved: colors.success, rejected: colors.danger, closed: colors.textMuted,
};

const FILTERS = [
  { value: 'all', label: 'الكل' },
  { value: 'pending', label: 'بانتظار الرد' },
  { value: 'answered', label: 'تم الرد' },
  { value: 'approved', label: 'مقبول' },
  { value: 'rejected', label: 'مرفوض' },
  { value: 'closed', label: 'مغلق' },
];

export default function InquiriesScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';
  const [items, setItems] = useState<AppInquiry[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const [replyOpen, setReplyOpen] = useState(false);
  const [current, setCurrent] = useState<AppInquiry | null>(null);
  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!centerId) return;
    try {
      const [inq, st, gr] = await Promise.all([fetchInquiries(centerId), fetchStudents(centerId), fetchGroups(centerId)]);
      setItems(inq); setStudents(st); setGroups(gr);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const studentName = (id: string | null) => students.find((s) => s.id === id)?.name ?? 'طالب محذوف';
  const groupName = (id: string | null | undefined) => groups.find((g) => g.id === id)?.name ?? '—';

  const shown = filter === 'all' ? items : items.filter((i) => i.status === filter);
  const pendingCount = items.filter((i) => i.status === 'pending').length;

  if (!can(profile, 'inquiries')) {
    return (
      <GradientScreen>
        <BackHeader title="الطلبات والاستفسارات" />
        <NoAccess />
      </GradientScreen>
    );
  }

  const openReply = (inq: AppInquiry) => {
    setCurrent(inq); setReply(inq.reply ?? ''); setReplyError(null); setReplyOpen(true);
  };

  const send = async (status: InquiryStatus) => {
    if (!current) return;
    setReplyError(null);
    // القبول/الرفض لطلب النقل ينفَّذ خادمياً (ينقل المجموعة الأساسية ذرياً)؛ باقي الطلبات رد نصي عادي.
    const isTransferResolution = current.kind === 'transfer' && current.status === 'pending' && (status === 'approved' || status === 'rejected');
    if (!isTransferResolution && !reply.trim()) return setReplyError('اكتب الرد أولاً');
    setBusy(true);
    try {
      if (isTransferResolution) {
        await resolveStudentTransfer(current.id, status as 'approved' | 'rejected', reply);
      } else {
        await replyInquiry(current.id, reply, status);
      }
      setReplyOpen(false);
      await load();
    } catch (e) {
      setReplyError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const quickClose = (inq: AppInquiry) => {
    Alert.alert('إغلاق الطلب', `إغلاق «${inq.subject}» بدون رد؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'إغلاق', style: 'destructive',
        onPress: async () => {
          try { await replyInquiry(inq.id, inq.reply ?? '', 'closed'); await load(); }
          catch (e) { Alert.alert('تعذر الإغلاق', arabicError(e)); }
        },
      },
    ]);
  };

  return (
    <GradientScreen>
      <BackHeader
        title="الطلبات والاستفسارات"
        subtitle={pendingCount > 0 ? `${pendingCount} بانتظار ردك` : `${items.length} طلب`}
      />
      <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.value}
              onPress={() => setFilter(f.value)}
              hitSlop={6}
              style={[styles.chipWrap, filter === f.value && styles.chipActive]}
            >
              <Text style={[styles.chipText, filter === f.value && styles.chipTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="chatbubble-outline"
          title="لا توجد طلبات"
          message={filter === 'all' ? 'عندما يراسلك الطلاب ستظهر طلباتهم هنا' : 'لا توجد طلبات بهذه الحالة'}
        />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const kind = KINDS[item.kind] ?? KINDS.other;
            return (
              <Card style={styles.inqCard}>
                <View style={styles.inqHead}>
                  <View style={[styles.kindIcon, { backgroundColor: kind.color + '22', borderColor: kind.color + '55' }]}>
                    <Ionicons name={kind.icon} size={18} color={kind.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inqTitle} numberOfLines={1}>{item.subject || kind.label}</Text>
                    <Text style={styles.inqMeta}>{kind.label} · {studentName(item.student_id)} · {formatDate(item.created_at)}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[item.status] + '22' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
                      {STATUS_LABEL[item.status]}
                    </Text>
                  </View>
                </View>
                {item.kind === 'transfer' ? (
                  <Text style={styles.inqBody}>
                    نقل من «{groupName(item.from_group_id)}» إلى «{groupName(item.to_group_id)}»
                    {item.body ? ` — ${item.body}` : ''}
                  </Text>
                ) : (
                  <Text style={styles.inqBody}>{item.body}</Text>
                )}
                {item.reply ? (
                  <View style={styles.replyBox}>
                    <Text style={styles.replyLabel}>رد الإدارة:</Text>
                    <Text style={styles.replyText}>{item.reply}</Text>
                  </View>
                ) : null}
                <View style={styles.inqActions}>
                  <AppButton title={item.reply ? 'تعديل الرد' : 'رد'} icon="chatbox" small onPress={() => openReply(item)} />
                  {item.status !== 'closed' ? (
                    <AppButton title="إغلاق" variant="ghost" small onPress={() => quickClose(item)} />
                  ) : null}
                </View>
              </Card>
            );
          }}
        />
      )}

      <Modal visible={replyOpen} transparent animationType="slide" onRequestClose={() => setReplyOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>الرد على: {current?.subject}</Text>
            {current?.kind === 'transfer' ? (
              <>
                <Text style={styles.modalBody}>
                  نقل من «{groupName(current.from_group_id)}» إلى «{groupName(current.to_group_id)}»
                </Text>
                <FormMessage type="info" text="القبول ينقل المجموعة الأساسية للطالب فوراً وذرياً على الخادم." />
              </>
            ) : (
              <Text style={styles.modalBody}>{current?.body}</Text>
            )}
            <AppInput
              label={current?.kind === 'transfer' ? 'ملاحظة للطالب (اختياري عند القبول/الرفض)' : 'رد الإدارة'}
              icon="chatbox"
              placeholder="اكتب ردك هنا..."
              value={reply}
              onChangeText={setReply}
              multiline
              numberOfLines={4}
              style={{ minHeight: 100, textAlignVertical: 'top' }}
            />
            {current?.kind === 'transfer' && current?.student_id ? (
              <AppButton
                title="فتح ملف الطالب"
                icon="person-circle"
                small
                variant="outline"
                onPress={() => { setReplyOpen(false); router.push(`/student/${current.student_id}`); }}
              />
            ) : null}
            <FormMessage type="error" text={replyError} />
            <SectionTitle title="إرسال الرد مع حالة" />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <AppButton title="رد عادي" icon="checkmark" small onPress={() => send('answered')} loading={busy} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton title="قبول" icon="thumbs-up" small variant="success" onPress={() => send('approved')} loading={busy} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton title="رفض" icon="thumbs-down" small variant="danger" onPress={() => send('rejected')} loading={busy} />
              </View>
            </View>
            <View style={{ height: spacing.sm }} />
            <AppButton title="إلغاء" variant="ghost" small onPress={() => setReplyOpen(false)} />
          </View>
        </View>
      </Modal>
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  chipWrap: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary + '33', borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '700' },
  chipTextActive: { color: colors.text },
  inqCard: { marginBottom: spacing.md },
  inqHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  kindIcon: {
    width: 42, height: 42, borderRadius: radius.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  inqTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  inqMeta: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  statusPill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusText: { fontSize: font.xs, fontWeight: '800' },
  inqBody: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', lineHeight: 20, marginTop: spacing.md },
  replyBox: {
    backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.success + '44',
    borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md,
  },
  replyLabel: { color: colors.success, fontSize: font.xs, fontWeight: '800', textAlign: 'right' },
  replyText: { color: colors.text, fontSize: font.sm, textAlign: 'right', marginTop: 4, lineHeight: 20 },
  inqActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bgSoft, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xl, paddingBottom: spacing.xxl * 1.5,
    borderWidth: 1, borderColor: colors.border, maxHeight: '92%',
  },
  modalTitle: {
    color: colors.text, fontSize: font.lg, fontWeight: '900',
    textAlign: 'center', marginBottom: spacing.sm,
  },
  modalBody: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginBottom: spacing.md, lineHeight: 20 },
}));
