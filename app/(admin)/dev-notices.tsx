// ============================================================
// صندوق رسائل المطور: يعرض RPC خادمي رسائل المالك أو الموظف النشط فقط.
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, LoadingView, NoAccess, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { fetchMyDeveloperNotifications, markDeveloperNotificationRead } from '../../src/lib/api';
import { isOwner, isStaff } from '../../src/lib/staff';
import { useSession } from '../../src/lib/session';
import type { MyNotification } from '../../src/lib/types';
import { formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

export default function DevNoticesScreen() {
  const { profile } = useSession();
  const [items, setItems] = useState<MyNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchMyDeveloperNotifications());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!isOwner(profile) && !isStaff(profile)) {
    return <GradientScreen><BackHeader title="إشعارات المطور" /><NoAccess /></GradientScreen>;
  }

  const open = async (notification: MyNotification) => {
    const willOpen = openId !== notification.id;
    setOpenId(willOpen ? notification.id : null);
    if (willOpen && !notification.is_read) {
      try {
        await markDeveloperNotificationRead(notification.id);
        setItems((previous) => previous.map((item) => item.id === notification.id ? { ...item, is_read: true } : item));
      } catch { /* يفصل RPC وصول حساب آخر، فلا نغيّر الواجهة عند الرفض */ }
    }
  };

  const unread = items.filter((item) => !item.is_read);
  const read = items.filter((item) => item.is_read);

  return (
    <GradientScreen>
      <BackHeader title="إشعارات المطور" subtitle={unread.length ? `${unread.length} غير مقروء` : 'كلها مقروءة'} />
      {loading ? <LoadingView message="جاري التحميل..." /> : items.length === 0 ? <EmptyState icon="megaphone-outline" title="لا توجد إشعارات" message="ستظهر هنا التنبيهات المطابقة لحسابك وسنترك فقط." /> : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {unread.length ? <><SectionTitle title={`غير مقروء (${unread.length})`} />{unread.map((item) => <NoticeCard key={item.id} item={item} open={openId === item.id} onOpen={() => void open(item)} />)}</> : null}
          {read.length ? <><SectionTitle title="الأحدث" />{read.map((item) => <NoticeCard key={item.id} item={item} open={openId === item.id} onOpen={() => void open(item)} />)}</> : null}
        </ScrollView>
      )}
    </GradientScreen>
  );
}

function NoticeCard({ item, open, onOpen }: { item: MyNotification; open: boolean; onOpen: () => void }) {
  return <Pressable onPress={onOpen}><Card style={!item.is_read ? { ...styles.card, ...styles.unreadCard } : styles.card}>
    <View style={styles.head}><View style={{ flex: 1 }}>{!item.is_read ? <View style={styles.dot} /> : null}<Text style={styles.title}>{item.title}</Text><Text style={styles.date}>{formatDate(item.created_at)}</Text></View><Ionicons name="shield-checkmark" size={20} color={colors.warning} /></View>
    <Text style={open ? styles.body : styles.preview} numberOfLines={open ? undefined : 2}>{item.body}</Text>
  </Card></Pressable>;
}

const styles = themedStyles(() => StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
  card: { marginBottom: spacing.md }, unreadCard: { borderColor: colors.warning + '66', backgroundColor: colors.warning + '11' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, dot: { width: 10, height: 10, borderRadius: radius.full, backgroundColor: colors.warning, position: 'absolute', right: -14, top: 7 },
  title: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' }, date: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  preview: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: spacing.sm, lineHeight: 20 }, body: { color: colors.text, fontSize: font.md, textAlign: 'right', marginTop: spacing.sm, lineHeight: 26 },
}));
