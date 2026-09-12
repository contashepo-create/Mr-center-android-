import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card } from '../../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { FormMessage } from '../../src/components/pickers';
import { getInviteInfo, registerStaffByInvite } from '../../src/lib/api';
import { savePendingRegistration } from '../../src/lib/pendingRegistration';
import { arabicError, isValidEmail } from '../../src/lib/utils';
import { colors, font, spacing, themedStyles } from '../../src/theme';

/**
 * تسجيل فريق العمل يتم حصراً بدعوة من صاحب السنتر — لا يوجد تسجيل ذاتي.
 * التدفق: كود الدعوة ← بريد وكلمة مرور ← تأكيد البريد ← أول دخول يُكمل الملف.
 */
export default function RegisterTeacherScreen() {
  const [step, setStep] = useState<'code' | 'signup'>('code');
  const [code, setCode] = useState('');
  const [info, setInfo] = useState<{ center_name?: string; role?: string; name?: string } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkCode = async () => {
    setError(null);
    if (!code.trim()) { setError('أدخل كود الدعوة'); return; }
    setBusy(true);
    try {
      const res = await getInviteInfo(code);
      if (!res.found) { setError('كود الدعوة غير صحيح'); return; }
      if (res.suspended) { setError('السنتر موقوف حالياً — تواصل مع مطور التطبيق'); return; }
      if (!res.usable) { setError('هذا الكود مستخدم أو ملغى — اطلب كوداً جديداً من صاحب السنتر'); return; }
      setInfo(res);
      setStep('signup');
    } catch (e) { setError(arabicError(e)); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    setError(null);
    if (!isValidEmail(email)) { setError('أدخل بريداً إلكترونياً صحيحاً'); return; }
    if (password.length < 6) { setError('كلمة المرور يجب ألا تقل عن 6 أحرف'); return; }
    setBusy(true);
    try {
      const done = await registerStaffByInvite({ inviteCode: code, email, password });
      if (done) {
        Alert.alert('تم إنشاء حسابك', 'حسابك جاهز — سجّل دخولك من «دخول فريق العمل» بعد أن يفعّلك صاحب السنتر.', [
          { text: 'حسناً', onPress: () => router.replace('/') },
        ]);
      } else {
        await savePendingRegistration({ kind: 'teacher', email: email.trim().toLowerCase(), inviteCode: code.trim().toUpperCase() });
        Alert.alert('خطوة أخيرة', 'أرسلنا رسالة تأكيد إلى بريدك — أكّده ثم سجّل دخولك من «دخول فريق العمل» ليُستكمل ملفك تلقائياً.', [
          { text: 'حسناً', onPress: () => router.replace('/') },
        ]);
      }
    } catch (e) {
      const m = String((e as Error).message ?? '').toLowerCase();
      if (m.includes('email_taken')) setError('هذا البريد مستخدم بالفعل — سجّل دخولك من «دخول فريق العمل»');
      else setError(arabicError(e));
    } finally { setBusy(false); }
  };

  return <GradientScreen><BackHeader title="حساب فريق العمل" /><KeyboardScreen>
    <View style={styles.hero}><Ionicons name="shield-checkmark" size={58} color={colors.primary} />
      <Text style={styles.title}>تسجيل حصراً بكود دعوة</Text>
      <Text style={styles.sub}>لا يمكن للمدرس أو السكرتير إنشاء حساب من تلقاء نفسه — صاحب السنتر هو من يولّد كود الدعوة.</Text></View>
    {step === 'code' ? (
      <Card>
        <AppInput label="كود الدعوة" value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="6 خانات من صاحب السنتر" autoCapitalize="characters" style={{ writingDirection: 'ltr', textAlign: 'center', letterSpacing: 3 }} />
        <FormMessage type="error" text={error} />
        <AppButton title="تحقق من الكود" icon="search" onPress={checkCode} loading={busy} />
      </Card>
    ) : (
      <Card>
        <Text style={styles.body}>{info?.name} — {info?.role === 'secretary' ? 'سكرتير' : 'مدرس'} في «{info?.center_name}»</Text>
        <AppInput label="البريد الإلكتروني" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={{ writingDirection: 'ltr' }} />
        <AppInput label="كلمة المرور" value={password} onChangeText={setPassword} secureTextEntry style={{ writingDirection: 'ltr' }} />
        <FormMessage type="error" text={error} />
        <AppButton title="إنشاء الحساب" icon="person-add" onPress={submit} loading={busy} />
        <View style={{ height: spacing.sm }} />
        <AppButton title="رجوع" variant="ghost" small onPress={() => { setStep('code'); setInfo(null); }} />
      </Card>
    )}
    <Card><Text style={styles.body}>بعد التسجيل يبقى حسابك خاملاً حتى يفعّلك صاحب السنتر ويحدد صلاحياتك ومجموعاتك. ستدخل من «دخول فريق العمل».</Text>
      <AppButton title="تسجيل دخول فريق العمل" icon="log-in" variant="outline" onPress={() => router.push('/auth/login-teacher')} />
    </Card>
  </KeyboardScreen></GradientScreen>;
}
const styles = themedStyles(() => StyleSheet.create({ hero:{alignItems:'center',paddingVertical:spacing.xl},title:{color:colors.text,fontSize:font.xl,fontWeight:'900',textAlign:'center',marginTop:spacing.md},sub:{color:colors.textSecondary,fontSize:font.md,textAlign:'center',marginTop:spacing.sm,lineHeight:24},body:{color:colors.text,fontSize:font.md,textAlign:'right',lineHeight:26,marginBottom:spacing.lg,fontWeight:'700'}}));
