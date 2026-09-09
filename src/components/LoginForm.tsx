// ============================================================
// نموذج تسجيل الدخول الموحد (مسئول / طالب) بتحقق من الصلاحية
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { loginWithEmail, sendPasswordReset } from '../lib/api';
import { getSupabase } from '../lib/supabase';
import { arabicError, isValidEmail } from '../lib/utils';
import type { Role } from '../lib/types';
import { colors, font, spacing } from '../theme';
import { AppButton, AppInput } from './controls';
import { FormMessage } from './pickers';

export function LoginForm({
  expectedRole,
  title,
  subtitle,
  icon,
}: {
  expectedRole: 'admin' | 'student';
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const { data: prof } = await getSupabase()
        .from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
      const role = (prof?.role ?? null) as Role | null;
      if (!prof) {
        await getSupabase().auth.signOut();
        setError('هذا الحساب غير مكتمل التسجيل — تواصل مع إدارة التطبيق');
        return;
      }
      if (prof.is_active === false) {
        await getSupabase().auth.signOut();
        setError('هذا الحساب موقوف — تواصل مع إدارة التطبيق');
        return;
      }
      if (expectedRole === 'admin' && role !== 'center_admin' && role !== 'super_admin') {
        await getSupabase().auth.signOut();
        setError('هذا الحساب حساب طالب — استخدم «دخول طالب» من الصفحة الرئيسية');
        return;
      }
      if (expectedRole === 'student' && role !== 'student') {
        await getSupabase().auth.signOut();
        setError('هذا الحساب حساب مسئول — استخدم «دخول مسئول السنتر»');
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
    try {
      await sendPasswordReset(email);
      Alert.alert('تم الإرسال', 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.');
    } catch (e) {
      Alert.alert('تعذر الإرسال', arabicError(e));
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
      <AppButton title="تسجيل الدخول" icon="log-in" onPress={submit} loading={busy} />

      <Text style={styles.forgot} onPress={forgot}>نسيت كلمة المرور؟</Text>

      <View style={styles.registerHint}>
        <Text style={styles.registerHintText}>ليس لديك حساب؟ </Text>
        <Text
          style={styles.registerHintLink}
          onPress={() => router.replace(expectedRole === 'admin' ? '/auth/register-center' : '/auth/register-student')}
        >
          {expectedRole === 'admin' ? 'أنشئ حساب سنتر' : 'سجّل كطالب جديد'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  registerHint: {
    flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xxl,
  },
  registerHintText: { color: colors.textSecondary, fontSize: font.md },
  registerHintLink: { color: colors.cyan, fontSize: font.md, fontWeight: '700' },
});
