// ============================================================
// الاستبيانات: نموذج كامل — أنواع أسئلة (اختيار/متعدد/تقييم/نعم-لا/نصي)،
// جمهور مستهدف (الكل/صف/مجموعات)، موعد نهائي، إجابات مجهولة، قفل بعد
// الإرسال، وتحليل نتائج سؤالاً بسؤال. يطابق نموذج الويب الكامل.
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, NoAccess, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage, OptionPicker } from '../../src/components/pickers';
import { can } from '../../src/lib/staff';
import {
  deleteSurvey, fetchCenterStudentGroups, fetchGrades, fetchGroups, fetchStudents,
  fetchSurveyResponseCounts, fetchSurveyResponses, fetchSurveys, toggleSurvey, upsertSurvey,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import {
  answerToText, audienceLabel, deadlineLabel, isAnswered, nextVersionAfterEdit,
  QUESTION_TYPE_LABELS, QUESTION_TYPES, surveyCsv, surveyStats,
} from '../../src/lib/survey';
import type {
  AppSurvey, AppSurveyResponse, Grade, Group, Student, SurveyAudience, SurveyQuestion, SurveyQuestionType,
} from '../../src/lib/types';
import { arabicError, formatDate, uuid } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

type QDraft = {
  key: string; type: SurveyQuestionType; title: string; required: boolean;
  options: string[]; maxRating: number; placeholder: string;
};
type FormState = {
  id: string; title: string; description: string; audience: SurveyAudience; grade_id: string; group_ids: string[];
  questions: QDraft[]; deadline: string; anonymous: boolean; lockAfterSubmit: boolean; isActive: boolean; version: number;
  prevQuestions: SurveyQuestion[];
};

const newQuestion = (): QDraft => ({ key: uuid(), type: 'single', title: '', required: false, options: ['', ''], maxRating: 5, placeholder: '' });
const initialForm: FormState = {
  id: '', title: '', description: '', audience: 'all', grade_id: '', group_ids: [],
  questions: [newQuestion()], deadline: '', anonymous: false, lockAfterSubmit: false, isActive: true, version: 1, prevQuestions: [],
};

const toSurveyQuestions = (qs: QDraft[]): SurveyQuestion[] => qs.map((q) => ({
  id: q.key, type: q.type, title: q.title.trim(), required: q.required,
  options: (q.type === 'single' || q.type === 'multi') ? q.options.map((o) => o.trim()).filter(Boolean) : undefined,
  maxRating: q.type === 'rating' ? q.maxRating : undefined,
  placeholder: q.type === 'text' ? q.placeholder : undefined,
}));

function targetCount(s: AppSurvey, students: Student[], memberships: { student_id: string; group_id: string }[]): number {
  if (s.audience === 'all') return students.length;
  if (s.audience === 'grade') return s.grade_id ? students.filter((x) => x.grade_id === s.grade_id).length : 0;
  const ids = new Set(s.group_ids ?? []);
  if (ids.size === 0) return 0;
  const byGroup = new Set<string>();
  for (const st of students) if (st.group_id && ids.has(st.group_id)) byGroup.add(st.id);
  for (const m of memberships) if (ids.has(m.group_id)) byGroup.add(m.student_id);
  return byGroup.size;
}

export default function SurveysScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';
  const [rows, setRows] = useState<AppSurvey[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [memberships, setMemberships] = useState<{ student_id: string; group_id: string }[]>([]);
  const [responseCounts, setResponseCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultsSurvey, setResultsSurvey] = useState<AppSurvey | null>(null);
  const [responses, setResponses] = useState<AppSurveyResponse[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!centerId) return;
    try {
      const [sv, st, gr, gp, counts, memb] = await Promise.all([
        fetchSurveys(centerId), fetchStudents(centerId), fetchGrades(centerId), fetchGroups(centerId),
        fetchSurveyResponseCounts(centerId).catch(() => ({})), fetchCenterStudentGroups(centerId).catch(() => []),
      ]);
      setRows(sv); setStudents(st); setGrades(gr); setGroups(gp); setResponseCounts(counts); setMemberships(memb);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const studentName = (id: string) => students.find((s) => s.id === id)?.name ?? 'طالب محذوف';

  const change = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const changeQuestion = (key: string, patch: Partial<QDraft>) => {
    setForm((f) => ({ ...f, questions: f.questions.map((q) => (q.key === key ? { ...q, ...patch } : q)) }));
  };
  const addQuestion = () => setForm((f) => ({ ...f, questions: [...f.questions, newQuestion()] }));
  const removeQuestion = (key: string) => {
    setForm((f) => ({ ...f, questions: f.questions.length > 1 ? f.questions.filter((q) => q.key !== key) : [newQuestion()] }));
  };
  const changeOption = (key: string, i: number, v: string) => {
    setForm((f) => ({ ...f, questions: f.questions.map((q) => (q.key === key ? { ...q, options: q.options.map((o, idx) => (idx === i ? v : o)) } : q)) }));
  };
  const addOption = (key: string) => {
    setForm((f) => ({ ...f, questions: f.questions.map((q) => (q.key === key ? { ...q, options: [...q.options, ''] } : q)) }));
  };
  const removeOption = (key: string, i: number) => {
    setForm((f) => ({ ...f, questions: f.questions.map((q) => (q.key === key ? { ...q, options: q.options.length > 1 ? q.options.filter((_, idx) => idx !== i) : [''] } : q)) }));
  };
  const toggleGroup = (gid: string) => {
    setForm((f) => ({ ...f, group_ids: f.group_ids.includes(gid) ? f.group_ids.filter((x) => x !== gid) : [...f.group_ids, gid] }));
  };

  const openAdd = () => { setForm(initialForm); setFormError(null); setFormOpen(true); };
  const openEdit = (s: AppSurvey) => {
    const qs: QDraft[] = (s.questions?.length ? s.questions : [])
      .map((q) => ({
        key: q.id || uuid(), type: q.type || 'single', title: q.title ?? '', required: !!q.required,
        options: q.options?.length ? q.options : ['', ''], maxRating: q.maxRating || 5, placeholder: q.placeholder ?? '',
      }));
    setForm({
      id: s.id, title: s.title, description: s.description ?? '', audience: s.audience ?? 'all',
      grade_id: s.grade_id ?? '', group_ids: s.group_ids ?? [],
      questions: qs.length ? qs : [newQuestion()], deadline: s.deadline ? s.deadline.slice(0, 10) : '',
      anonymous: !!s.anonymous, lockAfterSubmit: !!s.lock_after_submit, isActive: s.is_active, version: s.version ?? 1,
      prevQuestions: s.questions ?? [],
    });
    setFormError(null); setFormOpen(true);
  };

  const save = async () => {
    setFormError(null);
    if (!centerId) return;
    const clean = toSurveyQuestions(form.questions).filter((q) => q.title.trim().length > 0);
    if (clean.length === 0) return setFormError('أضف سؤالاً واحداً على الأقل بعنوان');
    if (form.audience === 'grade' && !form.grade_id) return setFormError('اختر الصف المستهدف');
    if (form.audience === 'group' && form.group_ids.length === 0) return setFormError('اختر مجموعة واحدة على الأقل');
    setBusy(true);
    try {
      await upsertSurvey(centerId, {
        id: form.id || undefined, title: form.title, description: form.description,
        questions: clean, audience: form.audience, grade_id: form.grade_id, group_ids: form.group_ids,
        deadline: form.deadline ? `${form.deadline}T00:00:00` : null, anonymous: form.anonymous,
        lock_after_submit: form.lockAfterSubmit, is_active: form.isActive,
        version: nextVersionAfterEdit(form.id ? { version: form.version, questions: form.prevQuestions } : undefined, clean),
      });
      setFormOpen(false);
      await load();
    } catch (e) {
      setFormError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!can(profile, 'surveys')) {
    return (
      <GradientScreen>
        <BackHeader title="الاستبيانات" />
        <NoAccess />
      </GradientScreen>
    );
  }

  const openResults = async (s: AppSurvey) => {
    setResultsSurvey(s); setResponses([]); setResultsLoading(true); setResultsOpen(true);
    try { setResponses(await fetchSurveyResponses(s.id)); } catch { /* ignore */ } finally { setResultsLoading(false); }
  };

  const confirmDelete = (s: AppSurvey) => {
    Alert.alert('حذف الاستبيان', `حذف «${s.title}» وكل إجاباته؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: async () => {
          try { await deleteSurvey(s.id); await load(); }
          catch (e) { Alert.alert('تعذر الحذف', arabicError(e)); }
        },
      },
    ]);
  };

  const exportCsv = async (s: AppSurvey) => {
    try {
      const csv = surveyCsv(s, responses, students);
      await Share.share({ message: csv, title: `نتائج ${s.title}` });
    } catch (e) { Alert.alert('تعذر التصدير', arabicError(e)); }
  };

  return (
    <GradientScreen>
      <BackHeader
        title="الاستبيانات"
        subtitle={`${rows.length} استبيان`}
        right={
          <Pressable style={styles.addBtn} onPress={openAdd}>
            <Ionicons name="add" size={24} color="#052E22" />
          </Pressable>
        }
      />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="list-outline"
          title="لا توجد استبيانات بعد"
          message="أنشئ استبياناً واختر نوع كل سؤال وجمهوره وموعده النهائي."
          action={<AppButton title="إنشاء استبيان" icon="add" small onPress={openAdd} />}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const target = targetCount(item, students, memberships);
            const count = responseCounts[item.id] ?? 0;
            const rate = target ? Math.min(100, Math.round((count / target) * 100)) : 0;
            const available = !item.deadline || new Date(item.deadline).getTime() >= Date.now();
            return (
              <Card style={styles.svCard}>
                <View style={styles.svHead}>
                  <View style={styles.svIcon}>
                    <Ionicons name="list" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.svTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.svMeta}>
                      {item.questions.length} أسئلة · {audienceLabel(item, grades, groups)} · {deadlineLabel(item)}
                    </Text>
                  </View>
                  <View style={[styles.pubPill, { backgroundColor: item.is_active ? (available ? colors.successBg : colors.warningBg) : colors.dangerBg }]}>
                    <Text style={[styles.pubText, { color: item.is_active ? (available ? colors.success : colors.warning) : colors.danger }]}>
                      {item.is_active ? (available ? 'نشط' : 'انتهى الموعد') : 'موقوف'}
                    </Text>
                  </View>
                </View>
                <View style={styles.progressRow}>
                  <Text style={styles.svMeta}>المشاركة: {count}{target ? ` / ${target}` : ' رد'}</Text>
                  {target ? (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${rate}%` }]} />
                    </View>
                  ) : null}
                </View>
                <View style={styles.svActions}>
                  <MiniBtn icon="stats-chart" label="النتائج" color={colors.info} onPress={() => openResults(item)} />
                  <MiniBtn
                    icon={item.is_active ? 'pause' : 'play'}
                    label={item.is_active ? 'إيقاف' : 'تفعيل'}
                    color={colors.success}
                    onPress={async () => {
                      try { await toggleSurvey(item.id, !item.is_active); await load(); }
                      catch (e) { Alert.alert('تعذر التحديث', arabicError(e)); }
                    }}
                  />
                  <MiniBtn icon="create" label="تعديل" color={colors.cyan} onPress={() => openEdit(item)} />
                  <MiniBtn icon="trash" label="حذف" color={colors.danger} onPress={() => confirmDelete(item)} />
                </View>
              </Card>
            );
          }}
        />
      )}

      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{form.id ? 'تعديل الاستبيان' : 'استبيان جديد'}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <AppInput label="عنوان الاستبيان" icon="list" placeholder="مثال: رأيك في مواعيد المجموعات" value={form.title} onChangeText={(v) => change({ title: v })} />
              <AppInput label="وصف مختصر (اختياري)" value={form.description} onChangeText={(v) => change({ description: v })} />

              <OptionPicker
                label="الجمهور المستهدف"
                value={form.audience}
                options={[{ value: 'all', label: 'الجميع' }, { value: 'grade', label: 'صف محدد' }, { value: 'group', label: 'مجموعات محددة' }]}
                onChange={(v) => change({ audience: v as SurveyAudience })}
              />
              {form.audience === 'grade' ? (
                <OptionPicker
                  label="الصف"
                  value={form.grade_id || null}
                  options={grades.map((g) => ({ value: g.id, label: g.name }))}
                  onChange={(v) => change({ grade_id: v })}
                  placeholder="اختر الصف"
                />
              ) : null}
              {form.audience === 'group' ? (
                <View style={{ marginBottom: spacing.md }}>
                  <Text style={styles.label}>المجموعات المستهدفة:</Text>
                  {groups.length === 0 ? (
                    <FormMessage type="info" text="لا توجد مجموعات بعد." />
                  ) : groups.map((g) => (
                    <Pressable key={g.id} style={styles.checkRow} onPress={() => toggleGroup(g.id)}>
                      <Ionicons name={form.group_ids.includes(g.id) ? 'checkbox' : 'square-outline'} size={20} color={form.group_ids.includes(g.id) ? colors.success : colors.textMuted} />
                      <Text style={styles.checkText}>{g.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <AppInput label="الموعد النهائي (اختياري، YYYY-MM-DD)" value={form.deadline} onChangeText={(v) => change({ deadline: v })} placeholder="مثال: 2026-10-01" />

              <SectionTitle title="الأسئلة" action={<AppButton title="+ إضافة سؤال" icon="add-circle" small variant="outline" onPress={addQuestion} />} />
              {form.questions.map((q, i) => (
                <Card key={q.key} style={styles.qCard}>
                  <View style={styles.qHead}>
                    <Text style={styles.qNum}>سؤال {i + 1}</Text>
                    {form.questions.length > 1 ? (
                      <Pressable hitSlop={8} onPress={() => removeQuestion(q.key)}>
                        <Ionicons name="trash" size={18} color={colors.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                  <AppInput placeholder="اكتب نص السؤال" value={q.title} onChangeText={(v) => changeQuestion(q.key, { title: v })} />
                  <OptionPicker
                    label="نوع السؤال"
                    value={q.type}
                    options={QUESTION_TYPES.map((t) => ({ value: t, label: QUESTION_TYPE_LABELS[t] }))}
                    onChange={(v) => changeQuestion(q.key, { type: v as SurveyQuestionType })}
                  />
                  {(q.type === 'single' || q.type === 'multi') ? (
                    <View>
                      <Text style={styles.label}>
                        الخيارات {q.type === 'multi' ? '(يختار الطالب أكثر من واحد)' : '(يختار الطالب واحداً)'}:
                      </Text>
                      {q.options.map((o, oi) => (
                        <View key={oi} style={styles.qRow}>
                          <View style={{ flex: 1 }}>
                            <AppInput placeholder={`خيار ${oi + 1}`} value={o} onChangeText={(v) => changeOption(q.key, oi, v)} style={{ marginBottom: 0 }} />
                          </View>
                          {q.options.length > 1 ? (
                            <Pressable hitSlop={8} onPress={() => removeOption(q.key, oi)}>
                              <Ionicons name="close-circle" size={20} color={colors.danger} />
                            </Pressable>
                          ) : null}
                        </View>
                      ))}
                      <AppButton title="+ خيار" icon="add" small variant="outline" onPress={() => addOption(q.key)} />
                    </View>
                  ) : null}
                  {q.type === 'rating' ? (
                    <AppInput
                      label="أقصى قيمة للتقييم"
                      value={String(q.maxRating)}
                      keyboardType="number-pad"
                      onChangeText={(v) => changeQuestion(q.key, { maxRating: Math.max(2, Math.min(10, Number(v) || 5)) })}
                    />
                  ) : null}
                  {q.type === 'text' ? (
                    <AppInput label="نص إرشادي (اختياري)" placeholder="مثال: اكتب رأيك باختصار" value={q.placeholder} onChangeText={(v) => changeQuestion(q.key, { placeholder: v })} />
                  ) : null}
                  <Pressable style={styles.checkRow} onPress={() => changeQuestion(q.key, { required: !q.required })}>
                    <Ionicons name={q.required ? 'checkbox' : 'square-outline'} size={20} color={q.required ? colors.success : colors.textMuted} />
                    <Text style={styles.checkText}>سؤال إجباري</Text>
                  </Pressable>
                </Card>
              ))}

              <Pressable style={styles.checkRow} onPress={() => change({ anonymous: !form.anonymous })}>
                <Ionicons name={form.anonymous ? 'checkbox' : 'square-outline'} size={22} color={form.anonymous ? colors.success : colors.textMuted} />
                <Text style={styles.checkText}>إجابات مجهولة (لا يظهر اسم الطالب في النتائج)</Text>
              </Pressable>
              <Pressable style={styles.checkRow} onPress={() => change({ lockAfterSubmit: !form.lockAfterSubmit })}>
                <Ionicons name={form.lockAfterSubmit ? 'checkbox' : 'square-outline'} size={22} color={form.lockAfterSubmit ? colors.success : colors.textMuted} />
                <Text style={styles.checkText}>قفل الإجابة بعد إرسالها (لا تعديل)</Text>
              </Pressable>
              <Pressable style={styles.checkRow} onPress={() => change({ isActive: !form.isActive })}>
                <Ionicons name={form.isActive ? 'checkbox' : 'square-outline'} size={22} color={form.isActive ? colors.success : colors.textMuted} />
                <Text style={styles.checkText}>نشط ويظهر للطلاب</Text>
              </Pressable>
              <FormMessage type="info" text="تعديل الأسئلة يرفع رقم النسخة تلقائياً، فيستطيع من أجاب سابقاً الإجابة على الأسئلة الجديدة." />

              <View style={{ height: spacing.md }} />
              <FormMessage type="error" text={formError} />
              <AppButton title={form.id ? 'حفظ التعديلات' : 'إنشاء الاستبيان'} icon="checkmark" onPress={save} loading={busy} />
              <View style={{ height: spacing.sm }} />
              <AppButton title="إلغاء" variant="ghost" small onPress={() => setFormOpen(false)} />
              <View style={{ height: spacing.xl }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={resultsOpen} transparent animationType="slide" onRequestClose={() => setResultsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>نتائج: {resultsSurvey?.title} ({responses.length})</Text>
            {resultsLoading ? <LoadingView message="جاري التحميل..." /> : resultsSurvey ? (
              <SurveyResultsBody
                survey={resultsSurvey}
                responses={responses}
                students={students}
                targetCount={targetCount(resultsSurvey, students, memberships)}
                studentName={studentName}
                onExport={() => exportCsv(resultsSurvey)}
              />
            ) : null}
            <View style={{ height: spacing.md }} />
            <AppButton title="إغلاق" variant="ghost" small onPress={() => setResultsOpen(false)} />
          </View>
        </View>
      </Modal>
    </GradientScreen>
  );
}

function SurveyResultsBody({
  survey, responses, students, targetCount: target, studentName, onExport,
}: {
  survey: AppSurvey; responses: AppSurveyResponse[]; students: Student[]; targetCount: number;
  studentName: (id: string) => string; onExport: () => void;
}) {
  const stats = useMemo(() => surveyStats(survey, responses), [survey, responses]);
  const completion = target ? Math.min(100, Math.round((responses.length / target) * 100)) : 0;
  void students;

  return (
    <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
      <View style={styles.resultsSummary}>
        <SummaryStat label="إجمالي الردود" value={String(responses.length)} />
        <SummaryStat label="المستهدفون" value={target ? String(target) : '—'} />
        <SummaryStat label="نسبة المشاركة" value={target ? `${completion}%` : '—'} />
      </View>
      <AppButton title="⇩ تصدير Excel / CSV" icon="download" variant="outline" small onPress={onExport} />
      <View style={{ height: spacing.md }} />
      {responses.length === 0 ? (
        <Text style={styles.dimText}>لا توجد إجابات حتى الآن</Text>
      ) : stats.map((stat, i) => (
        <Card key={stat.question.id} style={{ marginBottom: spacing.sm }}>
          <Text style={styles.respQTitle}>{i + 1}. {stat.question.title}</Text>
          <Text style={styles.svMeta}>
            {QUESTION_TYPE_LABELS[stat.question.type]} · أجاب {stat.answered} من {responses.length}
            {stat.average !== null ? ` · المتوسط ${stat.average} / ${stat.question.maxRating || 5}` : ''}
          </Text>
          {stat.question.type === 'text' ? (
            responses
              .filter((r) => isAnswered(r.answers?.[stat.question.id]))
              .map((r) => (
                <View key={r.id} style={{ marginTop: spacing.sm }}>
                  <Text style={styles.respA}>“{answerToText(stat.question, r.answers?.[stat.question.id])}”</Text>
                  <Text style={styles.respMeta}>{survey.anonymous ? 'رد مجهول' : studentName(r.student_id)} · {formatDate(r.created_at)}</Text>
                </View>
              ))
          ) : (
            stat.counts.map((c) => {
              const ratio = stat.answered ? Math.round((c.count / stat.answered) * 100) : 0;
              return (
                <View key={c.label} style={{ marginTop: spacing.sm }}>
                  <View style={styles.progressRow}>
                    <Text style={styles.svMeta}>{c.label} — {c.count} ({ratio}%)</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${ratio}%` }]} />
                  </View>
                </View>
              );
            })
          )}
        </Card>
      ))}
    </ScrollView>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.svMeta}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
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
  svCard: { marginBottom: spacing.md },
  svHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  svIcon: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.primary + '22', borderWidth: 1, borderColor: colors.primary + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  svTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  svMeta: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  pubPill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  pubText: { fontSize: font.xs, fontWeight: '800' },
  progressRow: { marginTop: spacing.sm },
  progressTrack: { height: 6, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, marginTop: 4, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: radius.full, backgroundColor: colors.primary },
  svActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
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
  label: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '700', textAlign: 'right', marginBottom: spacing.xs },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, marginTop: spacing.xs },
  checkText: { color: colors.text, fontSize: font.sm, fontWeight: '700' },
  qCard: { marginBottom: spacing.md },
  qHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  qNum: { color: colors.text, fontSize: font.sm, fontWeight: '900', textAlign: 'right' },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  dimText: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  resultsSummary: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  summaryStat: {
    flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center',
  },
  summaryValue: { color: colors.text, fontSize: font.lg, fontWeight: '900', marginTop: 2 },
  respQTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  respA: { color: colors.text, fontSize: font.sm, textAlign: 'right' },
  respMeta: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
}));
