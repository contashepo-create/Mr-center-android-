// ============================================================
// سجل حضور الطالب
// ============================================================

import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList } from 'react-native';
import { EmptyState, ListItem, LoadingView } from '../../src/components/controls';
import { GradientScreen, ScreenHeader } from '../../src/components/layout';
import { fetchMyAttendance } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { Attendance, SessionRecord } from '../../src/lib/types';
import { formatDate } from '../../src/lib/utils';
import { colors, spacing } from '../../src/theme';

type Row = Attendance & { sessions?: Pick<SessionRecord, 'session_date'> | null };

export default function MyAttendanceScreen() {
  const { profile } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.student_id) return;
    try {
      setRows(await fetchMyAttendance(profile.student_id));
    } catch { /* ignore */ }
    setLoading(false);
  }, [profile?.student_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const present = rows.filter((r) => r.status === 'present' || r.status === 'late').length;

  return (
    <GradientScreen>
      <ScreenHeader
        title="سجل حضوري"
        subtitle={rows.length > 0 ? `${present} حضور · ${rows.length - present} غياب من ${rows.length} حصة` : undefined}
      />
      {loading ? (
        <LoadingView message="جاري تحميل سجل الحضور..." />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="لا يوجد سجل حضور بعد"
          message="سيظهر هنا حضورك وغيابك فور تسجيله من إدارة السنتر"
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={() => { setLoading(true); void load(); }}
          renderItem={({ item }) => {
            const isPresent = item.status === 'present';
            const isLate = item.status === 'late';
            const color = isPresent ? colors.success : isLate ? colors.warning : colors.danger;
            const bg = isPresent ? colors.successBg : isLate ? colors.warningBg : colors.dangerBg;
            const label = isPresent ? 'حاضر' : isLate ? 'متأخر' : 'غائب';
            return (
              <ListItem
                title={formatDate(item.sessions?.session_date ?? item.created_at)}
                icon={isPresent ? 'checkmark-circle' : isLate ? 'time' : 'close-circle'}
                iconColor={color}
                badge={{ text: label, color, bg }}
              />
            );
          }}
        />
      )}
    </GradientScreen>
  );
}
