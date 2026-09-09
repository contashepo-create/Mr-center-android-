// ============================================================
// إدارة السناتر (للمطور): عرض الكل + إيقاف/تفعيل فوري
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { AppButton, EmptyState, ListItem, LoadingView } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { devFetchCenters, devSetCenterStatus, type CenterWithSub } from '../../src/lib/api';
import { arabicError, formatDate } from '../../src/lib/utils';
import { colors, spacing } from '../../src/theme';

export default function DevCentersScreen() {
  const [centers, setCenters] = useState<CenterWithSub[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setCenters(await devFetchCenters()); } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const toggleStatus = (c: CenterWithSub) => {
    const suspending = c.status === 'active';
    Alert.alert(
      suspending ? 'إيقاف السنتر؟' : 'تفعيل السنتر؟',
      suspending
        ? `سيُمنع سنتر «${c.name}» فوراً من تسجيل أي بيانات، وسيشاهد أعضاؤه شاشة الإيقاف.`
        : `سيعود سنتر «${c.name}» للعمل فوراً.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: suspending ? 'إيقاف' : 'تفعيل',
          style: suspending ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await devSetCenterStatus(c.id, suspending ? 'suspended' : 'active');
              await load();
            } catch (e) {
              Alert.alert('خطأ', arabicError(e));
            }
          },
        },
      ],
    );
  };

  return (
    <GradientScreen>
      <BackHeader title="إدارة السناتر" subtitle={`${centers.length} سنتر مسجل`} />
      {loading ? (
        <LoadingView message="جاري تحميل السناتر..." />
      ) : centers.length === 0 ? (
        <EmptyState
          icon="business-outline"
          title="لا توجد سناتر بعد"
          message="عندما يسجّل أصحاب السناتر حساباتهم ستظهر هنا"
        />
      ) : (
        <FlatList
          data={centers}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={() => { setLoading(true); void load(); }}
          renderItem={({ item }) => {
            const active = item.status === 'active';
            return (
              <ListItem
                title={item.name}
                subtitle={[
                  `الكود: ${item.code}`,
                  `المسئول: ${item.owner_name || '—'}${item.owner_email ? ' · ' + item.owner_email : ''}`,
                  `${item.students_count ?? 0} طالب · سُجل ${formatDate(item.created_at)}`,
                  item.latest_sub
                    ? `الاشتراك: ${item.latest_sub.plan_type === 'monthly' ? 'شهري' : item.latest_sub.plan_type === 'yearly' ? 'سنوي' : 'مخصص'} حتى ${item.latest_sub.ends_on}`
                    : 'الاشتراك: لا يوجد سجل',
                ].join('\n')}
                icon="business"
                iconColor={active ? colors.cyan : colors.danger}
                badge={{
                  text: active ? 'فعّال' : 'موقوف',
                  color: active ? colors.success : colors.danger,
                  bg: active ? colors.successBg : colors.dangerBg,
                }}
                right={
                  <AppButton
                    title={active ? 'إيقاف' : 'تفعيل'}
                    icon={active ? 'pause' : 'play'}
                    small
                    variant={active ? 'danger' : 'success'}
                    onPress={() => toggleStatus(item)}
                  />
                }
              />
            );
          }}
        />
      )}
    </GradientScreen>
  );
}
