// ============================================================
// سجل العمليات: من فعل ماذا ومتى داخل السنتر (للمالك فقط)
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, LoadingView, NoAccess } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { fetchActivityLog } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { isOwner } from '../../src/lib/staff';
import type { ActivityLog } from '../../src/lib/types';
import { formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

const ACTION_LABEL: Record<string, string> = {
  payment_recorded: 'تحصيل دفعة',
  dues_generated: 'توليد مستحقات',
  staff_activated: 'تفعيل فرد',
  staff_suspended: 'إيقاف فرد',
  staff_deleted: 'حذف فرد',
  subscription_request: 'طلب ترقية',
  subscription_activated: 'تفعيل اشتراك',
  subscription_suspended: 'إيقاف اشتراك',
  subscription_upgraded: 'ترقية اشتراك',
  center_suspended: 'إيقاف السنتر',
  broadcast_sent: 'بث إشعار',
  request_approved: 'قبول طلب',
  request_rejected: 'رفض طلب',
};

export default function ActivityScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';
  const [items, setItems] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!centerId) return;
    try {
      setItems(await fetchActivityLog(centerId));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!isOwner(profile)) {
    return (
      <GradientScreen>
        <BackHeader title="سجل العمليات" />
        <NoAccess message="سجل العمليات لصاحب السنتر فقط." />
      </GradientScreen>
    );
  }

  return (
    <GradientScreen>
      <BackHeader title="سجل العمليات" subtitle={`${items.length} عملية`} />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : items.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="لا عمليات مسجلة بعد"
          message="ستُسجل هنا المدفوعات والتفعيلات والاشتراكات ومن فعلها"
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Card style={styles.row}>
              <View style={styles.head}>
                <Ionicons name="receipt" size={18} color={colors.info} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.action}>{ACTION_LABEL[item.action] ?? item.action}</Text>
                  <Text style={styles.meta}>
                    {item.actor_name || 'النظام'} · {formatDate(item.created_at)}
                  </Text>
                </View>
              </View>
              {item.details ? <Text style={styles.details}>{item.details}</Text> : null}
            </Card>
          )}
        />
      )}
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  row: { marginBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  action: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  meta: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  details: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: spacing.sm, lineHeight: 20 },
}));
