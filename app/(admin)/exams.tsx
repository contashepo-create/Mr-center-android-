// ============================================================
// الاختبارات الإلكترونية: إنشاء أسئلة اختيار من متعدد + نشر +
// متابعة المحاولات والدرجات + نسخة ورقية للطباعة (PDF)
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, NoAccess, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage, OptionPicker } from '../../src/components/pickers';
import { can } from '../../src/lib/staff';
import {
  deleteExam, fetchAttemptsForExam, fetchExams, fetchGrades, fetchStudents,
  gradeAttemptManually, toggleExamPublished, upsertExam,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { AppExam, ExamAttempt, ExamQuestionType, Grade, Student } from '../../src/lib/types';
import { arabicError, examMarksTotal, formatDate, validateExamDraft } from '../../src/lib/utils';
import { buildReportHtml, shareReportPdf } from '../../src/lib/report';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

interface DraftQ { q: string; type: ExamQuestionType; choices: string[]; correct: number; marks: number }

const blankQ = (type: ExamQuestionType = 'mcq'): DraftQ => ({
  q: '', type, choices: type === 'tf' ? ['صح', 'خطأ'] : ['', '', '', ''], correct: 0, marks: 1,
});

const TYPE_OPTIONS: { value: ExamQuestionType; label: string }[] = [
  { value: 'mcq', label: 'اختيار من متعدد' },
  { value: 'tf', label: 'صح / خطأ' },
  { value: 'essay', label: 'مقالي (تصحيح يدوي)' },
];
const TYPE_LABEL: Record<ExamQuestionType, string> = {
  mcq: 'اختياري', tf: 'صح/خطأ', essay: 'مقالي',
};

const STARTERS = [
  { label: 'قصير: 10 دقائق', duration: 10, count: 5 },
  { label: 'متوسط: 30 دقيقة', duration: 30, count: 10 },
  { label: 'شامل: 60 دقيقة', duration: 60, count: 20 },
];

export default function ExamsScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';
  const [exams, setExams] = useState<AppExam[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AppExam | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [gradeId, setGradeId] = useState<string | null>(null);
  const [duration, setDuration] = useState('30');
  const [total, setTotal] = useState('');
  const [published, setPublished] = useState(false);
  const [questions, setQuestions] = useState<DraftQ[]>([blankQ()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [attemptsOpen, setAttemptsOpen] = useState(false);
  const [attemptsExam, setAttemptsExam] = useState<AppExam | null>(null);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [gradeScores, setGradeScores] = useState<Record<string, string>>({});

  const [previewOpen, setPreviewOpen] = useState(false);

  const load = useCallback(async () => {
    if (!centerId) return;
    try {
      const [e, g, s] = await Promise.all([fetchExams(centerId), fetchGrades(centerId), fetchStudents(centerId)]);
      setExams(e); setGrades(g); setStudents(s);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const studentName = (id: string) => students.find((s) => s.id === id)?.name ?? 'طالب';

  const openAdd = () => {
    setEditing(null); setTitle(''); setSubject(''); setGradeId(null);
    setDuration('30'); setTotal(''); setPublished(false);
    setQuestions([blankQ()]); setFormError(null); setFormOpen(true);
  };

  const openEdit = (e: AppExam) => {
    setEditing(e); setTitle(e.title); setSubject(e.subject ?? '');
    setGradeId(e.grade_id); setDuration(String(e.duration_minutes ?? 30));
    setTotal(e.total_score ? String(e.total_score) : ''); setPublished(!!e.is_published);
    setQuestions(e.questions.length > 0
      ? e.questions.map((q, i) => ({
        q: q.q,
        type: (q.type ?? 'mcq') as ExamQuestionType,
        choices: q.type === 'tf' ? ['صح', 'خطأ'] : [...(q.choices ?? []), '', '', '', ''].slice(0, 4),
        correct: e.answers[i] ?? 0,
        marks: Number((q as { marks?: number }).marks) || 1,
      }))
      : [blankQ()]);
    setFormError(null); setFormOpen(true);
  };

  const setQ = (i: number, patch: Partial<DraftQ>) => {
    setQuestions((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  };
  const setChoice = (i: number, c: number, v: string) => {
    setQuestions((prev) => prev.map((q, idx) => {
      if (idx !== i) return q;
      const choices = [...q.choices]; choices[c] = v;
      return { ...q, choices };
    }));
  };

  const save = async () => {
    setFormError(null);
    if (!title.trim()) return setFormError('أدخل عنوان الامتحان');
    const problem = validateExamDraft(questions);
    if (problem) return setFormError(problem);
    if (published && questions.length === 0) return setFormError('لا يمكن النشر بلا أسئلة');
    const clean = questions.map((q) => ({
      q: q.q.trim(),
      type: q.type,
      choices: q.type === 'mcq' ? q.choices.map((c) => c.trim()) : q.type === 'tf' ? ['صح', 'خطأ'] : [],
      marks: Number(q.marks) || 1,
    }));
    const doSave = async () => {
      setBusy(true);
      try {
        await upsertExam(centerId, {
          id: editing?.id,
          title, subject,
          grade_id: gradeId,
          duration_minutes: Number(duration) || 30,
          total_score: Number(total) || examMarksTotal(clean),
          questions: clean,
          answers: questions.map((q) => (q.type === 'essay' ? -1 : q.correct)),
          is_published: published,
        });
        setFormOpen(false);
        await load();
      } catch (e) {
        setFormError(arabicError(e));
      } finally {
        setBusy(false);
      }
    };
    // تعديل امتحان منشور قد يبطل نتائج سابقة — تنبيه قبل الحفظ
    if (editing?.is_published) {
      Alert.alert(
        'امتحان منشور',
        'تعديل الأسئلة بعد النشر قد يؤثر على نتائج الطلاب الذين أدوه. متابعة؟',
        [
          { text: 'مراجعة', style: 'cancel' },
          { text: 'حفظ رغم ذلك', style: 'destructive', onPress: () => { void doSave(); } },
        ],
      );
      return;
    }
    await doSave();
  };

  if (!can(profile, 'exams')) {
    return (
      <GradientScreen>
        <BackHeader title="الاختبارات" />
        <NoAccess />
      </GradientScreen>
    );
  }

  const openAttempts = async (e: AppExam) => {
    setAttemptsExam(e); setAttempts([]); setAttemptsOpen(true);
    try { setAttempts(await fetchAttemptsForExam(e.id)); } catch { /* ignore */ }
  };

  const togglePublish = async (e: AppExam) => {
    // منع نشر امتحان ناقص (بلا أسئلة صالحة)
    if (!e.is_published) {
      const bad = !e.questions || e.questions.length === 0
        || e.questions.some((q) => !q.q?.trim?.()
          || ((q.type ?? 'mcq') === 'mcq' && (q.choices ?? []).filter((c) => c?.trim?.()).length < 4));
      if (bad) {
        Alert.alert('لا يمكن النشر', 'الامتحان ناقص — عدّله وأكمل أسئلته واختياراتها أولاً');
        return;
      }
    }
    try {
      await toggleExamPublished(e.id, !e.is_published);
      await load();
    } catch (err) {
      Alert.alert('تعذر التحديث', arabicError(err));
    }
  };

  const confirmDelete = (e: AppExam) => {
    Alert.alert('حذف الامتحان', `حذف «${e.title}» وكل محاولاته؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: async () => {
          try { await deleteExam(e.id); await load(); }
          catch (err) { Alert.alert('تعذر الحذف', arabicError(err)); }
        },
      },
    ]);
  };

  const paperRows = (qs: { q: string; type?: string; choices?: string[]; marks?: number }[]) =>
    qs.map((q, i) => {
      const t = q.type ?? 'mcq';
      const body = t === 'essay'
        ? '(إجابة مقالية: .......................)'
        : (q.choices ?? []).map((c, ci) => `${ci + 1}) ${c}`).join(' — ');
      return [
        String(i + 1),
        `${q.q} [${t === 'mcq' ? 'اختياري' : t === 'tf' ? 'صح/خطأ' : 'مقالي'} — ${Number(q.marks) || 1} درجة]`,
        body,
      ];
    });

  const printPaper = async (e: AppExam) => {
    try {
      const html = buildReportHtml(`امتحان: ${e.title}`, `${e.subject} — ${e.questions.length} أسئلة — ${e.duration_minutes} دقيقة — من ${e.total_score}`, [{
        title: 'الأسئلة (ورقية — بلا إجابات)',
        headers: ['م', 'السؤال', 'الاختيارات'],
        rows: paperRows(e.questions),
      }]);
      await shareReportPdf(html, `امتحان ${e.title}`);
    } catch (err) {
      Alert.alert('تعذر الطباعة', arabicError(err));
    }
  };

  const previewQuestions: { q: string; type?: string; choices?: string[]; marks?: number }[] =
    questions.map((q) => ({ q: q.q || '(بلا نص بعد)', type: q.type, choices: q.choices, marks: q.marks }));

  return (
    <GradientScreen>
      <BackHeader
        title="الاختبارات"
        subtitle={`${exams.length} امتحان`}
        right={
          <Pressable style={styles.addBtn} onPress={openAdd}>
            <Ionicons name="add" size={24} color="#052E22" />
          </Pressable>
        }
      />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : exams.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="لا توجد اختبارات بعد"
          message="أنشئ اختبار اختيار من متعدد، انشره لطلابك، وتابع درجاتهم تلقائياً"
          action={<AppButton title="إنشاء اختبار" icon="add" small onPress={openAdd} />}
        />
      ) : (
        <FlatList
          data={exams}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Card style={styles.examCard}>
              <View style={styles.examHead}>
                <View style={styles.examIcon}>
                  <Ionicons name="document-text" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.examTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.examMeta}>
                    {item.subject || 'بدون مادة'} · {item.questions.length} سؤال
                    {item.questions.some((q) => (q.type ?? 'mcq') === 'essay') ? ' (فيه مقالي)' : ''} · {item.duration_minutes} دقيقة · من {item.total_score} درجة
                  </Text>
                </View>
                <View style={[styles.pubPill, { backgroundColor: item.is_published ? colors.successBg : colors.warningBg }]}>
                  <Text style={[styles.pubText, { color: item.is_published ? colors.success : colors.warning }]}>
                    {item.is_published ? 'منشور' : 'مسودة'}
                  </Text>
                </View>
              </View>
              <View style={styles.examActions}>
                <MiniBtn icon="eye" label="النتائج" color={colors.info} onPress={() => openAttempts(item)} />
                {item.is_published ? (
                  <MiniBtn
                    icon="logo-whatsapp"
                    label="تنبيه واتساب"
                    color={colors.success}
                    onPress={() => router.push(
                      `/whatsapp?preset=exam&examTitle=${encodeURIComponent(item.title)}&examSubject=${encodeURIComponent(item.subject ?? '')}&examCount=${item.questions.length}&examMinutes=${item.duration_minutes ?? 30}`,
                    )}
                  />
                ) : null}
                <MiniBtn
                  icon={item.is_published ? 'eye-off' : 'cloud-upload'}
                  label={item.is_published ? 'إخفاء' : 'نشر'}
                  color={colors.success}
                  onPress={() => togglePublish(item)}
                />
                <MiniBtn icon="print" label="ورقي" color={colors.warning} onPress={() => printPaper(item)} />
                <MiniBtn icon="create" label="تعديل" color={colors.cyan} onPress={() => openEdit(item)} />
                <MiniBtn icon="trash" label="حذف" color={colors.danger} onPress={() => confirmDelete(item)} />
              </View>
            </Card>
          )}
        />
      )}

      {/* نموذج إنشاء/تعديل */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{editing ? 'تعديل الامتحان' : 'امتحان جديد'}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <AppInput label="عنوان الامتحان" icon="document-text" placeholder="مثال: اختبار شهر مارس" value={title} onChangeText={setTitle} />
              <AppInput label="المادة" icon="book" placeholder="مثال: الفيزياء" value={subject} onChangeText={setSubject} />
              <OptionPicker
                label="الصف (اختياري)"
                icon="school"
                value={gradeId}
                options={grades.map((g) => ({ value: g.id, label: g.name }))}
                onChange={setGradeId}
                placeholder="كل الصفوف..."
              />
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <AppInput label="المدة (دقيقة)" icon="time" value={duration} onChangeText={setDuration} keyboardType="numeric" textAlign="left" style={{ writingDirection: 'ltr' }} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppInput label="الدرجة النهائية" icon="trophy" value={total} onChangeText={setTotal} keyboardType="numeric" textAlign="left" style={{ writingDirection: 'ltr' }} />
                </View>
              </View>
              <Pressable style={styles.pubRow} onPress={() => setPublished((v) => !v)}>
                <Ionicons name={published ? 'checkbox' : 'square-outline'} size={22} color={published ? colors.success : colors.textMuted} />
                <Text style={styles.pubRowText}>نشر للطلاب فور الحفظ</Text>
              </Pressable>

              <SectionTitle title="قوالب بداية سريعة" />
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
                {STARTERS.map((s) => (
                  <Pressable
                    key={s.label}
                    style={styles.starter}
                    onPress={() => {
                      const apply = () => {
                        setDuration(String(s.duration));
                        setQuestions(Array.from({ length: s.count }, () => blankQ()));
                      };
                      if (questions.some((q) => q.q.trim())) {
                        Alert.alert(
                          'استبدال الأسئلة؟',
                          `القالب سيستبدل الأسئلة الحالية (${questions.length}) بأسئلة فارغة جديدة. متابعة؟`,
                          [
                            { text: 'إلغاء', style: 'cancel' },
                            { text: 'استبدال', style: 'destructive', onPress: apply },
                          ],
                        );
                      } else apply();
                    }}
                  >
                    <Text style={styles.starterText}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>

              <SectionTitle title={`الأسئلة (${questions.length}) — المجموع ${examMarksTotal(questions)} درجة`} />
              {questions.map((q, i) => (
                <Card key={i} style={{ marginBottom: spacing.sm }}>
                  <View style={styles.qHead}>
                    <Text style={styles.qNum}>سؤال {i + 1}</Text>
                    {questions.length > 1 ? (
                      <Pressable hitSlop={8} onPress={() => setQuestions((p) => p.filter((_, x) => x !== i))}>
                        <Ionicons name="trash" size={16} color={colors.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.typeRow}>
                    {TYPE_OPTIONS.map((t) => (
                      <Pressable
                        key={t.value}
                        onPress={() => setQ(i, { type: t.value, choices: t.value === 'tf' ? ['صح', 'خطأ'] : q.type === 'tf' ? ['', '', '', ''] : q.choices, correct: 0 })}
                        style={[styles.typeChip, q.type === t.value && styles.typeChipActive]}
                      >
                        <Text style={[styles.typeText, q.type === t.value && styles.typeTextActive]}>{t.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <AppInput placeholder="نص السؤال..." value={q.q} onChangeText={(v) => setQ(i, { q: v })} />
                  {q.type === 'mcq' ? q.choices.map((c, ci) => (
                    <Pressable key={ci} style={styles.choiceRow} onPress={() => setQ(i, { correct: ci })}>
                      <Ionicons
                        name={q.correct === ci ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={q.correct === ci ? colors.success : colors.textMuted}
                      />
                      <View style={{ flex: 1 }}>
                        <AppInput
                          placeholder={`اختيار ${ci + 1}`}
                          value={c}
                          onChangeText={(v) => setChoice(i, ci, v)}
                          style={{ marginBottom: 0 }}
                        />
                      </View>
                    </Pressable>
                  )) : q.type === 'tf' ? (
                    <View style={styles.typeRow}>
                      {['صح', 'خطأ'].map((label, ci) => (
                        <Pressable
                          key={label}
                          onPress={() => setQ(i, { correct: ci })}
                          style={[styles.typeChip, q.correct === ci && styles.typeChipActive]}
                        >
                          <Text style={[styles.typeText, q.correct === ci && styles.typeTextActive]}>{label} ✓</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.correctHint}>سؤال مقالي — يجيب الطالب كتابةً وتصححه أنت يدوياً من النتائج</Text>
                  )}
                  {q.type !== 'essay' ? (
                    <Text style={styles.correctHint}>اضغط الدائرة أمام الإجابة الصحيحة</Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
                    <Text style={styles.marksLabel}>درجة السؤال:</Text>
                    <View style={{ flex: 1 }}>
                      <AppInput
                        value={String(q.marks)}
                        onChangeText={(v) => setQ(i, { marks: Number(v) || 0 })}
                        keyboardType="numeric"
                        textAlign="left"
                        style={{ writingDirection: 'ltr', marginBottom: 0 }}
                      />
                    </View>
                  </View>
                </Card>
              ))}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <AppButton title="+ اختياري" small variant="outline" onPress={() => setQuestions((p) => [...p, blankQ('mcq')])} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppButton title="+ صح/خطأ" small variant="outline" onPress={() => setQuestions((p) => [...p, blankQ('tf')])} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppButton title="+ مقالي" small variant="outline" onPress={() => setQuestions((p) => [...p, blankQ('essay')])} />
                </View>
              </View>
              <View style={{ height: spacing.md }} />
              <AppButton title="معاينة الورقة قبل الحفظ" icon="eye" variant="ghost" small onPress={() => setPreviewOpen(true)} />
              <View style={{ height: spacing.md }} />
              <FormMessage type="error" text={formError} />
              <AppButton title={editing ? 'حفظ التعديلات' : 'إنشاء الامتحان'} icon="checkmark" onPress={save} loading={busy} />
              <View style={{ height: spacing.sm }} />
              <AppButton title="إلغاء" variant="ghost" small onPress={() => setFormOpen(false)} />
              <View style={{ height: spacing.xl }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* معاينة الورقة قبل الحفظ/النشر */}
      <Modal visible={previewOpen} transparent animationType="slide" onRequestClose={() => setPreviewOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>معاينة الورقة — {title || '(بلا عنوان)'}</Text>
            <Text style={styles.previewSub}>
              {subject} · {previewQuestions.length} أسئلة · {duration || 30} دقيقة · المجموع {examMarksTotal(questions)} درجة
              {published ? ' · سيُنشر' : ' · مسودة'}
            </Text>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {previewQuestions.map((q, i) => (
                <View key={i} style={styles.previewQ}>
                  <Text style={styles.previewQText}>
                    {i + 1}) {q.q} [{q.type === 'mcq' ? 'اختياري' : q.type === 'tf' ? 'صح/خطأ' : 'مقالي'} — {Number(q.marks) || 1} درجة]
                  </Text>
                  {(q.choices ?? []).map((c, ci) => (
                    <Text key={ci} style={styles.previewChoice}>
                      {ci + 1}) {c || '...'}
                    </Text>
                  ))}
                </View>
              ))}
            </ScrollView>
            <View style={{ height: spacing.md }} />
            <AppButton title="رجوع للتعديل" variant="ghost" small onPress={() => setPreviewOpen(false)} />
          </View>
        </View>
      </Modal>

      {/* المحاولات والنتائج + تصحيح المقالي */}
      <Modal visible={attemptsOpen} transparent animationType="slide" onRequestClose={() => setAttemptsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>نتائج: {attemptsExam?.title}</Text>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {attempts.length === 0 ? (
                <Text style={styles.dimText}>لم يؤدِ أي طالب هذا الامتحان بعد</Text>
              ) : attempts.map((a) => {
                const needsReview = a.status === 'pending_review';
                const essayAnswers = (attemptsExam?.questions ?? [])
                  .map((q, qi) => ({ q, ans: a.answers[qi] }))
                  .filter((x) => (x.q.type ?? 'mcq') === 'essay');
                return (
                  <View key={a.id} style={styles.attemptRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.attemptName}>{studentName(a.student_id)}</Text>
                      <Text style={styles.attemptDate}>
                        {formatDate(a.created_at)}{needsReview ? ' · قيد مراجعتك' : ''}
                      </Text>
                      {needsReview && essayAnswers.map((x, xi) => (
                        <Text key={xi} style={styles.essayAns} numberOfLines={3}>
                          مقالي: {String(x.ans ?? '—')}
                        </Text>
                      ))}
                      {needsReview ? (
                        <View style={styles.manualRow}>
                          <View style={{ flex: 1 }}>
                            <AppInput
                              placeholder={`الدرجة من ${a.max_score}`}
                              value={gradeScores[a.id] ?? String(a.score)}
                              onChangeText={(v) => setGradeScores((p) => ({ ...p, [a.id]: v }))}
                              keyboardType="numeric"
                              textAlign="left"
                              style={{ writingDirection: 'ltr', marginBottom: 0 }}
                            />
                          </View>
                          <AppButton
                            title="اعتماد"
                            small
                            variant="success"
                            onPress={async () => {
                              const val = Number(gradeScores[a.id] ?? a.score);
                              if (isNaN(val) || val < 0 || val > Number(a.max_score)) {
                                Alert.alert('درجة خاطئة', `أدخل درجة بين 0 و ${a.max_score}`);
                                return;
                              }
                              try {
                                await gradeAttemptManually(a.id, val);
                                setAttempts(await fetchAttemptsForExam(a.exam_id));
                              } catch (e) {
                                Alert.alert('تعذر الحفظ', arabicError(e));
                              }
                            }}
                          />
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.attemptScore, {
                      color: needsReview ? colors.warning : Number(a.score) >= Number(a.max_score) * 0.5 ? colors.success : colors.danger,
                    }]}>
                      {needsReview ? '؟' : `${a.score}/${a.max_score}`}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
            <View style={{ height: spacing.md }} />
            <AppButton title="إغلاق" variant="ghost" small onPress={() => setAttemptsOpen(false)} />
          </View>
        </View>
      </Modal>
    </GradientScreen>
  );
}

function MiniBtn({ icon, label, color, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.miniAction}>
      <Ionicons name={icon} size={15} color={color} />
      <Text style={[styles.miniText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  addBtn: {
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  examCard: { marginBottom: spacing.md },
  examHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  examIcon: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.primary + '22', borderWidth: 1, borderColor: colors.primary + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  examTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  examMeta: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  pubPill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  pubText: { fontSize: font.xs, fontWeight: '800' },
  examActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  miniAction: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, paddingVertical: 7,
  },
  miniText: { fontSize: font.xs, fontWeight: '800' },
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
  pubRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  pubRowText: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  qHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  qNum: { color: colors.primary, fontSize: font.md, fontWeight: '800' },
  starter: {
    flex: 1, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center',
  },
  starterText: { color: colors.text, fontSize: font.xs, fontWeight: '800', textAlign: 'center' },
  typeRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
  typeChip: {
    flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.full, paddingVertical: spacing.sm, alignItems: 'center',
  },
  typeChipActive: { backgroundColor: colors.primary + '33', borderColor: colors.primary },
  typeText: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '800' },
  typeTextActive: { color: colors.text },
  marksLabel: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '700' },
  previewSub: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'center', marginBottom: spacing.md },
  previewQ: { marginBottom: spacing.md },
  previewQText: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  previewChoice: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 2 },
  essayAns: { color: colors.info, fontSize: font.sm, textAlign: 'right', marginTop: 4, lineHeight: 20 },
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  correctHint: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: spacing.xs },
  dimText: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  attemptRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  attemptName: { color: colors.text, fontSize: font.md, fontWeight: '700', textAlign: 'right' },
  attemptDate: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  attemptScore: { fontSize: font.md, fontWeight: '900' },
}));
