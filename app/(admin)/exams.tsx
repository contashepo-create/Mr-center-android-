// ============================================================
// الاختبارات الإلكترونية: 8 أنواع أسئلة (اختياري/متعدد/صح-خطأ/
// أكمل/وصل/صحّح/مقالي/قصير) + قوالب + نشر + نتائج وتصحيح يدوي
// + نسخة ورقية PDF — التصحيح التلقائي خادمي بمساواة JSON.
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
  deleteExam, fetchAttemptsForExam, fetchExams, fetchGrades, fetchGroups, fetchStudents,
  gradeAttemptManually, toggleExamPublished, upsertExam,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type {
  AppExam, ExamAnswer, ExamAttempt, ExamAvailabilityMode, ExamDeliveryMode, ExamOrnaments,
  ExamQuestionType, ExamResultMode, Grade, Group, OnlineExamMode, OrnamentDensity, PaperTemplate, Student,
} from '../../src/lib/types';
import {
  arabicError, examMarksTotal, EXAM_TYPE_LABEL, formatDate, isManualExamType,
  normalizeAnswerText, validateExamDraft,
} from '../../src/lib/utils';
import { buildExamPaperHtml, fetchReportBranding, shareReportPdf } from '../../src/lib/report';
import { ALL_ORNAMENTS, ornamentsForSubject, subjectLabelFor } from '../../src/lib/exam-ornaments';
import { OrnamentStampEditor } from '../../src/components/ornament-stamp-editor';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

const DELIVERY_OPTIONS: { value: ExamDeliveryMode; label: string }[] = [
  { value: 'online', label: 'إلكتروني — يؤديه الطالب داخل التطبيق' },
  { value: 'paper', label: 'ورقي — للطباعة فقط' },
];

const ONLINE_MODE_OPTIONS: { value: OnlineExamMode; label: string; hint: string }[] = [
  { value: 'objective', label: 'موضوعي', hint: 'اختيار من متعدد/متعدد الإجابات/صح وخطأ/أكمل/وصل — تصحيح تلقائي' },
  { value: 'essay', label: 'مقالي', hint: 'مقالي/إجابة قصيرة/صحّح الخطأ — مراجعة المعلم يدوياً' },
  { value: 'mixed', label: 'مختلط', hint: 'كل أنواع الأسئلة الثمانية معاً' },
];

const PAPER_TEMPLATE_OPTIONS: { value: PaperTemplate; label: string; symbol: string }[] = [
  { value: 'classic', label: 'كلاسيكي', symbol: '📄' },
  { value: 'formal', label: 'رسمي', symbol: '🏛️' },
  { value: 'modern', label: 'عصري', symbol: '🌐' },
  { value: 'lab', label: 'معملي', symbol: '🧪' },
  { value: 'life', label: 'أحياء', symbol: '🌿' },
  { value: 'cosmos', label: 'فلكي', symbol: '🌌' },
  { value: 'explorer', label: 'مستكشف', symbol: '🧭' },
  { value: 'royal', label: 'ملكي', symbol: '👑' },
  { value: 'parchment', label: 'ورق قديم', symbol: '📜' },
  { value: 'wedding', label: 'احتفالي', symbol: '🎉' },
];

const blankOrnaments = (): ExamOrnaments => ({ placement: 'auto', density: 'medium', opacity: 0.18, kinds: [], stamps: [] });

interface DraftQ {
  q: string;
  type: ExamQuestionType;
  choices: string[];
  correct: number;                 // mcq / tf
  corrects: number[];              // multi
  answer: string;                  // complete / correct (نموذج)
  pairs: { l: string; r: string }[]; // match
  marks: number;
  image?: string;
  imagePosition?: 'beside' | 'above' | 'below';
  imageSize?: number;
  underlined?: { start: number; count: number }; // صحّح ما تحته خط
}

const padChoices = (c: string[] | undefined) => [...(c ?? []), '', '', '', ''].slice(0, 4);

const blankQ = (type: ExamQuestionType = 'mcq'): DraftQ => ({
  q: '',
  type,
  choices: type === 'tf' ? ['صح', 'خطأ'] : type === 'mcq' || type === 'multi' ? ['', '', '', ''] : [],
  correct: 0,
  corrects: [],
  answer: '',
  pairs: type === 'match' ? [{ l: '', r: '' }, { l: '', r: '' }] : [],
  marks: 1,
});

