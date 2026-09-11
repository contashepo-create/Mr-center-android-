// ============================================================
// إشعارات المطور: تنبيهات خاصة بإدارة السنتر (تُعلَّم مقروءة عند الفتح)
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, LoadingView, NoAccess, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { isOwner } from '../../src/lib/staff';
import { fetchOwnerNotices, markOwnerNoticeRead } from '../../src/lib/api';
import { getSupabase } from '../../src/lib/supabase';
import { useSession } from '../../src/lib/session';
import type { AppNotification } from '../../src/lib/types';
import { formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

export default function DevNoticesScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';
  const [items, setItems] = useState<(AppNotification & { read: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!centerId) { setLoading(false); return; }
    try {
      const ns = await fetchOwnerNotices(centerId);
      const { data: sess } = await getSupabase().auth.getSession();
      const uid = sess.session?.user.id;
      let readIds = new Set<string>();
      if (uid) {
        const { data: reads } = await getSupabase().from('app_notification_reads').select('notification_id')
          .eq('center_id', centerId).eq('student_id', uid);
        readIds = new Set((reads ?? []).map((r: { notification_id: string }) => r.notification_id));
      }
      setItems(ns.map((n) => ({ ...n, read: readIds.has(n.id) })));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // قناة أصحاب السناتر فقط — لا يراها فريق العمل
  if (!isOwner(profile)) {
    return (
      <GradientScreen>
        <BackHeader title="إشعارات المطور" />
        <NoAccess />
      </GradientScreen>
    );
  }

  const open = async (n: AppNotification & { read: boolean }) => {
    const willOpen = openId !== n.id;
    setOpenId(willOpen ? n.id : null);
    if (willOpen && !n.read) {
      try {
        await markOwnerNoticeRead(centerId, n.id);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      } catch { /* تجاهل */ }
    }
  };

  const unread = items.filter((i) => !i.read);

  return (
    <GradientScreen>
      <BackHeader title="إشعارات المطور" subtitle={unread.length > 0 ? `${unread.length} غير مقروء` : 'كلها مقروءة'} />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : items.length === 0 ? (
        <EmptyState
          icon="megaphone-outline"
          title="لا توجد إشعارات"
          message="تنبيهات المطور الخاصة بإدارتك ستظهر هنا"
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {unread.length > 0 ? (
            <>
              <SectionTitle title={`غير مقروء (${unread.length})`} />
              {unread.map((n) => (
                <NoticeCard key={n.id} n={n} open={openId === n.id} onOpen={() => open(n)} />
              ))}
            </>
          ) : null}
          <SectionTitle title="الأحدث" />
          {items.filter((i) => i.read).map((n) => (
            <NoticeCard key={n.id} n={n} open={openId === n.id} onOpen={() => open(n)} />
          ))}
        </ScrollView>
      )}
    </GradientScreen>
  );
}

function NoticeCard({ n, open, onOpen }: { n: AppNotification & { read: boolean }; open: boolean; onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen}>
      <Card style={!n.read ? { ...styles.card, ...styles.unreadCard } : styles.card}>
        <View style={styles.head}>
          {!n.read ? <View style={styles.dot} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{n.title}</Text>
            <Text style={styles.date}>{formatDate(n.created_at)}</Text>
          </View>
          <Ionicons name="shield-checkmark" size={20} color={colors.warning} />
        </View>
        {open ? <Text style={styles.body}>{n.body}</Text> : (
          <Text style={styles.preview} numberOfLines={2}>{n.body}</Text>
        )}
      </Card>
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  card: { marginBottom: spacing.md },
  unreadCard: { borderColor: colors.warning + '66', backgroundColor: colors.warning + '11' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: radius.full, backgroundColor: colors.warning },
  title: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  date: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  preview: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: spacing.sm, lineHeight: 20 },
  body: { color: colors.text, fontSize: font.md, textAlign: 'right', marginTop: spacing.sm, lineHeight: 26 },
}));
