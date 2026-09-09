// ============================================================
// تسجيل طالب جديد — الخطوة ١: كود السنتر، الخطوة ٢: البيانات
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card } from '../../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { checkAvailability, lookupCenterByCode, registerStudent } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { CenterLookup } from '../../src/lib/types';
import {
  arabicError, isValidEmail, isValidPhone, normalizeCenterCode, normalizePhone,
} from '../../src/lib/utils';
import { FormMessage } from '../../src/components/pickers';
import { colors, font, radius, spacing } from '../../src/theme';

export default function RegisterStudentScreen() {
  const { refresh } = useSession();
  const [step, setStep] = useState<1 | 2>(1);
  const [code, setCode] = useState('');
  const [center, setCenter] = useState<CenterLookup | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [password, setPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // الخطوة ١: التحقق من كود السنتر
  const verifyCode = async () => {
    setError(null);
    const normalized = normalizeCenterCode(code);
    if (!normalized) return setError('أدخل كود السنتر أولاً');
    setBusy(true);
    try {
      const found = await lookupCenterByCode(normalized);
      if (!found) {
        setError('كود السنتر غير صحيح — تأكد من الكود مع إدارة السنتر');
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

  // الخطوة ٢: إنشاء الحساب
  const submit = async () => {
    setError(null);
    if (!fullName.trim()) return setError('أدخل اسمك الكامل');
    if (!isValidEmail(email)) return setError('أدخل بريداً إلكترونياً صحيحاً');
    if (!isValidPhone(phone)) return setError('أدخل رقم هاتف صحيح (8 أرقام على الأقل)');
    if (guardianPhone.trim() && !isValidPhone(guardianPhone)) return setError('رقم ولي الأمر غير صحيح');
    if (password.length < 6) return setError('كلمة المرور يجب ألا تقل عن 6 أحرف');
    if (!center) return setError('أدخل كود السنتر أولاً');

    setBusy(true);
    try {
      const availability = await checkAvailability(email, normalizePhone(phone));
      if (availability.email_taken) {
        setBusy(false);
        return setError('هذا البريد الإلكتروني مستخدم من قبل — سجّل دخولك أو استخدم بريداً آخر');
      }
      if (availability.phone_taken) {
        setBusy(false);
        return setError('رقم الهاتف مستخدم من قبل — لا يمكن تكراره حتى مع سنتر مختلف');
      }
      await registerStudent({
        centerId: center.id,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: normalizePhone(phone),
        guardianPhone: normalizePhone(guardianPhone),
        password,
      });
      await refresh();
      Alert.alert(
        'تم إنشاء حسابك بنجاح',
        `أصبح حسابك مرتبطاً بسنتر «${center.name}» تلقائياً.\nلن تحتاج كود السنتر مرة أخرى عند تسجيل الدخول.`,
      );
    } catch (e) {
      setError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GradientScreen>
      <BackHeader title="تسجيل طالب جديد" subtitle={`الخطوة ${step} من 2`} />
      <KeyboardScreen>
        {step === 1 ? (
          <Card>
            <View style={styles.stepIcon}>
              <Ionicons name="key" size={30} color={colors.cyan} />
            </View>
            <Text style={styles.stepTitle}>أدخل كود السنتر</Text>
            <Text style={styles.stepSub}>
              احصل على الكود من إدارة سنترك — هو مفتاح ربط حسابك بسنترك ومجموعاتك
            </Text>
            <View style={{ height: spacing.lg }} />
            <AppInput
              label="كود السنتر"
              icon="shield-checkmark"
              placeholder="مثال: MR أو MRC7"
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
            {/* بطاقة السنتر المؤكد */}
            <Card style={styles.centerCard}>
              <View style={styles.centerRow}>
                <View style={styles.centerIcon}>
                  <Ionicons name="business" size={22} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.centerName}>{center?.name}</Text>
                  <Text style={styles.centerOwner}>المسئول: {center?.owner_name || '—'}</Text>
                </View>
                <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              </View>
              <Text style={styles.centerHint}>
                تأكد أن هذا هو سنترك قبل المتابعة — سيرتبط حسابك به نهائياً
              </Text>
            </Card>

            <Card style={{ marginTop: spacing.md }}>
              <AppInput
                label="الاسم الكامل"
                icon="person"
                placeholder="مثال: أحمد محمد علي"
                value={fullName}
                onChangeText={setFullName}
              />
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
                label="رقم هاتفك"
                icon="call"
                placeholder="01xxxxxxxxx"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                textAlign="left"
                style={{ writingDirection: 'ltr' }}
              />
              <AppInput
                label="رقم هاتف ولي الأمر (اختياري)"
                icon="people"
                placeholder="01xxxxxxxxx"
                value={guardianPhone}
                onChangeText={setGuardianPhone}
                keyboardType="phone-pad"
                textAlign="left"
                style={{ writingDirection: 'ltr' }}
              />
              <AppInput
                label="كلمة المرور"
                icon="lock-closed"
                placeholder="6 أحرف على الأقل"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textAlign="left"
                style={{ writingDirection: 'ltr' }}
              />

              <View style={styles.uniqueNote}>
                <Ionicons name="information-circle" size={18} color={colors.info} />
                <Text style={styles.uniqueNoteText}>
                  بريدك ورقم هاتفك فريدان على مستوى النظام كله — لا يمكن استخدامهما في حساب آخر.
                  وعند تسجيل الدخول لاحقاً لن تحتاج كود السنتر مرة أخرى.
                </Text>
              </View>

              <FormMessage type="error" text={error} />
              <AppButton title="إنشاء حسابي" icon="rocket" onPress={submit} loading={busy} />
              <View style={{ height: spacing.sm }} />
              <AppButton title="تغيير كود السنتر" variant="ghost" small onPress={() => { setStep(1); setError(null); }} />
            </Card>
          </>
        )}
      </KeyboardScreen>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  stepIcon: {
    width: 64, height: 64, borderRadius: 32, alignSelf: 'center',
    backgroundColor: colors.cyan + '22', borderWidth: 1, borderColor: colors.cyan + '55',
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
  centerIcon: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.success + '22', alignItems: 'center', justifyContent: 'center',
  },
  centerName: { color: colors.text, fontSize: font.lg, fontWeight: '800', textAlign: 'right' },
  centerOwner: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 2 },
  centerHint: {
    color: colors.textSecondary, fontSize: font.xs, marginTop: spacing.md,
    textAlign: 'right', lineHeight: 18,
  },
  uniqueNote: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.infoBg, borderWidth: 1, borderColor: colors.info + '44',
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  uniqueNoteText: {
    flex: 1, color: colors.info, fontSize: font.sm, textAlign: 'right', lineHeight: 20,
  },
});
