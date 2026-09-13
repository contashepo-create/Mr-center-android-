// ============================================================
// اختبارات الطالب: المنشورة + التأدية بمؤقت (٨ أنواع أسئلة)
// + محاولات متعددة + طرق عرض النتيجة (بعد كل سؤال/عند التسليم/أبداً)
// + مراجعة سؤال بسؤال بعد التصحيح — التصحيح التلقائي خادمي واليدوي عند المعلم
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, LoadingView, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage } from '../../src/components/pickers';
import { fetchMyExamAttempts, fetchPublishedExams, submitExam, type ExamResult } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { ExamAnswer, ExamAttempt, ExamQuestion, ExamQuestionType, PublishedExam } from '../../src/lib/types';
import { arabicError, EXAM_TYPE_LABEL, formatDate, normalizeAnswerText, seededShuffle } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

/** نص إجابة الطالب كما كُتبت */
function answerLabel(q: ExamQuestion, a: ExamAnswer | undefined): string {
  if (a === null || a === undefined || a === '') return 'لم تُجب';
  const t = (q.type ?? 'mcq') as ExamQuestionType;
  if (t === 'mcq') return typeof a === 'number' ? (q.choices[a] ?? 'لم تُجب') : 'لم تُجب';
  if (t === 'tf') return a === 0 ? 'صح' : a === 1 ? 'خطأ' : 'لم تُجب';
  if (t === 'multi') {
    return Array.isArray(a) && a.length > 0 ? (a as number[]).map((i) => q.choices[i]).filter(Boolean).join('، ') : 'لم تُجب';
  }
  if (t === 'match') {
    if (!Array.isArray(a) || a.length === 0) return 'لم تُجب';
    const pairs = q.pairs ?? [];
    const parts = pairs.map((p, i) => `${p.l} ← ${pairs[(a as number[])[i]]?.r ?? '—'}`);
    return parts.join(' · ');
  }
  return typeof a === 'string' && a.trim() !== '' ? a.trim() : 'لم تُجب';
}

/** الإجابة النموذجية نصاً */
function correctLabel(q: ExamQuestion, model: ExamAnswer | undefined): string {
  if (model === null || model === undefined) return '—';
  const t = (q.type ?? 'mcq') as ExamQuestionType;
  if (t === 'mcq') return typeof model === 'number' ? (q.choices[model] ?? '—') : '—';
  if (t === 'tf') return model === 0 ? 'صح' : model === 1 ? 'خطأ' : '—';
  if (t === 'multi') {
    return Array.isArray(model) && model.length > 0 ? (model as number[]).map((i) => q.choices[i]).filter(Boolean).join('، ') : '—';
  }
  if (t === 'match') {
    if (!Array.isArray(model)) return '—';
    const pairs = q.pairs ?? [];
    return pairs.map((p, i) => `${p.l} ← ${pairs[(model as number[])[i]]?.r ?? '—'}`).join(' · ');
  }
  if (t === 'complete' || t === 'correct') return typeof model === 'string' && model.trim() !== '' ? model.trim() : '—';
  return '—';
}

function isManualType(t: ExamQuestionType): boolean {
  return t === 'essay' || t === 'short' || t === 'correct';
}

