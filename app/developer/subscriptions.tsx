// ============================================================
// اشتراكات السناتر (المطور): باقات احترافية + اعتماد طلبات الترقية
// ============================================================

import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppButton, AppInput, Card, EmptyState, LoadingView, SectionTitle } from '../../src/components/controls';
import { DeveloperGate } from '../../src/components/DeveloperGate';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { FormMessage, OptionPicker } from '../../src/components/pickers';
import {
  devFetchCenters, devFetchPendingRequests, devResolveRequest, devSetCenterStatus,
  devUpsertSubscription, logActivity, type CenterWithSub,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { getSupabase } from '../../src/lib/supabase';
import { planLabel, PRODUCTS } from '../../src/lib/billing';
import type { PlanType, SubscriptionRequest } from '../../src/lib/types';
import { arabicError, formatDate, formatMoney } from '../../src/lib/utils';
import { colors, font, spacing, themedStyles } from '../../src/theme';

type ReqRow = SubscriptionRequest & { center_name?: string; center_code?: string };

export default function DevSubscriptionsScreen() {
  const { profile, ready } = useSession();
  const [centers, setCenters] = useState<CenterWithSub[]>([]);
  const [requests, setRequests] = useState<ReqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>('center_full');
  const [durationIdx, setDurationIdx] = useState('0');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [extraTeachers, setExtraTeachers] = useState('0');
  const [extraSecretaries, setExtraSecretaries] = useState('0');
  const [extraManagers, setExtraManagers] = useState('0');
  const [entitlementStart, setEntitlementStart] = useState(new Date().toISOString().slice(0, 10));
  const [entitlementEnd, setEntitlementEnd] = useState('');
  const [openEnded, setOpenEnded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cs, rq] = await Promise.all([devFetchCenters(), devFetchPendingRequests()]);
      setCenters(cs);
      setRequests(rq);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!ready) {
    return <GradientScreen><LoadingView message="..." /></GradientScreen>;
  }
  if (profile?.role !== 'super_admin') return <DeveloperGate />;

  const selected = centers.find((c) => c.id === selectedId);
  const product = PRODUCTS.find((p) => p.plan === plan) ?? PRODUCTS[0];
  const duration = product.durations[Number(durationIdx)] ?? product.durations[0];

  const activate = async () => {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    try {
      await devUpsertSubscription({
        centerId: selected.id, planType: product.plan as PlanType,
        months: duration.months, status: 'active',
        notes: `${product.name} — ${duration.label} (${formatMoney(duration.price)}) — تفعيل يدوي`,
      });
      await devSetCenterStatus(selected.id, 'active');
      await logActivity(selected.id, 'subscription_activated', `${product.name} (${duration.label}) — تفعيل يدوي من المطور`);
      setMsg(`تم تفعيل «${product.name}» لسنتر «${selected.name}» (${duration.label})`);
      await load();
    } catch (e) {
      Alert.alert('خطأ', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const saveEntitlement = async () => {
    if (!selected) return;
    const teachers = Math.max(0, Number(extraTeachers) || 0);
    const secretaries = Math.max(0, Number(extraSecretaries) || 0);
    const managers = Math.max(0, Number(extraManagers) || 0);
    if (!openEnded && !entitlementEnd) { Alert.alert('بيانات ناقصة', 'أدخل تاريخ انتهاء الزيادة أو اختر مفتوحة بلا نهاية'); return; }
    setBusy(true);
    try {
      const { error } = await getSupabase().rpc('dev_upsert_entitlement', {
        p_center: selected.id, p_teachers: teachers, p_secretaries: secretaries, p_managers: managers,
        p_starts: entitlementStart || null, p_ends: openEnded ? null : entitlementEnd, p_open: openEnded,
      });
      if (error) throw error;
      setMsg('تم حفظ الزيادة، وستؤثر على الحد الخادمي خلال مدة سريانها.');
    } catch (e) { Alert.alert('تعذر حفظ الزيادة', arabicError(e)); }
    finally { setBusy(false); }
  };

  const suspend = async (c: CenterWithSub) => {
    setBusy(true);
    try {
      await devUpsertSubscription({ centerId: c.id, planType: 'custom', months: 0, status: 'suspended', notes: 'إيقاف من المطور' });
      await devSetCenterStatus(c.id, 'suspended');
      await logActivity(c.id, 'subscription_suspended', 'إيقاف من المطور');
      await load();
    } catch (e) {
      Alert.alert('خطأ', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const resolveRequest = async (r: ReqRow, approve: boolean) => {
    const action = approve ? 'اعتماد طلب الترقية' : 'رفض طلب الترقية';
    Alert.alert(action, `${planLabel(r.plan)} لسنتر «${r.center_name}» بمبلغ ${formatMoney(r.amount)}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: approve ? 'اعتماد وتفعيل' : 'رفض',
        style: approve ? 'default' : 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            if (approve) {
              await devUpsertSubscription({
                centerId: r.center_id, planType: r.plan as PlanType,
                months: r.months, status: 'active',
                notes: `ترقية معتمدة — تحويل ${formatMoney(r.amount)} بتاريخ ${r.transfer_at}`,
              });
              await devSetCenterStatus(r.center_id, 'active');
              await logActivity(r.center_id, 'subscription_upgraded', `${planLabel(r.plan)} — اعتماد طلب بتحويل ${formatMoney(r.amount)}`);
            }
            await devResolveRequest(r.id, approve);
            await logActivity(r.center_id, approve ? 'request_approved' : 'request_rejected', `طلب ${planLabel(r.plan)} — ${formatMoney(r.amount)}`);
            await load();
          } catch (e) {
            Alert.alert('خطأ', arabicError(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <GradientScreen>
      <BackHeader title="اشتراكات السناتر" subtitle="باقات وطلبات ترقية" />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : (
        <KeyboardScreen>
          {/* طلبات الترقية المعلقة */}
          <SectionTitle title={`طلبات الترقية المعلقة (${requests.length})`} />
          {requests.length === 0 ? (
            <Card><Text style={styles.dimText}>لا توجد طلبات معلقة</Text></Card>
          ) : requests.map((r) => (
            <Card key={r.id} style={styles.reqCard}>
              <Text style={styles.reqTitle}>
                {r.center_name} ({r.center_code})
              </Text>
              <Text style={styles.reqMeta}>
                {planLabel(r.plan)} · {formatMoney(r.amount)} · تحويل: {r.transfer_at}
                {r.notes ? `\nملاحظات: ${r.notes}` : ''} · {formatDate(r.created_at)}
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <AppButton title="اعتماد وتفعيل" icon="checkmark" small variant="success" onPress={() => resolveRequest(r, true)} loading={busy} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppButton title="رفض" icon="close" small variant="danger" onPress={() => resolveRequest(r, false)} loading={busy} />
                </View>
              </View>
            </Card>
          ))}

          <SectionTitle title="تفعيل يدوي لأي سنتر" />
          <OptionPicker
            icon="business"
            value={selectedId}
            options={centers.map((c) => ({
              value: c.id,
              label: `${c.name} (${c.code})`,
              subtitle: c.latest_sub
                ? `${planLabel(c.latest_sub.plan_type)} حتى ${c.latest_sub.ends_on} · ${c.latest_sub.status === 'active' ? 'فعّال' : 'موقوف/منتهي'}`
                : 'بدون اشتراك',
            }))}
            onChange={setSelectedId}
            placeholder="اختر سنتراً..."
          />

          {selected ? (
            <>
              <Card style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                  <Text style={styles.dim}>الحالة الحالية:</Text>
                  <Text style={[styles.state, {
                    color: selected.status === 'active' && selected.latest_sub?.status === 'active'
                      ? colors.success : colors.danger,
                  }]}>
                    {selected.status === 'active' && selected.latest_sub?.status === 'active' ? 'فعّال' : 'موقوف/منتهي'}
                  </Text>
                </View>
                {selected.latest_sub ? (
                  <>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                      <Text style={styles.dim}>الباقة:</Text>
                      <Text style={styles.value}>{planLabel(selected.latest_sub.plan_type)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={styles.dim}>تنتهي في:</Text>
                      <Text style={styles.value}>{selected.latest_sub.ends_on}</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.dim}>لا يوجد سجل اشتراك لهذا السنتر</Text>
                )}
              </Card>

              <SectionTitle title="زيادة فريق العمل — للمطور" />
              <Card>
                <Text style={styles.dimText}>الزيادة مؤقتة وتضاف إلى حد الباقة، ولا تُحتسب قبل تاريخ البداية أو بعد الانتهاء.</Text>
                <AppInput label="مدرسون إضافيون" value={extraTeachers} onChangeText={setExtraTeachers} keyboardType="number-pad" />
                <AppInput label="سكرتارية إضافية" value={extraSecretaries} onChangeText={setExtraSecretaries} keyboardType="number-pad" />
                <AppInput label="مديرون إضافيون" value={extraManagers} onChangeText={setExtraManagers} keyboardType="number-pad" />
                <AppInput label="تاريخ البداية YYYY-MM-DD" value={entitlementStart} onChangeText={setEntitlementStart} />
                {!openEnded && <AppInput label="تاريخ النهاية YYYY-MM-DD" value={entitlementEnd} onChangeText={setEntitlementEnd} />}
                <AppButton title={openEnded ? 'تحويل إلى مدة محددة' : 'مفتوحة بلا نهاية'} icon="time" small variant="outline" onPress={() => setOpenEnded(v => !v)} />
                <AppButton title="حفظ زيادة الفريق" icon="save" variant="success" onPress={saveEntitlement} loading={busy} />
              </Card>

              <SectionTitle title="تفعيل باقة احترافية" />
              <Card>
                <OptionPicker
                  label="الباقة"
                  icon="card"
                  value={plan}
                  options={PRODUCTS.map((p) => ({ value: p.plan, label: `${p.name} — من ${formatMoney(p.durations[0].price)}/شهر` }))}
                  onChange={(v) => { setPlan(v); setDurationIdx('0'); }}
                />
                <OptionPicker
                  label="المدة"
                  icon="time"
                  value={durationIdx}
                  options={product.durations.map((d, i) => ({
                    value: String(i), label: `${d.label} — ${formatMoney(d.price)}`,
                  }))}
                  onChange={setDurationIdx}
                />
                {msg ? <Text style={styles.okMsg}>{msg}</Text> : null}
                <AppButton
                  title="تفعيل / تجديد الآن"
                  icon="checkmark-circle"
                  variant="success"
                  onPress={activate}
                  loading={busy}
                />
                <View style={{ height: spacing.sm }} />
                <AppButton
                  title="إيقاف الاشتراك"
                  icon="pause-circle"
                  variant="danger"
                  onPress={() => selected && suspend(selected)}
                  loading={busy}
                />
              </Card>
            </>
          ) : centers.length === 0 ? (
            <EmptyState icon="business-outline" title="لا توجد سناتر بعد" />
          ) : null}
        </KeyboardScreen>
      )}
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  dim: { color: colors.textSecondary, fontSize: font.md },
  dimText: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  value: { color: colors.text, fontSize: font.md, fontWeight: '800' },
  state: { fontSize: font.md, fontWeight: '900' },
  okMsg: { color: colors.success, fontSize: font.sm, fontWeight: '700', textAlign: 'right', marginBottom: spacing.md },
  reqCard: { marginBottom: spacing.sm },
  reqTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  reqMeta: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 4, lineHeight: 20 },
}));
