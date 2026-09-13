// ============================================================
// صفحة «حول التطبيق» — المحتوى يديره المطور من لوحة التحكم
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, LoadingView } from '../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../src/components/layout';
import { FormMessage, OptionPicker } from '../src/components/pickers';
import { ThemeToggleRow } from '../src/components/ThemeToggle';
import { lookupComplaint, submitComplaint, type ComplaintLookup } from '../src/lib/complaints';
import { fetchPublicConfig } from '../src/lib/supabase';
import type { PublicConfig } from '../src/lib/types';
import { arabicError, isValidPhone, normalizePhone } from '../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../src/theme';

const COMPLAINT_SUBJECTS = ['مشكلة تقنية', 'اقتراح تحسين', 'شكوى من خدمة', 'استفسار عام', 'أخرى'];

function complaintStatusLabel(status?: string): { text: string; color: string } {
  if (status === 'open') return { text: 'قيد المراجعة', color: colors.warning };
  if (status === 'in_progress') return { text: 'جارٍ المعالجة', color: colors.info };
  if (status === 'closed') return { text: 'تمت المعالجة', color: colors.success };
  return { text: status ?? '—', color: colors.textMuted };
}

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

  // قسم الشكاوي والاقتراحات — متاح للزوار بلا تسجيل
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cSubject, setCSubject] = useState(COMPLAINT_SUBJECTS[0]);
  const [cBody, setCBody] = useState('');
  const [cBusy, setCBusy] = useState(false);
  const [cError, setCError] = useState<string | null>(null);
  const [cTicket, setCTicket] = useState<string | null>(null);

  const submitComplaintForm = async () => {
    setCError(null); setCTicket(null);
    if (!isValidPhone(cPhone)) return setCError('أدخل رقم هاتف صحيحاً (8 إلى 15 رقماً) لتتمكن من تتبع شكواك.');
    if (!cBody.trim()) return setCError('اكتب نص الشكوى أو الاقتراح أولاً.');
    setCBusy(true);
    try {
      const ticket = await submitComplaint({ phone: normalizePhone(cPhone), name: cName, subject: cSubject, body: cBody });
      setCTicket(ticket);
      setCBody('');
    } catch (e) {
      setCError(arabicError(e));
    } finally {
      setCBusy(false);
    }
  };

  const [tPhone, setTPhone] = useState('');
  const [tTicket, setTTicket] = useState('');
  const [tBusy, setTBusy] = useState(false);
  const [tError, setTError] = useState<string | null>(null);
  const [tResult, setTResult] = useState<ComplaintLookup | null>(null);

  const trackComplaint = async () => {
    setTError(null); setTResult(null);
    if (!isValidPhone(tPhone)) return setTError('أدخل رقم الهاتف المسجل في الشكوى.');
    if (!tTicket.trim()) return setTError('أدخل رقم الشكوى.');
    setTBusy(true);
    try {
      const result = await lookupComplaint(tPhone, tTicket);
      setTResult(result);
      if (!result.found) setTError('لم نجد شكوى بهذا الرقم والهاتف — تأكد من صحتهما.');
    } catch (e) {
      setTError(arabicError(e));
    } finally {
      setTBusy(false);
    }
  };

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

            <Card style={{ marginTop: spacing.md }}>
              <Text style={styles.contactTitle}>الشكاوي والاقتراحات</Text>
              <Text style={styles.featSub}>
                واجهت مشكلة أو لديك اقتراح؟ أرسله من هنا — متاح للجميع حتى بلا تسجيل دخول.
                بعد الإرسال ستحصل على رقم شكوى، احتفظ به لتتبع حالتها لاحقاً.
              </Text>
              <View style={{ marginTop: spacing.md }}>
                <AppInput label="الاسم (اختياري)" icon="person" placeholder="اسمك" value={cName} onChangeText={setCName} />
                <AppInput
                  label="رقم الهاتف"
                  icon="call"
                  placeholder="01xxxxxxxxx"
                  value={cPhone}
                  onChangeText={setCPhone}
                  keyboardType="phone-pad"
                  textAlign="left"
                  style={{ writingDirection: 'ltr' }}
                />
                <OptionPicker
                  label="الموضوع"
                  icon="pricetag"
                  value={cSubject}
                  options={COMPLAINT_SUBJECTS.map((s) => ({ value: s, label: s }))}
                  onChange={(v) => setCSubject(v ?? COMPLAINT_SUBJECTS[0])}
                />
                <AppInput
                  label="نص الشكوى أو الاقتراح"
                  icon="chatbubble-ellipses"
                  placeholder="اكتب التفاصيل هنا..."
                  value={cBody}
                  onChangeText={setCBody}
                  multiline
                  numberOfLines={4}
                  style={{ minHeight: 96, textAlignVertical: 'top' }}
                />
                <FormMessage type="error" text={cError} />
                {cTicket ? (
                  <FormMessage type="success" text={`تم استلام شكواك — رقم التتبع: ${cTicket}. احتفظ به جيداً.`} />
                ) : null}
                <AppButton title="إرسال" icon="send" small onPress={submitComplaintForm} loading={cBusy} />
              </View>

              <View style={{ height: spacing.lg }} />
              <Text style={styles.contactTitle}>تتبع شكوى سابقة</Text>
              <View style={{ marginTop: spacing.md }}>
                <AppInput
                  label="رقم الهاتف المسجل بالشكوى"
                  icon="call"
                  placeholder="01xxxxxxxxx"
                  value={tPhone}
                  onChangeText={setTPhone}
                  keyboardType="phone-pad"
                  textAlign="left"
                  style={{ writingDirection: 'ltr' }}
                />
                <AppInput
                  label="رقم الشكوى (مثال: MR-26-000123)"
                  icon="ticket"
                  placeholder="MR-26-000123"
                  value={tTicket}
                  onChangeText={setTTicket}
                  autoCapitalize="characters"
                  textAlign="left"
                  style={{ writingDirection: 'ltr' }}
                />
                <FormMessage type="error" text={tError} />
                {tResult?.found ? (
                  <View style={styles.trackResult}>
                    <Text style={styles.trackRow}>الموضوع: {tResult.subject ?? '—'}</Text>
                    <View style={styles.trackStatusRow}>
                      <Text style={styles.trackRow}>الحالة:</Text>
                      <Text style={[styles.trackStatus, { color: complaintStatusLabel(tResult.status).color }]}>
                        {complaintStatusLabel(tResult.status).text}
                      </Text>
                    </View>
                  </View>
                ) : null}
                <AppButton title="بحث" icon="search" variant="outline" small onPress={trackComplaint} loading={tBusy} />
              </View>
            </Card>

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
  trackResult: {
    backgroundColor: colors.successBg, borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.md, gap: spacing.xs,
  },
  trackRow: { color: colors.text, fontSize: font.sm, fontWeight: '700', textAlign: 'right' },
  trackStatusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  trackStatus: { fontSize: font.sm, fontWeight: '900' },
}));
