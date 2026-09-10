// ============================================================
// مكتبة السنتر: لوحة الشرف + الملفات والمذكرات + الروابط المهمة
// (تظهر لطلاب السنتر في شاشة المكتبة لديهم)
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, NoAccess } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage } from '../../src/components/pickers';
import { can } from '../../src/lib/staff';
import {
  deleteHonoree, deleteImportantLink, deleteSharedFile, fetchGrades, fetchGroups,
  fetchHonorees, fetchImportantLinks, fetchSharedFiles, fetchStudents,
  upsertHonoree, upsertImportantLink,
  upsertSharedFile, type Honoree, type ImportantLink, type SharedFile,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { Grade, Group, Student } from '../../src/lib/types';
import { arabicError, isValidHttpUrl } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

type Tab = 'honorees' | 'files' | 'links';

const TABS: { value: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'honorees', label: 'لوحة الشرف', icon: 'trophy' },
  { value: 'files', label: 'الملفات', icon: 'document-text' },
  { value: 'links', label: 'الروابط', icon: 'link' },
];

export default function LibraryScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';
  const [tab, setTab] = useState<Tab>('honorees');
  const [honorees, setHonorees] = useState<Honoree[]>([]);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [links, setLinks] = useState<ImportantLink[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [extra, setExtra] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // اختيار المكرّم من الطلاب (بحث + فلتر صف/مجموعة)
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [honoreeStudentId, setHonoreeStudentId] = useState<string | null>(null);
  const [honoreeSearch, setHonoreeSearch] = useState('');
  const [honoreeGrade, setHonoreeGrade] = useState<string>('all');
  const [honoreeGroup, setHonoreeGroup] = useState<string>('all');

  const load = useCallback(async () => {
    if (!centerId) return;
    try {
      const [h, f, l, st, g, gr] = await Promise.all([
        fetchHonorees(centerId), fetchSharedFiles(centerId), fetchImportantLinks(centerId),
        fetchStudents(centerId), fetchGroups(centerId), fetchGrades(centerId),
      ]);
      setHonorees(h); setFiles(f); setLinks(l);
      setStudents(st); setGroups(g); setGrades(gr);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const gradeName = (id: string | null) => grades.find((g) => g.id === id)?.name ?? '';
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? '';

  if (!can(profile, 'honors')) {
    return (
      <GradientScreen>
        <BackHeader title="مكتبة السنتر" />
        <NoAccess />
      </GradientScreen>
    );
  }

  const openAdd = () => {
    setEditingId(null); setName(''); setExtra(''); setFormError(null);
    setHonoreeStudentId(null); setHonoreeSearch(''); setHonoreeGrade('all'); setHonoreeGroup('all');
    setFormOpen(true);
  };
  const openEdit = (id: string, n: string, e: string) => {
    setEditingId(id); setName(n); setExtra(e); setFormError(null);
    const row = honorees.find((h) => h.id === id);
    setHonoreeStudentId(row?.student_id ?? null);
    setHonoreeSearch(''); setHonoreeGrade('all'); setHonoreeGroup('all');
    setFormOpen(true);
  };

  const honoreeCandidates = students.filter((s) => {
    if (honoreeGrade !== 'all' && s.grade_id !== honoreeGrade) return false;
    if (honoreeGroup !== 'all' && s.group_id !== honoreeGroup) return false;
    const q = honoreeSearch.trim();
    if (q && !s.name.includes(q) && !(s.phone ?? '').includes(q)) return false;
    return true;
  }).slice(0, 50);

  const save = async () => {
    setFormError(null);
    if (tab === 'honorees') {
      const picked = students.find((s) => s.id === honoreeStudentId);
      const finalName = picked?.name ?? name;
      if (!finalName.trim()) return setFormError('اختر الطالب المكرّم من القائمة');
      if (!extra.trim()) return setFormError('اكتب سبب التكريم');
      setBusy(true);
      try {
        await upsertHonoree(centerId, {
          id: editingId ?? undefined, name: finalName, details: extra,
          student_id: picked?.id ?? null, group_id: picked?.group_id ?? null,
        });
        setFormOpen(false);
        await load();
      } catch (e) {
        setFormError(arabicError(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!name.trim()) return setFormError('أدخل الاسم/العنوان');
    if (!extra.trim()) {
      return setFormError(tab === 'files' ? 'أدخل رابط الملف' : 'أدخل الرابط');
    }
    if (!isValidHttpUrl(extra)) {
      return setFormError('الرابط غير صحيح — يجب أن يبدأ بـ https:// ويحوي اسم نطاق');
    }
    setBusy(true);
    try {
      if (tab === 'files') await upsertSharedFile(centerId, { id: editingId ?? undefined, name, file_url: extra });
      else await upsertImportantLink(centerId, { id: editingId ?? undefined, name, url: extra });
      setFormOpen(false);
      await load();
    } catch (e) {
      setFormError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (kind: string, id: string, label: string) => {
    Alert.alert('حذف', `حذف «${label}»؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: async () => {
          try {
            if (kind === 'honorees') await deleteHonoree(id);
            else if (kind === 'files') await deleteSharedFile(id);
            else await deleteImportantLink(id);
            await load();
          } catch (e) { Alert.alert('تعذر الحذف', arabicError(e)); }
        },
      },
    ]);
  };

  const openUrl = (url: string | null) => {
    if (!url) return;
    const fixed = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    Linking.openURL(fixed).catch(() => Alert.alert('تعذر الفتح', 'الرابط غير صحيح'));
  };

  const counts = { honorees: honorees.length, files: files.length, links: links.length };
  const labels = {
    honorees: { add: 'تكريم جديد', name: 'اسم الطالب المكرم', extra: 'سبب التكريم (مثال: الأول على المجموعة)', ph1: 'مثال: أحمد محمد', ph2: 'مثال: 150/150 في اختبار مارس' },
    files: { add: 'ملف جديد', name: 'اسم الملف/المذكرة', extra: 'رابط الملف', ph1: 'مثال: مذكرة الفيزياء — الباب الأول', ph2: 'https://...' },
    links: { add: 'رابط جديد', name: 'عنوان الرابط', extra: 'الرابط', ph1: 'مثال: قناة الشرح على يوتيوب', ph2: 'https://...' },
  }[tab];

  const renderRow = (id: string, n: string, e: string | null, icon: keyof typeof Ionicons.glyphMap, color: string, url?: string | null) => (
    <Card style={styles.rowCard}>
      <View style={styles.rowHead}>
        <View style={[styles.rowIcon, { backgroundColor: color + '22', borderColor: color + '55' }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>{n}</Text>
          {e ? <Text style={styles.rowSub} numberOfLines={2}>{e}</Text> : null}
        </View>
      </View>
      <View style={styles.rowActions}>
        {url ? <MiniBtn icon="open" label="فتح" color={colors.info} onPress={() => openUrl(url)} /> : null}
        <MiniBtn icon="create" label="تعديل" color={colors.cyan} onPress={() => openEdit(id, n, e ?? '')} />
        <MiniBtn icon="trash" label="حذف" color={colors.danger} onPress={() => remove(tab, id, n)} />
      </View>
    </Card>
  );

  type Row = { id: string; name: string; extra: string | null };
  const data: Row[] = tab === 'honorees'
    ? honorees.map((h) => ({ id: h.id, name: h.name, extra: h.details }))
    : tab === 'files'
      ? files.map((f) => ({ id: f.id, name: f.name, extra: f.file_url }))
      : links.map((l) => ({ id: l.id, name: l.name, extra: l.url }));

  return (
    <GradientScreen>
      <BackHeader
        title="مكتبة السنتر"
        subtitle="شرف وملفات وروابط تظهر لطلابك"
        right={
          <Pressable style={styles.addBtn} onPress={openAdd}>
            <Ionicons name="add" size={24} color="#052E22" />
          </Pressable>
        }
      />
      <View style={styles.tabsRow}>
        {TABS.map((t) => (
          <Pressable
            key={t.value}
            onPress={() => setTab(t.value)}
            style={[styles.tab, tab === t.value && styles.tabActive]}
          >
            <Ionicons name={t.icon} size={16} color={tab === t.value ? colors.text : colors.textMuted} />
            <Text style={[styles.tabText, tab === t.value && styles.tabTextActive]}>
              {t.label} ({counts[t.value]})
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : data.length === 0 ? (
        <EmptyState
          icon="library-outline"
          title="لا يوجد محتوى هنا بعد"
          action={<AppButton title={labels.add} icon="add" small onPress={openAdd} />}
        />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            if (tab === 'honorees') {
              const h = honorees.find((x) => x.id === item.id);
              const g = h?.group_id ? groupName(h.group_id) : '';
              return renderRow(item.id, item.name, [g, item.extra].filter(Boolean).join(' · ') || null, 'trophy', colors.warning);
            }
            if (tab === 'files') {
              return renderRow(item.id, item.name, item.extra, 'document-text', colors.info, item.extra);
            }
            return renderRow(item.id, item.name, item.extra, 'link', colors.success, item.extra);
          }}
        />
      )}

      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{editingId ? 'تعديل' : labels.add}</Text>
            {tab === 'honorees' ? (
              <>
                <AppInput
                  label="اسم المكرّم (يُملأ تلقائياً من اختيارك بالأسفل)"
                  icon="person"
                  placeholder="اختر طالباً من القائمة أو اكتب اسماً يدوياً"
                  value={honoreeStudentId ? students.find((s) => s.id === honoreeStudentId)?.name ?? name : name}
                  onChangeText={(v) => { setName(v); setHonoreeStudentId(null); }}
                />
                <Text style={styles.pickerLabel}>اختر الطالب المكرّم</Text>
                <View style={styles.searchRow}>
                  <Ionicons name="search" size={18} color={colors.textMuted} />
                  <TextInput
                    placeholder="ابحث بالاسم أو الهاتف..."
                    placeholderTextColor={colors.textMuted}
                    value={honoreeSearch}
                    onChangeText={setHonoreeSearch}
                    style={styles.searchInput}
                    textAlign="right"
                  />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.sm }}>
                  <FilterChip label="كل الصفوف" active={honoreeGrade === 'all'} onPress={() => setHonoreeGrade('all')} />
                  {grades.map((g) => (
                    <FilterChip key={g.id} label={g.name} active={honoreeGrade === g.id} onPress={() => setHonoreeGrade(honoreeGrade === g.id ? 'all' : g.id)} />
                  ))}
                </ScrollView>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.md }}>
                  <FilterChip label="كل المجموعات" active={honoreeGroup === 'all'} onPress={() => setHonoreeGroup('all')} />
                  {groups.map((g) => (
                    <FilterChip key={g.id} label={g.name} active={honoreeGroup === g.id} onPress={() => setHonoreeGroup(honoreeGroup === g.id ? 'all' : g.id)} />
                  ))}
                </ScrollView>
                <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                  {honoreeCandidates.length === 0 ? (
                    <Text style={styles.dimText}>لا يوجد طلاب مطابقون — غيّر البحث أو الفلتر</Text>
                  ) : honoreeCandidates.map((s) => {
                    const selected = honoreeStudentId === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => setHonoreeStudentId(selected ? null : s.id)}
                        style={[styles.candidate, selected && styles.candidateActive]}
                      >
                        <Ionicons
                          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                          size={20}
                          color={selected ? colors.success : colors.textMuted}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.candidateName}>{s.name}</Text>
                          <Text style={styles.candidateMeta}>
                            {groupName(s.group_id) || 'بدون مجموعة'}{gradeName(s.grade_id) ? ` · ${gradeName(s.grade_id)}` : ''}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <AppInput
                  label="سبب التكريم"
                  icon="ribbon"
                  placeholder="مثال: الأول على المجموعة — 150/150"
                  value={extra}
                  onChangeText={setExtra}
                  multiline
                />
              </>
            ) : (
              <>
                <AppInput label={labels.name} icon="text" placeholder={labels.ph1} value={name} onChangeText={setName} />
                <AppInput
                  label={labels.extra}
                  icon="link"
                  placeholder={labels.ph2}
                  value={extra}
                  onChangeText={setExtra}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textAlign="left"
                  style={{ writingDirection: 'ltr' }}
                />
              </>
            )}
            <FormMessage type="error" text={formError} />
            <AppButton title={editingId ? 'حفظ التعديل' : 'إضافة'} icon="checkmark" onPress={save} loading={busy} />
            <View style={{ height: spacing.sm }} />
            <AppButton title="إلغاء" variant="ghost" small onPress={() => setFormOpen(false)} />
          </View>
        </View>
      </Modal>
    </GradientScreen>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
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
  tabsRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingVertical: spacing.sm,
  },
  tabActive: { backgroundColor: colors.primary + '33', borderColor: colors.primary },
  tabText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '700' },
  tabTextActive: { color: colors.text },
  rowCard: { marginBottom: spacing.sm },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowIcon: {
    width: 42, height: 42, borderRadius: radius.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  rowSub: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
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
    borderWidth: 1, borderColor: colors.border,
  },
  modalTitle: {
    color: colors.text, fontSize: font.lg, fontWeight: '900',
    textAlign: 'center', marginBottom: spacing.lg,
  },
  pickerLabel: {
    color: colors.textSecondary, fontSize: font.sm, fontWeight: '700',
    marginBottom: spacing.xs + 2, textAlign: 'right',
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.md, minHeight: 48,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: font.md, paddingVertical: spacing.sm, textAlign: 'right' },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, maxWidth: 200,
  },
  chipActive: { backgroundColor: colors.primary + '33', borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '700' },
  chipTextActive: { color: colors.text },
  candidate: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.xs,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  candidateActive: { borderColor: colors.success, backgroundColor: colors.successBg },
  candidateName: { color: colors.text, fontSize: font.md, fontWeight: '700', textAlign: 'right' },
  candidateMeta: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  dimText: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center', paddingVertical: spacing.md },
});