const TYPE_OPTIONS: { value: ExamQuestionType; label: string }[] = [
  { value: 'mcq', label: 'اختيار من متعدد' },
  { value: 'multi', label: 'متعدد الإجابات' },
  { value: 'tf', label: 'صح / خطأ' },
  { value: 'complete', label: 'أكمل الفراغ' },
  { value: 'match', label: 'وصل' },
  { value: 'correct', label: 'صحّح الخطأ' },
  { value: 'essay', label: 'مقالي' },
  { value: 'short', label: 'إجابة قصيرة' },
];

const SHOW_RESULT_LABEL: Record<ExamResultMode, string> = {
  after_each: 'بعد كل محاولة',
  end: 'بعد الانتهاء',
  never: 'لا تظهر',
};

const STARTERS: { label: string; duration: number; count: number; type: ExamQuestionType; marks: number }[] = [
  { label: 'قصير 10د · 5 اختياري', duration: 10, count: 5, type: 'mcq', marks: 1 },
  { label: 'متوسط 30د · 10 اختياري', duration: 30, count: 10, type: 'mcq', marks: 2 },
  { label: 'شامل 60د · 20 اختياري', duration: 60, count: 20, type: 'mcq', marks: 2 },
  { label: 'أكمل 10د · 5×2', duration: 10, count: 5, type: 'complete', marks: 2 },
  { label: 'مختلط 20د · 4+2+2+2', duration: 20, count: 0, type: 'mcq', marks: 1 },
];

