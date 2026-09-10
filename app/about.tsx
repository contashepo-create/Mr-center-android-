// ============================================================
// صفحة «حول التطبيق» — المحتوى يديره المطور من لوحة التحكم
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, LoadingView } from '../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../src/components/layout';
import { ThemeToggleRow } from '../src/components/ThemeToggle';
import { fetchPublicConfig } from '../src/lib/supabase';
import type { PublicConfig } from '../src/lib/types';
import { colors, font, radius, spacing, themedStyles } from '../src/theme';

const APP_FEATURES: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }[] = [
  { icon: 'people', title: 'إدارة الطلاب', sub: 'تسجيل وبحث وفلاتر (نشط/موقوف/مؤرشف) وملف شامل لكل طالب' },
  { icon: 'albums', title: 'المجموعات والصفوف', sub: 'مجموعات بمدرسين وتسعير متنوع وعدّاد طلاب تلقائي' },
  { icon: 'checkmark-done', title: 'الحضور الذكي', sub: 'كشف جماعي يدوي + مسح باركود QR يومي آمن مضاد للنسخ' },
  { icon: 'scan', title: 'مسح باركود السنتر', sub: 'باركود ثابت قابل للطباعة لتسجيل الطلاب بسرعة' },
  { icon: 'wallet', title: 'المدفوعات والمستحقات', sub: 'تسعير شهري/أسبوعي/بالحصة + تحصيل جزئي وكشف حساب' },
  { icon: 'document-text', title: 'اختبارات إلكترونية', sub: 'اختياري وصح/خطأ ومقالي بمؤقت وتصحيح تلقائي ويدوي' },
  { icon: 'star', title: 'الدرجات والتقييم', sub: 'درجات يدوية بالشهر والصف مع متوسطات وتقارير' },
  { icon: 'stats-chart', title: 'تقارير شاملة PDF', sub: 'تقارير شهرية (حضور/تحصيل/درجات) + تقرير فردي كامل' },
  { icon: 'notifications', title: 'إشعارات فورية مجانية', sub: 'بث جماعي (الكل/صف/مجموعة/طالب) مع تتبع المقروء' },
  { icon: 'logo-whatsapp', title: 'تكامل واتساب', sub: 'تقارير حضور ومستحقات وتنبيهات مباشرة للطالب وولي الأمر' },
  { icon: 'briefcase', title: 'فريق عمل بصلاحيات', sub: 'مدرس/مدير/سكرتير — تفعيل بيدك و10 صلاحيات دقيقة لكل فرد' },
  { icon: 'school', title: 'مدرس خصوصي مستقل', sub: 'نفس الوظائف كاملة بلا فريق وحتى 200 طالب' },
  { icon: 'calendar', title: 'جدول أسبوعي', sub: 'مواعيد كل مجموعة + تنبيه تعارض المواعيد + PDF' },
  { icon: 'library', title: 'مكتبة السنتر', sub: 'لوحة شرف وملفات وروابط مهمة تظهر لطلابك' },
  { icon: 'list', title: 'استبيانات وطلبات', sub: 'آراء الطلاب بنتائج فورية + استفسارات بنظام رد وحالات' },
  { icon: 'card', title: 'باقات احترافية', sub: 'تجريبية 14 يوماً كاملة المزايا ثم شامل/متوسط/خصوصي بأسعار واضحة' },
  { icon: 'receipt', title: 'سجل عمليات ومعاملات', sub: 'من فعل ماذا ومتى + سجل طلبات الترقية والاشتراكات' },
  { icon: 'business', title: 'تعدد سناتر معزول', sub: 'كل سنتر ببياناته خلف خادم Supabase (RLS) بلا أي تداخل' },
  { icon: 'cloudy-night', title: 'وضع فاتح وداكن', sub: 'بدّل مظهر التطبيق كاملاً بضغطة ويُحفظ اختيارك' },
  { icon: 'download', title: 'تحديث ذاتي', sub: 'تحديثات مباشرة عبر كلاود فلير بلا متجر مع إشعار ما الجديد' },
  { icon: 'shield-checkmark', title: 'أمان على الخادم', sub: 'عزل RLS كامل + بريد موثوق + أرقام فريدة على مستوى النظام' },
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

            <Card style={{ marginTop: spacing.md }}>
              <Text style={styles.contactTitle}>مظهر التطبيق</Text>
              <View style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
                <ThemeToggleRow />
              </View>
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

const styles = themedStyles(() => StyleSheet.create({
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
}));
