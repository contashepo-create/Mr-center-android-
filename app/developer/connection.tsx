// ============================================================
// مفاتيح الربط — خاصة بالمطور:
//  المصدر المركزي لكل العملاء هو عامل كلاود فلير (يُعدَّل من لوحة Cloudflare).
//  هذه الشاشة تعرض مصدر الاتصال الحالي، وتتيح للمطور إدخال مفاتيح يدوية
//  على جهازه فقط لغرض التجربة والاختبار قبل نشرها على كلاود فلير.
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, LoadingView, SectionTitle } from '../../src/components/controls';
import { DeveloperGate } from '../../src/components/DeveloperGate';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { FormMessage } from '../../src/components/pickers';
import {
  clearOverrideConfig,
  getConfigUrl,
  isValidSupabaseUrl,
  saveOverrideConfig,
} from '../../src/lib/config';
import { applyConfig, getActiveConfig, getLastRemoteConfig } from '../../src/lib/supabase';
import { getCurrentVersionLabel, isSelfUpdateSupported } from '../../src/lib/updater';
import { useSession } from '../../src/lib/session';
import { arabicError } from '../../src/lib/utils';
import { colors, font, spacing, themedStyles } from '../../src/theme';

export default function ConnectionManager() {
  const { profile, ready, reinitConnection, signOut, refresh } = useSession();
  const [tick, setTick] = useState(0);
  // لقطة حية لبيانات الاتصال (تتحدث بعد كل حفظ/مسح)
  const active = getActiveConfig();
  const remote = getLastRemoteConfig();
  void tick;

  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (active?.source === 'override') {
      setUrl(active.url);
      setAnonKey(active.anonKey);
    }
  }, [active?.source, active?.url, active?.anonKey]);

  const validate = (): boolean => {
    setError(null); setNote(null);
    if (!isValidSupabaseUrl(url)) {
      setError('رابط قاعدة البيانات غير صحيح — يجب أن يبدأ بـ https://');
      return false;
    }
    if (anonKey.trim().length < 20) {
      setError('المفتاح غير صحيح — انسخه كاملاً');
      return false;
    }
    return true;
  };

  const saveLocal = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      await saveOverrideConfig(url, anonKey);
      await applyConfig({ url: url.trim(), anonKey: anonKey.trim(), source: 'override' });
      // تبديل القاعدة يُبطل الجلسة القديمة — خروج إجباري ثم إعادة تهيئة نظيفة
      await signOut();
      const status = await reinitConnection();
      setTick((t) => t + 1);
      setNote(status === 'ready'
        ? '✅ تعمل الآن على هذا الجهاز (سُجل خروجك تلقائياً للأمان). اختبر، ثم انشر نفس المفاتيح في عامل كلاود فلير ليتبعها الجميع.'
        : 'حُفظت المفاتيح لكن تعذر الوصول لقاعدة البيانات — راجعها');
    } catch (e) {
      setError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const clearLocal = async () => {
    await clearOverrideConfig();
    await signOut();
    await reinitConnection();
    await refresh();
    setTick((t) => t + 1);
    setNote('تم مسح المفاتيح اليدوية — عاد التطبيق ليتبع كلاود فلير');
  };

  const sourceLabel: Record<string, string> = {
    override: 'مفاتيح يدوية (هذا الجهاز فقط)',
    cloudflare: '☁️ كلاود فلير (المصدر المركزي لكل العملاء)',
    cache: 'مخزنة مؤقتاً (لا يوجد اتصال بكلاود فلير الآن)',
    builtin: 'مدمجة داخل التطبيق',
  };

  if (!ready) {
    return (
      <GradientScreen>
        <LoadingView message="..." />
      </GradientScreen>
    );
  }
  if (profile?.role !== 'super_admin') return <DeveloperGate />;

  return (
    <GradientScreen>
      <BackHeader title="مفاتيح الربط" subtitle="خاص بالمطور فقط" />
      <KeyboardScreen>
        {/* المصدر المركزي: كلاود فلير */}
        <Card>
          <View style={styles.statusRow}>
            <Ionicons name="cloud" size={22} color={colors.cyan} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>المصدر المركزي: عامل كلاود فلير</Text>
              <Text style={styles.statusSub} numberOfLines={2}>
                {getConfigUrl() || '⚠️ لم يُضبط رابط العامل بعد — أضفه في app.json ← extra.configUrl'}
              </Text>
            </View>
          </View>
        </Card>

        {/* الاتصال الحالي */}
        <Card style={{ marginTop: spacing.md }}>
          <View style={styles.statusRow}>
            <Ionicons
              name={active ? 'cloud-done' : 'cloud-offline'}
              size={22}
              color={active ? colors.success : colors.danger}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>قاعدة البيانات الحالية</Text>
              <Text style={styles.statusSub} numberOfLines={1}>{active?.url ?? 'لا يوجد اتصال'}</Text>
              <Text style={styles.statusSource}>المصدر: {sourceLabel[active?.source ?? ''] ?? '—'}</Text>
            </View>
          </View>
        </Card>

        {/* معلومات التحديث الواردة من كلاود فلير */}
        <Card style={{ marginTop: spacing.md }}>
          <View style={styles.statusRow}>
            <Ionicons name="rocket" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>التحديث الذاتي</Text>
              <Text style={styles.statusSub}>
                إصدارك: {getCurrentVersionLabel()}
                {'\n'}أحدث إصدار معلن: {remote?.update?.latest_version ?? '—'} ({remote?.update?.version_code ?? '—'})
              </Text>
              <Text style={styles.statusSource}>
                {isSelfUpdateSupported()
                  ? 'التحديث الذاتي مفعّل على هذا الجهاز'
                  : 'التحديث الذاتي يعمل في نسخة APK المثبتة فقط (ليس في Expo Go)'}
              </Text>
            </View>
          </View>
        </Card>

        {/* مفاتيح يدوية للتجربة */}
        <SectionTitle title="مفاتيح يدوية للتجربة (جهازك فقط)" />
        <Card>
          <AppInput
            label="رابط قاعدة البيانات"
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
            label="المفتاح (anon / api key)"
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
          <FormMessage type="success" text={note} />
          <AppButton title="حفظ على جهازي واختبار" icon="flash" onPress={saveLocal} loading={busy} />
          <View style={{ height: spacing.sm }} />
          <AppButton title="العودة لتتبع كلاود فلير" variant="ghost" small onPress={clearLocal} />
        </Card>

        <Text style={styles.explain}>
          • تغيير قاعدة البيانات لكل العملاء يتم من لوحة Cloudflare (ملف العامل ← قسم DATABASE)
          وتتبعها كل الأجهزة تلقائياً عند أول تشغيل بعد التغيير.{'\n'}
          • المفاتيح اليدوية هنا تتفوق مؤقتاً على كلاود فلير — مفيدة لاختبار قاعدة جديدة قبل نشرها.
          على باقي الأجهزة لن يتغير شيء.{'\n'}
          • أدلة الإعداد الكاملة في مجلد cloudflare داخل المشروع.
        </Text>
      </KeyboardScreen>
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  statusSub: { color: colors.textSecondary, fontSize: font.sm, marginTop: 2, textAlign: 'right', lineHeight: 19 },
  statusSource: { color: colors.cyan, fontSize: font.xs, marginTop: 4, fontWeight: '700', textAlign: 'right' },
  explain: {
    color: colors.textMuted, fontSize: font.sm, lineHeight: 24,
    marginTop: spacing.xl, textAlign: 'right',
  },
}));
