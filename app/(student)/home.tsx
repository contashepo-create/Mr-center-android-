// ============================================================
// الرئيسية للطالب: بطاقة ترحيب + مجموعتي + إعلانات السنتر
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, ListItem, LoadingView, SectionTitle, StatCard } from '../../src/components/controls';
import { GradientScreen, KeyboardScreen } from '../../src/components/layout';
import {
  fetchAnnouncements, fetchDuesForStudent, fetchGroups, fetchMyAttendance,
  fetchMyCenter, fetchStudentById,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { Announcement, Center, Group, Student } from '../../src/lib/types';
import { formatDays } from '../../src/lib/utils';
import { colors, font, gradients, radius, spacing } from '../../src/theme';

export default function StudentHome() {
  const { profile } = useSession();
  const [center, setCenter] = useState<Center | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [stats, setStats] = useState({ present: 0, absent: 0, pendingDues: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.center_id || !profile.student_id) return;
    try {
      const [c, s, groups, anns, att, dues] = await Promise.all([
        fetchMyCenter(profile.center_id),
        fetchStudentById(profile.student_id),
        fetchGroups(profile.center_id),
        fetchAnnouncements(profile.center_id),
        fetchMyAttendance(profile.student_id),
        fetchDuesForStudent(profile.student_id),
      ]);
      setCenter(c);
      setStudent(s);
      setGroup(groups.find((g) => g.id === s?.group_id) ?? null);
      setAnnouncements(anns.slice(0, 5));
      let present = 0; let absent = 0;
      for (const a of att) {
        if (a.status === 'present' || a.status === 'late') present++;
        else if (a.status === 'absent') absent++;
      }
      setStats({
        present,
        absent,
        pendingDues: dues.filter((d) => d.status !== 'paid').length,
      });
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [profile?.center_id, profile?.student_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading && !student) {
    return <GradientScreen><LoadingView message="جاري تحميل صفحتك..." /></GradientScreen>;
  }

  return (
    <GradientScreen>
      <KeyboardScreen>
        {/* بطاقة الترحيب */}
        <LinearGradient
          colors={gradients.primary}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>أهلاً بك 👋</Text>
            <Text style={styles.name} numberOfLines={1}>{profile?.full_name ?? ''}</Text>
            <Text style={styles.centerLine}>{center?.name ?? ''}</Text>
          </View>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>{(profile?.full_name ?? '؟').trim().charAt(0)}</Text>
          </View>
        </LinearGradient>

        {/* مجموعتي */}
        <Card style={styles.groupCard}>
          <View style={styles.groupRow}>
            <View style={styles.groupIcon}>
              <Ionicons name="albums" size={22} color={colors.cyan} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.groupLabel}>مجموعتي</Text>
              <Text style={styles.groupName}>{group?.name ?? 'لم تُسند لمجموعة بعد'}</Text>
              {group ? (
                <Text style={styles.groupMeta}>
                  {formatDays(group.days)}
                  {group.start_time ? ` · ${group.start_time}${group.end_time ? ' - ' + group.end_time : ''}` : ''}
                </Text>
              ) : (
                <Text style={styles.groupMeta}>ستظهر مجموعتك هنا فور إسنادك من إدارة السنتر</Text>
              )}
            </View>
          </View>
        </Card>

        {/* ملخص سريع */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <StatCard icon="checkmark-done" value={stats.present} label="حضور" color={colors.success} onPress={() => router.push('/my-attendance')} />
          <StatCard icon="close-circle" value={stats.absent} label="غياب" color={colors.danger} onPress={() => router.push('/my-attendance')} />
          <StatCard icon="time" value={stats.pendingDues} label="مستحق معلق" color={colors.warning} onPress={() => router.push('/my-payments')} />
        </View>

        {/* الإعلانات */}
        <SectionTitle title={`إعلانات ${center?.name ?? 'السنتر'}`} />
        {announcements.length === 0 ? (
          <Card>
            <Text style={styles.emptyText}>لا توجد إعلانات حالياً — ستظهر هنا فور نشرها</Text>
          </Card>
        ) : (
          announcements.map((a) => (
            <ListItem
              key={a.id}
              title={a.title}
              subtitle={a.body}
              icon="megaphone"
              iconColor={a.pinned ? colors.warning : colors.info}
              badge={a.pinned ? { text: 'مثبت', color: colors.warning, bg: colors.warningBg } : undefined}
            />
          ))
        )}
      </KeyboardScreen>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: radius.lg, padding: spacing.xl, marginTop: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  hello: { color: 'rgba(255,255,255,0.85)', fontSize: font.md, fontWeight: '600' },
  name: { color: '#fff', fontSize: font.xxl, fontWeight: '900', marginTop: 2 },
  centerLine: { color: 'rgba(255,255,255,0.85)', fontSize: font.sm, marginTop: spacing.sm },
  avatarCircle: {
    width: 60, height: 60, borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontSize: font.xxl, fontWeight: '900' },
  groupCard: { marginTop: spacing.md },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  groupIcon: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: colors.cyan + '22', borderWidth: 1, borderColor: colors.cyan + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  groupLabel: { color: colors.textMuted, fontSize: font.xs, fontWeight: '700', textAlign: 'right' },
  groupName: { color: colors.text, fontSize: font.lg, fontWeight: '800', textAlign: 'right', marginTop: 2 },
  groupMeta: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 4, lineHeight: 19 },
  emptyText: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'center', lineHeight: 20 },
});
