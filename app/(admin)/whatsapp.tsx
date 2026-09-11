// ============================================================
// واتساب السنتر: إرسال مباشر (تنبيه/تقرير/مستحقات/مخصص) لصف أو
// مجموعة أو طالب أو ولي أمر — تُفتح المحادثة في واتساب جهازك.
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { AppButton, AppInput, Card, EmptyState, LoadingView, NoAccess, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage, OptionPicker } from '../../src/components/pickers';
import { fetchAllPendingDues, fetchCenterStudentGroups, fetchGrades, fetchGroups, fetchMyCenter, fetchStudents } from '../../src/lib/api';
import { can, useTeacherGroupIds } from '../../src/lib/staff';
import { useSession } from '../../src/lib/session';
import type { Center, Due, Grade, Group, Student } from '../../src/lib/types';
import { arabicMonth, formatMoney } from '../../src/lib/utils';
import {
  duesReminderText, examAlertText, generalNoticeText, guardianReportText,
  openWhatsApp, toWaNumber,
} from '../../src/lib/whatsapp';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

type Scope = 'all' | 'grade' | 'group' | 'student';
type Target = 'student' | 'guardian';
type Tpl = 'custom' | 'notice' | 'dues' | 'report' | 'exam';

const SCOPE_OPTIONS = [
  { value: 'all', label: 'كل الطلاب' },
  { value: 'grade', label: 'صف معين' },
  { value: 'group', label: 'مجموعة معينة' },
  { value: 'student', label: 'طالب واحد' },
];
const TARGET_OPTIONS = [
  { value: 'student', label: 'رقم الطالب' },
  { value: 'guardian', label: 'رقم ولي الأمر' },
];
const TPL_OPTIONS = [
  { value: 'custom', label: 'رسالة مخصصة (نص واحد للكل)' },
  { value: 'notice', label: 'تنبيه عام من السنتر' },
  { value: 'dues', label: 'تذكير بالمستحقات (تلقائي لكل طالب)' },
  { value: 'report', label: 'تقرير مختصر (تلقائي لكل طالب)' },
];

