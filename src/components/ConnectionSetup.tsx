// ============================================================
// شاشة ضبط الاتصال الأولى — تظهر فقط عند غياب مفاتيح الربط
// يدخلها المطور مرة واحدة ثم تُحفظ على الجهاز
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { isValidSupabaseUrl, saveOverrideConfig } from '../lib/config';
import { applyConfig } from '../lib/supabase';
import { useSession } from '../lib/session';
import { arabicError } from '../lib/utils';
import { colors, font, radius, spacing } from '../theme';
import { AppButton, AppInput, Card } from './controls';
import { FormMessage } from './pickers';

export function ConnectionSetup() {
  const { reinitConnection } = useSession();
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!isValidSupabaseUrl(url)) {
      setError('رابط المشروع غير صحيح — يجب أن يبدأ بـ https://');
      return;
    }
    if (anonKey.trim().length < 20) {
      setError('مفتاح anon غير صحيح — انسخه كاملاً من لوحة Supabase');
      return;
    }
    setBusy(true);
    try {
      await saveOverrideConfig(url, anonKey);
      await applyConfig({ url: url.trim(), anonKey: anonKey.trim(), source: 'override' });
      // اختبار فعلي للاتصال
      const status = await reinitConnection();
      if (status === 'ready') {
        Alert.alert('تم الاتصال بنجاح', 'تم حفظ مفاتيح الربط وسيعمل التطبيق الآن.');
      } else {
        setError('تم الحفظ لكن تعذر الوصول للمشروع — تحقق من المفاتيح');
      }
    } catch (e) {
      setError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Ionicons name="key" size={34} color={colors.cyan} />
      </View>
      <Text style={styles.title}>إعداد الاتصال لأول مرة</Text>
      <Text style={styles.sub}>
        تعذر الوصول لخادم الإعدادات (كلاود فلير) ولا توجد مفاتيح محفوظة.{'\n'}
        هذه الخطوة يقوم بها <Text style={{ color: colors.cyan, fontWeight: '800' }}>المطور</Text> —
        أدخل المفاتيح يدوياً مرة واحدة، أو تأكد من ضبط رابط عامل كلاود فلير والإنترنت يعمل.
      </Text>

      <Card style={{ marginTop: spacing.xl }}>
        <AppInput
          label="رابط مشروع Supabase (Project URL)"
          icon="link"
          placeholder="https://xxxxx.supabase.co"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          textAlign="left"
          style={{ writingDirection: 'ltr' }}
        />
        <AppInput
          label="مفتاح anon public"
          icon="lock-closed"
          placeholder="eyJhbGciOi..."
          value={anonKey}
          onChangeText={setAnonKey}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          textAlign="left"
          style={{ writingDirection: 'ltr' }}
        />
        <FormMessage type="error" text={error} />
        <AppButton title="حفظ واختبار الاتصال" icon="flash" onPress={save} loading={busy} />
      </Card>

      <Text style={styles.hint}>
        تجد المفاتيح في: Supabase ← Project Settings ← API{'\n'}
        (Project URL + anon public key)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: spacing.xxl * 1.5 },
  iconWrap: {
    width: 72, height: 72, borderRadius: radius.full,
    backgroundColor: colors.cyan + '22', borderWidth: 1, borderColor: colors.cyan + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: font.xxl, fontWeight: '900', marginTop: spacing.lg },
  sub: {
    color: colors.textSecondary, fontSize: font.md, textAlign: 'center',
    marginTop: spacing.md, lineHeight: 24,
  },
  hint: {
    color: colors.textMuted, fontSize: font.sm, textAlign: 'center',
    marginTop: spacing.xl, lineHeight: 22,
  },
});
