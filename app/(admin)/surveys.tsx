// ============================================================
// الاستبيانات: إنشاء أسئلة + تفعيل/إيقاف + عرض النتائج
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, NoAccess, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage } from '../../src/components/pickers';
import { can } from '../../src/lib/staff';
import {
  deleteSurvey, fetchStudents, fetchSurveyResponses, fetchSurveys, toggleSurvey, upsertSurvey,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { AppSurvey, AppSurveyResponse, Student } from '../../src/lib/types';
import { arabicError, formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

export default function SurveysScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';
  const [surveys, setSurveys] = useState<AppSurvey[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AppSurvey | null>(null);
  const [title, setTitle] = useState('');
  const [active, setActive] = useState(true);
  const [qs, setQs] = useState<string[]>(['']);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultsSurvey, setResultsSurvey] = useState<AppSurvey | null>(null);
  const [responses, setResponses] = useState<AppSurveyResponse[]>([]);
  // عدد إجابات الاستبيان الجاري تعديله — تعديل الأسئلة بعده ممنوع حتى لا تزيح الإجابات القديمة
  const [editingResponses, setEditingResponses] = useState(0);
  const [originalQs, setOriginalQs] = useState<string>('');

  const load = useCallback(async () => {
    if (!centerId) return;
    try {
      const [sv, st] = await Promise.all([fetchSurveys(centerId), fetchStudents(centerId)]);
      setSurveys(sv); setStudents(st);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const studentName = (id: string) => students.find((s) => s.id === id)?.name ?? 'طالب محذوف';

  const openAdd = () => {
    setEditing(null); setTitle(''); setActive(true); setQs(['']); setEditingResponses(0);
    setOriginalQs(''); setFormError(null); setFormOpen(true);
  };
  const openEdit = async (s: AppSurvey) => {
    setEditing(s); setTitle(s.title); setActive(!!s.is_active);
    setQs(s.questions.length > 0 ? [...s.questions] : ['']);
    setOriginalQs(JSON.stringify(s.questions));
    setFormError(null); setFormOpen(true);
    try {
      setEditingResponses((await fetchSurveyResponses(s.id)).length);
    } catch {
      setEditingResponses(0);
    }
  };

  const save = async () => {
    setFormError(null);
    if (!title.trim()) return setFormError('أدخل عنوان الاستبيان');
    const clean = qs.map((q) => q.trim()).filter(Boolean);
    if (clean.length === 0) return setFormError('أضف سؤالاً واحداً على الأقل');
    // فحص لحظي: أسئلة متغيرة على استبيان مُجاب = رفض (حماية تطابق الإجابات)
    if (editing && JSON.stringify(clean) !== originalQs) {
      try {
        const fresh = await fetchSurveyResponses(editing.id);
        if (fresh.length > 0) {
          return setFormError(`أجاب ${fresh.length} طالب بالفعل — لا يمكن تغيير الأسئلة. أنشئ استبياناً جديداً.`);
        }
      } catch {
        return setFormError('تعذر التحقق من الإجابات — حاول مجدداً');
      }
    }
    setBusy(true);
    try {
      await upsertSurvey(centerId, { id: editing?.id, title, questions: clean, is_active: active });
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
    setResultsSurvey(s); setResponses([]); setResultsOpen(true);
    try { setResponses(await fetchSurveyResponses(s.id)); } catch { /* ignore */ }
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

  return (
    <GradientScreen>
      <BackHeader
        title="الاستبيانات"
        subtitle={`${surveys.length} استبيان`}
        right={
          <Pressable style={styles.addBtn} onPress={openAdd}>
            <Ionicons name="add" size={24} color="#052E22" />
          </Pressable>
        }
      />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : surveys.length === 0 ? (
        <EmptyState
          icon="list-outline"
          title="لا توجد استبيانات بعد"
          message="اسأل طلابك عن آرائهم (مستوى الشرح، المواعيد...) وستصلك إجاباتهم هنا"
          action={<AppButton title="إنشاء استبيان" icon="add" small onPress={openAdd} />}
        />
      ) : (
        <FlatList
          data={surveys}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Card style={styles.svCard}>
              <View style={styles.svHead}>
                <View style={styles.svIcon}>
                  <Ionicons name="list" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.svTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.svMeta}>{item.questions.length} أسئلة · {formatDate(item.created_at)}</Text>
                </View>
                <View style={[styles.pubPill, { backgroundColor: item.is_active ? colors.successBg : colors.warningBg }]}>
                  <Text style={[styles.pubText, { color: item.is_active ? colors.success : colors.warning }]}>
                    {item.is_active ? 'مفعّل' : 'متوقف'}
                  </Text>
                </View>
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
          )}
        />
      )}

      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{editing ? 'تعديل الاستبيان' : 'استبيان جديد'}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <AppInput label="عنوان الاستبيان" icon="list" placeholder="مثال: رأيك في مواعيد المجموعات" value={title} onChangeText={setTitle} />
              <Pressable style={styles.pubRow} onPress={() => setActive((v) => !v)}>
                <Ionicons name={active ? 'checkbox' : 'square-outline'} size={22} color={active ? colors.success : colors.textMuted} />
                <Text style={styles.pubRowText}>مفعّل ويظهر للطلاب</Text>
              </Pressable>
              <SectionTitle title={`الأسئلة (${qs.filter((q) => q.trim()).length})`} />
              {editing && editingResponses > 0 ? (
                <FormMessage
                  type="info"
                  text={`أجاب ${editingResponses} طالب بالفعل — الأسئلة مقفلة حتى لا تزيح الإجابات القديمة. عدّل العنوان أو الحالة فقط، أو أنشئ استبياناً جديداً.`}
                />
              ) : null}
              {qs.map((q, i) => (
                <View key={i} style={styles.qRow}>
                  <View style={{ flex: 1 }}>
                    <AppInput
                      placeholder={`سؤال ${i + 1}...`}
                      value={q}
                      onChangeText={(v) => setQs((p) => p.map((x, xi) => (xi === i ? v : x)))}
                      style={{ marginBottom: 0 }}
                      editable={!(editing && editingResponses > 0)}
                    />
                  </View>
                  {qs.length > 1 && !(editing && editingResponses > 0) ? (
                    <Pressable hitSlop={8} onPress={() => setQs((p) => p.filter((_, xi) => xi !== i))}>
                      <Ionicons name="trash" size={18} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {!(editing && editingResponses > 0) ? (
                <AppButton title="إضافة سؤال" icon="add-circle" variant="outline" small onPress={() => setQs((p) => [...p, ''])} />
              ) : null}
              <View style={{ height: spacing.md }} />
              <FormMessage type="error" text={formError} />
              <AppButton title={editing ? 'حفظ التعديلات' : 'إنشاء الاستبيان'} icon="checkmark" onPress={save} loading={busy} />
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
            <Text style={styles.modalTitle}>إجابات: {resultsSurvey?.title} ({responses.length})</Text>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {responses.length === 0 ? (
                <Text style={styles.dimText}>لا توجد إجابات بعد</Text>
              ) : responses.map((r) => (
                <Card key={r.id} style={{ marginBottom: spacing.sm }}>
                  <Text style={styles.respName}>{studentName(r.student_id)} · {formatDate(r.created_at)}</Text>
                  {(resultsSurvey?.questions ?? []).map((q, qi) => (
                    <View key={qi} style={{ marginTop: spacing.sm }}>
                      <Text style={styles.respQ}>{q}</Text>
                      <Text style={styles.respA}>{r.answers?.[qi] || '—'}</Text>
                    </View>
                  ))}
                </Card>
              ))}
            </ScrollView>
            <View style={{ height: spacing.md }} />
            <AppButton title="إغلاق" variant="ghost" small onPress={() => setResultsOpen(false)} />
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

const styles = StyleSheet.create({
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
  pubRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  pubRowText: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  dimText: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  respName: { color: colors.primary, fontSize: font.sm, fontWeight: '800', textAlign: 'right' },
  respQ: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right' },
  respA: { color: colors.text, fontSize: font.sm, textAlign: 'right', marginTop: 2 },
});
