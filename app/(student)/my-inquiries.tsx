// ============================================================
// استفسارات الطالب: إرسال سؤال/طلب + متابعة ردود الإدارة
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage, OptionPicker } from '../../src/components/pickers';
import { addInquiry, fetchMyInquiries } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { AppInquiry, InquiryKind } from '../../src/lib/types';
import { arabicError, formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

const KIND_OPTIONS = [
  { value: 'question', label: 'سؤال عن الدروس' },
  { value: 'transfer', label: 'طلب نقل لمجموعة أخرى' },
  { value: 'registration', label: 'طلب تسجيل/استفسار إداري' },
  { value: 'other', label: 'أخرى' },
];
const KIND_LABEL: Record<string, string> = {
  question: 'سؤال', transfer: 'نقل مجموعة', registration: 'تسجيل', other: 'أخرى',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'بانتظار رد الإدارة', answered: 'تم الرد', approved: 'مقبول ✓', rejected: 'مرفوض', closed: 'مغلق',
};
const STATUS_COLOR: Record<string, string> = {
  pending: colors.warning, answered: colors.info, approved: colors.success, rejected: colors.danger, closed: colors.textMuted,
};

export default function MyInquiriesScreen() {
  const { profile } = useSession();
  const [items, setItems] = useState<AppInquiry[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState('question');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.student_id) { setLoading(false); return; }
    try { setItems(await fetchMyInquiries(profile.student_id)); } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [profile?.student_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const send = async () => {
    setFormError(null);
    if (!subject.trim()) return setFormError('اكتب عنواناً لطلبك');
    if (!body.trim()) return setFormError('اشرح طلبك بالتفصيل');
    if (!profile?.center_id || !profile.student_id) {
      return setFormError('تعذر تحديد حسابك — أعد فتح التطبيق وحاول مجدداً');
    }
    setBusy(true);
    try {
      await addInquiry({
        centerId: profile.center_id, studentId: profile.student_id,
        kind: kind as InquiryKind, subject, body,
      });
      setFormOpen(false); setSubject(''); setBody('');
      await load();
    } catch (e) {
      setFormError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GradientScreen>
      <BackHeader
        title="استفساراتي"
        subtitle="راسل إدارة سنترك"
        right={<AppButton title="جديد" icon="add" small onPress={() => { setFormError(null); setFormOpen(true); }} />}
      />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : items.length === 0 ? (
        <EmptyState
          icon="chatbubble-outline"
          title="لا توجد مراسلات بعد"
          message="عندك سؤال أو طلب نقل مجموعة؟ ابعته للإدارة من هنا"
          action={<AppButton title="طلب جديد" icon="add" small onPress={() => setFormOpen(true)} />}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          <SectionTitle title={`طلباتك (${items.length})`} />
          {items.map((i) => (
            <Card key={i.id} style={{ marginBottom: spacing.md }}>
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>{i.subject}</Text>
                  <Text style={styles.meta}>{KIND_LABEL[i.kind] ?? ''} · {formatDate(i.created_at)}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: (STATUS_COLOR[i.status] ?? colors.textMuted) + '22' }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[i.status] ?? colors.textMuted }]}>
                    {STATUS_LABEL[i.status] ?? i.status}
                  </Text>
                </View>
              </View>
              <Text style={styles.body}>{i.body}</Text>
              {i.reply ? (
                <View style={styles.replyBox}>
                  <View style={styles.replyHead}>
                    <Ionicons name="megaphone" size={14} color={colors.success} />
                    <Text style={styles.replyLabel}>رد الإدارة</Text>
                  </View>
                  <Text style={styles.replyText}>{i.reply}</Text>
                </View>
              ) : null}
            </Card>
          ))}
        </ScrollView>
      )}

      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>طلب جديد للإدارة</Text>
            <OptionPicker label="نوع الطلب" icon="chatbox" value={kind} options={KIND_OPTIONS} onChange={setKind} />
            <AppInput label="العنوان" icon="text" placeholder="مثال: طلب نقل لمجموعة الثلاثاء" value={subject} onChangeText={setSubject} />
            <AppInput
              label="التفاصيل" icon="document-text" placeholder="اشرح طلبك..."
              value={body} onChangeText={setBody} multiline numberOfLines={4}
              style={{ minHeight: 100, textAlignVertical: 'top' }}
            />
            <FormMessage type="error" text={formError} />
            <AppButton title="إرسال الطلب" icon="send" onPress={send} loading={busy} />
            <View style={{ height: spacing.sm }} />
            <AppButton title="إلغاء" variant="ghost" small onPress={() => setFormOpen(false)} />
          </View>
        </View>
      </Modal>
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  meta: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  statusPill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusText: { fontSize: font.xs, fontWeight: '800' },
  body: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', lineHeight: 20, marginTop: spacing.sm },
  replyBox: {
    backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.success + '44',
    borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md,
  },
  replyHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, justifyContent: 'flex-end' },
  replyLabel: { color: colors.success, fontSize: font.xs, fontWeight: '800' },
  replyText: { color: colors.text, fontSize: font.sm, textAlign: 'right', marginTop: 4, lineHeight: 20 },
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
}));