/** بطاقة مراجعة سؤال بسؤال بعد التصحيح، تُستخدم أيضاً بعد كل سؤال إن اختارت الإدارة ذلك */
function ExamReview({
  result, questions, answers,
}: {
  result: ExamResult;
  questions: ExamQuestion[];
  answers: ExamAnswer[];
}) {
  const pct = result.max_score > 0 ? Math.round((result.score / result.max_score) * 100) : null;
  const pending = result.status === 'pending_review';
  const scoreColor = pct !== null && pct >= 85 ? colors.success : pct !== null && pct >= 50 ? colors.warning : colors.danger;
  const perQuestion = result.per_question ?? [];

  return (
    <View>
      <Card style={styles.scoreCard}>
        <View style={[styles.pendingBadge, { backgroundColor: (pending ? colors.warning : colors.success) + '22' }]}>
          <Text style={[styles.pendingBadgeText, { color: pending ? colors.warning : colors.success }]}>
            {pending ? 'بانتظار مراجعة المعلم' : 'تم التصحيح'}
          </Text>
        </View>
        <Text style={[styles.bigScore, { color: scoreColor }]}>
          {result.score} <Text style={styles.bigScoreMax}>/ {result.max_score || '—'}</Text>
        </Text>
        {pct !== null ? <Text style={[styles.pctText, { color: scoreColor }]}>{pct}%</Text> : null}
        <Text style={styles.scoreSub}>
          أجبت صحيحاً على {result.correct} من {result.total} سؤال
          {result.attempts_used && result.attempts_allowed ? ` · المحاولة ${result.attempts_used} من ${result.attempts_allowed}` : ''}
        </Text>
      </Card>

      {perQuestion.length > 0 ? (
        <>
          <SectionTitle title="مراجعة الإجابات" />
          {perQuestion.map((r) => {
            const q = questions[r.q];
            if (!q) return null;
            const a = answers[r.q];
            const manual = r.correct === null;
            const myAnswer = answerLabel(q, a);
            const answered = myAnswer !== 'لم تُجب';
            const model = r.model !== undefined ? r.model : (q.type === 'complete' || q.type === 'correct' ? q.answer ?? null : undefined);
            const key = correctLabel(q, model);
            const verdict: 'correct' | 'wrong' | 'pending' = manual ? 'pending' : r.correct ? 'correct' : 'wrong';
            return (
              <Card key={r.q} style={{ marginBottom: spacing.md }}>
                <View style={styles.reviewHead}>
                  <Text style={styles.reviewQ} numberOfLines={2}>{r.q + 1}. {q.q}</Text>
                  <View style={styles.reviewMarksBadge}>
                    <Text style={styles.reviewMarksText}>{r.earned}/{r.marks} درجة</Text>
                  </View>
                </View>
                <View style={[
                  styles.answerRow,
                  verdict === 'correct' && styles.answerRowCorrect,
                  verdict === 'wrong' && styles.answerRowWrong,
                ]}
                >
                  <Text style={styles.answerText}><Text style={styles.answerLabel}>إجابتك: </Text>{myAnswer}</Text>
                  {verdict === 'correct' ? <Ionicons name="checkmark-circle" size={20} color={colors.success} /> : null}
                  {verdict === 'wrong' ? <Ionicons name="close-circle" size={20} color={colors.danger} /> : null}
                  {verdict === 'pending' ? <Ionicons name="time" size={20} color={colors.warning} /> : null}
                </View>
                {verdict === 'wrong' ? (
                  <Text style={styles.verdictNote}>{answered ? '✗ إجابة خاطئة' : 'بدون إجابة'}</Text>
                ) : null}
                {verdict === 'pending' ? <Text style={[styles.verdictNote, { color: colors.warning }]}>بانتظار تصحيح المعلم</Text> : null}
                {verdict === 'wrong' && key !== '—' ? (
                  <View style={styles.modelBox}>
                    <Text style={styles.modelText}><Text style={styles.answerLabel}>الإجابة الصحيحة: </Text>{key}</Text>
                  </View>
                ) : null}
                {verdict === 'pending' && isManualType(q.type) && key !== '—' ? (
                  <View style={[styles.modelBox, { backgroundColor: colors.info + '14', borderColor: colors.info + '44' }]}>
                    <Text style={styles.modelText}><Text style={styles.answerLabel}>الإجابة النموذجية: </Text>{key}</Text>
                  </View>
                ) : null}
              </Card>
            );
          })}
        </>
      ) : null}
    </View>
  );
}

