// ============================================================
// استفسارات الطالب: إرسال سؤال/طلب نقل مجموعة + متابعة ردود الإدارة
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage, OptionPicker } from '../../src/components/pickers';
import { addInquiry, fetchGroups, fetchMyInquiries, fetchStudentById, fetchStudentGroups } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { AppInquiry, Group, InquiryKind, Student } from '../../src/lib/types';
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
  const [student, setStudent] = useState<Student | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [membershipIds, setMembershipIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState<InquiryKind>('question');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [fromGroupId, setFromGroupId] = useState<string | null>(null);
  const [toGroupId, setToGroupId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.student_id || !profile.center_id) { setLoading(false); return; }
    try {
      const [inq, st, gr, memberships] = await Promise.all([
        fetchMyInquiries(profile.student_id),
        fetchStudentById(profile.student_id),
        fetchGroups(profile.center_id),
        fetchStudentGroups(profile.student_id),
      ]);
      setItems(inq); setStudent(st); setGroups(gr);
      setMembershipIds(memberships.map((m) => m.group_id));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [profile?.student_id, profile?.center_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const groupsMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  // المجموعات التي ينتمي إليها الطالب فعلياً (الأساسية + الإضافية)
  const currentMembershipIds = useMemo(() => {
    const ids = new Set(membershipIds);
    if (student?.group_id) ids.add(student.group_id);
    return Array.from(ids);
  }, [membershipIds, student?.group_id]);
  const sourceGroups = useMemo(
    () => currentMembershipIds.map((id) => groupsMap.get(id)).filter((g): g is Group => !!g),
    [currentMembershipIds, groupsMap],
  );
  // مجموعات صفه فقط، ولا تشمل ما هو منتمٍ إليه بالفعل
  const eligibleTargetGroups = useMemo(
    () => groups.filter((g) => g.grade_id === student?.grade_id && !currentMembershipIds.includes(g.id)),
    [groups, student?.grade_id, currentMembershipIds],
  );

  const openNew = () => {
    setFormError(null); setSubject(''); setBody('');
    setKind('question'); setFromGroupId(null); setToGroupId(null);
    setFormOpen(true);
  };

  const openTransfer = () => {
    setFormError(null); setSubject(''); setBody('');
    setKind('transfer');
    setFromGroupId(student?.group_id || currentMembershipIds[0] || null);
    setToGroupId(null);
    setFormOpen(true);
  };

  const chooseKind = (value: string) => {
    const nextKind = value as InquiryKind;
    setKind(nextKind);
    if (nextKind === 'transfer') {
      setFromGroupId(student?.group_id || currentMembershipIds[0] || null);
    } else {
      setFromGroupId(null);
    }
    setToGroupId(null);
  };

  const send = async () => {
    setFormError(null);
    if (!profile?.center_id || !profile.student_id) {
      return setFormError('تعذر تحديد حسابك — أعد فتح التطبيق وحاول مجدداً');
    }
    if (kind === 'transfer') {
      if (!fromGroupId || !toGroupId) return setFormError('اختر المجموعة الحالية والمجموعة المطلوبة');
    } else {
      if (!subject.trim()) return setFormError('اكتب عنواناً لطلبك');
      if (!body.trim()) return setFormError('اشرح طلبك بالتفصيل');
    }
    setBusy(true);
    try {
      const source = fromGroupId ? groupsMap.get(fromGroupId) : null;
      const target = toGroupId ? groupsMap.get(toGroupId) : null;
      await addInquiry({
        centerId: profile.center_id, studentId: profile.student_id, kind,
        subject: kind === 'transfer' ? `طلب انتقال: ${source?.name ?? 'مجموعة'} ← ${target?.name ?? 'مجموعة'}` : subject,
        body: kind === 'transfer' ? (body || 'طلب انتقال المجموعة من بوابة الطالب.') : body,
        fromGroupId: kind === 'transfer' ? fromGroupId : null,
        toGroupId: kind === 'transfer' ? toGroupId : null,
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
        right={<AppButton title="جديد" icon="add" small onPress={openNew} />}
      />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          <Card style={{ marginBottom: spacing.md }}>
            <View style={styles.transferHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.transferTitle}>طلب انتقال مجموعة</Text>
                <Text style={styles.transferSub}>تظهر لك مجموعات صفك فقط. عند الموافقة تنتقل مجموعتك الأساسية تلقائياً.</Text>
              </View>
              <Ionicons name="swap-horizontal" size={28} color={colors.info} />
            </View>
            <AppButton
              title="طلب انتقال الآن"
              icon="swap-horizontal"
              small
              variant="outline"
              onPress={openTransfer}
              disabled={sourceGroups.length === 0 || eligibleTargetGroups.length === 0}
            />
            {sourceGroups.length === 0 || eligibleTargetGroups.length === 0 ? (
              <Text style={styles.transferHint}>لا توجد مجموعات أخرى متاحة للنقل داخل صفك حالياً.</Text>
            ) : null}
          </Card>

          {items.length === 0 ? (
            <EmptyState
              icon="chatbubble-outline"
              title="لا توجد مراسلات بعد"
              message="عندك سؤال أو طلب نقل مجموعة؟ ابعته للإدارة من هنا"
              action={<AppButton title="طلب جديد" icon="add" small onPress={openNew} />}
            />
          ) : (
            <>
              <SectionTitle title={`طلباتك (${items.length})`} />
              {items.map((i) => (
                <Card key={i.id} style={{ marginBottom: spacing.md }}>
                  <View style={styles.head}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title} numberOfLines={1}>
                        {i.subject || (i.kind === 'transfer' ? 'طلب انتقال مجموعة' : 'طلب')}
                      </Text>
                      <Text style={styles.meta}>{KIND_LABEL[i.kind] ?? ''} · {formatDate(i.created_at)}</Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: (STATUS_COLOR[i.status] ?? colors.textMuted) + '22' }]}>
                      <Text style={[styles.statusText, { color: STATUS_COLOR[i.status] ?? colors.textMuted }]}>
                        {STATUS_LABEL[i.status] ?? i.status}
                      </Text>
                    </View>
                  </View>
                  {i.kind === 'transfer' ? (
                    <Text style={styles.body}>
                      من: {groupsMap.get(i.from_group_id ?? '')?.name ?? '—'} ← إلى: {groupsMap.get(i.to_group_id ?? '')?.name ?? '—'}
                    </Text>
                  ) : (
                    <Text style={styles.body}>{i.body}</Text>
                  )}
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
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{kind === 'transfer' ? 'طلب انتقال إلى مجموعة' : 'طلب جديد للإدارة'}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <OptionPicker label="نوع الطلب" icon="chatbox" value={kind} options={KIND_OPTIONS} onChange={chooseKind} />
              {kind === 'transfer' ? (
                <>
                  <FormMessage type="info" text="لن تظهر أي مجموعة من صف آخر، ولا يمكن إرسال الطلب إلى مجموعة من مجموعاتك الحالية." />
                  <OptionPicker
                    label="المجموعة الحالية"
                    icon="albums"
                    value={fromGroupId}
                    options={sourceGroups.map((g) => ({ value: g.id, label: g.name }))}
                    onChange={setFromGroupId}
                    placeholder="اختر المجموعة..."
                  />
                  <OptionPicker
                    label="المجموعة المطلوبة"
                    icon="swap-horizontal"
                    value={toGroupId}
                    options={eligibleTargetGroups.map((g) => ({
                      value: g.id,
                      label: g.name,
                      subtitle: g.teacher_name ? `المدرس: ${g.teacher_name}` : undefined,
                    }))}
                    onChange={setToGroupId}
                    placeholder="اختر من مجموعات صفك..."
                  />
                  <AppInput
                    label="سبب أو ملاحظة (اختياري)" icon="document-text" placeholder="مثال: الوقت المناسب للمجموعة الأخرى"
                    value={body} onChangeText={setBody} multiline numberOfLines={3}
                    style={{ minHeight: 80, textAlignVertical: 'top' }}
                  />
                </>
              ) : (
                <>
                  <AppInput label="العنوان" icon="text" placeholder="مثال: سؤال عن موعد الاختبار" value={subject} onChangeText={setSubject} />
                  <AppInput
                    label="التفاصيل" icon="document-text" placeholder="اشرح طلبك..."
                    value={body} onChangeText={setBody} multiline numberOfLines={4}
                    style={{ minHeight: 100, textAlignVertical: 'top' }}
                  />
                </>
              )}
              <FormMessage type="error" text={formError} />
              <AppButton title="إرسال الطلب" icon="send" onPress={send} loading={busy} />
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

const styles = themedStyles(() => StyleSheet.create({
  transferHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  transferTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  transferSub: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: 4, lineHeight: 18 },
  transferHint: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: spacing.sm },
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
    borderWidth: 1, borderColor: colors.border, maxHeight: '92%',
  },
  modalTitle: {
    color: colors.text, fontSize: font.lg, fontWeight: '900',
    textAlign: 'center', marginBottom: spacing.lg,
  },
}));
