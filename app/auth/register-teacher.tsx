// ============================================================
// تسجيل مدرس تابع لسنتر: الكود ← البيانات ← حساب خامل حتى يفعّله المسئول
// (المدرس لا يسجّل نفسه صلاحيات — التفعيل والصلاحيات بيد صاحب السنتر)
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card } from '../../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { FormMessage, OptionPicker } from '../../src/components/pickers';
import { checkAvailability, lookupCenterByCode, registerStaffAccount } from '../../src/lib/api';
import { savePendingRegistration } from '../../src/lib/pendingRegistration';
import { getSupabase } from '../../src/lib/supabase';
import type { CenterLookup } from '../../src/lib/types';
import {
  arabicError, isAllowedEmailDomain, isValidEmail, isValidPhone,
  normalizeCenterCode, normalizePhone,
} from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

export default function RegisterTeacherScreen() {
  const [step, setStep] = useState<1 | 2>(1);
  const [code, setCode] = useState('');
  const [center, setCenter] = useState<CenterLookup | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [staffRole, setStaffRole] = useState<'teacher' | 'manager' | 'secretary'>('teacher');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifyCode = async () => {
    setError(null);
    const normalized = normalizeCenterCode(code);
    if (!normalized) return setError('أدخل كود السنتر أولاً');
    setBusy(true);
    try {
      const found = await lookupCenterByCode(normalized);
      if (!found) {
        setError('كود السنتر غير صحيح — اطلب الكود من صاحب السنتر');
        return;
      }
      // ملاحظة: الدالة القديمة على الخادم لا ترجع status — الغياب يُعامل كفعّال
      if (found.status && found.status !== 'active') {
        setError('هذا السنتر موقوف حالياً — تواصل مع إدارته');
        return;
      }
      setCenter(found);
      setStep(2);
    } catch (e) {
      setError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!fullName.trim()) return setError('أدخل اسمك الكامل');
    if (!isValidEmail(email)) return setError('أدخل بريداً إلكترونياً صحيحاً');
    if (!isAllowedEmailDomain(email)) {
      return setError('استخدم بريداً من موفر معروف (Gmail / Yahoo / Outlook / iCloud...)');
    }
    if (!isValidPhone(phone)) return setError('أدخل رقم هاتف صحيح (8 أرقام على الأقل)');
    if (password.length < 6) return setError('كلمة المرور يجب ألا تقل عن 6 أحرف');
    if (!center) return setError('أدخل كود السنتر أولاً');

    setBusy(true);
    try {
      const availability = await checkAvailability(email, normalizePhone(phone));
      if (availability.email_taken) {
        setBusy(false);
        return setError('هذا البريد مستخدم من قبل — سجّل دخولك أو استخدم بريداً آخر');
      }
      if (availability.phone_taken) {
        setBusy(false);
        return setError('رقم الهاتف مستخدم من قبل');
      }
      const sb = getSupabase();
      const { data, error } = await sb.auth.signUp({
        email: email.trim().toLowerCase(), password,
      });
      if (error) throw error;
      if (!data.user) throw new Error('email_taken');
      // تأكيد البريد أولاً (نفس نظام الطلاب) ثم الدخول للتفعيل
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) {
        try { await sb.auth.signOut(); } catch { /* تجاهل */ }
        await savePendingRegistration({
          kind: 'teacher',
          email: email.trim().toLowerCase(),
          centerId: center.id,
          fullName: fullName.trim(),
          phone: normalizePhone(phone),
          staffRole,
        });
        setBusy(false);
        Alert.alert(
          'أكّد بريدك الإلكتروني',
          'أرسلنا رابط تأكيد إلى بريدك. افتحه من نفس الجهاز ثم سجّل دخولك — وسيطلب حسابك تفعيل صاحب السنتر.',
          [{ text: 'تسجيل الدخول', onPress: () => router.push('/auth/login-admin') }],
        );
        return;
      }
      await registerStaffAccount({
        centerId: center.id, fullName: fullName.trim(), phone: normalizePhone(phone), role: staffRole,
      });
      try { await sb.auth.signOut(); } catch { /* تجاهل */ }
      Alert.alert(
        'تم إرسال طلبك',
        `حسابك (${staffRole === 'teacher' ? 'مدرس' : staffRole === 'manager' ? 'مدير' : 'سكرتير'}) في «${center.name}» خامل الآن.\nتواصل مع صاحب السنتر ليفعّله ويحدد صلاحياتك.`,
        [{ text: 'حسناً', onPress: () => router.replace('/') }],
      );
    } catch (e) {
      // مسار انعدام الجلسة عولج أعلاه مع حفظ معلق — هنا أي خطأ حقيقي فقط
      setError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GradientScreen>
      <BackHeader title="انضمام لفريق سنتر" subtitle={`الخطوة ${step} من 2`} />
      <KeyboardScreen>
        {step === 1 ? (
          <Card>
            <View style={styles.stepIcon}>
              <Ionicons name="briefcase" size={30} color={colors.primary} />
            </View>
            <Text style={styles.stepTitle}>كود السنتر الذي تعمل به</Text>
            <Text style={styles.stepSub}>
              اطلب الكود من صاحب السنتر — حسابك سيبقى خاملاً حتى يفعّله ويحدد صلاحياتك
            </Text>
            <View style={{ height: spacing.lg }} />
            <AppInput
              label="كود السنتر"
              icon="key"
              placeholder="مثال: MRC7"
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              textAlign="left"
              style={{ writingDirection: 'ltr' }}
            />
            <FormMessage type="error" text={error} />
            <AppButton title="تحقق من الكود" icon="search" onPress={verifyCode} loading={busy} />
          </Card>
        ) : (
          <>
            <Card style={styles.centerCard}>
              <View style={styles.centerRow}>
                <Ionicons name="business" size={22} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.centerName}>{center?.name}</Text>
                  <Text style={styles.centerOwner}>المسئول: {center?.owner_name || '—'}</Text>
                </View>
                <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              </View>
            </Card>
            <Card style={{ marginTop: spacing.md }}>
              <OptionPicker
                label="صفتك في السنتر"
                icon="briefcase"
                value={staffRole}
                options={[
                  { value: 'teacher', label: 'مدرس (مجموعات ومواد)' },
                  { value: 'manager', label: 'مدير السنتر' },
                  { value: 'secretary', label: 'سكرتير' },
                ]}
                onChange={(v) => setStaffRole(v as 'teacher' | 'manager' | 'secretary')}
              />
              <AppInput label="الاسم الكامل" icon="person" placeholder="مثال: أحمد محمد" value={fullName} onChangeText={setFullName} />
              <AppInput
                label="البريد الإلكتروني" icon="mail" placeholder="example@mail.com"
                value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
                keyboardType="email-address" textAlign="left" style={{ writingDirection: 'ltr' }}
              />
              <AppInput
                label="رقم الهاتف" icon="call" placeholder="01xxxxxxxxx"
                value={phone} onChangeText={setPhone} keyboardType="phone-pad"
                textAlign="left" style={{ writingDirection: 'ltr' }}
              />
              <AppInput
                label="كلمة المرور" icon="lock-closed" placeholder="6 أحرف على الأقل"
                value={password} onChangeText={setPassword} secureTextEntry
                textAlign="left" style={{ writingDirection: 'ltr' }}
              />
              <FormMessage type="error" text={error} />
              <AppButton title="إرسال طلب الانضمام" icon="send" onPress={submit} loading={busy} />
              <View style={{ height: spacing.sm }} />
              <AppButton title="تغيير الكود" variant="ghost" small onPress={() => { setStep(1); setError(null); }} />
            </Card>
          </>
        )}
      </KeyboardScreen>
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  stepIcon: {
    width: 64, height: 64, borderRadius: 32, alignSelf: 'center',
    backgroundColor: colors.primary + '22', borderWidth: 1, borderColor: colors.primary + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  stepTitle: {
    color: colors.text, fontSize: font.xl, fontWeight: '900',
    textAlign: 'center', marginTop: spacing.lg,
  },
  stepSub: {
    color: colors.textSecondary, fontSize: font.sm,
    textAlign: 'center', marginTop: spacing.sm, lineHeight: 20,
  },
  centerCard: { borderColor: colors.success + '55', backgroundColor: colors.successBg },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  centerName: { color: colors.text, fontSize: font.lg, fontWeight: '800', textAlign: 'right' },
  centerOwner: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 2 },
}));
