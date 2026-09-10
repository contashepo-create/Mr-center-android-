// ============================================================
// درجات الطالب مع نسبة النجاح
// ============================================================

import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList } from 'react-native';
import { EmptyState, ListItem, LoadingView } from '../../src/components/controls';
import { GradientScreen, ScreenHeader } from '../../src/components/layout';
import { fetchGradesForStudent } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { ManualGrade } from '../../src/lib/types';
import { arabicMonth } from '../../src/lib/utils';
import { colors, spacing } from '../../src/theme';

export default function MyGradesScreen() {
  const { profile } = useSession();
  const [rows, setRows] = useState<ManualGrade[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.student_id) { setLoading(false); return; }
    try {
      setRows(await fetchGradesForStudent(profile.student_id));
    } catch { /* ignore */ }
    setLoading(false);
  }, [profile?.student_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const totalScore = rows.reduce((s, g) => s + (Number(g.score) || 0), 0);
  const totalMax = rows.reduce((s, g) => s + (Number(g.max_score) || 0), 0);
  const percent = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : null;

  return (
    <GradientScreen>
      <ScreenHeader
        title="درجاتي"
        subtitle={percent !== null ? `متوسطك العام: ${percent}%` : undefined}
      />
      {loading ? (
        <LoadingView message="جاري تحميل درجاتك..." />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="star-outline"
          title="لا توجد درجات بعد"
          message="ستظهر هنا درجاتك في الاختبارات والتقييمات فور تسجيلها"
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
            const ratio = item.max_score > 0 ? item.score / item.max_score : 0;
            const color = ratio >= 0.85 ? colors.success : ratio >= 0.5 ? colors.warning : colors.danger;
            const bg = ratio >= 0.85 ? colors.successBg : ratio >= 0.5 ? colors.warningBg : colors.dangerBg;
            return (
              <ListItem
                title={item.title}
                subtitle={`${arabicMonth(item.month)} ${item.year}`}
                icon="star"
                iconColor={color}
                badge={{ text: `${item.score}/${item.max_score}`, color, bg }}
              />
            );
          }}
        />
      )}
    </GradientScreen>
  );
}
