// ============================================================
// إعدادات مسئول السنتر: بيانات السنتر + حالة الاشتراك + الحساب
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, ListItem, NoAccess, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { FormMessage } from '../../src/components/pickers';
import { fetchCenterSettings, fetchMyCenter, saveCenterSettings } from '../../src/lib/api';
import { isOwner } from '../../src/lib/staff';
import { useSession } from '../../src/lib/session';
import { fetchPublicConfig } from '../../src/lib/supabase';
import { exportCenterBackup } from '../../src/lib/backup';
import type { Center, CenterSettings, PublicConfig } from '../../src/lib/types';
import { planLabel } from '../../src/lib/billing';
import { arabicError, formatDate, isValidEmail, isValidPhone } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

export default function AdminSettingsScreen() {
  const { profile, subscription, signOut, refresh } = useSession();
  const [center, setCenter] = useState<Center | null>(null);
  const [cfg, setCfg] = useState<PublicConfig>({});
  const [settings, setSettings] = useState<CenterSettings>({
    whatsapp: '', contact_email: '', registration_open: true, archive_year: '',
  });
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => {
    if (profile?.center_id) {
      fetchMyCenter(profile.center_id).then(setCenter).catch(() => {});
      fetchCenterSettings(profile.center_id).then(setSettings).catch(() => {});
    }
    fetchPublicConfig().then(setCfg);
    void refresh();
  }, [profile?.center_id, refresh]);

  const saveSettings = async () => {
    if (!profile?.center_id) return;
    setSettingsMsg(null); setSettingsError(null);
    if (settings.whatsapp.trim() && !isValidPhone(settings.whatsapp)) {
      return setSettingsError('رقم الواتساب غير صحيح — اكتبه بكود الدولة بدون + (مثال: 2010xxxxxxxx)');
    }
    if (settings.contact_email.trim() && !isValidEmail(settings.contact_email)) {
      return setSettingsError('بريد التواصل غير صحيح');
    }
    setSaving(true);
    try {
      await saveCenterSettings(profile.center_id, settings);
      setSettingsMsg('تم حفظ إعدادات السنتر بنجاح');
    } catch (e) {
      setSettingsError(arabicError(e));
    } finally {
      setSaving(false);
    }
  };

  const backup = async (tag: string) => {
    if (!profile?.center_id) return;
    setBackupBusy(true);
    try {
      const name = await exportCenterBackup(profile.center_id, center?.name ?? 'center', tag);
      Alert.alert('تم إنشاء النسخة', `حُفظت نسخة «${name}» — شاركها واحتفظ بها خارج الهاتف.`);
    } catch (e) {
      Alert.alert('تعذر النسخ', arabicError(e));
    } finally {
      setBackupBusy(false);
    }
  };

  const shareCode = async () => {
    if (!center) return;
    try {
      await Share.share({
        message: `انضم إلى «${center.name}» على تطبيق Mr Center — كود السنتر: ${center.code}`,
      });
    } catch { /* ignore */ }
  };

  const confirmSignOut = () => {
    Alert.alert('تسجيل الخروج', 'هل تريد تسجيل الخروج؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: signOut },
    ]);
  };

  const subColor = subscription?.status === 'active' ? colors.success
    : subscription?.status === 'suspended' ? colors.danger : colors.warning;

  // الإعدادات والاشتراك شأن المالك — الفريق لديه حسابه في «المزيد»
  if (!isOwner(profile)) {
    return (
      <GradientScreen>
        <BackHeader title="الإعدادات والاشتراك" />
        <NoAccess />
      </GradientScreen>
    );
  }

  return (
    <GradientScreen>
      <BackHeader title="الإعدادات والاشتراك" />
      <KeyboardScreen>
        {/* بيانات السنتر */}
        <SectionTitle title="بيانات السنتر" />
        <Card>
          <Row label="اسم السنتر" value={center?.name ?? '—'} />
          <Row label="كود السنتر" value={center?.code ?? '—'} highlight />
          <Row label="اسم المسئول" value={center?.owner_name ?? '—'} />
          <Row label="تاريخ التسجيل" value={formatDate(center?.created_at)} />
          <View style={{ marginTop: spacing.md }}>
            <AppButton title="مشاركة كود السنتر" icon="share-social" variant="accent" small onPress={shareCode} />
          </View>
          <Text style={styles.note}>
            كود السنتر ثابت وفريد — يستخدمه طلابك عند التسجيل لأول مرة للانضمام لسنترك.
          </Text>
        </Card>

        {/* الاشتراك */}
        <SectionTitle title="اشتراكك" />
        <Card>
          <View style={styles.subHeader}>
            <Ionicons
              name={subscription?.status === 'active' ? 'checkmark-circle' : 'alert-circle'}
              size={26}
              color={subColor}
            />
            <Text style={[styles.subStatus, { color: subColor }]}>
              {subscription?.status === 'active' ? 'اشتراكك فعّال'
                : subscription?.status === 'suspended' ? 'اشتراكك موقوف'
                : subscription?.status === 'expired' ? 'اشتراكك منتهي' : 'غير معروف'}
            </Text>
          </View>
          {subscription?.plan_type ? (
            <Row label="نوع الباقة" value={planLabel(subscription.plan_type)} />
          ) : null}
          {subscription?.ends_on ? <Row label="تاريخ الانتهاء" value={formatDate(subscription.ends_on)} /> : null}
          {subscription?.days_left !== null && subscription?.days_left !== undefined ? (
            <Row
              label="الأيام المتبقية"
              value={subscription.days_left <= 0 ? 'انتهت المدة' : `${subscription.days_left} يوم`}
            />
          ) : null}
          <Text style={styles.note}>
            إدارة الاشتراكات وتجديدها تتم من قبل إدارة التطبيق.
            {cfg.contact_whatsapp ? ' تواصل معنا عبر واتساب من صفحة «حول التطبيق».' : ''}
          </Text>
          <View style={{ marginTop: spacing.sm }}>
            <AppButton title="الباقات والترقية" icon="card" small onPress={() => router.push('/subscription')} />
          </View>
          <View style={{ marginTop: spacing.sm }}>
            <AppButton title="حول التطبيق والتواصل" icon="information-circle" variant="outline" small onPress={() => router.push('/about')} />
          </View>
        </Card>

        {/* الإعدادات التشغيلية */}
        <SectionTitle title="الإعدادات التشغيلية" />
        <Card>
          <AppInput
            label="واتساب التواصل (بكود الدولة بدون +)"
            icon="logo-whatsapp"
            placeholder="2010xxxxxxxx"
            value={settings.whatsapp}
            onChangeText={(v) => setSettings((s) => ({ ...s, whatsapp: v }))}
            keyboardType="phone-pad"
            textAlign="left"
            style={{ writingDirection: 'ltr' }}
          />
          <AppInput
            label="بريد التواصل"
            icon="mail"
            placeholder="support@mail.com"
            value={settings.contact_email}
            onChangeText={(v) => setSettings((s) => ({ ...s, contact_email: v }))}
            autoCapitalize="none"
            keyboardType="email-address"
            textAlign="left"
            style={{ writingDirection: 'ltr' }}
          />
          <Pressable
            style={styles.toggleRow}
            onPress={() => setSettings((s) => ({ ...s, registration_open: !s.registration_open }))}
          >
            <Ionicons
              name={settings.registration_open ? 'checkbox' : 'square-outline'}
              size={22}
              color={settings.registration_open ? colors.success : colors.textMuted}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>فتح تسجيل الطلاب الجدد</Text>
              <Text style={styles.toggleSub}>
                {settings.registration_open ? 'الطلاب يستطيعون الانضمام بكود سنترك' : 'مغلق — لن يقبل أي تسجيل جديد'}
              </Text>
            </View>
          </Pressable>
          <AppInput
            label="السنة الدراسية/الأرشيفية (اختياري)"
            icon="archive"
            placeholder="مثال: 2026-2027"
            value={settings.archive_year}
            onChangeText={(v) => setSettings((s) => ({ ...s, archive_year: v }))}
          />
          <FormMessage type="error" text={settingsError} />
          <FormMessage type="success" text={settingsMsg} />
          <AppButton title="حفظ الإعدادات" icon="checkmark" small onPress={saveSettings} loading={saving} />
        </Card>

        {/* النسخ الاحتياطي */}
        <SectionTitle title="النسخ الاحتياطي" />
        <Card>
          <Text style={styles.note}>
            نسخة كاملة من كل بيانات سنترك (طلاب/حضور/مدفوعات/درجات/اختبارات...) في ملف واحد لمشاركته وحفظه خارج الهاتف.
          </Text>
          <View style={{ height: spacing.sm }} />
          <AppButton title="نسخة احتياطية الآن" icon="cloud-upload" small onPress={() => backup('backup')} loading={backupBusy} />
          <View style={{ height: spacing.sm }} />
          <AppButton title="أرشفة السنة (نسخة مؤرخة)" icon="archive" small variant="outline" onPress={() => backup('archive')} loading={backupBusy} />
        </Card>

        {/* الحساب */}
        <SectionTitle title="حسابك" />
        <ListItem
          title={profile?.full_name ?? ''}
          subtitle={profile?.email ?? ''}
          icon="person-circle"
          iconColor={colors.primary}
        />
        <ListItem
          title="تسجيل الخروج"
          icon="log-out"
          iconColor={colors.danger}
          onPress={confirmSignOut}
        />
      </KeyboardScreen>
    </GradientScreen>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && { color: colors.cyan, letterSpacing: 2 }]}>{value}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.textSecondary, fontSize: font.md },
  rowValue: { color: colors.text, fontSize: font.md, fontWeight: '800' },
  subHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.md,
  },
  subStatus: { fontSize: font.lg, fontWeight: '900' },
  note: {
    color: colors.textMuted, fontSize: font.xs, marginTop: spacing.md,
    textAlign: 'right', lineHeight: 18,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  toggleTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  toggleSub: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 2 },
}));
