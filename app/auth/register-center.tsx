// ============================================================
// تسجيل سنتر جديد (صاحب السنتر) — مع اختيار كود فريد ثابت
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card } from '../../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { checkAvailability, lookupCenterByCode, registerCenterOwner } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import {
  arabicError, isValidCenterCode, isValidEmail, isValidPhone,
  normalizeCenterCode, normalizePhone,
} from '../../src/lib/utils';
import { FormMessage } from '../../src/components/pickers';
import { colors, font, radius, spacing } from '../../src/theme';

type CodeState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function RegisterCenterScreen() {
  const { refresh } = useSession();
  const [centerName, setCenterName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState<CodeState>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // فحص توفر الكود لحظياً أثناء الكتابة
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const normalized = normalizeCenterCode(code);
    if (!normalized) { setCodeState('idle'); return; }
    if (!isValidCenterCode(normalized)) { setCodeState('invalid'); return; }
    setCodeState('checking');
    debounce.current = setTimeout(async () => {
      try {
        const found = await lookupCenterByCode(normalized);
        setCodeState(found ? 'taken' : 'available');
      } catch {
        setCodeState('idle');
      }
    }, 450);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [code]);

  const submit = async () => {
    setError(null);
    const normalizedCode = normalizeCenterCode(code);
    if (!centerName.trim()) return setError('أدخل اسم السنتر');
    if (!ownerName.trim()) return setError('أدخل اسم صاحب السنتر / المدرس');
    if (!isValidEmail(email)) return setError('أدخل بريداً إلكترونياً صحيحاً');
    if (!isValidPhone(phone)) return setError('أدخل رقم هاتف صحيح (8 أرقام على الأقل)');
    if (password.length < 6) return setError('كلمة المرور يجب ألا تقل عن 6 أحرف');
    if (!isValidCenterCode(normalizedCode)) {
      return setError('كود السنتر يجب أن يكون من 3 إلى 8 حروف أو أرقام بدون مسافات');
    }
    if (codeState === 'checking') return setError('انتظر لحظة حتى يكتمل فحص الكود...');
    if (codeState === 'taken') return setError('هذا الكود غير متاح — اختر كوداً آخر');

    setBusy(true);
    try {
      // فحص تكرار البريد/الهاتف قبل إنشاء الحساب لرسالة أوضح
      const availability = await checkAvailability(email, normalizePhone(phone));
      if (availability.email_taken) {
        setBusy(false);
        return setError('هذا البريد الإلكتروني مستخدم من قبل — سجّل دخولك أو استخدم بريداً آخر');
      }
      if (availability.phone_taken) {
        setBusy(false);
        return setError('رقم الهاتف مستخدم من قبل — لا يمكن تكراره حتى مع سنتر مختلف');
      }
      await registerCenterOwner({
        centerName: centerName.trim(),
        code: normalizedCode,
        ownerName: ownerName.trim(),
        email: email.trim(),
        phone: normalizePhone(phone),
        password,
      });
      await refresh();
      Alert.alert(
        'تم إنشاء حسابك بنجاح',
        `سنتر «${centerName.trim()}» جاهز الآن بكود «${normalizedCode}».\nشارك هذا الكود مع طلابك ليسجلوا به.`,
      );
    } catch (e) {
      setError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GradientScreen>
      <BackHeader title="إنشاء حساب سنتر جديد" subtitle="لأصحاب السناتر والمدرسين" />
      <KeyboardScreen>
        <Card>
          <AppInput
            label="اسم السنتر"
            icon="business"
            placeholder="مثال: سنتر المستقبل"
            value={centerName}
            onChangeText={setCenterName}
          />
          <AppInput
            label="اسم صاحب السنتر / المدرس"
            icon="person"
            placeholder="مثال: مستر أحمد محمد"
            value={ownerName}
            onChangeText={setOwnerName}
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
            label="رقم الهاتف"
            icon="call"
            placeholder="01xxxxxxxxx"
            value={phone}
            onChangeText={setPhone}
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

          {/* كود السنتر */}
          <AppInput
            label="كود السنتر (من 3 إلى 8 حروف أو أرقام)"
            icon="key"
            placeholder="مثال: MR أو 123 أو MRC7"
            value={code}
            onChangeText={(t) => setCode(t)}
            autoCapitalize="characters"
            autoCorrect={false}
            textAlign="left"
            style={{ writingDirection: 'ltr' }}
            rightElement={
              codeState === 'checking' ? (
                <Ionicons name="sync" size={18} color={colors.textMuted} style={{ marginHorizontal: spacing.md }} />
              ) : codeState === 'available' ? (
                <Ionicons name="checkmark-circle" size={20} color={colors.success} style={{ marginHorizontal: spacing.md }} />
              ) : codeState === 'taken' ? (
                <Ionicons name="close-circle" size={20} color={colors.danger} style={{ marginHorizontal: spacing.md }} />
              ) : null
            }
          />

          {/* حالة الكود */}
          {codeState === 'available' ? (
            <FormMessage type="success" text={`الكود «${normalizeCenterCode(code)}» متاح — سيصبح هوية سنترك الدائمة`} />
          ) : codeState === 'taken' ? (
            <FormMessage type="error" text="هذا الكود غير متاح — مسجل لسنتر آخر، اختر كوداً مختلفاً" />
          ) : codeState === 'invalid' ? (
            <FormMessage type="info" text="الكود: 3 إلى 8 حروف إنجليزية أو عربية أو أرقام — بدون مسافات أو رموز" />
          ) : null}

          <View style={styles.codeNote}>
            <Ionicons name="warning" size={18} color={colors.warning} />
            <Text style={styles.codeNoteText}>
              تنبيه مهم: كود السنتر <Text style={{ fontWeight: '900' }}>ثابت وفريد</Text> —
              لا يمكن تغييره بعد التسجيل، وسيطلبه طلابك عند تسجيلهم لأول مرة ليرتبط حسابهم بسنترك تلقائياً.
            </Text>
          </View>

          <FormMessage type="error" text={error} />
          <AppButton title="إنشاء الحساب" icon="rocket" onPress={submit} loading={busy} />
        </Card>

        <Text style={styles.footer}>
          بإنشائك الحساب ستحصل على اشتراك تجريبي شهري، وتظهر حالة اشتراكك في صفحة الإعدادات.
        </Text>
      </KeyboardScreen>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  codeNote: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warning + '44',
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  codeNoteText: {
    flex: 1, color: colors.warning, fontSize: font.sm, textAlign: 'right', lineHeight: 20,
  },
  footer: {
    color: colors.textMuted, fontSize: font.sm, textAlign: 'center',
    marginTop: spacing.xl, lineHeight: 20,
  },
});
