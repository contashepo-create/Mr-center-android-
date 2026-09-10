// ============================================================
// تسجيل الحضور: اختيار مجموعة وتاريخ، ثم تحديد حالة كل طالب
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, EmptyState, LoadingView, NoAccess } from '../../src/components/controls';
import { GradientScreen, ScreenHeader } from '../../src/components/layout';
import { OptionPicker } from '../../src/components/pickers';
import { can, useTeacherGroupIds } from '../../src/lib/staff';
import {
  fetchAttendanceForSession, fetchGroupMembers, fetchGroups,
  findSession, getOrCreateSession, saveAttendance,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { AttendanceStatus, Group, SessionRecord, Student } from '../../src/lib/types';
import { arabicError, formatDate, shiftDateIso, todayIso } from '../../src/lib/utils';
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
  const teacherScope = useTeacherGroupIds();
  const visibleGroups = teacherScope ? groups.filter((g) => teacherScope.includes(g.id)) : groups;

  const loadGroups = useCallback(async () => {
    if (!centerId) return;
    try { setGroups(await fetchGroups(centerId)); } catch { /* ignore */ }
    setLoading(false);
  }, [centerId]);

  useFocusEffect(useCallback(() => { void loadGroups(); }, [loadGroups]));

  // فتح الكشف بلا إنشاء حصة — الحصة تُنشأ فقط عند أول حفظ فعلي
  const openSheet = async (gid: string, forDate: string) => {
    if (!gid) return;
    setLoadingSheet(true);
    setRows([]);
    setSession(null);
    try {
      const sess = await findSession(centerId, gid, forDate);
      setSession(sess);
      const [groupStudents, existing] = await Promise.all([
        fetchGroupMembers(centerId, gid),
        sess ? fetchAttendanceForSession(sess.id) : Promise.resolve([]),
      ]);
      const existingMap = new Map(existing.map((a) => [a.student_id, a.status]));
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
    if (!groupId || rows.length === 0) return;
    setBusy(true);
    try {
      // الحصة تُنشأ هنا فقط عند أول حفظ فعلي
      const sess = session ?? await getOrCreateSession(centerId, groupId, date);
      setSession(sess);
      await saveAttendance(centerId, sess.id, rows.map((r) => ({ student_id: r.student.id, status: r.status })));
      Alert.alert('تم الحفظ', `تم تسجيل حضور ${rows.length} طالب ليوم ${formatDate(date)}`);
    } catch (e) {
      Alert.alert('تعذر الحفظ', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const presentCount = rows.filter((r) => r.status === 'present' || r.status === 'late').length;

  if (!can(profile, 'attendance')) {
    return (
      <GradientScreen>
        <ScreenHeader title="تسجيل الحضور" />
        <NoAccess />
      </GradientScreen>
    );
  }

  return (
    <GradientScreen>
      <ScreenHeader
        title="تسجيل الحضور"
        subtitle="اختر المجموعة والتاريخ"
        right={
          <Pressable style={styles.scanBtn} onPress={() => router.push('/scan')}>
            <Ionicons name="qr-code" size={22} color="#052E22" />
          </Pressable>
        }
      />

      <View style={{ paddingHorizontal: spacing.lg }}>
        <OptionPicker
          label="المجموعة"
          icon="albums"
          value={groupId}
          options={visibleGroups.map((g) => ({ value: g.id, label: g.name, subtitle: `${g.students_count} طالب` }))}
          onChange={(v) => { setGroupId(v); if (v) void openSheet(v, date); }}
          placeholder={visibleGroups.length === 0 && teacherScope ? 'لم تُسند لك مجموعات بعد' : 'اختر المجموعة...'}
        />
        <Text style={styles.dateLabel}>تاريخ الحصة</Text>
        <View style={styles.dateNav}>
          <Pressable
            style={styles.dateArrow}
            onPress={() => {
              const d = shiftDateIso(date, -1);
              setDate(d);
              if (groupId) void openSheet(groupId, d);
            }}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </Pressable>

          <Pressable
            style={styles.dateCenter}
            onPress={() => {
              const t = todayIso();
              setDate(t);
              if (groupId) void openSheet(groupId, t);
            }}
          >
            <Text style={styles.dateText}>{formatDate(date)}</Text>
            {date !== todayIso() ? <Text style={styles.todayLink}>العودة لليوم</Text> : null}
          </Pressable>
          <Pressable
            style={styles.dateArrow}
            onPress={() => {
              // ممنوع تسجيل حضور في تاريخ مستقبلي — السقف هو اليوم
              const d = shiftDateIso(date, 1) > todayIso() ? todayIso() : shiftDateIso(date, 1);
              setDate(d);
              if (groupId) void openSheet(groupId, d);
            }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
        </View>
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
          <Text style={styles.activeNote}>الكشف يعرض الطلاب النشطين فقط — الموقوف والمؤرشف خارج الحضور</Text>
          {/* شريط الملخص والتحكم الجماعي */}
          <View style={styles.summaryBar}>
            <Text style={styles.summaryText}>
              {presentCount} حاضر · {rows.length - presentCount} غائب
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable style={styles.bulkBtn} onPress={() => markAll('present')}>
                <Text style={styles.bulkBtnText}>الكل حاضر</Text>
              </Pressable>
              <Pressable style={[styles.bulkBtn, styles.bulkBtnDanger]} onPress={() => markAll('absent')}>
                <Text style={[styles.bulkBtnText, { color: colors.danger }]}>الكل غائب</Text>
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
  activeNote: {
    color: colors.textMuted, fontSize: font.xs, textAlign: 'center',
    marginBottom: spacing.sm, paddingHorizontal: spacing.lg,
  },
  scanBtn: {
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  dateLabel: {
    color: colors.textSecondary, fontSize: font.sm, fontWeight: '700',
    marginBottom: spacing.xs + 2, textAlign: 'right',
  },
  dateNav: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dateArrow: {
    width: 48, height: 52, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  dateCenter: {
    flex: 1, height: 52, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  dateText: { color: colors.text, fontSize: font.md, fontWeight: '800' },
  todayLink: { color: colors.cyan, fontSize: font.xs, fontWeight: '700', marginTop: 2 },
  summaryBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  summaryText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '700' },
  bulkBtn: {
    backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.success + '55',
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  bulkBtnDanger: { backgroundColor: colors.dangerBg, borderColor: colors.danger + '55' },
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
