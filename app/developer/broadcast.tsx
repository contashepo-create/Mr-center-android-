// ============================================================
// بث المطور: خمس قنوات مخصصة، مع اختيار المستلمين خادمياً لا من الهاتف.
// ============================================================

import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, SectionTitle } from '../../src/components/controls';
import { DeveloperGate } from '../../src/components/DeveloperGate';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { FormMessage, OptionPicker } from '../../src/components/pickers';
import { devFetchCenters, developerBroadcastNotification, type CenterWithSub } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { CenterBroadcastDelivery, DeveloperBroadcastChannel } from '../../src/lib/types';
import { arabicError } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

type StaffScope = 'all_centers' | 'one_center';

const channels: { value: DeveloperBroadcastChannel; label: string; description: string }[] = [
  { value: 'center', label: '١. سنتر محدد', description: 'صاحب السنتر فقط أو صاحبه وطلابه.' },
  { value: 'all_owners', label: '٢. أصحاب السناتر كلها', description: 'رسالة لأصحاب كل السناتر فقط.' },
  { value: 'all_owners_students', label: '٣. السناتر وطلابها كلها', description: 'رسالة لأصحاب السناتر وكل الطلاب.' },
  { value: 'all_students', label: '٤. الطلاب كلها فقط', description: 'لا تصل لأصحاب السناتر أو الموظفين.' },
  { value: 'staff', label: '٥. موظفو السناتر', description: 'مدرسون ومديرون وسكرتارية، في الكل أو سنتر معين.' },
];

export default function DevBroadcastScreen() {
  const { profile, ready } = useSession();
  const [centers, setCenters] = useState<CenterWithSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<DeveloperBroadcastChannel>('center');
  const [centerId, setCenterId] = useState<string | null>(null);
  const [centerDelivery, setCenterDelivery] = useState<CenterBroadcastDelivery>('owners');
  const [staffScope, setStaffScope] = useState<StaffScope>('all_centers');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await devFetchCenters();
      setCenters(rows);
      setCenterId((current) => current || rows[0]?.id || null);
    } catch (error) {
      setFormError(arabicError(error));
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const needsCenter = channel === 'center' || (channel === 'staff' && staffScope === 'one_center');
  const selectedCenter = useMemo(() => centers.find((center) => center.id === centerId), [centers, centerId]);
  const recipients = useMemo(() => {
    const name = selectedCenter?.name ? `سنتر «${selectedCenter.name}»` : 'السنتر المختار';
    if (channel === 'center') return centerDelivery === 'owners' ? `صاحب ${name} فقط` : `صاحب ${name} وطلابه`;
    if (channel === 'all_owners') return 'أصحاب كل السناتر';
    if (channel === 'all_owners_students') return 'أصحاب كل السناتر وكل الطلاب';
    if (channel === 'all_students') return 'كل الطلاب فقط';
    return staffScope === 'all_centers' ? 'الموظفون النشطون في كل السناتر' : `الموظفون النشطون في ${name}`;
  }, [channel, centerDelivery, staffScope, selectedCenter]);

  if (!ready) return <GradientScreen><LoadingView message="جاري التحميل..." /></GradientScreen>;
  if (profile?.role !== 'super_admin') return <DeveloperGate />;

  const send = async () => {
    setFormError(null);
    if (!title.trim()) return setFormError('اكتب عنوان الإشعار');
    if (!body.trim()) return setFormError('اكتب نص الإشعار');
    if (needsCenter && !centerId) return setFormError('اختر السنتر المستهدف');
    setBusy(true);
    try {
      const result = await developerBroadcastNotification({
        channel,
        title,
        body,
        centerId: needsCenter ? centerId : null,
        centerDelivery: channel === 'center' ? centerDelivery : null,
      });
      setTitle(''); setBody('');
      Alert.alert('تم البث', `استهدف ${result.recipient_accounts} حساباً في ${result.centers} سنتر.`);
    } catch (error) {
      setFormError(arabicError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GradientScreen>
      <BackHeader title="بث وإشعارات العملاء" subtitle="اختر واحدة من القنوات الخمس بدقة" />
      {loading ? <LoadingView message="جاري تحميل السناتر..." /> : <KeyboardScreen>
        <Card>
          <SectionTitle title="قناة البث" />
          <OptionPicker
            label="الإرسال إلى" icon="megaphone" value={channel}
            options={channels.map(({ value, label }) => ({ value, label }))}
            onChange={(value) => setChannel(value as DeveloperBroadcastChannel)}
          />
          <Text style={styles.description}>{channels.find((item) => item.value === channel)?.description}</Text>

          {channel === 'staff' ? <OptionPicker
            label="نطاق الموظفين" icon="people" value={staffScope}
            options={[{ value: 'all_centers', label: 'الموظفون في كل السناتر' }, { value: 'one_center', label: 'داخل سنتر محدد' }]}
            onChange={(value) => setStaffScope(value as StaffScope)}
          /> : null}

          {needsCenter ? <OptionPicker
            label="السنتر" icon="business" value={centerId}
            options={centers.map((center) => ({ value: center.id, label: `${center.name} (${center.code})` }))}
            onChange={setCenterId} placeholder="اختر السنتر..."
          /> : null}

          {channel === 'center' ? <OptionPicker
            label="مستلمو رسالة السنتر" icon="person" value={centerDelivery}
            options={[{ value: 'owners', label: 'صاحب السنتر فقط' }, { value: 'owners_students', label: 'صاحب السنتر وطلابه' }]}
            onChange={(value) => setCenterDelivery(value as CenterBroadcastDelivery)}
          /> : null}

          <View style={styles.recipientBox}><Text style={styles.recipientLabel}>المستلمون</Text><Text style={styles.recipientText}>{recipients}</Text></View>
          <AppInput label="العنوان" icon="text" placeholder="مثال: تحديث مهم الليلة" value={title} onChangeText={setTitle} maxLength={180} />
          <AppInput label="النص" icon="document-text" placeholder="اكتب تنبيهك..." value={body} onChangeText={setBody} multiline numberOfLines={4} maxLength={5000} style={{ minHeight: 100, textAlignVertical: 'top' }} />
          <FormMessage type="error" text={formError} />
          <AppButton title="بث الآن" icon="send" onPress={send} loading={busy} disabled={!title.trim() || !body.trim() || (needsCenter && !centerId)} />
        </Card>
        <SectionTitle title="القنوات المتاحة" />
        {channels.map((item) => <Card key={item.value} style={styles.channelCard}><Text style={styles.channelTitle}>{item.label}</Text><Text style={styles.channelText}>{item.description}</Text></Card>)}
        {centers.length === 0 ? <EmptyState icon="business-outline" title="لا توجد سناتر" message="تظهر هنا السناتر المسجلة عند وجودها." /> : null}
      </KeyboardScreen>}
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  description: { color: colors.textSecondary, fontSize: font.sm, lineHeight: 21, textAlign: 'right', marginTop: -spacing.sm, marginBottom: spacing.md },
  recipientBox: { backgroundColor: colors.successBg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.success + '55' },
  recipientLabel: { color: colors.success, fontSize: font.xs, fontWeight: '800', textAlign: 'right' },
  recipientText: { color: colors.text, fontSize: font.sm, fontWeight: '700', textAlign: 'right', marginTop: 4 },
  channelCard: { marginBottom: spacing.sm },
  channelTitle: { color: colors.text, fontSize: font.sm, fontWeight: '800', textAlign: 'right' },
  channelText: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: 3, lineHeight: 18 },
}));
