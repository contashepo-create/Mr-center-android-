// ============================================================
// تسجيل الحضور: اختيار مجموعة وتاريخ، ثم تحديد حالة كل طالب
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView } from '../../src/components/controls';
import { GradientScreen, ScreenHeader } from '../../src/components/layout';
import { OptionPicker } from '../../src/components/pickers';
import {
  fetchAttendanceForSession, fetchGroups, fetchStudents,
  getOrCreateSession, saveAttendance,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { AttendanceStatus, Group, SessionRecord, Student } from '../../src/lib/types';
import { arabicError, formatDate, todayIso } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

interface Row {
  student: Student;
  status: AttendanceStatus;
}

export default function AttendanceScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';

  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadGroups = useCallback(async () => {
    if (!centerId) return;
    try { setGroups(await fetchGroups(centerId)); } catch { /* ignore */ }
    setLoading(false);
  }, [centerId]);

  useFocusEffect(useCallback(() => { void loadGroups(); }, [loadGroups]));

  const openSheet = async (gid: string, forDate: string) => {
    setLoadingSheet(true);
    setRows([]);
    setSession(null);
    try {
      const sess = await getOrCreateSession(centerId, gid, forDate);
      setSession(sess);
      const [allStudents, existing] = await Promise.all([
        fetchStudents(centerId),
        fetchAttendanceForSession(sess.id),
      ]);
      const existingMap = new Map(existing.map((a) => [a.student_id, a.status]));
      const groupStudents = allStudents.filter((s) => s.group_id === gid && s.status === 'active');
      setRows(groupStudents.map((s) => ({
        student: s,
        status: (existingMap.get(s.id) as AttendanceStatus) ?? 'present',
      })));
    } catch (e) {
      Alert.alert('خطأ', arabicError(e));
    } finally {
      setLoadingSheet(false);
    }
  };

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setRows((prev) => prev.map((r) => (r.student.id === studentId ? { ...r, status } : r)));
  };

  const markAll = (status: AttendanceStatus) => {
    setRows((prev) => prev.map((r) => ({ ...r, status })));
    };

  const save = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await saveAttendance(centerId, session.id, rows.map((r) => ({ student_id: r.student.id, status: r.status })));
      Alert.alert('تم الحفظ', `تم تسجيل حضور ${rows.length} طالب ليوم ${formatDate(date)}`);
    } catch (e) {
      Alert.alert('تعذر الحفظ', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const presentCount = rows.filter((r) => r.status === 'present' || r.status === 'late').length;

  return (
    <GradientScreen>
      <ScreenHeader title="تسجيل الحضور" subtitle="اختر المجموعة والتاريخ" />

      <View style={{ paddingHorizontal: spacing.lg }}>
        <OptionPicker
          label="المجموعة"
          icon="albums"
          value={groupId}
          options={groups.map((g) => ({ value: g.id, label: g.name, subtitle: `${g.students_count} طالب` }))}
          onChange={(v) => { setGroupId(v); void openSheet(v, date); }}
          placeholder="اختر المجموعة..."
        />
        <AppInput
          label="تاريخ الحصة"
          icon="calendar"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          textAlign="left"
          style={{ writingDirection: 'ltr' }}
          onBlur={() => { if (groupId && /^\d{4}-\d{2}-\d{2}$/.test(date)) void openSheet(groupId, date); }}
        />
      </View>

      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : !groupId ? (
        <EmptyState
          icon="calendar-outline"
          title="اختر مجموعة للبدء"
          message="بعد اختيار المجموعة ستظهر قائمة طلابها لتسجيل حضورهم بضغطة واحدة"
        />
      ) : loadingSheet ? (
        <LoadingView message="جاري تحميل قائمة الطلاب..." />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="لا يوجد طلاب نشطون في هذه المجموعة"
          message="أضف طلاباً للمجموعة من شاشة الطلاب أولاً"
        />
      ) : (
        <>
          {/* شريط الملخص والتحكم الجماعي */}
          <View style={styles.summaryBar}>
            <Text style={styles.summaryText}>
              {presentCount} حاضر · {rows.length - presentCount} غائب
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable style={styles.bulkBtn} onPress={() => markAll('present')}>
                <Text style={styles.bulkBtnText}>الكل حاضر</Text>
              </Pressable>
            </View>
          </View>

          <FlatList
            data={rows}
            keyExtractor={(r) => r.student.id}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Card style={styles.studentRow}>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName} numberOfLines={1}>{item.student.name}</Text>
                  {item.student.phone ? <Text style={styles.studentPhone}>{item.student.phone}</Text> : null}
                </View>
                <View style={styles.statusRow}>
                  <StatusButton
                    label="حاضر" icon="checkmark" color={colors.success}
                    active={item.status === 'present'}
                    onPress={() => setStatus(item.student.id, 'present')}
                  />
                  <StatusButton
                    label="متأخر" icon="time" color={colors.warning}
                    active={item.status === 'late'}
                    onPress={() => setStatus(item.student.id, 'late')}
                  />
                  <StatusButton
                    label="غائب" icon="close" color={colors.danger}
                    active={item.status === 'absent'}
                    onPress={() => setStatus(item.student.id, 'absent')}
                  />
                </View>
              </Card>
            )}
          />

          <View style={styles.saveBar}>
            <AppButton
              title={`حفظ حضور ${rows.length} طالب`}
              icon="save"
              onPress={save}
              loading={busy}
            />
          </View>
        </>
      )}
    </GradientScreen>
  );
}

function StatusButton({ label, icon, color, active, onPress }: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.statusBtn,
        active ? { backgroundColor: color, borderColor: color } : null,
      ]}
    >
      <Ionicons name={icon} size={14} color={active ? '#fff' : color} />
      <Text style={[styles.statusText, { color: active ? '#fff' : color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summaryBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  summaryText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '700' },
  bulkBtn: {
    backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.success + '55',
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  bulkBtnText: { color: colors.success, fontSize: font.xs, fontWeight: '800' },
  studentRow: { marginBottom: spacing.sm, padding: spacing.md },
  studentInfo: { marginBottom: spacing.sm },
  studentName: { color: colors.text, fontSize: font.md, fontWeight: '700', textAlign: 'right' },
  studentPhone: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  statusRow: { flexDirection: 'row', gap: spacing.sm },
  statusBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt,
  },
  statusText: { fontSize: font.sm, fontWeight: '800' },
  saveBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.lg, paddingBottom: spacing.xl,
    backgroundColor: colors.bgSoft, borderTopWidth: 1, borderTopColor: colors.border,
  },
});
