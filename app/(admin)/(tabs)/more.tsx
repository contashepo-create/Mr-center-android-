// ============================================================
// قائمة «المزيد» لمسئول السنتر: الأقسام الإضافية + بيانات السنتر
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { AppButton, Card, ListItem, SectionTitle } from '../../../src/components/controls';
import { ThemeToggleRow } from '../../../src/components/ThemeToggle';
import { GradientScreen, KeyboardScreen } from '../../../src/components/layout';
import { fetchMyCenter } from '../../../src/lib/api';
import { isOwner } from '../../../src/lib/staff';
import { useSession } from '../../../src/lib/session';
import { encodeCenterQr } from '../../../src/lib/qr';
import type { Center } from '../../../src/lib/types';
import { arabicError } from '../../../src/lib/utils';
import { colors, font, gradients, radius, spacing, themedStyles } from '../../../src/theme';

export default function MoreScreen() {
  const { profile, signOut } = useSession();
  const [center, setCenter] = useState<Center | null>(null);
  const qrRef = useRef<{ toDataURL: (cb: (data: string) => void) => void } | null>(null);

  useEffect(() => {
    if (profile?.center_id) {
      fetchMyCenter(profile.center_id).then(setCenter).catch(() => {});
    }
  }, [profile?.center_id]);

  /** تصدير باركود السنتر كصورة للطباعة أو الإرسال */
  const shareQrImage = () => {
    if (!center) return;
    try {
      qrRef.current?.toDataURL(async (data: string) => {
        try {
          // اسم ملف لاتيني آمن (الأكواد قد تحوي عربية)
          const safeCode = center.code.replace(/[^A-Za-z0-9]/g, '') || 'center';
          const uri = `${FileSystem.documentDirectory}center-${safeCode}.png`;
          await FileSystem.writeAsStringAsync(uri, data, { encoding: FileSystem.EncodingType.Base64 });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `باركود ${center.name}` });
          } else {
            Alert.alert('تعذر المشاركة', 'المشاركة غير متاحة على هذا الجهاز');
          }
        } catch (e) {
          Alert.alert('تعذر المشاركة', arabicError(e));
        }
      });
    } catch (e) {
      Alert.alert('تعذر المشاركة', arabicError(e));
    }
  };

  const shareCode = async () => {
    if (!center) {
      Alert.alert('لحظة', 'جاري تحميل بيانات السنتر — حاول بعد ثوانٍ');
      return;
    }
    try {
      await Share.share({
        message: `انضم إلى «${center.name}» على تطبيق Mr Center — كود السنتر: ${center.code}\nحمّل التطبيق وسجّل كطالب بهذا الكود.`,
      });
    } catch { /* أُلغيت المشاركة */ }
  };

  const confirmSignOut = () => {
    Alert.alert('تسجيل الخروج', 'هل تريد تسجيل الخروج من حسابك؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <GradientScreen>
      <KeyboardScreen>
        {/* بطاقة السنتر وكود المشاركة */}
        <LinearGradient
          colors={gradients.primary}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.centerCard}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.centerLabel}>كود السنتر — شاركه مع طلابك</Text>
            <Text style={styles.centerCode}>{center?.code ?? '...'}</Text>
            <Text style={styles.centerName}>{center?.name ?? ''}</Text>
          </View>
          <Card style={styles.shareBtn} onPress={shareCode}>
            <Ionicons name="share-social" size={22} color={colors.primary} />
            <Text style={styles.shareText}>مشاركة</Text>
          </Card>
        </LinearGradient>

        {/* باركود السنتر للطباعة */}
        {center ? (
          <>
            <SectionTitle title="باركود السنتر" />
            <Card style={{ alignItems: 'center' }}>
              <View style={styles.qrBox}>
                {(() => {
                  const v = center.id && center.code ? encodeCenterQr(center.id, center.code, center.name) : '';
                  return v ? (
                    <QRCode
                      value={v}
                      size={190}
                      color="#0A0E1A"
                      backgroundColor="#FFFFFF"
                      getRef={(r: unknown) => { qrRef.current = r as { toDataURL: (cb: (data: string) => void) => void }; }}
                    />
                  ) : (
                    <Text style={styles.qrHint}>تعذر توليد الباركود</Text>
                  );
                })()}
              </View>
              <Text style={styles.qrName}>{center.name}</Text>
              <Text style={styles.qrCode}>الكود: {center.code}</Text>
              <Text style={styles.qrHint}>
                اطبعه وضعه على مكتبك — الطالب يمسحه من شاشة التسجيل بدل كتابة الكود
              </Text>
              <View style={{ height: spacing.md }} />
              <AppButton title="مشاركة كصورة" icon="share-social" small onPress={shareQrImage} />
            </Card>
          </>
        ) : null}

        <SectionTitle title="التقييم والمتابعة" />
        <ListItem title="الاختبارات" subtitle="إنشاء ونشر وتصحيح تلقائي ونتائج" icon="document-text" iconColor={colors.primary} onPress={() => router.push('/exams')} />
        <ListItem title="التقارير" subtitle="حضور وتحصيل ودرجات الشهر + PDF" icon="stats-chart" iconColor={colors.success} onPress={() => router.push('/reports')} />
        <ListItem title="الطلبات والاستفسارات" subtitle="رد على رسائل طلابك" icon="chatbubbles" iconColor={colors.warning} onPress={() => router.push('/inquiries')} />
        <ListItem title="الجدول الأسبوعي" subtitle="حصص كل يوم + تنبيه التعارض" icon="calendar" iconColor={colors.cyan} onPress={() => router.push('/schedule')} />

        <SectionTitle title="المحتوى" />
        <ListItem title="مكتبة السنتر" subtitle="لوحة شرف وملفات وروابط لطلابك" icon="library" iconColor={colors.warning} onPress={() => router.push('/library')} />
        <ListItem title="الاستبيانات" subtitle="آراء الطلاب ونتائجها" icon="list" iconColor={colors.info} onPress={() => router.push('/surveys')} />
        <ListItem title="الإعلانات" subtitle="أخبار وتنبيهات تظهر لطلابك فوراً" icon="megaphone" iconColor={colors.warning} onPress={() => router.push('/announcements')} />

        <SectionTitle title="الإدارة" />
        <ListItem title="إشعارات الطلاب" subtitle="بث جماعي فوري ومجاني داخل التطبيق" icon="notifications" iconColor={colors.primary} onPress={() => router.push('/notifications')} />
        {!isOwner(profile) ? null : (
          <ListItem title="إشعارات المطور" subtitle="تنبيهات خاصة بإدارتك" icon="shield-checkmark" iconColor={colors.warning} onPress={() => router.push('/dev-notices')} />
        )}
        <ListItem title="واتساب السنتر" subtitle="تنبيهات وتقارير ومستحقات مباشرة" icon="logo-whatsapp" iconColor={colors.success} onPress={() => router.push('/whatsapp')} />
        <ListItem title="المدفوعات والمستحقات" subtitle="توليد الاستحقاقات الشهرية وتسجيل الدفعات" icon="wallet" iconColor={colors.cyan} onPress={() => router.push('/payments')} />
        {isOwner(profile) ? <ListItem title="الحسابات" subtitle="إيرادات ومصروفات وقائمة مالية للسنتر" icon="calculator" iconColor={colors.success} onPress={() => router.push('/accounting')} /> : null}
        {(isOwner(profile) || profile?.role === 'secretary' || profile?.role === 'manager') ? <ListItem title="عهدة التحصيل" subtitle="تسليم ومطابقة المبالغ المحصلة يومياً" icon="cash" iconColor={colors.warning} onPress={() => router.push('/custody')} /> : null}
        <ListItem title="الصفوف الدراسية" subtitle="إدارة الصفوف المرتبطة بالمجموعات" icon="school" iconColor={colors.info} onPress={() => router.push('/grades-list')} />
        {!isOwner(profile) ? null : (
          <>
            <ListItem title="المدرسون" subtitle="تفعيل وصلاحيات ومجموعات المدرسين" icon="briefcase" iconColor={colors.primary} onPress={() => router.push('/teachers')} />
            <ListItem title="الباقات والترقية" subtitle="خطتك وطلبات الترقية للمطور" icon="card" iconColor={colors.success} onPress={() => router.push('/subscription')} />
            <ListItem title="سجل العمليات" subtitle="من فعل ماذا ومتى" icon="receipt" iconColor={colors.info} onPress={() => router.push('/activity')} />
            <ListItem title="الدعم الفني" subtitle="محادثة مباشرة مع مطور التطبيق" icon="chatbubbles" iconColor={colors.warning} onPress={() => router.push('/support')} />
            <ListItem title="الإعدادات والاشتراك" subtitle="بيانات السنتر وحالة اشتراكك" icon="settings" iconColor={colors.primary} onPress={() => router.push('/admin-settings')} />
          </>
        )}
        <ListItem title="دليل الاستخدام" subtitle="شرح كل قسم خطوة بخطوة" icon="book" iconColor={colors.textSecondary} onPress={() => router.push('/guide')} />

        <SectionTitle title="عام" />
        <ThemeToggleRow />
        <ListItem title="حول التطبيق" subtitle="معلومات التطبيق والتواصل" icon="information-circle" iconColor={colors.textSecondary} onPress={() => router.push('/about')} />
        <ListItem title="تسجيل الخروج" subtitle={profile?.email ?? ''} icon="log-out" iconColor={colors.danger} onPress={confirmSignOut} />
      </KeyboardScreen>
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  centerCard: {
    borderRadius: radius.lg, padding: spacing.xl, marginTop: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  centerLabel: { color: 'rgba(4,46,34,0.75)', fontSize: font.sm, fontWeight: '600' },
  centerCode: {
    color: '#052E22', fontSize: 34, fontWeight: '900', letterSpacing: 4, marginTop: 4,
  },
  centerName: { color: '#052E22', fontSize: font.md, fontWeight: '700', marginTop: 4 },
  shareBtn: { alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  shareText: { color: colors.primary, fontSize: font.xs, fontWeight: '800', marginTop: 4 },
  qrBox: { backgroundColor: '#FFFFFF', borderRadius: radius.md, padding: spacing.lg },
  qrName: { color: colors.text, fontSize: font.lg, fontWeight: '900', marginTop: spacing.md, textAlign: 'center' },
  qrCode: { color: colors.cyan, fontSize: font.md, fontWeight: '800', marginTop: 4, letterSpacing: 2 },
  qrHint: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },
}));
