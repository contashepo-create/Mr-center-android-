// ============================================================
// صفحة «حول التطبيق» — المحتوى يديره المطور من لوحة التحكم
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, LoadingView } from '../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../src/components/layout';
import { fetchPublicConfig } from '../src/lib/supabase';
import type { PublicConfig } from '../src/lib/types';
import { colors, font, radius, spacing } from '../src/theme';

const APP_FEATURES: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }[] = [
  { icon: 'people', title: 'إدارة الطلاب والمجموعات', sub: 'تسجيل وبحث وفلاتر وحالات وعضويات متعددة' },
  { icon: 'checkmark-done', title: 'الحضور الذكي', sub: 'تسجيل جماعي + مسح باركود QR يومي آمن' },
  { icon: 'wallet', title: 'المدفوعات والمستحقات', sub: 'تسعير شهري/أسبوعي/بالحصة + تحصيل وتقارير' },
  { icon: 'document-text', title: 'اختبارات إلكترونية', sub: 'اختياري وصح/خطأ ومقالي بتصحيح تلقائي ويدوي' },
  { icon: 'stats-chart', title: 'تقارير شاملة', sub: 'حضور وتحصيل ودرجات + تقرير فردي PDF' },
  { icon: 'notifications', title: 'إشعارات فورية مجانية', sub: 'بث جماعي + تنبيه قبل الحصة بساعة' },
  { icon: 'logo-whatsapp', title: 'تكامل واتساب', sub: 'تقارير وتنبيهات ومستحقات مباشرة' },
  { icon: 'briefcase', title: 'فريق العمل', sub: 'مدرسون ومديرون وسكرتارية بصلاحيات دقيقة' },
  { icon: 'calendar', title: 'جدول أسبوعي', sub: 'مواعيد كل مجموعة + تنبيه تعارض المواعيد' },
  { icon: 'library', title: 'مكتبة السنتر', sub: 'لوحة شرف وملفات وروابط واستبيانات' },
  { icon: 'shield-checkmark', title: 'عزل كامل', sub: 'كل سنتر معزول ببياناته + اشتراكات وباقات' },
  { icon: 'qr-code', title: 'باركود السنتر', sub: 'للطباعة والمشاركة لتسجيل الطلاب' },
];

export default function AboutScreen() {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);

  useEffect(() => {
    fetchPublicConfig().then(setCfg).catch(() => setCfg({}));
  }, []);

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <GradientScreen>
      <BackHeader title="حول التطبيق" />
      <KeyboardScreen>
        {cfg === null ? (
          <LoadingView message="جاري تحميل المحتوى..." />
        ) : (
          <>
            <Card style={{ alignItems: 'center' }}>
              <View style={styles.logoBadge}>
                <Ionicons name="school" size={30} color={colors.cyan} />
              </View>
              <Text style={styles.title}>{cfg.about_title || 'Mr Center'}</Text>
              <Text style={styles.version}>الإصدار {version}</Text>
              <Text style={styles.body}>
                {cfg.about_body || 'تطبيق إدارة السناتر التعليمية.'}
              </Text>
            </Card>

            {cfg.global_message ? (
              <Card style={styles.msgCard}>
                <View style={styles.msgRow}>
                  <Ionicons name="megaphone" size={20} color={colors.warning} />
                  <Text style={styles.msgTitle}>رسالة من إدارة التطبيق</Text>
                </View>
                <Text style={styles.msgBody}>{cfg.global_message}</Text>
              </Card>
            ) : null}

            <Card style={{ marginTop: spacing.md }}>
              <Text style={styles.contactTitle}>مميزات التطبيق</Text>
              {APP_FEATURES.map((f) => (
                <View key={f.title} style={styles.featRow}>
                  <Ionicons name={f.icon} size={18} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featTitle}>{f.title}</Text>
                    <Text style={styles.featSub}>{f.sub}</Text>
                  </View>
                </View>
              ))}
            </Card>

            {(cfg.contact_whatsapp || cfg.contact_email) ? (
              <Card style={{ marginTop: spacing.md }}>
                <Text style={styles.contactTitle}>تواصل معنا</Text>
                {cfg.contact_whatsapp ? (
                  <View style={{ marginTop: spacing.md }}>
                    <AppButton
                      title="واتساب"
                      icon="logo-whatsapp"
                      variant="success"
                      small
                      onPress={() => Linking.openURL(`https://wa.me/${cfg.contact_whatsapp}`)}
                    />
                  </View>
                ) : null}
                {cfg.contact_email ? (
                  <View style={{ marginTop: spacing.sm }}>
                    <AppButton
                      title={cfg.contact_email}
                      icon="mail"
                      variant="outline"
                      small
                      onPress={() => Linking.openURL(`mailto:${cfg.contact_email}`)}
                    />
                  </View>
                ) : null}
              </Card>
            ) : null}

            <Text style={styles.copyright}>
              نظام متعدد السناتر بعزل كامل للبيانات — جميع الحقوق محفوظة © {new Date().getFullYear()}
            </Text>
          </>
        )}
      </KeyboardScreen>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  logoBadge: {
    width: 64, height: 64, borderRadius: radius.lg,
    backgroundColor: colors.cyan + '22', borderWidth: 1, borderColor: colors.cyan + '55',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: font.xxl, fontWeight: '900' },
  version: { color: colors.textMuted, fontSize: font.sm, marginTop: spacing.xs },
  body: {
    color: colors.textSecondary, fontSize: font.md, textAlign: 'center',
    marginTop: spacing.lg, lineHeight: 26,
  },
  msgCard: { marginTop: spacing.md, borderColor: colors.warning + '44' },
  msgRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  msgTitle: { color: colors.warning, fontSize: font.md, fontWeight: '800' },
  msgBody: { color: colors.textSecondary, fontSize: font.md, marginTop: spacing.sm, lineHeight: 24, textAlign: 'right' },
  contactTitle: { color: colors.text, fontSize: font.lg, fontWeight: '800', textAlign: 'right' },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  featTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  featSub: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 2 },
  copyright: {
    color: colors.textMuted, fontSize: font.xs, textAlign: 'center',
    marginTop: spacing.xxl, lineHeight: 18,
  },
});
