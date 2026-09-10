// ============================================================
// جدول الطالب: حصص كل مجموعاته (الأساسية + الإضافية) أيام الأسبوع
// ============================================================

import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, LoadingView, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { fetchGroups, fetchStudentById, fetchStudentGroups } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { Group } from '../../src/lib/types';
import { arabicDay, formatTimeAr, timeToMinutes } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

export default function StudentScheduleScreen() {
  const { profile } = useSession();
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.center_id || !profile?.student_id) { setLoading(false); return; }
    try {
      const [gs, st, extra] = await Promise.all([
        fetchGroups(profile.center_id),
        fetchStudentById(profile.student_id),
        fetchStudentGroups(profile.student_id),
      ]);
      const ids = new Set([st?.group_id, ...extra.map((r) => r.group_id)].filter(Boolean) as string[]);
      setMyGroups(gs.filter((g) => ids.has(g.id)));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [profile?.center_id, profile?.student_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <GradientScreen>
      <BackHeader title="جدولي الأسبوعي" subtitle={myGroups.length > 0 ? `${myGroups.length} مجموعات` : ''} />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : myGroups.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="لم تُسند لمجموعة بعد"
          message="ستظهر مواعيد حصصك هنا فور إسنادك لمجموعة من إدارة السنتر"
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {myGroups.map((group) => (
            <View key={group.id}>
              <SectionTitle title={group.name} />
              {(group.days ?? []).length === 0 ? (
                <Card><Text style={styles.dimText}>لم تُحدد أيام لهذه المجموعة بعد</Text></Card>
              ) : (group.days ?? []).map((d) => (
                <Card key={d} style={styles.dayCard}>
                  <View style={styles.dayHead}>
                    <View style={styles.dayPill}>
                      <Text style={styles.dayText}>{arabicDay(d)}</Text>
                    </View>
                    <Text style={styles.timeText}>
                      {timeToMinutes(group.start_time) !== null
                        ? `${formatTimeAr(group.start_time)}${timeToMinutes(group.end_time) !== null ? ' - ' + formatTimeAr(group.end_time) : ''}`
                        : 'الموعد يُعلن لاحقاً'}
                    </Text>
                  </View>
                </Card>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  dimText: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  dayCard: { marginBottom: spacing.sm },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dayPill: {
    backgroundColor: colors.primary + '22', borderWidth: 1, borderColor: colors.primary + '55',
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  dayText: { color: colors.text, fontSize: font.md, fontWeight: '800' },
  timeText: { flex: 1, color: colors.textSecondary, fontSize: font.md, fontWeight: '700', textAlign: 'right' },
});