export default function StudentExamsScreen() {
  const { profile } = useSession();
  const [exams, setExams] = useState<PublishedExam[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  const [taking, setTaking] = useState<PublishedExam | null>(null);
  const [answers, setAnswers] = useState<ExamAnswer[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ExamResult | null>(null);
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

  const usedFor = (examId: string) => attempts.filter((a) => a.exam_id === examId).length;

  const startExam = (e: PublishedExam) => {
    submittedRef.current = false;
    setResult(null);
    // تهيئة الإجابات حسب النوع: وصل = مصفوفة -1 لكل بند يسار، والباقي null
    setAnswers(e.questions.map((q) => {
      const t = (q.type ?? 'mcq') as ExamQuestionType;
      if (t === 'match') return Array((q.pairs ?? []).length).fill(-1) as number[];
      return null;
    }));
    setSecondsLeft((e.duration_minutes || 30) * 60);
    setTaking(e);
  };

  const isCorrupt = (qi: number) => {
    const q = taking?.questions[qi];
    if (!q) return true;
    const t = (q.type ?? 'mcq') as string;
    if (t === 'mcq' || t === 'multi') return !(q.choices ?? []).length;
    if (t === 'match') return (q.pairs ?? []).length < 2;
    return false;
  };
  const unansweredCount = () => answers.filter((a, qi) => {
    if (isCorrupt(qi)) return false;
    const q = taking?.questions[qi];
    const t = (q?.type ?? 'mcq') as string;
    if (t === 'multi') return !Array.isArray(a) || (a as number[]).length === 0;
    if (t === 'match') return !Array.isArray(a) || (a as number[]).some((x) => x < 0);
    return a === null || a === -1 || (typeof a === 'string' && !a.trim());
  }).length;

  const finish = async (auto = false) => {
    if (!taking || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      // أكمل الفراغ: نطبّع نص الطالب قبل التسليم ليطابق النموذج المطبَّع
      const payload: ExamAnswer[] = taking.questions.map((q, qi) => {
        const t = (q.type ?? 'mcq') as string;
        const a = answers[qi];
        if (t === 'complete' && typeof a === 'string') return normalizeAnswerText(a);
        if (t === 'multi' && Array.isArray(a)) return [...(a as number[])].sort((x, y) => x - y);
        return a;
      });
      const res = await submitExam(taking.id, payload);
      const mode = taking.show_result ?? 'end';
      await load();
      if (mode === 'never') {
        setResult(null);
        setTaking(null);
        Alert.alert(
          'تم التسليم بنجاح',
          `لن تظهر النتيجة الآن — ستُعرض لك بعد تحرير جميع النتائج من الإدارة${auto ? '\n(انتهى الوقت فسُلّم تلقائياً)' : ''}.`,
        );
      } else {
        setResult(res);
      }
    } catch (e) {
      submittedRef.current = false;
      Alert.alert('تعذر التسليم', arabicError(e));
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!taking || result) return;
    if (secondsLeft <= 0) { void finish(true); return; }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taking, secondsLeft, result]);

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');

  if (taking) {
    if (result) {
      return (
        <GradientScreen>
          <BackHeader title={taking.title} subtitle="نتيجتك" />
          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            <ExamReview result={result} questions={taking.questions} answers={answers} />
            <AppButton title="العودة إلى الاختبارات" icon="arrow-back" variant="outline" onPress={() => { setTaking(null); setResult(null); }} />
            <View style={{ height: spacing.xl }} />
          </ScrollView>
        </GradientScreen>
      );
    }
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
            const qtype = (q.type ?? 'mcq') as ExamQuestionType;
            const marks = Number((q as { marks?: number }).marks) || 1;
            const options = qtype === 'tf' ? ['صح', 'خطأ'] : (q.choices ?? []);
            if (isCorrupt(qi)) {
              return (
                <Card key={qi} style={{ marginBottom: spacing.md }}>
                  <Text style={styles.qText}>{qi + 1}) {q.q}</Text>
                  <FormMessage type="error" text="سؤال معطوب — أبلغ إدارة سنترك وسيُستبعد من التصحيح" />
                </Card>
              );
            }
            return (
              <Card key={qi} style={{ marginBottom: spacing.md }}>
                <Text style={styles.qText}>
                  {qi + 1}) {q.q} [{EXAM_TYPE_LABEL[qtype] ?? qtype} — {marks} درجة]
                </Text>

                {/* اختياري / صح-خطأ: اختيار واحد */}
                {qtype === 'mcq' || qtype === 'tf' ? options.map((c, ci) => (
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
                )) : null}

                {/* متعدد الإجابات: علّم كل الصحيح */}
                {qtype === 'multi' ? options.map((c, ci) => {
                  const cur = Array.isArray(answers[qi]) ? (answers[qi] as number[]) : [];
                  const on = cur.includes(ci);
                  return (
                    <Pressable
                      key={ci}
                      onPress={() => setAnswers((p) => p.map((a, ai) => (
                        ai === qi ? (on ? cur.filter((x) => x !== ci) : [...cur, ci]) : a
                      )))}
                      style={[styles.choice, on && styles.choiceActive]}
                    >
                      <Ionicons
                        name={on ? 'checkbox' : 'square-outline'}
                        size={18}
                        color={on ? colors.primary : colors.textMuted}
                      />
                      <Text style={styles.choiceText}>{c}</Text>
                    </Pressable>
                  );
                }) : null}

                {/* أكمل الفراغ */}
                {qtype === 'complete' ? (
                  <AppInput
                    placeholder="اكتب ما ينقص العبارة..."
                    value={typeof answers[qi] === 'string' ? (answers[qi] as string) : ''}
                    onChangeText={(v) => setAnswers((p) => p.map((a, ai) => (ai === qi ? v : a)))}
                  />
                ) : null}

                {/* وصل: لكل بند يسار اختر ما يقابله يميناً (ترتيب مبعثر ثابت) */}
                {qtype === 'match' ? (() => {
                  const pairs = q.pairs ?? [];
                  const order = seededShuffle(pairs.length, `${taking.id}:${qi}`);
                  const cur = Array.isArray(answers[qi]) ? (answers[qi] as number[]) : Array(pairs.length).fill(-1);
                  return pairs.map((p, li) => (
                    <View key={li} style={styles.matchBlock}>
                      <Text style={styles.matchLeft}>{li + 1}) {p.l}</Text>
                      <View style={styles.matchRights}>
                        {order.map((ri) => (
                          <Pressable
                            key={ri}
                            onPress={() => setAnswers((prev) => prev.map((a, ai) => (
                              ai === qi ? (cur).map((v, x) => (x === li ? ri : v)) : a
                            )))}
                            style={[styles.matchChip, cur[li] === ri && styles.matchChipActive]}
                          >
                            <Text style={[styles.matchChipText, cur[li] === ri && styles.matchChipTextActive]}>
                              {pairs[ri].r}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ));
                })() : null}

                {/* صحّح الخطأ / مقالي / إجابة قصيرة */}
                {qtype === 'correct' || qtype === 'essay' ? (
                  <AppInput
                    placeholder={qtype === 'correct' ? 'اكتب الجملة مصححة...' : 'اكتب إجابتك هنا...'}
                    value={typeof answers[qi] === 'string' ? (answers[qi] as string) : ''}
                    onChangeText={(v) => setAnswers((p) => p.map((a, ai) => (ai === qi ? v : a)))}
                    multiline
                    numberOfLines={4}
                    style={{ minHeight: 100, textAlignVertical: 'top' }}
                  />
                ) : null}
                {qtype === 'short' ? (
                  <AppInput
                    placeholder="إجابتك القصيرة..."
                    value={typeof answers[qi] === 'string' ? (answers[qi] as string) : ''}
                    onChangeText={(v) => setAnswers((p) => p.map((a, ai) => (ai === qi ? v : a)))}
                  />
                ) : null}
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

  const availableExams = exams.filter((e) => usedFor(e.id) < (e.attempts_allowed ?? 1));
  const exhaustedExams = exams.filter((e) => usedFor(e.id) >= (e.attempts_allowed ?? 1));

  return (
    <GradientScreen>
      <BackHeader title="الاختبارات" subtitle="أدِّ المنشور حسب عدد المحاولات المسموحة" />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          <SectionTitle title={`امتحانات متاحة (${availableExams.length})`} />
          {availableExams.length === 0 ? (
            <Card><Text style={styles.dimText}>لا توجد امتحانات جديدة — ستظهر هنا فور نشرها</Text></Card>
          ) : availableExams.map((e) => {
            const used = usedFor(e.id);
            const allowed = e.attempts_allowed ?? 1;
            return (
              <Card key={e.id} style={styles.examCard}>
                <View style={styles.examHead}>
                  <View style={styles.examIcon}>
                    <Ionicons name="document-text" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.examTitle}>{e.title}</Text>
                    <Text style={styles.examMeta}>
                      {e.subject} · {e.questions.length} أسئلة · {e.duration_minutes ?? 30} دقيقة · من {e.total_score} · المحاولات {used}/{allowed}
                    </Text>
                  </View>
                </View>
                <View style={{ height: spacing.md }} />
                <AppButton title={used > 0 ? 'إعادة المحاولة' : 'بدء الامتحان'} icon="play" small onPress={() => startExam(e)} />
              </Card>
            );
          })}

          {exhaustedExams.length > 0 ? (
            <>
              <SectionTitle title={`اكتملت محاولاتها (${exhaustedExams.length})`} />
              {exhaustedExams.map((e) => (
                <Card key={e.id} style={{ ...styles.examCard, opacity: 0.65 }}>
                  <View style={styles.examHead}>
                    <View style={styles.examIcon}>
                      <Ionicons name="checkmark-done" size={20} color={colors.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.examTitle}>{e.title}</Text>
                      <Text style={styles.examMeta}>استنفدت المحاولات ({e.attempts_allowed ?? 1})</Text>
                    </View>
                  </View>
                </Card>
              ))}
            </>
          ) : null}

          <SectionTitle title={`نتائجي (${attempts.length})`} />
          {attempts.length === 0 ? (
            <Card><Text style={styles.dimText}>لم تؤدِ أي امتحان بعد</Text></Card>
          ) : attempts.map((a) => {
            const exam = exams.find((e) => e.id === a.exam_id);
            const pending = a.status === 'pending_review';
            const pct = Number(a.max_score) > 0 ? Math.round((Number(a.score) / Number(a.max_score)) * 100) : 0;
            const hidden = exam?.show_result === 'never';
            return (
              <View key={a.id} style={styles.resRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resTitle} numberOfLines={1}>{exam?.title ?? 'امتحان'}</Text>
                  <Text style={styles.resMeta}>
                    {formatDate(a.created_at)}{pending ? ' · قيد مراجعة المعلم' : ''}{hidden ? ' · بانتظار تحرير النتائج' : ''}
                  </Text>
                </View>
                <Text style={[styles.resScore, { color: pending || hidden ? colors.warning : pct >= 50 ? colors.success : colors.danger }]}>
                  {pending || hidden ? '...' : `${a.score}/${a.max_score}`}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
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
  matchBlock: {
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  matchLeft: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right', marginBottom: spacing.sm },
  matchRights: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  matchChip: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  matchChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '26' },
  matchChipText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '700' },
  matchChipTextActive: { color: colors.text },
  resRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  resTitle: { color: colors.text, fontSize: font.md, fontWeight: '700', textAlign: 'right' },
  resMeta: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  resScore: { fontSize: font.lg, fontWeight: '900' },
  scoreCard: { alignItems: 'center', paddingVertical: spacing.xl, marginBottom: spacing.md },
  pendingBadge: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6, marginBottom: spacing.md },
  pendingBadgeText: { fontSize: font.sm, fontWeight: '800' },
  bigScore: { fontSize: 46, fontWeight: '900', writingDirection: 'ltr' },
  bigScoreMax: { fontSize: 20, color: colors.textMuted, fontWeight: '700' },
  pctText: { fontSize: font.lg, fontWeight: '900', marginTop: spacing.xs },
  scoreSub: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'center', marginTop: spacing.sm },
  reviewHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  reviewQ: { flex: 1, color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  reviewMarksBadge: { backgroundColor: colors.info + '22', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  reviewMarksText: { color: colors.info, fontSize: font.xs, fontWeight: '800' },
  answerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md,
  },
  answerRowCorrect: { borderColor: colors.success + '66', backgroundColor: colors.successBg },
  answerRowWrong: { borderColor: colors.danger + '66', backgroundColor: colors.dangerBg },
  answerText: { flex: 1, color: colors.text, fontSize: font.sm, textAlign: 'right' },
  answerLabel: { fontWeight: '800' },
  verdictNote: { color: colors.danger, fontSize: font.xs, textAlign: 'right', marginTop: spacing.xs, fontWeight: '700' },
  modelBox: {
    backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.success + '55',
    borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm,
  },
  modelText: { color: colors.text, fontSize: font.sm, textAlign: 'right' },
}));
