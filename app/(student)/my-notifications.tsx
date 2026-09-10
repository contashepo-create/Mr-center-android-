// ============================================================
// إشعارات الطالب: رسائل سنتره (تُعلَّم مقروءة عند الفتح)
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, LoadingView, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { fetchMyNotifications, markNotificationRead } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { MyNotification } from '../../src/lib/types';
import { formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

export default function MyNotificationsScreen() {
  const { profile } = useSession();
  const [items, setItems] = useState<MyNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.student_id || !profile?.center_id) { setLoading(false); return; }
    try {
      setItems(await fetchMyNotifications());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [profile?.student_id, profile?.center_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const open = async (n: MyNotification) => {
    const willOpen = openId !== n.id;
    setOpenId(willOpen ? n.id : null);
    if (willOpen && !n.is_read && profile?.center_id && profile?.student_id) {
      try {
        await markNotificationRead(profile.center_id, n.id, profile.student_id);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      } catch { /* تجاهل */ }
    }
  };

  const unread = items.filter((i) => !i.is_read);

  return (
    <GradientScreen>
      <BackHeader title="إشعارات السنتر" subtitle={unread.length > 0 ? `${unread.length} غير مقروء` : 'كلها مقروءة'} />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : items.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="لا توجد إشعارات"
          message="رسائل إدارة سنترك ستظهر هنا فور بثها"
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {unread.length > 0 ? (
            <>
              <SectionTitle title={`غير مقروء (${unread.length})`} />
              {unread.map((n) => (
                <NotifCard key={n.id} n={n} open={openId === n.id} onOpen={() => open(n)} />
              ))}
            </>
          ) : null}
          <SectionTitle title="الأحدث" />
          {items.filter((i) => i.is_read).slice(0, 30).map((n) => (
            <NotifCard key={n.id} n={n} open={openId === n.id} onOpen={() => open(n)} />
          ))}
        </ScrollView>
      )}
    </GradientScreen>
  );
}

function NotifCard({ n, open, onOpen }: { n: MyNotification; open: boolean; onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen}>
      <Card style={!n.is_read ? { ...styles.card, ...styles.unreadCard } : styles.card}>
        <View style={styles.head}>
          {!n.is_read ? <View style={styles.dot} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{n.title}</Text>
            <Text style={styles.date}>{formatDate(n.created_at)}</Text>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </View>
        {open ? <Text style={styles.body}>{n.body}</Text> : (
          <Text style={styles.preview} numberOfLines={2}>{n.body}</Text>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  unreadCard: { borderColor: colors.primary + '66', backgroundColor: colors.primary + '11' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: radius.full, backgroundColor: colors.primary },
  title: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  date: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  preview: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: spacing.sm, lineHeight: 20 },
  body: { color: colors.text, fontSize: font.md, textAlign: 'right', marginTop: spacing.sm, lineHeight: 26 },
});
