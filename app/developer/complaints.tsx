// ============================================================
// الشكاوي والاقتراحات (للمطور): شكاوي الزوار من «حول التطبيق»
// عرض الكل + تحديث الحالة (قيد المراجعة/جارٍ المعالجة/تمت المعالجة)
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, LoadingView, SectionTitle } from '../../src/components/controls';
import { DeveloperGate } from '../../src/components/DeveloperGate';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { devListComplaints, devUpdateComplaint, type ComplaintRow } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { arabicError, formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

const STATUS_LABEL: Record<ComplaintRow['status'], { text: string; color: string; bg: string }> = {
  open: { text: 'قيد المراجعة', color: colors.warning, bg: colors.warningBg },
  in_progress: { text: 'جارٍ المعالجة', color: colors.info, bg: colors.infoBg },
  closed: { text: 'تمت المعالجة', color: colors.success, bg: colors.successBg },
};

const NEXT_STATUS: Record<ComplaintRow['status'], ComplaintRow['status']> = {
  open: 'in_progress',
  in_progress: 'closed',
  closed: 'open',
};

export default function DeveloperComplaintsScreen() {
  const { profile, ready } = useSession();
  const [rows, setRows] = useState<ComplaintRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await devListComplaints()); } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!ready) {
    return (
      <GradientScreen>
        <LoadingView message="..." />
      </GradientScreen>
    );
  }
  if (profile?.role !== 'super_admin') return <DeveloperGate />;

  const advance = async (row: ComplaintRow) => {
    setBusyId(row.id);
    try {
      const next = NEXT_STATUS[row.status];
      await devUpdateComplaint(row.id, next);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: next } : r)));
    } catch (e) {
      Alert.alert('تعذر التحديث', arabicError(e));
    } finally {
      setBusyId(null);
    }
  };

  const open = rows.filter((r) => r.status === 'open');
  const inProgress = rows.filter((r) => r.status === 'in_progress');
  const closed = rows.filter((r) => r.status === 'closed');

  return (
    <GradientScreen>
      <BackHeader title="الشكاوي والاقتراحات" subtitle={`${rows.length} إجمالي · ${open.length} قيد المراجعة`} />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : rows.length === 0 ? (
        <EmptyState icon="alert-circle-outline" title="لا توجد شكاوي بعد" message="ستظهر هنا شكاوي واقتراحات الزوار المُرسلة من صفحة «حول التطبيق»." />
      ) : (
        <FlatList
          data={[...open, ...inProgress, ...closed]}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const status = STATUS_LABEL[item.status];
            const isOpen = openId === item.id;
            return (
              <Card style={styles.card}>
                <Pressable onPress={() => setOpenId(isOpen ? null : item.id)}>
                  <View style={styles.head}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ticket}>{item.ticket_no}</Text>
                      <Text style={styles.subject} numberOfLines={1}>{item.subject || 'بدون موضوع'}</Text>
                    </View>
                    <View style={[styles.pill, { backgroundColor: status.bg }]}>
                      <Text style={[styles.pillText, { color: status.color }]}>{status.text}</Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>
                    {item.name || 'زائر'} · {item.phone} · {formatDate(item.created_at)}
                  </Text>
                  <Text style={isOpen ? styles.body : styles.preview} numberOfLines={isOpen ? undefined : 2}>
                    {item.body}
                  </Text>
                </Pressable>
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.actionBtn, { opacity: busyId === item.id ? 0.6 : 1 }]}
                    disabled={busyId === item.id}
                    onPress={() => void advance(item)}
                  >
                    <Ionicons name="arrow-forward-circle" size={16} color={colors.primary} />
                    <Text style={styles.actionText}>
                      {item.status === 'open' ? 'بدء المعالجة' : item.status === 'in_progress' ? 'وضع علامة تمت' : 'إعادة الفتح'}
                    </Text>
                  </Pressable>
                </View>
              </Card>
            );
          }}
          ListHeaderComponent={<SectionTitle title="كل الشكاوي (الأحدث أولاً ضمن كل حالة)" />}
        />
      )}
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  card: { marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  ticket: { color: colors.cyan, fontSize: font.xs, fontWeight: '800', letterSpacing: 1, textAlign: 'right' },
  subject: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right', marginTop: 2 },
  pill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  pillText: { fontSize: font.xs, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: spacing.xs },
  preview: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: spacing.sm, lineHeight: 20 },
  body: { color: colors.text, fontSize: font.md, textAlign: 'right', marginTop: spacing.sm, lineHeight: 26 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.md },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.primary + '1a', borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  actionText: { color: colors.primary, fontSize: font.xs, fontWeight: '800' },
}));