export default function ExamsScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';
  const [exams, setExams] = useState<AppExam[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
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
  const [attemptsAllowed, setAttemptsAllowed] = useState('1');
  const [showResult, setShowResult] = useState<ExamResultMode>('end');
  const [targetGroupIds, setTargetGroupIds] = useState<string[]>([]);
  const [availabilityMode, setAvailabilityMode] = useState<ExamAvailabilityMode>('always');
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<ExamDeliveryMode>('online');
  const [onlineMode, setOnlineMode] = useState<OnlineExamMode>('mixed');
  const [paperTemplate, setPaperTemplate] = useState<PaperTemplate>('classic');
  const [paperFooter, setPaperFooter] = useState('');
  const [ornaments, setOrnaments] = useState<ExamOrnaments>(blankOrnaments());
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
      const [e, g, gr, s] = await Promise.all([fetchExams(centerId), fetchGrades(centerId), fetchGroups(centerId), fetchStudents(centerId)]);
      setExams(e); setGrades(g); setGroups(gr); setStudents(s);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const studentName = (id: string) => students.find((s) => s.id === id)?.name ?? 'طالب';

  const openAdd = () => {
    setEditing(null); setTitle(''); setSubject(''); setGradeId(null);
    setDuration('30'); setTotal(''); setPublished(false);
    setAttemptsAllowed('1'); setShowResult('end'); setTargetGroupIds([]);
    setAvailabilityMode('always'); setAvailableFrom(''); setAvailableUntil('');
    setDeliveryMode('online'); setOnlineMode('mixed'); setPaperTemplate('classic');
    setPaperFooter(''); setOrnaments(blankOrnaments());
    setQuestions([blankQ()]); setFormError(null); setFormOpen(true);
  };

  const openEdit = (e: AppExam) => {
    setEditing(e); setTitle(e.title); setSubject(e.subject ?? '');
    setGradeId(e.grade_id); setDuration(String(e.duration_minutes ?? 30));
    setTotal(e.total_score ? String(e.total_score) : ''); setPublished(!!e.is_published);
    setAttemptsAllowed(String(e.attempts_allowed ?? 1));
    setShowResult(e.show_result ?? 'end');
    setTargetGroupIds(e.target_group_ids ?? []);
    setAvailabilityMode(e.availability_mode ?? 'always');
    setAvailableFrom(e.available_from ? e.available_from.slice(0, 10) : '');
    setAvailableUntil(e.available_until ? e.available_until.slice(0, 10) : '');
    setDeliveryMode(e.delivery_mode ?? 'online');
    setOnlineMode(e.online_mode ?? 'mixed');
    setPaperTemplate(e.paper_template ?? 'classic');
    setPaperFooter(e.paper_footer ?? '');
    setOrnaments(e.ornaments ?? blankOrnaments());
    setQuestions(e.questions.length > 0
      ? e.questions.map((raw, i) => {
        const type = (raw.type ?? 'mcq') as ExamQuestionType;
        const a = e.answers[i];
        const base = {
          q: raw.q,
          type,
          marks: Number((raw as { marks?: number }).marks) || 1,
          correct: 0, corrects: [] as number[], answer: '', pairs: [] as { l: string; r: string }[],
          image: raw.image ?? undefined,
          imagePosition: raw.imagePosition ?? 'beside',
          imageSize: raw.imageSize ?? 160,
          underlined: raw.underlined ?? undefined,
        };
        if (type === 'tf' || type === 'mcq') {
          return { ...base, choices: type === 'tf' ? ['صح', 'خطأ'] : padChoices(raw.choices), correct: typeof a === 'number' ? a : 0 };
        }
        if (type === 'multi') {
          return { ...base, choices: padChoices(raw.choices), corrects: Array.isArray(a) ? (a as number[]).filter((x) => typeof x === 'number') : [] };
        }
        if (type === 'complete' || type === 'correct') {
          return { ...base, choices: [], answer: typeof a === 'string' ? a : '' };
        }
        if (type === 'match') {
          const pairs = (raw.pairs ?? []);
          return { ...base, choices: [], pairs: pairs.length >= 2 ? pairs.map((p) => ({ l: p.l, r: p.r })) : [{ l: '', r: '' }, { l: '', r: '' }] };
        }
        return { ...base, choices: [] }; // essay / short
      })
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
  const setPair = (i: number, pi: number, side: 'l' | 'r', v: string) => {
    setQuestions((prev) => prev.map((q, idx) => {
      if (idx !== i) return q;
      const pairs = q.pairs.map((p, x) => (x === pi ? { ...p, [side]: v } : p));
      return { ...q, pairs };
    }));
  };

  /** بناء الأسئلة والإجابات النهائية من المسودة */
  const buildPayload = () => {
    const cleanQuestions = questions.map((q) => {
      const image = q.image?.trim() || null;
      const base = {
        q: q.q.trim(), type: q.type, marks: Number(q.marks) || 1,
        ...(image ? { image, imagePosition: q.imagePosition ?? 'beside', imageSize: q.imageSize ?? 160 } : {}),
        ...(q.type === 'correct' && q.underlined?.count ? { underlined: q.underlined } : {}),
      };
      if (q.type === 'mcq' || q.type === 'multi') return { ...base, choices: q.choices.map((c) => c.trim()) };
      if (q.type === 'tf') return { ...base, choices: ['صح', 'خطأ'] };
      if (q.type === 'complete') return { ...base, choices: [], answer: normalizeAnswerText(q.answer) };
      if (q.type === 'match') return { ...base, choices: [], pairs: q.pairs.map((p) => ({ l: p.l.trim(), r: p.r.trim() })) };
      if (q.type === 'correct') return { ...base, choices: [], answer: q.answer.trim() };
      return { ...base, choices: [] }; // essay / short
    });
    const answers: ExamAnswer[] = questions.map((q) => {
      if (q.type === 'mcq' || q.type === 'tf') return q.correct;
      if (q.type === 'multi') return [...q.corrects].sort((a, b) => a - b);
      if (q.type === 'complete') return normalizeAnswerText(q.answer) || null;
      if (q.type === 'match') return q.pairs.map((_, idx) => idx); // الهوية: اليسار k ↔ اليمين k
      if (q.type === 'correct') return q.answer.trim() || null;    // نموذج إرشادي (المطابقة التامة = درجة آلية)
      return null;                                                  // essay / short
    });
    return { cleanQuestions, answers };
  };

  const save = async () => {
    setFormError(null);
    if (!title.trim()) return setFormError('أدخل عنوان الامتحان');
    const problem = validateExamDraft(questions);
    if (problem) return setFormError(problem);
    if (published && questions.length === 0) return setFormError('لا يمكن النشر بلا أسئلة');
    const { cleanQuestions, answers } = buildPayload();
    const doSave = async () => {
      setBusy(true);
      try {
        await upsertExam(centerId, {
          id: editing?.id,
          title, subject,
          grade_id: gradeId,
          duration_minutes: Number(duration) || 30,
          total_score: Number(total) || examMarksTotal(cleanQuestions),
          questions: cleanQuestions,
          answers,
          is_published: deliveryMode === 'online' && published,
          attempts_allowed: Math.max(1, Number(attemptsAllowed) || 1),
          show_result: showResult,
          delivery_mode: deliveryMode,
          online_mode: onlineMode,
          target_group_ids: deliveryMode === 'online' ? targetGroupIds : [],
          availability_mode: deliveryMode === 'online' ? availabilityMode : 'always',
          available_from: deliveryMode === 'online' && availabilityMode === 'scheduled' && availableFrom.trim() ? availableFrom.trim() : null,
          available_until: deliveryMode === 'online' && availabilityMode === 'scheduled' && availableUntil.trim() ? availableUntil.trim() : null,
          paper_template: paperTemplate,
          paper_footer: paperFooter,
          ornaments,
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
    // منع نشر امتحان ناقص (بلا أسئلة صالحة كاملة بكل نوع)
    if (!e.is_published) {
      const bad = !e.questions || e.questions.length === 0
        || e.questions.some((q, i) => {
          const t = q.type ?? 'mcq';
          if (t === 'mcq') return (q.choices ?? []).filter((c) => c?.trim?.()).length < 4;
          if (t === 'multi') return (q.choices ?? []).filter((c) => c?.trim?.()).length < 4
            || !Array.isArray(e.answers?.[i]) || !(e.answers[i] as number[]).length;
          if (t === 'complete') return typeof e.answers?.[i] !== 'string' || !(e.answers[i] as string).trim();
          if (t === 'match') return (q.pairs ?? []).filter((p) => p.l?.trim() && p.r?.trim()).length < 2;
          return false; // essay / short / correct (النموذج اختياري)
        });
      if (bad) {
        Alert.alert('لا يمكن النشر', 'الامتحان ناقص — عدّله وأكمل أسئلته وإجاباتها أولاً');
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

  const printPaper = async (e: AppExam) => {
    try {
      const branding = await fetchReportBranding(centerId);
      const html = buildExamPaperHtml({
        title: e.title,
        subject: e.subject,
        duration: e.duration_minutes,
        total: e.total_score,
        questions: e.questions,
        ornaments: e.ornaments,
        paperFooter: e.paper_footer,
        template: e.paper_template ?? 'classic',
      }, { name: profile?.full_name, branding });
      await shareReportPdf(html, `امتحان ${e.title}`);
    } catch (err) {
      Alert.alert('تعذر الطباعة', arabicError(err));
    }
  };

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
          message="٨ أنواع أسئلة: اختياري، متعدد الإجابات، صح/خطأ، أكمل، وصل، صحّح الخطأ، مقالي، وإجابة قصيرة"
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
                    {item.questions.some((q) => isManualExamType(q.type)) ? ' (فيه يدوي)' : ''} · {item.duration_minutes} دقيقة · من {item.total_score} درجة
                  </Text>
                  {(item.delivery_mode ?? 'online') === 'online' ? (
                    <Text style={styles.examMeta}>
                      محاولات: {item.attempts_allowed ?? 1}
                      {' · '}النتيجة: {SHOW_RESULT_LABEL[item.show_result ?? 'end']}
                      {item.target_group_ids && item.target_group_ids.length > 0 ? ` · ${item.target_group_ids.length} مجموعة مستهدفة` : ' · لكل الطلاب'}
                      {item.availability_mode === 'scheduled' ? ' · موعد محدد' : ''}
                    </Text>
                  ) : (
                    <Text style={styles.examMeta}>
                      ورقي — قالب {PAPER_TEMPLATE_OPTIONS.find((t) => t.value === (item.paper_template ?? 'classic'))?.label ?? 'كلاسيكي'}
                    </Text>
                  )}
                </View>
                <View style={[styles.pubPill, { backgroundColor: (item.delivery_mode ?? 'online') === 'paper' ? colors.infoBg : item.is_published ? colors.successBg : colors.warningBg }]}>
                  <Text style={[styles.pubText, { color: (item.delivery_mode ?? 'online') === 'paper' ? colors.info : item.is_published ? colors.success : colors.warning }]}>
                    {(item.delivery_mode ?? 'online') === 'paper' ? 'ورقي' : item.is_published ? 'منشور' : 'مسودة'}
                  </Text>
                </View>
              </View>
              <View style={styles.examActions}>
                {(item.delivery_mode ?? 'online') === 'online' ? (
                  <>
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
                  </>
                ) : null}
                <MiniBtn icon="print" label="ورقي PDF" color={colors.warning} onPress={() => printPaper(item)} />
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

              <OptionPicker
                label="مسار الاختبار"
                icon="git-branch"
                value={deliveryMode}
                options={DELIVERY_OPTIONS}
                onChange={(v) => setDeliveryMode(v as ExamDeliveryMode)}
              />

              {deliveryMode === 'online' ? (
                <>
                  <Text style={[styles.pubRowText, { marginBottom: spacing.sm }]}>نمط الأداء الإلكتروني</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
                    {ONLINE_MODE_OPTIONS.map((m) => {
                      const active = onlineMode === m.value;
                      return (
                        <Pressable
                          key={m.value}
                          style={[styles.starter, active && { backgroundColor: colors.successBg, borderColor: colors.success }]}
                          onPress={() => setOnlineMode(m.value)}
                        >
                          <Text style={[styles.starterText, active && { color: colors.success }]}>{m.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Pressable style={styles.pubRow} onPress={() => setPublished((v) => !v)}>
                    <Ionicons name={published ? 'checkbox' : 'square-outline'} size={22} color={published ? colors.success : colors.textMuted} />
                    <Text style={styles.pubRowText}>نشر للطلاب فور الحفظ</Text>
                  </Pressable>

                  <SectionTitle title="إعدادات الامتحان" />
                  <View style={{ flexDirection: 'row', gap: spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <AppInput
                        label="عدد المحاولات المسموحة"
                        icon="repeat"
                        value={attemptsAllowed}
                        onChangeText={setAttemptsAllowed}
                        keyboardType="numeric"
                        textAlign="left"
                        style={{ writingDirection: 'ltr' }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <OptionPicker
                        label="إظهار النتيجة"
                        icon="eye"
                        value={showResult}
                        options={[
                          { value: 'after_each', label: 'بعد كل محاولة' },
                          { value: 'end', label: 'بعد الانتهاء' },
                          { value: 'never', label: 'لا تظهر' },
                        ]}
                        onChange={(v) => setShowResult(v as ExamResultMode)}
                      />
                    </View>
                  </View>

                  <Text style={[styles.pubRowText, { marginBottom: spacing.sm }]}>المجموعات المستهدفة (اختياري — فارغ = الكل)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
                    {groups.length === 0 ? (
                      <Text style={styles.examMeta}>لا توجد مجموعات بعد</Text>
                    ) : groups.map((g) => {
                      const active = targetGroupIds.includes(g.id);
                      return (
                        <Pressable
                          key={g.id}
                          style={[styles.starter, active && { backgroundColor: colors.successBg, borderColor: colors.success }]}
                          onPress={() => setTargetGroupIds((prev) => (prev.includes(g.id) ? prev.filter((id) => id !== g.id) : [...prev, g.id]))}
                        >
                          <Text style={[styles.starterText, active && { color: colors.success }]}>{g.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <OptionPicker
                    label="توقيت الإتاحة"
                    icon="calendar"
                    value={availabilityMode}
                    options={[
                      { value: 'always', label: 'متاح دائمًا' },
                      { value: 'scheduled', label: 'حسب موعد محدد' },
                    ]}
                    onChange={(v) => setAvailabilityMode(v as ExamAvailabilityMode)}
                  />
                  {availabilityMode === 'scheduled' ? (
                    <View style={{ flexDirection: 'row', gap: spacing.md }}>
                      <View style={{ flex: 1 }}>
                        <AppInput
                          label="متاح من (YYYY-MM-DD)"
                          icon="calendar"
                          placeholder="2026-01-01"
                          value={availableFrom}
                          onChangeText={setAvailableFrom}
                          textAlign="left"
                          style={{ writingDirection: 'ltr' }}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppInput
                          label="متاح حتى (YYYY-MM-DD)"
                          icon="calendar"
                          placeholder="2026-01-31"
                          value={availableUntil}
                          onChangeText={setAvailableUntil}
                          textAlign="left"
                          style={{ writingDirection: 'ltr' }}
                        />
                      </View>
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <AppInput
                    label="عبارة ختام الورقة (اختياري)"
                    icon="text"
                    placeholder="مثال: راجع إجاباتك جيداً قبل تسليم الورقة"
                    value={paperFooter}
                    onChangeText={setPaperFooter}
                    multiline
                  />

                  <SectionTitle title="قالب الورقة" />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
                    {PAPER_TEMPLATE_OPTIONS.map((t) => {
                      const active = paperTemplate === t.value;
                      return (
                        <Pressable
                          key={t.value}
                          style={[styles.starter, active && { backgroundColor: colors.successBg, borderColor: colors.success }]}
                          onPress={() => setPaperTemplate(t.value)}
                        >
                          <Text style={[styles.starterText, active && { color: colors.success }]}>{t.symbol} {t.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <SectionTitle title="زخارف الورقة (اختياري)" />
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <OptionPicker
                        label="أسلوب التوزيع"
                        icon="apps"
                        value={ornaments.placement}
                        options={[
                          { value: 'auto', label: 'تلقائي على الحواف' },
                          { value: 'manual', label: 'يدوي (أختام)' },
                        ]}
                        onChange={(v) => setOrnaments((o) => ({ ...o, placement: v as ExamOrnaments['placement'] }))}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <OptionPicker
                        label="الكثافة"
                        icon="grid"
                        value={ornaments.density}
                        options={[
                          { value: 'low', label: 'خفيفة' },
                          { value: 'medium', label: 'متوسطة' },
                          { value: 'high', label: 'كثيفة' },
                        ]}
                        onChange={(v) => setOrnaments((o) => ({ ...o, density: v as OrnamentDensity }))}
                      />
                    </View>
                  </View>

                  <View style={styles.opacityRow}>
                    <Text style={styles.pubRowText}>شفافية الزخارف: {Math.round(ornaments.opacity * 100)}%</Text>
                    <View style={styles.editButtons}>
                      <Pressable
                        style={styles.stepBtn}
                        onPress={() => setOrnaments((o) => ({ ...o, opacity: Math.max(0.02, Math.round((o.opacity - 0.05) * 100) / 100) }))}
                      >
                        <Ionicons name="remove" size={16} color={colors.text} />
                      </Pressable>
                      <Pressable
                        style={styles.stepBtn}
                        onPress={() => setOrnaments((o) => ({ ...o, opacity: Math.min(0.6, Math.round((o.opacity + 0.05) * 100) / 100) }))}
                      >
                        <Ionicons name="add" size={16} color={colors.text} />
                      </Pressable>
                    </View>
                  </View>

                  {ornaments.placement === 'manual' ? (
                    <OrnamentStampEditor
                      stamps={ornaments.stamps}
                      opacity={ornaments.opacity}
                      onChangeStamps={(stamps) => setOrnaments((o) => ({ ...o, stamps }))}
                    />
                  ) : (
                    <>
                      <AppButton
                        title={`تعبئة حسب المادة (${subjectLabelFor(subject)})`}
                        icon="color-palette"
                        small
                        variant="outline"
                        onPress={() => setOrnaments((o) => ({ ...o, kinds: ornamentsForSubject(subject).map((orn) => orn.kind) }))}
                      />
                      <View style={{ height: spacing.sm }} />
                      <Text style={[styles.pubRowText, { marginBottom: spacing.sm }]}>اختر عناصر الزخرفة (اختياري — فارغ = طقم المادة تلقائياً)</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
                        {ALL_ORNAMENTS.map((orn) => {
                          const active = ornaments.kinds.includes(orn.kind);
                          return (
                            <Pressable
                              key={orn.kind}
                              style={[styles.stampChip, active && { backgroundColor: colors.successBg, borderColor: colors.success }]}
                              onPress={() => setOrnaments((o) => ({
                                ...o,
                                kinds: active ? o.kinds.filter((k) => k !== orn.kind) : [...o.kinds, orn.kind],
                              }))}
                            >
                              <Text style={styles.stampChipText}>{orn.glyph}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}
                </>
              )}

              <SectionTitle title="قوالب بداية سريعة" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
                {STARTERS.map((s) => (
                  <Pressable
                    key={s.label}
                    style={styles.starter}
                    onPress={() => {
                      const apply = () => {
                        setDuration(String(s.duration));
                        if (s.type === 'mcq' && s.count === 0) {
                          // قالب مختلط: 4 اختياري + 2 صح/خطأ + 2 أكمل + 2 مقالي
                          setQuestions([
                            ...Array.from({ length: 4 }, () => ({ ...blankQ('mcq'), marks: 2 })),
                            ...Array.from({ length: 2 }, () => ({ ...blankQ('tf'), marks: 1 })),
                            ...Array.from({ length: 2 }, () => ({ ...blankQ('complete'), marks: 2 })),
                            ...Array.from({ length: 2 }, () => ({ ...blankQ('essay'), marks: 3 })),
                          ]);
                          return;
                        }
                        setQuestions(Array.from({ length: s.count }, () => ({ ...blankQ(s.type), marks: s.marks })));
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
                  <View style={styles.typeGrid}>
                    {TYPE_OPTIONS.map((t) => (
                      <Pressable
                        key={t.value}
                        onPress={() => setQ(i, { ...blankQ(t.value), q: q.q, marks: q.marks })}
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
                  )) : null}

                  {q.type === 'multi' ? (
                    <>
                      {q.choices.map((c, ci) => (
                        <Pressable
                          key={ci}
                          style={styles.choiceRow}
                          onPress={() => setQ(i, {
                            corrects: q.corrects.includes(ci)
                              ? q.corrects.filter((x) => x !== ci)
                              : [...q.corrects, ci].sort((a, b) => a - b),
                          })}
                        >
                          <Ionicons
                            name={q.corrects.includes(ci) ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={q.corrects.includes(ci) ? colors.success : colors.textMuted}
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
                      ))}
                      <Text style={styles.correctHint}>علّم كل الإجابات الصحيحة (اثنان أو أكثر) — الطالب يختارها كلها</Text>
                    </>
                  ) : null}

                  {q.type === 'tf' ? (
                    <View style={styles.typeGrid}>
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
                  ) : null}

                  {q.type === 'complete' ? (
                    <>
                      <AppInput
                        label="الإجابة النموذجية"
                        icon="checkmark-done"
                        placeholder="ما يجب أن يكتبه الطالب في الفراغ"
                        value={q.answer}
                        onChangeText={(v) => setQ(i, { answer: v })}
                      />
                      <Text style={styles.correctHint}>تصحيح تلقائي بمطابقة النص (يُتجاهل التشكيل والهمزات والمسافات)</Text>
                    </>
                  ) : null}

                  {q.type === 'match' ? (
                    <>
                      {q.pairs.map((p, pi) => (
                        <View key={pi} style={styles.pairRow}>
                          <View style={{ flex: 1 }}>
                            <AppInput placeholder={`بند ${pi + 1} (يسار)`} value={p.l} onChangeText={(v) => setPair(i, pi, 'l', v)} style={{ marginBottom: 0 }} />
                          </View>
                          <Ionicons name="arrow-back" size={16} color={colors.textMuted} />
                          <View style={{ flex: 1 }}>
                            <AppInput placeholder={`يقابله (يمين)`} value={p.r} onChangeText={(v) => setPair(i, pi, 'r', v)} style={{ marginBottom: 0 }} />
                          </View>
                          {q.pairs.length > 2 ? (
                            <Pressable hitSlop={8} onPress={() => setQ(i, { pairs: q.pairs.filter((_, x) => x !== pi) })}>
                              <Ionicons name="close-circle" size={18} color={colors.danger} />
                            </Pressable>
                          ) : null}
                        </View>
                      ))}
                      {q.pairs.length < 6 ? (
                        <AppButton
                          title="+ إضافة زوج"
                          small
                          variant="outline"
                          onPress={() => setQ(i, { pairs: [...q.pairs, { l: '', r: '' }] })}
                        />
                      ) : null}
                      <Text style={styles.correctHint}>الطالب يصل كل بند يسار بما يقابله يميناً — الترتيب يُبعثر تلقائياً عنده وتصحيح تلقائي</Text>
                    </>
                  ) : null}

                  {q.type === 'correct' ? (
                    <>
                      <AppInput
                        label="التصحيح الصحيح (إرشاد لك)"
                        icon="create"
                        placeholder="مثال: ذَهَبَ أحمدُ إلى المدرسةِ"
                        value={q.answer}
                        onChangeText={(v) => setQ(i, { answer: v })}
                      />
                      <Text style={styles.correctHint}>تصحيح يدوي من شاشة النتائج — وإن كتب الطالب نفس النص حرفياً تُحسب الدرجة آلياً</Text>
                      {q.q.trim() ? (
                        <>
                          <Text style={[styles.pubRowText, { marginTop: spacing.sm, marginBottom: spacing.xs }]}>اضغط الكلمة التي تريد وضع خط تحتها في الورقة</Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                            {q.q.trim().split(/\s+/).map((word, wi) => {
                              const range = q.underlined ?? { start: 0, count: 0 };
                              const active = range.count > 0 && wi >= range.start - 1 && wi < range.start - 1 + range.count;
                              return (
                                <Pressable
                                  key={`${word}-${wi}`}
                                  style={[styles.starter, active && { backgroundColor: colors.successBg, borderColor: colors.success }]}
                                  onPress={() => setQ(i, { underlined: active ? { start: 0, count: 0 } : { start: wi + 1, count: 1 } })}
                                >
                                  <Text style={[styles.starterText, active && { color: colors.success, textDecorationLine: 'underline' }]}>{word}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </>
                      ) : null}
                    </>
                  ) : null}

                  {q.type === 'essay' ? (
                    <Text style={styles.correctHint}>سؤال مقالي — يجيب الطالب كتابةً وتصححه أنت يدوياً من النتائج</Text>
                  ) : null}

                  {q.type === 'short' ? (
                    <Text style={styles.correctHint}>إجابة قصيرة بسطر واحد — تصحيح يدوي من شاشة النتائج</Text>
                  ) : null}

                  <AppInput
                    label="صورة السؤال (اختياري — رابط https://)"
                    icon="image"
                    placeholder="https://…"
                    value={q.image ?? ''}
                    onChangeText={(v) => setQ(i, { image: v })}
                    autoCapitalize="none"
                    textAlign="left"
                    style={{ writingDirection: 'ltr' }}
                  />
                  {q.image?.trim() ? (
                    <OptionPicker
                      label="مكان الصورة"
                      icon="locate"
                      value={q.imagePosition ?? 'beside'}
                      options={[
                        { value: 'beside', label: 'بجانب السؤال (ورقي)' },
                        { value: 'above', label: 'فوق السؤال' },
                        { value: 'below', label: 'تحت السؤال' },
                      ]}
                      onChange={(v) => setQ(i, { imagePosition: v as DraftQ['imagePosition'] })}
                    />
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
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {([
                  ['mcq', '+ اختياري'], ['tf', '+ صح/خطأ'], ['complete', '+ أكمل'],
                  ['match', '+ وصل'], ['essay', '+ مقالي'],
                ] as [ExamQuestionType, string][]).map(([t, label]) => (
                  <View key={t} style={{ flex: 1, minWidth: '30%' }}>
                    <AppButton title={label} small variant="outline" onPress={() => setQuestions((p) => [...p, blankQ(t)])} />
                  </View>
                ))}
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
              {subject} · {questions.length} أسئلة · {duration || 30} دقيقة · المجموع {examMarksTotal(questions)} درجة
              {published ? ' · سيُنشر' : ' · مسودة'}
            </Text>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {questions.map((q, i) => (
                <View key={i} style={styles.previewQ}>
                  <Text style={styles.previewQText}>
                    {i + 1}) {q.q || '(بلا نص بعد)'} [{EXAM_TYPE_LABEL[q.type]} — {Number(q.marks) || 1} درجة]
                  </Text>
                  {(q.type === 'mcq' || q.type === 'multi') && q.choices.map((c, ci) => (
                    <Text key={ci} style={styles.previewChoice}>
                      {ci + 1}) {c || '...'}
                    </Text>
                  ))}
                  {q.type === 'complete' ? (
                    <Text style={styles.previewChoice}>أكمل: .............................. (النموذج: {q.answer || '...'})</Text>
                  ) : null}
                  {q.type === 'match' ? q.pairs.map((p, pi) => (
                    <Text key={pi} style={styles.previewChoice}>{p.l || '...'} ⇠ {p.r || '...'}</Text>
                  )) : null}
                  {q.type === 'correct' ? (
                    <Text style={styles.previewChoice}>صحّح: .................... (النموذج: {q.answer || '—'})</Text>
                  ) : null}
                  {q.type === 'essay' || q.type === 'short' ? (
                    <Text style={styles.previewChoice}>إجابة كتابية: .......................</Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
            <View style={{ height: spacing.md }} />
            <AppButton title="رجوع للتعديل" variant="ghost" small onPress={() => setPreviewOpen(false)} />
          </View>
        </View>
      </Modal>

      {/* المحاولات والنتائج + تصحيح اليدوي */}
      <Modal visible={attemptsOpen} transparent animationType="slide" onRequestClose={() => setAttemptsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>نتائج: {attemptsExam?.title}</Text>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {attempts.length === 0 ? (
                <Text style={styles.dimText}>لم يؤدِ أي طالب هذا الامتحان بعد</Text>
              ) : attempts.map((a) => {
                const needsReview = a.status === 'pending_review';
                const manualAnswers = (attemptsExam?.questions ?? [])
                  .map((q, qi) => ({ q, ans: a.answers[qi], model: attemptsExam?.answers?.[qi] }))
                  .filter((x) => isManualExamType(x.q.type));
                return (
                  <View key={a.id} style={styles.attemptRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.attemptName}>{studentName(a.student_id)}</Text>
                      <Text style={styles.attemptDate}>
                        {formatDate(a.created_at)}{needsReview ? ' · قيد مراجعتك' : ''}
                      </Text>
                      {needsReview && manualAnswers.map((x, xi) => (
                        <Text key={xi} style={styles.essayAns} numberOfLines={4}>
                          {EXAM_TYPE_LABEL[x.q.type ?? 'mcq']}: {String(x.ans ?? '—') || '(تركها فارغة)'}
                          {typeof x.model === 'string' && x.model.trim() ? `\nالنموذج: ${x.model}` : ''}
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
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  starterText: { color: colors.text, fontSize: font.xs, fontWeight: '800', textAlign: 'center' },
  stampChip: {
    width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
  },
  stampChipText: { fontSize: font.md },
  opacityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md,
  },
  editButtons: { flexDirection: 'row', gap: spacing.xs },
  stepBtn: {
    width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  typeChip: {
    width: '48.5%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
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
  pairRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
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
