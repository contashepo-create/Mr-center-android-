// ============================================================
// عهدة التحصيل: ثلاث مراحل واضحة — تحصيل متوقع (تلقائي من الدفعات)
// ← تسليم فعلي للخزينة ← مطابقة/توثيق عجز أو زيادة وتسويته.
// يطابق مساحة العهدة داخل المحاسبة على الويب (CustodyWorkspace).
// ============================================================

import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  AppButton, AppInput, Card, EmptyState, LoadingView, NoAccess, SectionTitle, StatCard,
} from '../../src/components/controls';
import { DetailSheet } from '../../src/components/DetailSheet';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { OptionPicker } from '../../src/components/pickers';
import {
  fetchAccountingEnabled, fetchCustodyOverview, resolveStaffCustodyShortage,
  settleStaffCustody, submitStaffCustody, type CustodyRow,
} from '../../src/lib/api';
import { buildCustodyReportHtml, fetchReportBranding, shareReportPdf } from '../../src/lib/report';
import { useSession } from '../../src/lib/session';
import { getSupabase } from '../../src/lib/supabase';
import { isOwner } from '../../src/lib/staff';
import { arabicError, formatDate, todayIso } from '../../src/lib/utils';
import { colors, font, spacing, themedStyles } from '../../src/theme';

const value = (n: number | string | null | undefined) => Number(n || 0);

function custodyLabel(status: CustodyRow['status'], delivered: number, shortage = 0, resolved = 0): [string, string] {
  if (status === 'matched') return ['مطابقة ومعتمدة', colors.success];
  if (status === 'shortage' && shortage > 0 && resolved >= shortage) return ['عجز تمت تسويته', colors.warning];
  if (status === 'shortage' && resolved > 0) return ['عجز مسوّى جزئياً', colors.warning];
  if (status === 'shortage') return ['عجز يحتاج متابعة', colors.danger];
  if (status === 'surplus') return ['زيادة بحاجة لتفسير', colors.warning];
  if (status === 'submitted') return ['بانتظار مراجعة', colors.info];
  return delivered > 0 ? ['بانتظار مطابقة', colors.info] : ['بانتظار التسليم', colors.textMuted];
}

type Staff = { id: string; full_name: string; role: string };

