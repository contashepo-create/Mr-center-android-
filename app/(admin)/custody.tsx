import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppButton, AppInput, Card, NoAccess } from '../../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { getSupabase } from '../../src/lib/supabase';
import { useSession } from '../../src/lib/session';
import { isOwner } from '../../src/lib/staff';
import { colors, font, spacing, themedStyles } from '../../src/theme';

type Custody = { id:string; staff_id:string; custody_date:string; expected_amount:number; delivered_amount:number; status:string; notes:string; };
export default function CustodyScreen() {
  const { profile, ready } = useSession();
  const [rows, setRows] = useState<Custody[]>([]);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const load = useCallback(async () => {
    if (!profile?.center_id) return;
    const { data } = await getSupabase().from('staff_custody').select('*').eq('center_id', profile.center_id).order('custody_date', { ascending: false }).limit(100);
    setRows((data ?? []) as Custody[]);
  }, [profile?.center_id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (!ready) return <GradientScreen><BackHeader title="العهدة" /></GradientScreen>;
  const staffAllowed = profile?.role === 'secretary' || profile?.role === 'manager';
  if (!isOwner(profile) && !staffAllowed) return <GradientScreen><BackHeader title="العهدة" /><NoAccess message="العهدة متاحة لصاحب السنتر والموظف المفعّل فقط." /></GradientScreen>;
  const submit = async () => {
    const value = Number(amount);
    if (!value || value < 0) return Alert.alert('بيانات ناقصة', 'أدخل المبلغ المسلم');
    setLoading(true);
    try {
      const { error } = await getSupabase().rpc('submit_staff_custody', { p_staff: profile!.id, p_date: today, p_delivered: value, p_notes: notes.trim() });
      if (error) throw error;
      setAmount(''); setNotes(''); await load(); Alert.alert('تم التسجيل', 'تمت مطابقة عهدتك مع إجمالي تحصيلك اليومي.');
    } catch (e) { Alert.alert('تعذر التسجيل', e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setLoading(false); }
  };
  const monthTotal = rows.filter(r => r.custody_date.slice(0, 7) === today.slice(0, 7)).reduce((a, r) => a + Number(r.delivered_amount), 0);
  const monthExpected = rows.filter(r => r.custody_date.slice(0, 7) === today.slice(0, 7)).reduce((a, r) => a + Number(r.expected_amount), 0);
  const review = async (id:string, status:string) => { try { const { error } = await getSupabase().rpc('review_staff_custody', { p_id:id, p_status:status, p_notes:'' }); if(error) throw error; await load(); } catch(e) { Alert.alert('تعذر الاعتماد', e instanceof Error ? e.message : 'حدث خطأ'); } };
  const label = (s:string) => s === 'matched' ? 'مطابقة' : s === 'shortage' ? 'عجز' : s === 'surplus' ? 'زيادة' : 'مفتوحة';
  return <GradientScreen><BackHeader title="عهدة التحصيل" subtitle="مطابقة يومية وشهرية للمبالغ المحصلة" /><KeyboardScreen>
    {staffAllowed && <Card><Text style={styles.heading}>تسليم عهدة اليوم</Text><Text style={styles.hint}>سيتم حساب إجمالي تحصيلك تلقائياً من سجل المدفوعات.</Text><AppInput label={`المبلغ المسلم — ${today}`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /><AppInput label="ملاحظات" value={notes} onChangeText={setNotes} /><AppButton title="تسجيل وتسليم العهدة" icon="checkmark-circle" variant="success" onPress={submit} loading={loading} /></Card>}
    {isOwner(profile) && <Card><Text style={styles.heading}>ملخص عهدة الشهر الحالي</Text><Text style={styles.meta}>المتوقع: {monthExpected.toFixed(2)} جنيه · المسلم: {monthTotal.toFixed(2)} جنيه · الفرق: {(monthTotal-monthExpected).toFixed(2)} جنيه</Text></Card>}<Text style={styles.heading}>سجل العهد</Text>{rows.length === 0 ? <Card><Text style={styles.hint}>لا توجد عهد مسجلة بعد.</Text></Card> : rows.map(r => <Card key={r.id} style={styles.row}><View style={styles.line}><Text style={styles.heading}>{r.custody_date}</Text><Text style={[styles.status, { color: r.status === 'matched' ? colors.success : r.status === 'shortage' ? colors.danger : colors.warning }]}>{label(r.status)}</Text></View><Text style={styles.meta}>المتوقع: {Number(r.expected_amount).toFixed(2)} جنيه · المسلم: {Number(r.delivered_amount).toFixed(2)} جنيه</Text>{r.notes ? <Text style={styles.meta}>{r.notes}</Text> : null}{isOwner(profile) && r.status !== 'matched' && <AppButton title="اعتماد كمطابقة" icon="checkmark" small variant="success" onPress={() => review(r.id, 'matched')} />}</Card>)}</KeyboardScreen></GradientScreen>;
}
const styles = themedStyles(() => StyleSheet.create({ heading:{color:colors.text,fontSize:font.md,fontWeight:'900',textAlign:'right',marginBottom:spacing.sm},hint:{color:colors.textSecondary,textAlign:'right',marginBottom:spacing.md},row:{marginBottom:spacing.sm},line:{flexDirection:'row',justifyContent:'space-between'},status:{fontWeight:'900'},meta:{color:colors.textSecondary,fontSize:font.sm,textAlign:'right',marginTop:4}}));
