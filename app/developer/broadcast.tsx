// ============================================================
// بث المطور: إشعار باسم «المطور» يصل للجميع أو لأصحاب السناتر
// أو لسنتر معين — مع تتبع من قرأه
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, SectionTitle } from '../../src/components/controls';
import { DeveloperGate } from '../../src/components/DeveloperGate';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage, OptionPicker } from '../../src/components/pickers';
import {
  deleteNotification, devFetchCenters, fetchNotificationReadCounts, logActivity,
  sendNotification, type CenterWithSub,
} from '../../src/lib/api';
import { groupBroadcasts, type BroadcastGroup } from '../../src/lib/broadcast';
import { getSupabase } from '../../src/lib/supabase';
import { useSession } from '../../src/lib/session';
import type { AppNotification, NotificationAudience } from '../../src/lib/types';
import { arabicError, formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

type Target = 'all_students' | 'all_owners' | 'one_center';

export default function DevBroadcastScreen() {
  const { profile, ready } = useSession();
  const [centers, setCenters] = useState<CenterWithSub[]>([]);
  const [sent, setSent] = useState<(AppNotification & { reads: number; centerName: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const [target, setTarget] = useState<Target>('all_students');
  const [centerId, setCenterId] = useState<string | null>(null);
  const [toOwners, setToOwners] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BroadcastGroup | null>(null);

  const load = useCallback(async () => {
    try {
      const cs = await devFetchCenters();
      setCenters(cs.filter((c) => c.status === 'active'));
      // بثوث المطور فقط (تُختم بـ «المطور: ») — لا إشعارات السناتر الداخلية
      const { data } = await getSupabase().from('app_notifications').select('*')
        .like('title', 'المطور: %')
        .order('created_at', { ascending: false }).limit(120);
      const rows = (data ?? []) as AppNotification[];
      const readsMap = await fetchNotificationReadCounts(rows.map((n) => n.id)).catch(() => new Map());
      const withMeta = rows.map((n) => ({
        ...n,
        reads: readsMap.get(n.id) ?? 0,
        centerName: cs.find((c) => c.id === n.center_id)?.name ?? '—',
      }));
      setSent(withMeta);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!ready) {
    return <GradientScreen><LoadingView message="..." /></GradientScreen>;
  }
  if (profile?.role !== 'super_admin') return <DeveloperGate />;

  const send = async () => {
    setFormError(null);
    if (!title.trim()) return setFormError('اكتب عنوان الإشعار');
    if (!body.trim()) return setFormError('اكتب نص الإشعار');
    let targets: { centerId: string; audience: NotificationAudience }[] = [];
    if (target === 'all_students') {
      targets = centers.map((c) => ({ centerId: c.id, audience: 'all' }));
    } else if (target === 'all_owners') {
      targets = centers.map((c) => ({ centerId: c.id, audience: 'owners' }));
    } else {
      if (!centerId) return setFormError('اختر السنتر المستهدف');
      targets = [{ centerId, audience: toOwners ? 'owners' : 'all' }];
    }
    if (targets.length === 0) return setFormError('لا توجد سناتر فعّالة للإرسال إليها');
    setBusy(true);
    try {
      for (const t of targets) {
        await sendNotification({
          centerId: t.centerId, audience: t.audience,
          title: `المطور: ${title.trim()}`, body: body.trim(),
        });
        await logActivity(t.centerId, 'broadcast_sent', `بث المطور: ${title.trim()}`);
      }
      setTitle(''); setBody('');
      await load();
      const who = target === 'all_students' ? `طلاب ${targets.length} سنتر`
        : target === 'all_owners' ? `أصحاب ${targets.length} سنتر`
        : 'السنتر المختار';
      Alert.alert('تم البث', `وصل إشعار المطور إلى ${who}`);
    } catch (e) {
      setFormError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const grouped = groupBroadcasts(sent);

  const confirmDeleteGroup = (g: BroadcastGroup) => {
    Alert.alert('حذف البث', `حذف «${g.title}» من ${g.centers.length} سنتر نهائياً؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف الكل', style: 'destructive',
        onPress: async () => {
          try {
            for (const c of g.centers) await deleteNotification(c.notifId);
            setPreview(null);
            await load();
          } catch (e) { Alert.alert('تعذر الحذف', arabicError(e)); }
        },
      },
    ]);
  };

  return (
    <GradientScreen>
      <BackHeader title="بث المطور" subtitle="إشعار للجميع باسمك" />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={(g) => g.key}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <Card>
                <OptionPicker
                  label="الإرسال إلى" icon="megaphone" value={target}
                  options={[
                    { value: 'all_students', label: `كل الطلاب (${centers.length} سنتر)` },
                    { value: 'all_owners', label: `أصحاب السناتر فقط (${centers.length})` },
                    { value: 'one_center', label: 'سنتر معين' },
                  ]}
                  onChange={(v) => setTarget(v as Target)}
                />
                {target === 'one_center' ? (
                  <>
                    <OptionPicker
                      label="السنتر" icon="business" value={centerId}
                      options={centers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
                      onChange={setCenterId} placeholder="اختر السنتر..."
                    />
                    <Pressable style={styles.toggle} onPress={() => setToOwners((v) => !v)}>
                      <Ionicons
                        name={toOwners ? 'checkbox' : 'square-outline'}
                        size={22} color={toOwners ? colors.success : colors.textMuted}
                      />
                      <Text style={styles.toggleText}>لصاحب السنتر فقط (بدل كل أعضائه)</Text>
                    </Pressable>
                  </>
                ) : null}
                <AppInput label="العنوان" icon="text" placeholder="مثال: تحديث مهم الليلة" value={title} onChangeText={setTitle} />
                <AppInput
                  label="النص" icon="document-text" placeholder="اكتب تنبيهك..."
                  value={body} onChangeText={setBody} multiline numberOfLines={4}
                  style={{ minHeight: 100, textAlignVertical: 'top' }}
                />
                <FormMessage type="error" text={formError} />
                <AppButton title="بث الآن" icon="send" onPress={send} loading={busy} />
              </Card>
              <SectionTitle title={`آخر البثوث (${grouped.length})`} />
            </>
          }
          ListEmptyComponent={
            <EmptyState icon="megaphone-outline" title="لا بثوث بعد" message="ابث أول تنبيه وسيصل باسم المطور" />
          }
          renderItem={({ item }) => {
            const totalReads = item.centers.reduce((s, c) => s + c.reads, 0);
            return (
              <Pressable onPress={() => setPreview(item)}>
                <Card style={styles.row}>
                  <View style={styles.rowHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.rowMeta}>
                        وصل {item.centers.length} سنتر · {item.audience === 'owners' ? 'الأصحاب' : 'الأعضاء'} · {formatDate(item.created_at)}
                      </Text>
                    </View>
                    <View style={styles.readsPill}>
                      <Ionicons name="eye" size={13} color={colors.success} />
                      <Text style={styles.readsText}>{totalReads} قرأ</Text>
                    </View>
                    <Ionicons name="expand" size={16} color={colors.info} />
                  </View>
                  <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text>
                </Card>
              </Pressable>
            );
          }}
        />
      )}

      {/* معاينة البث الكاملة + القراءة لكل سنتر */}
      <Modal visible={!!preview} transparent animationType="slide" onRequestClose={() => setPreview(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle} numberOfLines={2}>{preview?.title}</Text>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.previewBody}>{preview?.body}</Text>
              <SectionTitle title={`الوصول والقراءة (${preview?.centers.length ?? 0} سنتر)`} />
              {(preview?.centers ?? []).map((c) => (
                <View key={c.notifId} style={styles.centerRow}>
                  <Text style={styles.centerName} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.centerReads}>{c.reads} قرأ</Text>
                </View>
              ))}
            </ScrollView>
            <View style={{ height: spacing.md }} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <AppButton title="حذف البث كله" icon="trash" variant="danger" small onPress={() => preview && confirmDeleteGroup(preview)} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton title="إغلاق" variant="ghost" small onPress={() => setPreview(null)} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  toggleText: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  row: { marginBottom: spacing.sm },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  rowMeta: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  readsPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.successBg, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  readsText: { color: colors.success, fontSize: font.xs, fontWeight: '800' },
  rowBody: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: spacing.sm, lineHeight: 20 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bgSoft, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xl, paddingBottom: spacing.xxl * 1.5,
    borderWidth: 1, borderColor: colors.border, maxHeight: '92%',
  },
  modalTitle: {
    color: colors.text, fontSize: font.lg, fontWeight: '900',
    textAlign: 'center', marginBottom: spacing.md,
  },
  previewBody: { color: colors.text, fontSize: font.md, textAlign: 'right', lineHeight: 26 },
  centerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  centerName: { flex: 1, color: colors.text, fontSize: font.sm, fontWeight: '700', textAlign: 'right' },
  centerReads: { color: colors.success, fontSize: font.sm, fontWeight: '800' },
}));
