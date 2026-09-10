// ============================================================
// استبيانات الطالب: الإجابة مرة واحدة على استبيانات السنتر المفعّلة
// ============================================================

import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage } from '../../src/components/pickers';
import { fetchActiveSurveys, fetchMySurveyResponses, submitSurveyResponse } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { AppSurvey } from '../../src/lib/types';
import { arabicError } from '../../src/lib/utils';
import { colors, font, spacing } from '../../src/theme';

export default function StudentSurveysScreen() {
  const { profile } = useSession();
  const [surveys, setSurveys] = useState<AppSurvey[]>([]);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [openId, setOpenId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.center_id || !profile.student_id) { setLoading(false); return; }
    try {
      const [sv, mine] = await Promise.all([
        fetchActiveSurveys(profile.center_id),
        fetchMySurveyResponses(profile.student_id),
      ]);
      setSurveys(sv);
      setAnsweredIds(new Set(mine.map((r) => r.survey_id)));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [profile?.center_id, profile?.student_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openSurvey = (s: AppSurvey) => {
    if (!s.questions || s.questions.length === 0) {
      Alert.alert('استبيان فارغ', 'هذا الاستبيان بلا أسئلة بعد — أبلغ إدارة سنترك.');
      return;
    }
    setOpenId(s.id);
    setAnswers(new Array(s.questions.length).fill(''));
    setFormError(null);
  };

  const send = async () => {
    const survey = surveys.find((s) => s.id === openId);
    if (!survey || !profile?.center_id || !profile.student_id) return;
    setFormError(null);
    if (answers.some((a) => !a.trim())) return setFormError('أجب عن كل الأسئلة أولاً');
    setBusy(true);
    try {
      await submitSurveyResponse({
        centerId: profile.center_id, surveyId: survey.id,
        studentId: profile.student_id, answers: answers.map((a) => a.trim()),
      });
      setOpenId(null);
      await load();
      Alert.alert('شكراً لك', 'تم إرسال إجاباتك بنجاح.');
    } catch (e) {
      setFormError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const pending = surveys.filter((s) => !answeredIds.has(s.id));
  const done = surveys.filter((s) => answeredIds.has(s.id));
  const current = surveys.find((s) => s.id === openId);

  return (
    <GradientScreen>
      <BackHeader title="الاستبيانات" subtitle="شارك رأيك مع إدارة سنترك" />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : openId && current ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          <SectionTitle title={current.title} />
          {current.questions.map((q, i) => (
            <AppInput
              key={i}
              label={`سؤال ${i + 1}: ${q}`}
              icon="chatbox"
              placeholder="اكتب إجابتك..."
              value={answers[i] ?? ''}
              onChangeText={(v) => setAnswers((p) => p.map((a, ai) => (ai === i ? v : a)))}
              multiline
            />
          ))}
          <FormMessage type="error" text={formError} />
          <AppButton title="إرسال إجاباتي" icon="send" onPress={send} loading={busy} />
          <View style={{ height: spacing.sm }} />
          <AppButton title="رجوع" variant="ghost" small onPress={() => setOpenId(null)} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          <SectionTitle title={`بانتظار إجابتك (${pending.length})`} />
          {pending.length === 0 ? (
            <Card><Text style={styles.dimText}>لا توجد استبيانات جديدة حالياً</Text></Card>
          ) : pending.map((s) => (
            <Card key={s.id} style={styles.svCard}>
              <Text style={styles.svTitle}>{s.title}</Text>
              <Text style={styles.svMeta}>{s.questions.length} أسئلة</Text>
              <View style={{ height: spacing.md }} />
              <AppButton title="الإجابة الآن" icon="create" small onPress={() => openSurvey(s)} />
            </Card>
          ))}
          {done.length > 0 ? (
            <>
              <SectionTitle title={`أجبت عنها (${done.length})`} />
              {done.map((s) => (
                <Card key={s.id} style={styles.svCard}>
                  <Text style={styles.svTitle}>{s.title}</Text>
                  <Text style={styles.svDone}>✓ تم الإرسال — شكراً لمشاركتك</Text>
                </Card>
              ))}
            </>
          ) : null}
          {surveys.length === 0 ? (
            <EmptyState icon="list-outline" title="لا توجد استبيانات" message="ستظهر هنا استبيانات سنترك فور تفعيلها" />
          ) : null}
        </ScrollView>
      )}
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  dimText: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  svCard: { marginBottom: spacing.md },
  svTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  svMeta: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 4 },
  svDone: { color: colors.success, fontSize: font.sm, fontWeight: '700', textAlign: 'right', marginTop: 4 },
});
