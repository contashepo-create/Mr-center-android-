// ============================================================
// منطقة المطور (سوبر أدمن) — محمية بصلاحية super_admin فقط
// تُفتح من ضغطة مطوّلة على الشعار بشاشة الترحيب، وتتطلب حساب المطور
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, LoadingView } from '../../src/components/controls';
import { GradientScreen } from '../../src/components/layout';
import { FormMessage } from '../../src/components/pickers';
import { loginWithEmail } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { arabicError, isValidEmail } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

/** بوابة دخول المطور — لا تعرض أي إشارة لغير المخوّل */
function DeveloperGate() {
  const { session, profile, ready, signOut } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return <LoadingView message="..." />;

  // مسجل دخول لكن ليس مطوراً → رسالة عامة بلا كشف تفاصيل
  if (session && profile && profile.role !== 'super_admin') {
    return (
      <GradientScreen>
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={44} color={colors.textMuted} />
          <Text style={styles.deniedTitle}>منطقة محظورة</Text>
          <Text style={styles.deniedText}>هذه الصفحة غير متاحة لحسابك.</Text>
          <View style={{ height: spacing.xl }} />
          <AppButton title="العودة" variant="outline" small onPress={() => { void signOut(); router.replace('/'); }} />
        </View>
      </GradientScreen>
    );
  }

  const submit = async () => {
    setError(null);
    if (!isValidEmail(email)) return setError('أدخل بريداً إلكترونياً صحيحاً');
    if (password.length < 6) return setError('كلمة المرور قصيرة');
    setBusy(true);
    try {
      await loginWithEmail(email, password);
      // بعد الدخول: الحارس يعيد العرض، والصلاحية تُفحص أعلاه
    } catch (e) {
      setError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GradientScreen>
      <View style={styles.center}>
        <Pressable onPress={() => router.back()} style={styles.close}>
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>
        <View style={styles.lockWrap}>
          <Ionicons name="lock-closed" size={30} color={colors.primary} />
        </View>
        <Text style={styles.title}>بوابة خاصة</Text>
        <Text style={styles.sub}>هذه المنطقة مخصصة فقط لصاحبها</Text>
        <Card style={{ width: '100%', marginTop: spacing.xl }}>
          <AppInput
            label="البريد الإلكتروني"
            icon="mail"
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
            icon="key"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textAlign="left"
            style={{ writingDirection: 'ltr' }}
            onSubmitEditing={submit}
          />
          <FormMessage type="error" text={error} />
          <AppButton title="دخول" icon="log-in" onPress={submit} loading={busy} />
        </Card>
      </View>
    </GradientScreen>
  );
}

export default function DeveloperLayout() {
  const { profile, ready } = useSession();

  if (!ready) {
    return <GradientScreen><LoadingView message="..." /></GradientScreen>;
  }
  if (profile?.role !== 'super_admin') {
    return <DeveloperGate />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_left',
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  close: { position: 'absolute', top: spacing.xl, left: spacing.xl, padding: spacing.sm },
  lockWrap: {
    width: 72, height: 72, borderRadius: radius.full,
    backgroundColor: colors.primary + '22', borderWidth: 1, borderColor: colors.primary + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: font.xxl, fontWeight: '900', marginTop: spacing.lg },
  sub: { color: colors.textSecondary, fontSize: font.md, marginTop: spacing.sm },
  deniedTitle: { color: colors.text, fontSize: font.xl, fontWeight: '900', marginTop: spacing.lg },
  deniedText: { color: colors.textSecondary, fontSize: font.md, marginTop: spacing.sm },
});
