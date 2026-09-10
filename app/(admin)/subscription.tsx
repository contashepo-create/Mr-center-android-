// ============================================================
// الباقات والترقية (للمالك فقط): خطتك الحالية + المنتجات + طلب ترقية
// بتاريخ وقيمة التحويل — يعتمدها المطور من لوحته
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, NoAccess, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage, OptionPicker } from '../../src/components/pickers';
import {
  createSubscriptionRequest, fetchMyCenter, fetchSubscriptionRequests,
  fetchSubscriptionsHistory, logActivity,
} from '../../src/lib/api';
import type { Subscription } from '../../src/lib/types';
import { useSession } from '../../src/lib/session';
import { getSupabase } from '../../src/lib/supabase';
import { isOwner } from '../../src/lib/staff';
import { planLabel, priceFor, PRODUCTS, TRIAL_DAYS, type PlanDuration } from '../../src/lib/billing';
import type { Center, SubscriptionRequest } from '../../src/lib/types';
import { arabicError, formatDate, formatMoney } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

export default function SubscriptionScreen() {
  const { profile, subscription } = useSession();
  const centerId = profile?.center_id ?? '';
  const [center, setCenter] = useState<Center | null>(null);
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
  const [history, setHistory] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [plan, setPlan] = useState<string>('center_full');
  const [durationIdx, setDurationIdx] = useState(0);
  const [transferAt, setTransferAt] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!centerId) return;
    try {
      const [c, r, h] = await Promise.all([
        fetchMyCenter(centerId), fetchSubscriptionRequests(centerId),
        fetchSubscriptionsHistory(centerId),
      ]);
      setCenter(c); setRequests(r); setHistory(h);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!isOwner(profile)) {
    return (
      <GradientScreen>
        <BackHeader title="الباقات والترقية" />
        <NoAccess message="صفحة الباقات والترقية لصاحب السنتر فقط." />
      </GradientScreen>
    );
  }

  const product = PRODUCTS.find((p) => p.plan === plan) ?? PRODUCTS[0];
  const duration: PlanDuration = product.durations[Math.min(durationIdx, product.durations.length - 1)];
  const pending = requests.filter((r) => r.status === 'pending');

  const openRequest = (planId: string) => {
    const p = PRODUCTS.find((x) => x.plan === planId) ?? PRODUCTS[0];
    setPlan(p.plan);
    setDurationIdx(0);
    setAmount(String(p.durations[0].price));
    setTransferAt('');
    setNotes('');
    setFormError(null);
    setFormOpen(true);
  };

  const send = async () => {
    setFormError(null);
    if (!transferAt.trim()) return setFormError('اكتب تاريخ ووقت التحويل (مثال: 2026-09-12 الساعة 3 عصراً)');
    const amt = Number(amount);
    if (!amt || amt <= 0) return setFormError('اكتب قيمة التحويل حسب الباقة المختارة');
    setBusy(true);
    try {
      await createSubscriptionRequest({
        centerId, plan, months: duration.months, amount: amt, transferAt, notes,
      });
      await logActivity(centerId, 'subscription_request', `طلب ترقية: ${product.name} (${duration.label}) — ${formatMoney(amt)} — تحويل: ${transferAt.trim()}`);
      setFormOpen(false);
      await load();
      Alert.alert('تم إرسال الطلب', 'سيتواصل معك المطور بعد مراجعة التحويل لتفعيل باقتك.');
    } catch (e) {
      setFormError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (s: string) => (s === 'pending' ? 'قيد المراجعة' : s === 'approved' ? 'مقبول ✓' : 'مرفوض');
  const statusColor = (s: string) => (s === 'pending' ? colors.warning : s === 'approved' ? colors.success : colors.danger);

  return (
    <GradientScreen>
      <BackHeader title="الباقات والترقية" subtitle="خطتك وطلباتك" />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : (
        <FlatList
          data={[]}
          keyExtractor={() => 'x'}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* خطتك الحالية */}
              <Card style={styles.currentCard}>
                <View style={styles.currentHead}>
                  <Ionicons name="card" size={24} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.currentLabel}>باقتك الحالية</Text>
                    <Text style={styles.currentPlan}>{planLabel(subscription?.plan_type)}</Text>
                    <Text style={styles.currentMeta}>
                      {subscription?.status === 'active' ? 'فعّالة' : subscription?.status === 'suspended' ? 'موقوفة' : 'منتهية'}
                      {subscription?.days_left !== null && subscription?.days_left !== undefined && (subscription?.days_left ?? 0) >= 0
                        ? ` · متبقي ${subscription.days_left} يوم` : ''}
                      {subscription?.ends_on ? ` · حتى ${formatDate(subscription.ends_on)}` : ''}
                    </Text>
                  </View>
                </View>
                {subscription?.plan_type === 'trial' ? (
                  <Text style={styles.trialNote}>
                    تجربتك {TRIAL_DAYS} أيام بمزايا كاملة — اختر باقتك واطلب الترقية قبل انتهائها.
                  </Text>
                ) : null}
              </Card>

              {/* المنتجات */}
              <SectionTitle title="الباقات المتاحة" />
              {PRODUCTS.filter((p) => center?.kind === 'solo' ? p.plan === 'solo_teacher' : p.plan !== 'solo_teacher').map((p) => (
                <Card key={p.plan} style={styles.planCard}>
                  <View style={styles.planHead}>
                    <Text style={styles.planName}>{p.name}</Text>
                    <Text style={styles.planFrom}>من {formatMoney(Math.min(...p.durations.map((d) => d.price)))}/شهر</Text>
                  </View>
                  <Text style={styles.planTag}>{p.tagline}</Text>
                  {p.features.map((f) => (
                    <View key={f} style={styles.featRow}>
                      <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                      <Text style={styles.featText}>{f}</Text>
                    </View>
                  ))}
                  <View style={{ height: spacing.sm }} />
                  <AppButton title="طلب الترقية لهذه الباقة" icon="arrow-up-circle" small onPress={() => openRequest(p.plan)} />
                </Card>
              ))}

              {/* طلباتك */}
              <SectionTitle title={`طلبات الترقية (${requests.length})`} />
              {requests.length === 0 ? (
                <Card><Text style={styles.dimText}>لا توجد طلبات بعد</Text></Card>
              ) : requests.map((r) => (
                <Card key={r.id} style={styles.reqCard}>
                  <View style={styles.reqHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reqTitle}>{planLabel(r.plan)} · {formatMoney(r.amount)}</Text>
                      <Text style={styles.reqMeta}>
                        تحويل: {r.transfer_at} · {formatDate(r.created_at)}
                        {r.notes ? `\nملاحظات: ${r.notes}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: statusColor(r.status) + '22' }]}>
                      <Text style={[styles.statusText, { color: statusColor(r.status) }]}>{statusLabel(r.status)}</Text>
                    </View>
                  </View>
                  {r.status === 'pending' ? (
                    <Pressable
                      style={styles.cancelBtn}
                      onPress={() => {
                        Alert.alert('إلغاء الطلب', 'سحب طلب الترقية هذا نهائياً؟', [
                          { text: 'تراجع', style: 'cancel' },
                          {
                            text: 'سحب الطلب', style: 'destructive',
                            onPress: async () => {
                              try {
                                const { error } = await getSupabase().from('subscription_requests').delete().eq('id', r.id);
                                if (error) throw error;
                                await load();
                              } catch (e) { Alert.alert('تعذر السحب', arabicError(e)); }
                            },
                          },
                        ]);
                      }}
                    >
                      <Text style={styles.cancelText}>سحب الطلب</Text>
                    </Pressable>
                  ) : null}
                </Card>
              ))}
              {pending.length > 0 ? (
                <FormMessage type="info" text={`لديك ${pending.length} طلب قيد مراجعة المطور`} />
              ) : null}

              {/* سجل المعاملات مع المطور: كل اشتراك فُعّل لسنترك */}
              <SectionTitle title={`سجل المعاملات مع المطور (${history.length})`} />
              {history.length === 0 ? (
                <Card><Text style={styles.dimText}>لا معاملات بعد — تجربتك المجانية أول سجل</Text></Card>
              ) : history.map((h) => (
                <Card key={h.id} style={styles.reqCard}>
                  <View style={styles.reqHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reqTitle}>{planLabel(h.plan_type)} · {h.status === 'active' ? 'ساري' : h.status === 'suspended' ? 'موقوف' : 'منتهي'}</Text>
                      <Text style={styles.reqMeta}>
                        {h.starts_on} ← {h.ends_on}
                        {h.notes ? `\n${h.notes}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: (h.status === 'active' ? colors.success : h.status === 'suspended' ? colors.danger : colors.warning) + '22' }]}>
                      <Text style={[styles.statusText, { color: h.status === 'active' ? colors.success : h.status === 'suspended' ? colors.danger : colors.warning }]}>
                        {h.status === 'active' ? 'ساري' : h.status === 'suspended' ? 'موقوف' : 'منتهي'}
                      </Text>
                    </View>
                  </View>
                </Card>
              ))}
            </>
          }
          renderItem={() => null}
        />
      )}

      {/* نموذج طلب الترقية */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>طلب ترقية: {product.name}</Text>
            <OptionPicker
              label="المدة"
              icon="time"
              value={String(durationIdx)}
              options={product.durations.map((d, i) => ({
                value: String(i), label: `${d.label} — ${formatMoney(d.price)}`,
              }))}
              onChange={(v) => {
                setDurationIdx(Number(v));
                setAmount(String(product.durations[Number(v)].price));
              }}
            />
            <AppInput
              label="قيمة التحويل الفعلية (ج.م)"
              icon="cash"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              textAlign="left"
              style={{ writingDirection: 'ltr' }}
            />
            <AppInput
              label="تاريخ ووقت التحويل"
              icon="calendar"
              placeholder="مثال: 2026-09-12 الساعة 3 عصراً"
              value={transferAt}
              onChangeText={setTransferAt}
            />
            <AppInput
              label="ملاحظات (اختياري)"
              icon="create"
              placeholder="رقم العملية أو أي تفاصيل"
              value={notes}
              onChangeText={setNotes}
            />
            <FormMessage type="error" text={formError} />
            <AppButton title="إرسال الطلب للمطور" icon="send" onPress={send} loading={busy} />
            <View style={{ height: spacing.sm }} />
            <AppButton title="إلغاء" variant="ghost" small onPress={() => setFormOpen(false)} />
          </View>
        </View>
      </Modal>
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  currentCard: { borderColor: colors.primary + '66' },
  currentHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  currentLabel: { color: colors.textMuted, fontSize: font.xs, fontWeight: '700', textAlign: 'right' },
  currentPlan: { color: colors.text, fontSize: font.xl, fontWeight: '900', textAlign: 'right', marginTop: 2 },
  currentMeta: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 4 },
  trialNote: { color: colors.warning, fontSize: font.sm, textAlign: 'right', marginTop: spacing.md, lineHeight: 20 },
  planCard: { marginBottom: spacing.md },
  planHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planName: { color: colors.text, fontSize: font.lg, fontWeight: '900' },
  planFrom: { color: colors.success, fontSize: font.sm, fontWeight: '800' },
  planTag: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 2 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  featText: { color: colors.text, fontSize: font.sm },
  reqCard: { marginBottom: spacing.sm },
  reqHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  reqTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  reqMeta: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: 2, lineHeight: 18 },
  statusPill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusText: { fontSize: font.xs, fontWeight: '800' },
  cancelBtn: { alignItems: 'center', marginTop: spacing.sm },
  cancelText: { color: colors.danger, fontSize: font.sm, fontWeight: '700' },
  dimText: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bgSoft, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xl, paddingBottom: spacing.xxl * 1.5,
    borderWidth: 1, borderColor: colors.border,
  },
  modalTitle: {
    color: colors.text, fontSize: font.lg, fontWeight: '900',
    textAlign: 'center', marginBottom: spacing.lg,
  },
}));
