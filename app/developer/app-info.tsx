// ============================================================
// محرر صفحة «حول التطبيق» + الرسالة العامة (للمطور)
// يُحفظ في app_config.public_config فيقرؤه كل العملاء فوراً
// ============================================================

import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { AppButton, AppInput, Card, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { FormMessage } from '../../src/components/pickers';
import { devFetchPublicConfig, devSavePublicConfig } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { arabicError } from '../../src/lib/utils';
import { colors, font, spacing } from '../../src/theme';

export default function DevAppInfoScreen() {
  const { refresh } = useSession();
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    devFetchPublicConfig()
      .then((cfg) => {
        setTitle(cfg.about_title ?? '');
        setBody(cfg.about_body ?? '');
        setWhatsapp(cfg.contact_whatsapp ?? '');
        setEmail(cfg.contact_email ?? '');
        setMessage(cfg.global_message ?? '');
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const current = await devFetchPublicConfig();
      await devSavePublicConfig({
        ...current,
        about_title: title.trim(),
        about_body: body.trim(),
        contact_whatsapp: whatsapp.trim(),
        contact_email: email.trim(),
        global_message: message.trim(),
      });
      await refresh();
      Alert.alert('تم الحفظ', 'تم تحديث صفحة «حول التطبيق» وستظهر التغييرات لجميع العملاء فوراً.');
    } catch (e) {
      setError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GradientScreen>
      <BackHeader title="صفحة «حول التطبيق»" subtitle="المحتوى الظاهر لجميع المستخدمين" />
      <KeyboardScreen>
        {loaded ? (
          <>
            <SectionTitle title="محتوى الصفحة" />
            <Card>
              <AppInput
                label="اسم التطبيق / العنوان"
                icon="text"
                placeholder="Mr Center"
                value={title}
                onChangeText={setTitle}
              />
              <AppInput
                label="وصف التطبيق (نبذة تظهر في صفحة حول)"
                icon="document-text"
                placeholder="اكتب نبذة عن التطبيق..."
                value={body}
                onChangeText={setBody}
                multiline
                numberOfLines={5}
                style={{ minHeight: 120, textAlignVertical: 'top' }}
              />
            </Card>

            <SectionTitle title="بيانات التواصل" />
            <Card>
              <AppInput
                label="رقم واتساب التواصل (بكود الدولة بدون +)"
                icon="logo-whatsapp"
                placeholder="2010xxxxxxxx"
                value={whatsapp}
                onChangeText={setWhatsapp}
                keyboardType="phone-pad"
                textAlign="left"
                style={{ writingDirection: 'ltr' }}
              />
              <AppInput
                label="بريد التواصل"
                icon="mail"
                placeholder="support@mail.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                textAlign="left"
                style={{ writingDirection: 'ltr' }}
              />
            </Card>

            <SectionTitle title="رسالة عامة (اختياري)" />
            <Card>
              <AppInput
                label="رسالة تظهر في صفحة «حول التطبيق» للجميع"
                icon="megaphone"
                placeholder="مثال: سيتم تحديث النظام يوم الجمعة..."
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={3}
                style={{ minHeight: 80, textAlignVertical: 'top' }}
              />
              <FormMessage type="error" text={error} />
              <AppButton title="حفظ ونشر للجميع" icon="cloud-upload" onPress={save} loading={busy} />
            </Card>

            <Text style={styles.hint}>
              كل ما تحفظه هنا يُكتب في الإعدادات العامة بقاعدة البيانات ويقرؤه كل عميل
              عند فتح صفحة «حول التطبيق» — تحكم كامل من مكان واحد.
            </Text>
          </>
        ) : null}
      </KeyboardScreen>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: colors.textMuted, fontSize: font.sm, lineHeight: 22,
    marginTop: spacing.xl, textAlign: 'right',
  },
});
