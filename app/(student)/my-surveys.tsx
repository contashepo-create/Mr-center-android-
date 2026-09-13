// ============================================================
// استبيانات الطالب: أنواع أسئلة كاملة (اختيار/متعدد/تقييم/نعم-لا/نصي)،
// جمهور مستهدف (الكل/صف/مجموعات)، موعد نهائي، وقفل بعد الإرسال.
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage } from '../../src/components/pickers';
import {
  fetchActiveSurveys, fetchMySurveyResponses, fetchStudentById, fetchStudentGroups, submitSurveyResponse,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { deadlineLabel, emptyAnswer, isAnswered, isSurveyOpen, QUESTION_TYPE_LABELS, surveyForStudent, YES, NO } from '../../src/lib/survey';
import type { AppSurvey, AppSurveyResponse, Student, SurveyAnswer, SurveyQuestion } from '../../src/lib/types';
import { arabicError } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

export default function StudentSurveysScreen() {
  const { profile } = useSession();
  const [surveys, setSurveys] = useState<AppSurvey[]>([]);
  const [responses, setResponses] = useState<AppSurveyResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [active, setActive] = useState<AppSurvey | null>(null);
  const [answers, setAnswers] = useState<Record<string, SurveyAnswer>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.center_id || !profile.student_id) { setLoading(false); return; }
    try {
      const [sv, mine, student, groups] = await Promise.all([
        fetchActiveSurveys(profile.center_id),
        fetchMySurveyResponses(profile.student_id),
        fetchStudentById(profile.student_id).catch(() => null),
        fetchStudentGroups(profile.student_id).catch(() => []),
      ]);
      const filtered = student ? sv.filter((s) => surveyForStudent(s, student as Student, groups.map((g) => g.group_id))) : sv;
      setSurveys(filtered);
      setResponses(mine);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [profile?.center_id, profile?.student_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const doneIds = new Set(responses.map((r) => r.survey_id));

  const start = (s: AppSurvey) => {
    setActive(s);
    const init: Record<string, SurveyAnswer> = {};
    for (const q of s.questions) init[q.id] = emptyAnswer(q);
    setAnswers(init);
    setFormError(null);
  };

  const setAnswer = (q: SurveyQuestion, patch: Partial<SurveyAnswer>) => {
    setAnswers((old) => ({ ...old, [q.id]: { ...(old[q.id] ?? emptyAnswer(q)), ...patch } }));
  };
  const toggleChoice = (q: SurveyQuestion, opt: string, multi: boolean) => {
    setAnswers((old) => {
      const cur = old[q.id] ?? emptyAnswer(q);
      const choice = [...(cur.choice ?? [])];
      const idx = choice.indexOf(opt);
      if (multi) { if (idx >= 0) choice.splice(idx, 1); else choice.push(opt); }
      else if (idx >= 0) choice.splice(idx, 1); else { choice.length = 0; choice.push(opt); }
      return { ...old, [q.id]: { ...cur, choice } };
    });
  };

  const submit = async () => {
    if (!active || !profile?.center_id || !profile.student_id) return;
    const missing = active.questions.find((q) => q.required && !isAnswered(answers[q.id]));
    if (missing) return setFormError(`أجب عن السؤال الإجباري: ${missing.title}`);
    setFormError(null);
    setBusy(true);
    try {
      await submitSurveyResponse({
        centerId: profile.center_id, surveyId: active.id, studentId: profile.student_id,
        answers, lockAfterSubmit: active.lock_after_submit,
      });
      setActive(null);
      await load();
      Alert.alert('شكراً لك', 'تم إرسال إجاباتك بنجاح.');
    } catch (e) {
      if (String((e as Error)?.message ?? '').includes('already_answered')) setFormError('أُرسلت إجابتك ولا يمكن تعديلها.');
      else setFormError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GradientScreen>
      <BackHeader title="الاستبيانات" subtitle="شارك رأيك مع إدارة سنترك" />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : active ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          <SectionTitle title={active.title} />
          {active.description ? <Text style={styles.svDesc}>{active.description}</Text> : null}
          {active.anonymous ? <FormMessage type="info" text="إجاباتك مجهولة — لن يظهر اسمك في النتائج." /> : null}
          {active.questions.map((q, i) => (
            <Card key={q.id} style={styles.qCard}>
              <View style={styles.qHead}>
                <Text style={styles.qTitle}>{i + 1}. {q.title}</Text>
                <Text style={styles.qType}>{QUESTION_TYPE_LABELS[q.type]}{q.required ? ' · إجباري' : ''}</Text>
              </View>
              {(q.type === 'single' || q.type === 'multi') ? (
                (q.options ?? []).map((o) => {
                  const checked = (answers[q.id]?.choice ?? []).includes(o);
                  return (
                    <Pressable key={o} style={styles.optRow} onPress={() => toggleChoice(q, o, q.type === 'multi')}>
                      <Ionicons
                        name={q.type === 'multi' ? (checked ? 'checkbox' : 'square-outline') : (checked ? 'radio-button-on' : 'radio-button-off')}
                        size={20}
                        color={checked ? colors.success : colors.textMuted}
                      />
                      <Text style={styles.optText}>{o}</Text>
                    </Pressable>
                  );
                })
              ) : null}
              {q.type === 'yesno' ? (
                <View style={styles.yesNoRow}>
                  {[YES, NO].map((o) => {
                    const checked = (answers[q.id]?.choice ?? []).includes(o);
                    return (
                      <AppButton
                        key={o}
                        title={o}
                        small
                        variant={checked ? 'success' : 'outline'}
                        onPress={() => toggleChoice(q, o, false)}
                      />
                    );
                  })}
                </View>
              ) : null}
              {q.type === 'rating' ? (
                <View style={styles.ratingRow}>
                  {Array.from({ length: q.maxRating || 5 }, (_, k) => k + 1).map((v) => (
                    <Pressable
                      key={v}
                      style={[styles.ratingDot, (answers[q.id]?.rating ?? 0) >= v && styles.ratingDotOn]}
                      onPress={() => setAnswer(q, { rating: v })}
                    >
                      <Text style={[styles.ratingText, (answers[q.id]?.rating ?? 0) >= v && styles.ratingTextOn]}>{v}</Text>
                    </Pressable>
                  ))}
                  <Text style={styles.qType}>
                    {(answers[q.id]?.rating || 0) > 0 ? `${answers[q.id]?.rating} / ${q.maxRating || 5}` : 'اختر تقييماً'}
                  </Text>
                </View>
              ) : null}
              {q.type === 'text' ? (
                <AppInput
                  placeholder={q.placeholder || 'إجابتك'}
                  value={answers[q.id]?.text ?? ''}
                  onChangeText={(v) => setAnswer(q, { text: v })}
                  multiline
                  style={{ marginBottom: 0 }}
                />
              ) : null}
            </Card>
          ))}
          <FormMessage type="error" text={formError} />
          <AppButton title="إرسال إجاباتي" icon="send" onPress={submit} loading={busy} />
          <View style={{ height: spacing.sm }} />
          <AppButton title="إلغاء" variant="ghost" small onPress={() => setActive(null)} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          <SectionTitle title={`المتاح (${surveys.length})`} />
          {surveys.length === 0 ? (
            <EmptyState icon="list-outline" title="لا توجد استبيانات" message="لم يوجّه لك أي استبيان نشط حالياً." />
          ) : surveys.map((s) => {
            const done = doneIds.has(s.id);
            const open = isSurveyOpen(s);
            return (
              <Card key={s.id} style={styles.svCard}>
                <View style={styles.svHead}>
                  <Text style={styles.svTitle}>{s.title}</Text>
                  <View style={[styles.pubPill, { backgroundColor: done ? colors.successBg : open ? colors.infoBg : colors.warningBg }]}>
                    <Text style={[styles.pubText, { color: done ? colors.success : open ? colors.info : colors.warning }]}>
                      {done ? 'تمت الإجابة' : open ? 'متاح' : 'منتهي'}
                    </Text>
                  </View>
                </View>
                {s.description ? <Text style={styles.svDesc}>{s.description}</Text> : null}
                <Text style={styles.svMeta}>{s.questions.length} أسئلة · {deadlineLabel(s)}</Text>
                <View style={{ height: spacing.md }} />
                <AppButton
                  title={done ? (s.lock_after_submit ? 'مقفلة' : 'تمت الإجابة') : open ? 'الإجابة الآن' : 'منتهي'}
                  icon="create"
                  small
                  disabled={done || !open}
                  onPress={() => start(s)}
                />
              </Card>
            );
          })}
        </ScrollView>
      )}
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  svCard: { marginBottom: spacing.md },
  svHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  svTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right', flex: 1 },
  svDesc: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 4 },
  svMeta: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 4 },
  pubPill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  pubText: { fontSize: font.xs, fontWeight: '800' },
  qCard: { marginBottom: spacing.md },
  qHead: { marginBottom: spacing.sm },
  qTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  qType: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  optText: { color: colors.text, fontSize: font.sm, textAlign: 'right' },
  yesNoRow: { flexDirection: 'row', gap: spacing.sm },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  ratingDot: {
    width: 34, height: 34, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  ratingDotOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  ratingText: { color: colors.text, fontWeight: '800' },
  ratingTextOn: { color: '#052E22' },
}));
