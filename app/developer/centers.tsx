// ============================================================
// إدارة السناتر (للمطور): عرض الكل + إيقاف/تفعيل فوري
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { AppButton, EmptyState, ListItem, LoadingView } from '../../src/components/controls';
import { DeveloperGate } from '../../src/components/DeveloperGate';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { devFetchCenters, devSetCenterStatus, logActivity, type CenterWithSub } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { arabicError, formatDate } from '../../src/lib/utils';
import { planLabel } from '../../src/lib/billing';
import { openWhatsApp } from '../../src/lib/whatsapp';
import { colors, spacing } from '../../src/theme';

export default function DevCentersScreen() {
  const { profile, ready } = useSession();
  const [centers, setCenters] = useState<CenterWithSub[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setCenters(await devFetchCenters()); } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!ready) {
    return (
      <GradientScreen>
        <LoadingView message="..." />
      </GradientScreen>
    );
  }
  if (profile?.role !== 'super_admin') return <DeveloperGate />;

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
                await logActivity(c.id, suspending ? 'center_suspended' : 'subscription_activated', suspending ? 'إيقاف من إدارة السناتر' : 'تفعيل من إدارة السناتر');
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
                onPress={() => router.push(`/developer/center-detail?id=${item.id}`)}
                title={item.name}
                subtitle={[
                  `الكود: ${item.code}`,
                  `المسئول: ${item.owner_name || '—'}${item.owner_email ? ' · ' + item.owner_email : ''}`,
                  `${item.students_count ?? 0} طالب · سُجل ${formatDate(item.created_at)}`,
                  item.latest_sub
                    ? `الاشتراك: ${planLabel(item.latest_sub.plan_type)} حتى ${formatDate(item.latest_sub.ends_on)}`
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
                  <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
                    {item.owner_phone ? (
                      <Pressable
                        hitSlop={8}
                        onPress={async () => {
                          const ok = await openWhatsApp(
                            item.owner_phone,
                            `مرحباً ${item.owner_name || ''} (سنتر ${item.name}) — معك إدارة تطبيق Mr Center.`,
                          );
                          if (!ok) Alert.alert('تعذر الفتح', 'رقم الهاتف غير صالح أو واتساب غير مثبت');
                        }}
                        style={styles.waBtn}
                      >
                        <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                      </Pressable>
                    ) : null}
                    <AppButton
                      title={active ? 'إيقاف' : 'تفعيل'}
                      icon={active ? 'pause' : 'play'}
                      small
                      variant={active ? 'danger' : 'success'}
                      onPress={() => toggleStatus(item)}
                    />
                  </View>
                }
              />
            );
          }}
        />
      )}
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  waBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#25D36622', borderWidth: 1, borderColor: '#25D36655',
    alignItems: 'center', justifyContent: 'center',
  },
});