export default function WhatsAppScreen() {
  const params = useLocalSearchParams<{ preset?: string; examTitle?: string; examSubject?: string; examCount?: string; examMinutes?: string }>();
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';

  const [center, setCenter] = useState<Center | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [pendingDues, setPendingDues] = useState<Due[]>([]);
  const [extraLinks, setExtraLinks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [scope, setScope] = useState<Scope>('all');
  const [scopeGrade, setScopeGrade] = useState<string | null>(null);
  const [scopeGroup, setScopeGroup] = useState<string | null>(null);
  const [scopeStudent, setScopeStudent] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>('guardian');
  const [tpl, setTpl] = useState<Tpl>(params.preset === 'exam' ? 'exam' : 'custom');
  const [text, setText] = useState('');
  const teacherScope = useTeacherGroupIds();
  const visibleGroups = teacherScope ? groups.filter((g) => teacherScope.includes(g.id)) : groups;

  const load = useCallback(async () => {
    if (!centerId) return;
    try {
      const [c, st, g, gr, dues, xj] = await Promise.all([
        fetchMyCenter(centerId), fetchStudents(centerId),
        fetchGroups(centerId), fetchGrades(centerId), fetchAllPendingDues(centerId),
        fetchCenterStudentGroups(centerId),
      ]);
      setCenter(c); setStudents(st); setGroups(g); setGrades(gr); setPendingDues(dues);
      setExtraLinks(new Set(xj.map((r) => `${r.student_id}:${r.group_id}`)));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!can(profile, 'notify')) {
    return (
      <GradientScreen>
        <BackHeader title="واتساب السنتر" />
        <NoAccess />
      </GradientScreen>
    );
  }

  // المدرس يراسل طلاب مجموعاته المسندة فقط — حتى مع اختيار الكل
  const teacherStudentIds = (() => {
    if (!teacherScope) return null;
    const ids = new Set<string>();
    for (const s of students) {
      if (s.group_id && teacherScope.includes(s.group_id)) ids.add(s.id);
    }
    for (const link of extraLinks) {
      const [sid, gid] = link.split(':');
      if (teacherScope.includes(gid)) ids.add(sid);
    }
    return ids;
  })();

  const inScope = (s: Student) => {
    if (s.status !== 'active') return false;
    if (teacherStudentIds && !teacherStudentIds.has(s.id)) return false;
    if (scope === 'grade') return scopeGrade ? s.grade_id === scopeGrade : true;
    if (scope === 'group') {
      if (!scopeGroup) return true;
      return s.group_id === scopeGroup || extraLinks.has(`${s.id}:${scopeGroup}`);
    }
    if (scope === 'student') return scopeStudent ? s.id === scopeStudent : true;
    return true;
  };

  const phoneOf = (s: Student) => (target === 'guardian' ? s.guardian_phone : s.phone);

  const recipients = students.filter((s) => inScope(s) && toWaNumber(phoneOf(s)));

  const duesOf = (studentId: string) => pendingDues.filter((d) => d.student_id === studentId);
  const duesTotal = (studentId: string) => duesOf(studentId).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  const examText = params.preset === 'exam'
    ? examAlertText(
      center?.name ?? 'السنتر',
      params.examTitle ?? 'امتحان جديد',
      params.examSubject ?? '',
      Number(params.examCount) || 0,
      Number(params.examMinutes) || 30,
    )
    : '';

  const textFor = (s: Student): string => {
    if (tpl === 'exam') return examText;
    if (tpl === 'notice') return generalNoticeText(center?.name ?? '', text);
    if (tpl === 'dues') {
      const mine = duesOf(s.id);
      if (mine.length === 0) return '';
      const first = mine[0];
      return duesReminderText(
        center?.name ?? '', s.name,
        `${arabicMonth(first.month)} ${first.year}`, duesTotal(s.id),
      );
    }
    if (tpl === 'report') {
      return guardianReportText({
        centerName: center?.name ?? '', studentName: s.name,
        pendingTotal: duesTotal(s.id), pendingCount: duesOf(s.id).length,
        present: 0, absent: 0,
      });
    }
    return text;
  };

  const mailable = tpl === 'dues'
    ? recipients.filter((s) => duesOf(s.id).length > 0)
    : recipients;

  const sendTo = async (s: Student) => {
    const msg = textFor(s);
    if (!msg.trim()) {
      Alert.alert('لا رسالة', 'لا يوجد محتوى لإرساله لهذا الطالب (لا مستحقات معلقة مثلاً)');
      return;
    }
    const ok = await openWhatsApp(phoneOf(s), msg);
    if (!ok) Alert.alert('تعذر الفتح', 'رقم الهاتف غير صالح أو واتساب غير مثبت');
  };

  const copyAll = async () => {
    try {
      const msg = tpl === 'custom' || tpl === 'notice' ? (tpl === 'notice' ? generalNoticeText(center?.name ?? '', text) : text) : examText;
      await Clipboard.setStringAsync(msg || '');
      Alert.alert('تم النسخ', 'انسخ الرسالة والصقها في أي مكان');
    } catch { /* ignore */ }
  };

  const gradeName = (id: string | null) => grades.find((g) => g.id === id)?.name ?? '';

  return (
    <GradientScreen>
      <BackHeader title="واتساب السنتر" subtitle="إرسال مباشر من جهازك" />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : (
        <FlatList
          data={mailable}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <Card>
                <OptionPicker label="النطاق" icon="people" value={scope} options={SCOPE_OPTIONS} onChange={(v) => setScope(v as Scope)} />
                {scope === 'grade' ? (
                  <OptionPicker
                    label="الصف" icon="school" value={scopeGrade}
                    options={grades.map((g) => ({ value: g.id, label: g.name }))}
                    onChange={setScopeGrade} placeholder="اختر الصف..."
                  />
                ) : null}
                {scope === 'group' ? (
                  <OptionPicker
                    label="المجموعة" icon="albums" value={scopeGroup}
                    options={visibleGroups.map((g) => ({ value: g.id, label: g.name }))}
                    onChange={setScopeGroup} placeholder="اختر المجموعة..."
                  />
                ) : null}
                {scope === 'student' ? (
                  <OptionPicker
                    label="الطالب" icon="person" value={scopeStudent}
                    options={students
                      .filter((s) => s.status === 'active' && (!teacherStudentIds || teacherStudentIds.has(s.id)))
                      .map((s) => ({ value: s.id, label: s.name }))}
                    onChange={setScopeStudent} placeholder="اختر الطالب..."
                  />
                ) : null}
                <OptionPicker
                  label="الإرسال إلى" icon="call" value={target}
                  options={TARGET_OPTIONS} onChange={(v) => setTarget(v as Target)}
                />
              </Card>

              <View style={{ height: spacing.md }} />
              <Card>
                {tpl !== 'exam' ? (
                  <OptionPicker label="نوع الرسالة" icon="chatbox" value={tpl} options={TPL_OPTIONS} onChange={(v) => setTpl(v as Tpl)} />
                ) : (
                  <FormMessage type="info" text="تنبيه امتحان جاهز — اختر النطاق ثم أرسل لكل طالب" />
                )}
                {tpl === 'custom' || tpl === 'notice' ? (
                  <AppInput
                    label={tpl === 'notice' ? 'نص التنبيه' : 'نص الرسالة'}
                    icon="create"
                    placeholder="اكتب رسالتك هنا..."
                    value={text}
                    onChangeText={setText}
                    multiline
                    numberOfLines={4}
                    style={{ minHeight: 100, textAlignVertical: 'top' }}
                  />
                ) : null}
                {tpl === 'report' ? (
                  <FormMessage type="info" text="التقرير المختصر يشمل المستحقات المعلقة لكل طالب" />
                ) : null}
                {tpl === 'dues' ? (
                  <FormMessage type="info" text="يُرسل فقط لمن لديه مستحقات معلقة" />
                ) : null}
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <AppButton title="نسخ الرسالة" icon="copy" small variant="outline" onPress={copyAll} />
                  </View>
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Text style={styles.countText}>{mailable.length} مستلم جاهز</Text>
                  </View>
                </View>
              </Card>

              <FormMessage
                type="info"
                text="كل إرسال يفتح شات مستلم واحد فقط — فشل رقم لا يعطل الباقي. الرقم غير المسجل واتساب سيظهر له تنبيه داخل واتساب نفسه."
              />
              <SectionTitle title={`المستلمون (${mailable.length})`} />
              {mailable.length === 0 ? (
                <EmptyState
                  icon="logo-whatsapp"
                  title="لا يوجد مستلمون"
                  message={target === 'guardian' ? 'تأكد من تسجيل أرقام أولياء الأمور للطلاب' : 'لا يوجد طلاب بأرقام صالحة في هذا النطاق'}
                />
              ) : null}
            </>
          }
          renderItem={({ item }) => (
            <Card style={styles.recCard}>
              <View style={styles.recHead}>
                <Ionicons name="person" size={18} color={colors.info} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.recName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.recMeta}>
                    {phoneOf(item)}{gradeName(item.grade_id) ? ` · ${gradeName(item.grade_id)}` : ''}
                    {tpl === 'dues' ? ` · معلق ${formatMoney(duesTotal(item.id))}` : ''}
                  </Text>
                </View>
                <Pressable style={styles.sendBtn} onPress={() => sendTo(item)}>
                  <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                  <Text style={styles.sendText}>إرسال</Text>
                </Pressable>
              </View>
            </Card>
          )}
        />
      )}
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  countText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '700', textAlign: 'center' },
  recCard: { marginBottom: spacing.sm, padding: spacing.md },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  recName: { color: colors.text, fontSize: font.md, fontWeight: '700', textAlign: 'right' },
  recMeta: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#25D366', borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  sendText: { color: '#fff', fontSize: font.sm, fontWeight: '800' },
}));
