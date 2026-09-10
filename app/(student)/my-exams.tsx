// ============================================================
// اختبارات الطالب: المنشورة + التأدية بمؤقت + نتائجي
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage } from '../../src/components/pickers';
import { fetchMyExamAttempts, fetchPublishedExams, submitExam } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { ExamAttempt, PublishedExam } from '../../src/lib/types';
import { arabicError, formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

export default function StudentExamsScreen() {
  const { profile } = useSession();
  const [exams, setExams] = useState<PublishedExam[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  const [taking, setTaking] = useState<PublishedExam | null>(null);
  const [answers, setAnswers] = useState<(number | string | null)[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  const load = useCallback(async () => {
    if (!profile?.student_id) { setLoading(false); return; }
    try {
      const [pub, att] = await Promise.all([
        fetchPublishedExams(),
        fetchMyExamAttempts(profile.student_id),
      ]);
      setExams(pub); setAttempts(att);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [profile?.student_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const startExam = (e: PublishedExam) => {
    submittedRef.current = false;
    setAnswers(new Array(e.questions.length).fill(null));
    setSecondsLeft((e.duration_minutes || 30) * 60);
    setTaking(e);
  };

  const isCorrupt = (qi: number) => {
    const q = taking?.questions[qi];
    if (!q) return true;
    const t = (q.type ?? 'mcq') as string;
    return t !== 'essay' && !(q.choices ?? []).length && t !== 'tf';
  };
  const unansweredCount = () => answers.filter((a, qi) => {
    if (isCorrupt(qi)) return false;
    return a === null || a === -1 || (typeof a === 'string' && !a.trim());
  }).length;

  const finish = async (auto = false) => {
    if (!taking || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await submitExam(taking.id, answers);
      setTaking(null);
      await load();
      Alert.alert(
        'تم تسليم الامتحان',
        res.status === 'pending_review'
          ? `استلمنا إجابتك — فيها أسئلة مقالية قيد مراجعة المعلم وستظهر درجتك بعد الاعتماد${auto ? '\n(انتهى الوقت فسُلّم تلقائياً)' : ''}`
          : `درجتك: ${res.score} من ${res.max_score}\nإجابات صحيحة: ${res.correct} من ${res.total}${auto ? '\n(انتهى الوقت فسُلّم تلقائياً)' : ''}`,
      );
    } catch (e) {
      submittedRef.current = false;
      Alert.alert('تعذر التسليم', arabicError(e));
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!taking) return;
    if (secondsLeft <= 0) { void finish(true); return; }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taking, secondsLeft]);

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');

  if (taking) {
    return (
      <GradientScreen>
        <BackHeader title={taking.title} subtitle={`${taking.subject} — ${taking.questions.length} أسئلة`} />
        <View style={styles.timerBar}>
          <Ionicons name="time" size={18} color={secondsLeft < 300 ? colors.danger : colors.warning} />
          <Text style={[styles.timerText, secondsLeft < 300 && { color: colors.danger }]}>
            المتبقي: {mm}:{ss}
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          {taking.questions.map((q, qi) => {
            const qtype = (q.type ?? 'mcq') as 'mcq' | 'tf' | 'essay';
            const marks = Number((q as { marks?: number }).marks) || 1;
            const options = qtype === 'tf' ? ['صح', 'خطأ'] : (q.choices ?? []);
            if (qtype !== 'essay' && options.length === 0) {
              return (
                <Card key={qi} style={{ marginBottom: spacing.md }}>
                  <Text style={styles.qText}>{qi + 1}) {q.q}</Text>
                  <FormMessage type="error" text="سؤال معطوب بلا اختيارات — أبلغ إدارة سنترك وسيُستبعد من التصحيح" />
                </Card>
              );
            }
            return (
              <Card key={qi} style={{ marginBottom: spacing.md }}>
                <Text style={styles.qText}>
                  {qi + 1}) {q.q} [{qtype === 'mcq' ? 'اختياري' : qtype === 'tf' ? 'صح/خطأ' : 'مقالي'} — {marks} درجة]
                </Text>
                {qtype === 'essay' ? (
                  <AppInput
                    placeholder="اكتب إجابتك هنا..."
                    value={typeof answers[qi] === 'string' ? (answers[qi] as string) : ''}
                    onChangeText={(v) => setAnswers((p) => p.map((a, ai) => (ai === qi ? v : a)))}
                    multiline
                    numberOfLines={4}
                    style={{ minHeight: 100, textAlignVertical: 'top' }}
                  />
                ) : options.map((c, ci) => (
                  <Pressable
                    key={ci}
                    onPress={() => setAnswers((p) => p.map((a, ai) => (ai === qi ? ci : a)))}
                    style={[styles.choice, answers[qi] === ci && styles.choiceActive]}
                  >
                    <Ionicons
                      name={answers[qi] === ci ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={answers[qi] === ci ? colors.primary : colors.textMuted}
                    />
                    <Text style={styles.choiceText}>{c}</Text>
                  </Pressable>
                ))}
              </Card>
            );
          })}
          <FormMessage
            type="info"
            text={unansweredCount() > 0 ? `بقي ${unansweredCount()} أسئلة بلا إجابة — راجعها قبل التسليم` : null}
          />
          <AppButton
            title="تسليم الامتحان"
            icon="send"
            onPress={() => {
              if (unansweredCount() > 0) {
                Alert.alert('أسئلة ناقصة', 'لم تجب عن كل الأسئلة — متأكد من التسليم؟', [
                  { text: 'مراجعة', style: 'cancel' },
                  { text: 'تسليم', style: 'destructive', onPress: () => finish(false) },
                ]);
              } else finish(false);
            }}
            loading={submitting}
          />
          <View style={{ height: spacing.sm }} />
          <AppButton
            title="خروج بدون تسليم"
            variant="ghost"
            small
            onPress={() => {
              Alert.alert('خروج بدون تسليم؟', 'ستضيع كل إجاباتك في هذا الامتحان.', [
                { text: 'البقاء', style: 'cancel' },
                { text: 'خروج وضياع الإجابات', style: 'destructive', onPress: () => setTaking(null) },
              ]);
            }}
          />
        </ScrollView>
      </GradientScreen>
    );
  }

  return (
    <GradientScreen>
      <BackHeader title="الاختبارات" subtitle="أدِّ المنشور وحاول مرة واحدة" />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          <SectionTitle title={`امتحانات متاحة (${exams.filter((e) => !e.attempted).length})`} />
          {exams.filter((e) => !e.attempted).length === 0 ? (
            <Card><Text style={styles.dimText}>لا توجد امتحانات جديدة — ستظهر هنا فور نشرها</Text></Card>
          ) : exams.filter((e) => !e.attempted).map((e) => (
            <Card key={e.id} style={styles.examCard}>
              <View style={styles.examHead}>
                <View style={styles.examIcon}>
                  <Ionicons name="document-text" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.examTitle}>{e.title}</Text>
                  <Text style={styles.examMeta}>
                    {e.subject} · {e.questions.length} أسئلة · {e.duration_minutes ?? 30} دقيقة · من {e.total_score}
                  </Text>
                </View>
              </View>
              <View style={{ height: spacing.md }} />
              <AppButton title="بدء الامتحان" icon="play" small onPress={() => startExam(e)} />
            </Card>
          ))}

          <SectionTitle title={`نتائجي (${attempts.length})`} />
          {attempts.length === 0 ? (
            <Card><Text style={styles.dimText}>لم تؤدِ أي امتحان بعد</Text></Card>
          ) : attempts.map((a) => {
            const exam = exams.find((e) => e.id === a.exam_id);
            const pending = a.status === 'pending_review';
            const pct = Number(a.max_score) > 0 ? Math.round((Number(a.score) / Number(a.max_score)) * 100) : 0;
            return (
              <View key={a.id} style={styles.resRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resTitle} numberOfLines={1}>{exam?.title ?? 'امتحان'}</Text>
                  <Text style={styles.resMeta}>
                    {formatDate(a.created_at)}{pending ? ' · قيد مراجعة المعلم' : ''}
                  </Text>
                </View>
                <Text style={[styles.resScore, { color: pending ? colors.warning : pct >= 50 ? colors.success : colors.danger }]}>
                  {pending ? '...' : `${a.score}/${a.max_score}`}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  dimText: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  examCard: { marginBottom: spacing.md },
  examHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  examIcon: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.primary + '22', borderWidth: 1, borderColor: colors.primary + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  examTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  examMeta: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  timerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingVertical: spacing.sm,
  },
  timerText: { color: colors.warning, fontSize: font.md, fontWeight: '900' },
  qText: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right', marginBottom: spacing.md },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  choiceActive: { borderColor: colors.primary, backgroundColor: colors.primary + '1f' },
  choiceText: { flex: 1, color: colors.text, fontSize: font.md, textAlign: 'right' },
  resRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  resTitle: { color: colors.text, fontSize: font.md, fontWeight: '700', textAlign: 'right' },
  resMeta: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  resScore: { fontSize: font.lg, fontWeight: '900' },
});
