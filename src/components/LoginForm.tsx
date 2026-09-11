// ============================================================
// نموذج تسجيل الدخول الموحد (مسئول / طالب) بتحقق من الصلاحية
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { completePendingCenter, completePendingStudent, loginWithEmail, registerStaffAccount, sendPasswordReset } from '../lib/api';
import { clearPendingRegistration, loadPendingRegistration } from '../lib/pendingRegistration';
import { getSupabase } from '../lib/supabase';
import { arabicError, isValidEmail } from '../lib/utils';
import type { Role } from '../lib/types';
import { colors, font, spacing, themedStyles } from '../theme';
import { AppButton, AppInput } from './controls';
import { FormMessage } from './pickers';

export function LoginForm({
  expectedRole,
  title,
  subtitle,
  icon,
}: {
  expectedRole: 'admin' | 'student' | 'teacher';
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!isValidEmail(email)) {
      setError('أدخل بريداً إلكترونياً صحيحاً');
      return;
    }
    if (password.length < 6) {
      setError('كلمة المرور يجب ألا تقل عن 6 أحرف');
      return;
    }
    setBusy(true);
    try {
      const { user } = await loginWithEmail(email, password);
      // التحقق من الصلاحية الفعلية بعد الدخول
      let { data: prof } = await getSupabase()
        .from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
      // بلا ملف + يوجد تسجيل معلق لنفس البريد (أكّد بريده للتو) → نستكمل تسجيله تلقائياً
      if (!prof) {
        const pending = await loadPendingRegistration();
        if (pending && pending.email.trim().toLowerCase() === email.trim().toLowerCase()) {
          // نوع التسجيل المعلق يجب أن يطابق شاشة الدخول (شاشتا الإدارة تقبلان سنتر/فريق)
          const kindOk = ((expectedRole === 'admin' || expectedRole === 'teacher')
            && (pending.kind === 'center' || pending.kind === 'teacher'))
            || (expectedRole === 'student' && pending.kind === 'student');
          if (!kindOk) {
            await getSupabase().auth.signOut();
            setError(pending.kind === 'student'
              ? 'تسجيلك المعلق حساب طالب — سجّل الدخول من «دخول طالب» ليُستكمل'
              : 'تسجيلك المعلق حساب سنتر/فريق — سجّل الدخول من «دخول مسئول السنتر» أو «دخول فريق العمل» ليُستكمل');
            return;
          }
          try {
            if (pending.kind === 'center') {
              await completePendingCenter({
                centerName: pending.centerName, code: pending.code,
                ownerName: pending.ownerName, phone: pending.phone,
                kind: pending.centerKind ?? 'center',
              });
            } else if (pending.kind === 'student') {
              await completePendingStudent({
                centerId: pending.centerId, fullName: pending.fullName,
                phone: pending.phone, guardianPhone: pending.guardianPhone,
                gradeId: pending.gradeId ?? null, groupId: pending.groupId ?? null,
              });
            } else {
              await registerStaffAccount({
                centerId: pending.centerId, fullName: pending.fullName, phone: pending.phone,
                role: pending.staffRole ?? 'teacher',
              });
            }
            await clearPendingRegistration();
            const retry = await getSupabase()
              .from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
            prof = retry.data;
          } catch (resumeErr) {
            const m = String((resumeErr as any)?.message ?? '').toLowerCase();
            // نُبقي التسجيل المعلق دائماً عند الفشل (باستثناء نجاح متأخر)
            // حتى يعيد المستخدم الدخول فيُستكمل تلقائياً بعد إصلاح السبب
            if (m.includes('already_registered')) {
              // الملف اتعمل فعلاً (تسابق) — نمسح المعلق ونكمل فحص الصلاحية بالأسفل
              await clearPendingRegistration();
              const retry = await getSupabase()
                .from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
              prof = retry.data;
            }
            await getSupabase().auth.signOut();
            setError(arabicError(resumeErr) + ' — بيانات تسجيلك محفوظة، أعد الدخول بعد حل المشكلة وسيُستكمل تلقائياً');
            return;
          }
        }
      }
      const role = (prof?.role ?? null) as Role | null;
      if (!prof) {
        await getSupabase().auth.signOut();
        setError('هذا الحساب غير مكتمل التسجيل — أعد التسجيل من الصفحة الرئيسية أو تواصل مع إدارة التطبيق');
        return;
      }
      if (prof.is_active === false) {
        await getSupabase().auth.signOut();
        setError(role === 'teacher' || role === 'manager' || role === 'secretary'
          ? 'حسابك غير مفعّل بعد — تواصل مع صاحب السنتر ليفعّله ويحدد صلاحياتك'
          : 'هذا الحساب موقوف — تواصل مع إدارة التطبيق');
        return;
      }
      if (expectedRole === 'admin' && role !== 'center_admin' && role !== 'super_admin'
        && role !== 'teacher' && role !== 'manager' && role !== 'secretary') {
        await getSupabase().auth.signOut();
        setError('هذا الحساب حساب طالب — استخدم «دخول طالب» من الصفحة الرئيسية');
        return;
      }
      if (expectedRole === 'student' && role !== 'student') {
        await getSupabase().auth.signOut();
        setError('هذا الحساب حساب مسئول — استخدم «دخول مسئول السنتر»');
        return;
      }
      if (expectedRole === 'teacher' && role !== 'teacher' && role !== 'manager' && role !== 'secretary') {
        await getSupabase().auth.signOut();
        setError(role === 'student'
          ? 'هذا الحساب حساب طالب — استخدم «دخول طالب»'
          : 'هذا الحساب حساب مسئول سنتر — استخدم «دخول مسئول السنتر»');
        return;
      }
      // النجاح — حارس المسارات سيتولى التوجيه
    } catch (e) {
      setError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!isValidEmail(email)) {
      Alert.alert('نسيت كلمة المرور', 'اكتب بريدك الإلكتروني في الحقل أولاً ثم اضغط «نسيت كلمة المرور»');
      return;
    }
    setForgotBusy(true);
    try {
      await sendPasswordReset(email);
      Alert.alert('تم الإرسال', 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.');
    } catch (e) {
      Alert.alert('تعذر الإرسال', arabicError(e));
    } finally {
      setForgotBusy(false);
    }
  };

  const resendConfirmation = async () => {
    if (!isValidEmail(email)) return;
    setResendBusy(true);
    setResendMsg(null);
    try {
      const { error: rerr } = await getSupabase().auth.resend({ type: 'signup', email: email.trim().toLowerCase() });
      if (rerr) throw rerr;
      setResendMsg('أُعيد إرسال رابط التأكيد — افحص بريدك (ومجلد الرسائل المزعجة)');
    } catch (e) {
      setResendMsg(arabicError(e));
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <View>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={32} color={colors.cyan} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <View style={{ height: spacing.xl }} />
      <AppInput
        label="البريد الإلكتروني"
        icon="mail"
        placeholder="example@mail.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textAlign="left"
        style={{ writingDirection: 'ltr' }}
      />
      <AppInput
        label="كلمة المرور"
        icon="lock-closed"
        placeholder="••••••••"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!showPass}
        textAlign="left"
        style={{ writingDirection: 'ltr' }}
        rightElement={
          <Ionicons
            name={showPass ? 'eye-off' : 'eye'}
            size={20}
            color={colors.textMuted}
            style={{ marginHorizontal: spacing.md }}
            onPress={() => setShowPass((v) => !v)}
          />
        }
      />
      <FormMessage type="error" text={error} />
      {error && (error.includes('مؤكد') || error.includes('التأكيد')) ? (
        <View style={{ marginBottom: spacing.md }}>
          <AppButton
            title="إعادة إرسال رابط التأكيد"
            icon="mail"
            variant="outline"
            small
            onPress={resendConfirmation}
            loading={resendBusy}
          />
          {resendMsg ? <Text style={styles.resendMsg}>{resendMsg}</Text> : null}
        </View>
      ) : null}
      <AppButton title="تسجيل الدخول" icon="log-in" onPress={submit} loading={busy} />

      <Text style={[styles.forgot, forgotBusy && { opacity: 0.5 }]} onPress={forgotBusy ? undefined : forgot}>
        {forgotBusy ? 'جاري الإرسال...' : 'نسيت كلمة المرور؟'}
      </Text>

      <View style={styles.registerHint}>
        <Text style={styles.registerHintText}>ليس لديك حساب؟ </Text>
        <Text
          style={styles.registerHintLink}
          onPress={() => router.replace(
            expectedRole === 'admin' ? '/auth/register-center'
              : expectedRole === 'teacher' ? '/auth/register-teacher'
                : '/auth/register-student',
          )}
        >
          {expectedRole === 'admin' ? 'أنشئ حساب سنتر'
            : expectedRole === 'teacher' ? 'انضم كمدرس لسنتر'
              : 'سجّل كطالب جديد'}
        </Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  iconWrap: {
    width: 68, height: 68, borderRadius: 34, alignSelf: 'center',
    backgroundColor: colors.cyan + '22', borderWidth: 1, borderColor: colors.cyan + '55',
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl,
  },
  title: {
    color: colors.text, fontSize: font.xxl, fontWeight: '900',
    textAlign: 'center', marginTop: spacing.lg,
  },
  subtitle: {
    color: colors.textSecondary, fontSize: font.md,
    textAlign: 'center', marginTop: spacing.sm, lineHeight: 22,
  },
  forgot: {
    color: colors.cyan, fontSize: font.sm, fontWeight: '600',
    textAlign: 'center', marginTop: spacing.lg,
  },
  resendMsg: {
    color: colors.info, fontSize: font.sm, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20,
  },
  registerHint: {
    flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xxl,
  },
  registerHintText: { color: colors.textSecondary, fontSize: font.md },
  registerHintLink: { color: colors.cyan, fontSize: font.md, fontWeight: '700' },
}));