export default function CustodyScreen() {
  const { profile, ready } = useSession();
  const centerId = profile?.center_id ?? null;
  const owner = isOwner(profile);
  const staffAllowed = profile?.role === 'secretary' || profile?.role === 'manager';

  const [rows, setRows] = useState<CustodyRow[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStaff, setFilterStaff] = useState<string | null>(null);

  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const [settleOpen, setSettleOpen] = useState(false);
  const [settleRow, setSettleRow] = useState<CustodyRow | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleNotes, setSettleNotes] = useState('');

  const [shortageOpen, setShortageOpen] = useState(false);
  const [shortageRow, setShortageRow] = useState<CustodyRow | null>(null);
  const [shortageMethod, setShortageMethod] = useState<'expense' | 'deduction'>('deduction');
  const [shortageAmount, setShortageAmount] = useState('');
  const [shortageNote, setShortageNote] = useState('');

  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!centerId) { setLoading(false); return; }
    setLoading(true);
    try {
      // العجز/العهدة إجراء تشغيلي يظل متاحاً للموظف حتى لو لم تُفعَّل المحاسبة المالية للسنتر.
      const en = owner ? await fetchAccountingEnabled(centerId) : true;
      setEnabled(en);
      const sb = getSupabase();
      const [overview, staffRes] = await Promise.all([
        (owner || !en) ? fetchCustodyOverview().catch(() => [] as CustodyRow[]) : Promise.resolve([] as CustodyRow[]),
        owner
          ? sb.from('profiles').select('id,full_name,role').eq('center_id', centerId)
            .in('role', ['teacher', 'manager', 'secretary']).order('full_name').limit(300)
          : Promise.resolve({ data: [] as Staff[] }),
      ]);
      setRows(owner ? overview : await fetchCustodyOverview().catch(() => []));
      setStaff((staffRes.data ?? []) as Staff[]);
    } catch {
      // نتجاهل الخطأ: يبقى السجل فارغاً وتظهر رسالة «لا توجد بيانات».
    } finally {
      setLoading(false);
    }
  }, [centerId, owner]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const visible = useMemo(
    () => rows.filter((r) => !filterStaff || r.staff_id === filterStaff),
    [rows, filterStaff],
  );
  const currentMonth = todayIso().slice(0, 7);
  const monthRows = useMemo(() => visible.filter((r) => r.custody_date.slice(0, 7) === currentMonth), [visible, currentMonth]);
  const monthExpected = monthRows.reduce((s, r) => s + value(r.expected_amount), 0);
  const monthDelivered = monthRows.reduce((s, r) => s + value(r.delivered_amount), 0);
  const pendingCount = visible.filter((r) => r.status === 'open' || r.status === 'submitted').length;
  const myToday = rows.find((r) => r.staff_id === profile?.id && r.custody_date === todayIso());

  if (!ready) return <GradientScreen><BackHeader title="العهدة" /><LoadingView message="..." /></GradientScreen>;
  if (!owner && !staffAllowed) {
    return (
      <GradientScreen>
        <BackHeader title="العهدة" />
        <NoAccess message="العهدة متاحة لصاحب السنتر والمدير والسكرتير فقط." />
      </GradientScreen>
    );
  }

  const openDelivery = () => {
    setAmount(String(myToday ? value(myToday.expected_amount) : 0));
    setNotes(myToday?.notes ?? '');
    setDeliveryOpen(true);
  };

  const submitDelivery = async () => {
    const delivered = Number(amount);
    if (!Number.isFinite(delivered) || delivered < 0) return Alert.alert('بيانات ناقصة', 'أدخل مبلغاً مسلماً صحيحاً.');
    setBusy(true);
    try {
      await submitStaffCustody({ staffId: profile!.id, date: todayIso(), delivered, notes });
      setDeliveryOpen(false);
      await load();
      Alert.alert('تم التسجيل', delivered === (myToday ? value(myToday.expected_amount) : 0)
        ? 'المبلغ مطابق للتحصيل المتوقع.' : 'سيظهر الفرق بوضوح للمراجعة.');
    } catch (e) { Alert.alert('تعذر التسجيل', arabicError(e)); } finally { setBusy(false); }
  };

  const openSettle = (row: CustodyRow) => {
    setSettleRow(row);
    setSettleAmount(String(value(row.delivered_amount) || value(row.expected_amount)));
    setSettleNotes(row.notes || '');
    setSettleOpen(true);
  };

  const submitSettle = async () => {
    if (!centerId || !settleRow) return;
    const delivered = Number(settleAmount);
    if (!Number.isFinite(delivered) || delivered < 0) return Alert.alert('بيانات ناقصة', 'أدخل مبلغاً صحيحاً للخزينة.');
    setBusy(true);
    try {
      const expected = value(settleRow.expected_amount);
      await settleStaffCustody({
        centerId, staffId: settleRow.staff_id!, date: settleRow.custody_date, delivered, notes: settleNotes,
      });
      setSettleOpen(false); setSettleRow(null);
      await load();
      Alert.alert('تمت المراجعة', delivered === expected ? 'تم اعتماد المطابقة.'
        : delivered < expected ? `سجل عجز قدره ${(expected - delivered).toFixed(2)} جنيه.`
          : `سجلت زيادة قدرها ${(delivered - expected).toFixed(2)} جنيه.`);
    } catch (e) { Alert.alert('تعذر الاعتماد', arabicError(e)); } finally { setBusy(false); }
  };

  const openShortage = (row: CustodyRow) => {
    const shortage = Math.max(0, value(row.expected_amount) - value(row.delivered_amount));
    const remaining = Math.max(0, shortage - value(row.shortage_resolved_amount));
    setShortageRow(row); setShortageMethod('deduction'); setShortageAmount(String(remaining)); setShortageNote('');
    setShortageOpen(true);
  };

  const submitShortage = async () => {
    if (!shortageRow?.id) return;
    const amt = Number(shortageAmount);
    if (!Number.isFinite(amt) || amt <= 0) return Alert.alert('بيانات ناقصة', 'أدخل مبلغ تسوية صحيحاً.');
    setBusy(true);
    try {
      await resolveStaffCustodyShortage({ custodyId: shortageRow.id, method: shortageMethod, amount: amt, note: shortageNote });
      setShortageOpen(false); setShortageRow(null);
      await load();
      Alert.alert('تمت التسوية', shortageMethod === 'expense' ? 'سُجل العجز كمصروف على السنتر.' : 'سُجل خصماً على صاحب العهدة.');
    } catch (e) { Alert.alert('تعذر التسوية', arabicError(e)); } finally { setBusy(false); }
  };

  const printCustody = async () => {
    const branding = await fetchReportBranding(centerId);
    const html = buildCustodyReportHtml(
      'كشف العهدة', `${currentMonth}`,
      visible.map((r) => {
        const [label] = custodyLabel(r.status, value(r.delivered_amount), Math.max(0, value(r.expected_amount) - value(r.delivered_amount)), value(r.shortage_resolved_amount));
        return [formatDate(r.custody_date), `${value(r.expected_amount).toFixed(2)} جنيه`, `${value(r.delivered_amount).toFixed(2)} جنيه`, label];
      }),
      { name: profile?.full_name || '—', branding },
    );
    try { await shareReportPdf(html, 'كشف العهدة'); } catch (e) { Alert.alert('تعذر إنشاء الكشف', arabicError(e)); }
  };

  return (
    <GradientScreen>
      <BackHeader title="عهدة التحصيل" subtitle="تحصيل متوقع ← تسليم فعلي ← مطابقة أو تسوية عجز/زيادة" />
      <KeyboardScreen>
        {loading ? <LoadingView message="جاري التحميل..." /> : (
          <>
            {owner && enabled === false ? (
              <Card style={{ marginBottom: spacing.md }}>
                <Text style={styles.hint}>المحاسبة المالية التفصيلية غير مفعّلة لسنترك، لكن العهدة تعمل كإجراء تشغيلي يومي بشكل طبيعي.</Text>
              </Card>
            ) : null}

            {staffAllowed ? (
              <Card style={{ marginBottom: spacing.md }}>
                <Text style={styles.heading}>تسليم عهدة اليوم</Text>
                <Text style={styles.hint}>
                  تحصيلك المتوقع اليوم: {value(myToday?.expected_amount).toFixed(2)} جنيه. أدخل ما سلّمته فعلياً للخزينة وسيُحسب الفرق تلقائياً.
                </Text>
                <AppButton title="+ تسليم عهدة اليوم" icon="cash" variant="success" onPress={openDelivery} />
              </Card>
            ) : null}

            {owner ? (
              <View style={styles.summary}>
                <StatCard label="تحصيل متوقع هذا الشهر" value={`${monthExpected.toFixed(0)} ج`} icon="trending-up" />
                <StatCard label="تم تسليمه للخزينة" value={`${monthDelivered.toFixed(0)} ج`} icon="wallet" />
                <StatCard
                  label="الفرق قيد المتابعة"
                  value={`${(monthDelivered - monthExpected).toFixed(0)} ج`}
                  icon="alert-circle"
                  color={monthDelivered === monthExpected ? colors.success : colors.danger}
                />
                <StatCard label="صفوف تحتاج إجراء" value={String(pendingCount)} icon="list" />
              </View>
            ) : null}

            <View style={styles.rowBetween}>
              <SectionTitle title="سجل العهدة اليومي" />
              {owner ? <AppButton title="كشف PDF" icon="document-text" small variant="outline" onPress={printCustody} /> : null}
            </View>

            {owner && staff.length > 0 ? (
              <View style={{ marginBottom: spacing.md }}>
                <OptionPicker
                  label="عرض عهدة موظف معين"
                  value={filterStaff}
                  placeholder="كل الموظفين"
                  options={staff.map((s) => ({ value: s.id, label: s.full_name }))}
                  onChange={(v) => setFilterStaff(v)}
                />
                {filterStaff ? <AppButton title="إظهار الكل" variant="ghost" small onPress={() => setFilterStaff(null)} /> : null}
              </View>
            ) : null}

            {visible.length === 0 ? (
              <EmptyState icon="wallet-outline" title="لا يوجد تحصيل أو تسليم مسجل بعد" message="بمجرد تسجيل تحصيل طالب سيظهر هنا فوراً كمبلغ متوقع للعهدة." />
            ) : (
              <ScrollView>
                {visible.map((row) => {
                  const expected = value(row.expected_amount);
                  const delivered = value(row.delivered_amount);
                  const difference = delivered - expected;
                  const shortage = Math.max(0, expected - delivered);
                  const resolved = Math.min(shortage, value(row.shortage_resolved_amount));
                  const remaining = Math.max(0, shortage - resolved);
                  const [label, color] = custodyLabel(row.status, delivered, shortage, resolved);
                  return (
                    <Card key={`${row.staff_id}-${row.custody_date}`} style={styles.row}>
                      <View style={styles.line}>
                        <Text style={styles.rowTitle}>{row.staff_name} — {formatDate(row.custody_date)}</Text>
                        <Text style={[styles.status, { color }]}>{label}</Text>
                      </View>
                      <Text style={styles.meta}>
                        المتوقع: {expected.toFixed(2)} ج · {row.submitted_at ? `المسلم: ${delivered.toFixed(2)} ج` : 'لم يُسلّم بعد'}
                        {row.submitted_at ? ` · الفرق: ${difference > 0 ? '+' : ''}${difference.toFixed(2)} ج` : ''}
                      </Text>
                      {shortage > 0 ? (
                        <Text style={[styles.meta, { color: remaining ? colors.danger : colors.success }]}>
                          {remaining ? `عجز متبقٍ: ${remaining.toFixed(2)} ج` : 'تمت تسوية العجز بالكامل'}
                        </Text>
                      ) : null}
                      {row.notes ? <Text style={styles.meta}>{row.notes}</Text> : null}
                      {owner && row.staff_id ? (
                        <View style={styles.actions}>
                          <AppButton
                            title={row.submitted_at ? 'مراجعة' : 'تسجيل تسليم'}
                            icon="checkmark-circle"
                            small
                            variant={row.status === 'matched' ? 'ghost' : 'outline'}
                            onPress={() => openSettle(row)}
                          />
                          {row.status === 'shortage' && remaining > 0 && row.id ? (
                            <AppButton title="تسوية العجز" icon="build" small variant="danger" onPress={() => openShortage(row)} />
                          ) : null}
                        </View>
                      ) : null}
                    </Card>
                  );
                })}
              </ScrollView>
            )}
          </>
        )}
      </KeyboardScreen>

      <DetailSheet
        visible={deliveryOpen}
        onClose={() => setDeliveryOpen(false)}
        icon="cash"
        tint="success"
        title="تسليم عهدة اليوم"
        meta={`التحصيل المتوقع المسجل: ${value(myToday?.expected_amount).toFixed(2)} جنيه`}
        footer={(
          <AppButton title={busy ? 'جارٍ الحفظ...' : 'تسجيل التسليم'} icon="checkmark" variant="success" loading={busy} onPress={submitDelivery} />
        )}
      >
        <AppInput label="المبلغ المُسلّم للخزينة" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <AppInput label="ملاحظات التسليم (اختيارية)" value={notes} onChangeText={setNotes} />
      </DetailSheet>

      <DetailSheet
        visible={settleOpen}
        onClose={() => setSettleOpen(false)}
        icon="checkmark-done-circle"
        tint="info"
        title="مراجعة وتسوية العهدة"
        meta={settleRow ? `${settleRow.staff_name} — ${formatDate(settleRow.custody_date)} — المتوقع ${value(settleRow.expected_amount).toFixed(2)} ج` : ''}
        footer={(
          <AppButton title={busy ? 'جارٍ الاعتماد...' : 'اعتماد التسليم'} icon="checkmark" variant="success" loading={busy} onPress={submitSettle} />
        )}
      >
        <AppInput label="المبلغ الفعلي الذي استلمته الخزينة" value={settleAmount} onChangeText={setSettleAmount} keyboardType="decimal-pad" />
        <AppInput label="ملاحظة المراجعة أو سبب الفرق" value={settleNotes} onChangeText={setSettleNotes} />
        <Text style={styles.hint}>يُعتمد تلقائياً: مطابق عند تساوي المبلغين، عجز عند الأقل، وزيادة عند الأعلى.</Text>
      </DetailSheet>

      <DetailSheet
        visible={shortageOpen}
        onClose={() => setShortageOpen(false)}
        icon="build"
        tint="danger"
        title="تسوية عجز العهدة"
        meta={shortageRow ? `${shortageRow.staff_name} — عجز ${Math.max(0, value(shortageRow.expected_amount) - value(shortageRow.delivered_amount)).toFixed(2)} ج` : ''}
        footer={(
          <AppButton title={busy ? 'جارٍ التسوية...' : 'اعتماد التسوية'} icon="checkmark" variant="danger" loading={busy} onPress={submitShortage} />
        )}
      >
        <Text style={styles.hint}>اختر معالجة واحدة واضحة للعجز — لن يُسجَّل المبلغ مرتين.</Text>
        <OptionPicker
          label="طريقة التسوية"
          value={shortageMethod}
          options={[{ value: 'deduction', label: 'خصم على صاحب العهدة' }, { value: 'expense', label: 'مصروف يتحمله السنتر' }]}
          onChange={(v) => setShortageMethod(v as 'expense' | 'deduction')}
        />
        <AppInput label="مبلغ التسوية" value={shortageAmount} onChangeText={setShortageAmount} keyboardType="decimal-pad" />
        <AppInput label="سبب أو ملاحظة (اختياري)" value={shortageNote} onChangeText={setShortageNote} />
      </DetailSheet>
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  heading: { color: colors.text, fontSize: font.md, fontWeight: '900', textAlign: 'right', marginBottom: spacing.sm },
  hint: { color: colors.textSecondary, textAlign: 'right', marginBottom: spacing.md },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { marginBottom: spacing.sm },
  rowTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right', flex: 1 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  status: { fontWeight: '900', fontSize: font.xs },
  meta: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
}));
