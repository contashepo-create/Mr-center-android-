// ============================================================
// مركز التواصل: جرس إشعارات + صندوق رسائل موحّد أعلى كل شاشة رئيسية
// مصدر واحد خادمي (get_my_communication_summary) — بلا تجميع محلي.
// منفذ RN لمكوّن الويب src/components/communication-hub.tsx.
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  fetchMyCommunicationSummary, markMyCommunicationNotificationRead, subscribeCommunicationChanged,
} from '../lib/api';
import { useSession } from '../lib/session';
import type { CommunicationBucket, CommunicationItem, CommunicationSummary } from '../lib/types';
import { formatDate } from '../lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../theme';

const emptySummary: CommunicationSummary = {
  notifications: { unread: 0, items: [] },
  messages: { unread: 0, items: [] },
};

type Area = 'admin' | 'student' | 'developer';
type OpenPanel = 'notifications' | 'messages' | null;

/** يحوّل مسار الويب المخزّن في قاعدة البيانات إلى مسار شاشة Expo Router المقابل. */
function mapWebRouteToApp(webRoute: string): string {
  const [path] = webRoute.split('?');
  const map: Record<string, string> = {
    '/student/notifications': '/my-notifications',
    '/admin/dev-notices': '/dev-notices',
    '/admin/support': '/support',
    '/developer/support': '/developer/support',
    '/developer/broadcast': '/developer/broadcast',
  };
  return map[path] ?? path;
}

function fallbackRoute(area: Area, panel: Exclude<OpenPanel, null>): string | null {
  if (area === 'student') return panel === 'notifications' ? '/my-notifications' : '/my-inquiries';
  if (area === 'admin') return panel === 'notifications' ? '/dev-notices' : '/support';
  return panel === 'messages' ? '/developer/support' : '/developer/broadcast';
}

function shortBody(body: string): string {
  return body.length > 96 ? `${body.slice(0, 96)}…` : body;
}

function CommunicationPanel({
  label, bucket, fallback, onNavigate, onClose,
}: {
  label: string;
  bucket: CommunicationBucket;
  fallback: string | null;
  onNavigate: (route: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={(e) => e.stopPropagation()}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>{label}</Text>
            <View style={styles.panelBadge}><Text style={styles.panelBadgeText}>{bucket.unread} جديد</Text></View>
          </View>
          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            {bucket.items.length === 0 ? (
              <Text style={styles.empty}>لا توجد عناصر غير مقروءة.</Text>
            ) : bucket.items.map((item) => (
              <Pressable
                key={`${item.kind}-${item.id}`}
                style={styles.item}
                onPress={() => onNavigate(mapWebRouteToApp(item.route))}
              >
                <View style={[styles.itemIcon, item.presentation === 'urgent' && styles.itemIconUrgent]}>
                  <Ionicons
                    name={item.presentation === 'urgent' ? 'alert' : item.kind === 'support_message' || item.kind === 'developer_message' ? 'mail' : 'ellipse'}
                    size={item.presentation === 'urgent' ? 16 : item.kind === 'notification' ? 10 : 14}
                    color={item.presentation === 'urgent' ? colors.danger : colors.info}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.itemBody} numberOfLines={2}>{shortBody(item.body)}</Text>
                  <Text style={styles.itemTime}>{formatDate(item.created_at)}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          {fallback ? (
            <Pressable style={styles.panelFooter} onPress={() => onNavigate(fallback)}>
              <Text style={styles.panelFooterText}>فتح القسم المختص ←</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** جرس/مغلف موحّد أعلى مساحة العمل — لا يضع إشعارات المستخدم داخل القائمة الجانبية. */
export function CommunicationHub({ area }: { area: Area }) {
  const pathname = usePathname();
  const { profile } = useSession();
  const [summary, setSummary] = useState<CommunicationSummary>(emptySummary);
  const [open, setOpen] = useState<OpenPanel>(null);
  const [urgent, setUrgent] = useState<CommunicationItem | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reload = useCallback(async () => {
    if (!profile) { setSummary(emptySummary); return; }
    try {
      const next = await fetchMyCommunicationSummary();
      setSummary(next);
      setUrgent((current) => {
        const firstUrgent = next.notifications.items.find((item) => item.presentation === 'urgent') ?? null;
        if (!firstUrgent) return null;
        return firstUrgent.id !== current?.id ? firstUrgent : current;
      });
    } catch {
      // لا تعطل التصفح لو لم يطبق ترحيل مركز التواصل بعد أو انقطع الاتصال لحظياً.
    }
  }, [profile]);

  useEffect(() => {
    void reload();
  }, [pathname, reload]);

  useEffect(() => {
    const unsubscribe = subscribeCommunicationChanged(() => { void reload(); });
    timerRef.current = setInterval(() => { void reload(); }, 45000);
    return () => {
      unsubscribe();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [reload]);

  const urgentTitle = useMemo(() => urgent?.title ?? '', [urgent]);

  const acknowledgeUrgent = async (openTarget: boolean) => {
    if (!urgent) return;
    const target = mapWebRouteToApp(urgent.route);
    try { await markMyCommunicationNotificationRead(urgent.id); } catch { /* تعرض الشاشة الأصلية الرسالة إن تعذر التعليم */ }
    setUrgent(null);
    if (openTarget) router.push(target as never);
  };

  const navigate = (route: string) => {
    setOpen(null);
    router.push(route as never);
  };

  if (!profile) return null;

  return (
    <>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
        <View style={styles.bar}>
          <View style={styles.barDotWrap}>
            <View style={styles.barDot} />
            <Text style={styles.barLabel}>مركز التواصل</Text>
          </View>
          <View style={styles.actions}>
            <Pressable style={styles.actionBtn} onPress={() => setOpen((c) => (c === 'notifications' ? null : 'notifications'))}>
              <Ionicons name="notifications" size={20} color={colors.text} />
              {summary.notifications.unread > 0 ? (
                <View style={styles.dot}><Text style={styles.dotText}>{summary.notifications.unread > 99 ? '99+' : summary.notifications.unread}</Text></View>
              ) : null}
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => setOpen((c) => (c === 'messages' ? null : 'messages'))}>
              <Ionicons name="mail" size={20} color={colors.text} />
              {summary.messages.unread > 0 ? (
                <View style={styles.dot}><Text style={styles.dotText}>{summary.messages.unread > 99 ? '99+' : summary.messages.unread}</Text></View>
              ) : null}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {open === 'notifications' ? (
        <CommunicationPanel
          label="الإشعارات غير المقروءة"
          bucket={summary.notifications}
          fallback={fallbackRoute(area, 'notifications')}
          onNavigate={navigate}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open === 'messages' ? (
        <CommunicationPanel
          label="الرسائل غير المقروءة"
          bucket={summary.messages}
          fallback={fallbackRoute(area, 'messages')}
          onNavigate={navigate}
          onClose={() => setOpen(null)}
        />
      ) : null}

      {urgent ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => void acknowledgeUrgent(false)}>
          <View style={styles.urgentBackdrop}>
            <View style={styles.urgentDialog}>
              <View style={styles.urgentSymbol}><Ionicons name="alert" size={28} color={colors.danger} /></View>
              <Text style={styles.urgentKicker}>تنبيه طارئ من إدارة Mr Center</Text>
              <Text style={styles.urgentTitle}>{urgentTitle}</Text>
              <Text style={styles.urgentBody}>{urgent.body}</Text>
              <View style={styles.urgentRow}>
                <Pressable style={styles.urgentBtnSecondary} onPress={() => void acknowledgeUrgent(false)}>
                  <Text style={styles.urgentBtnSecondaryText}>تمت القراءة</Text>
                </Pressable>
                <Pressable style={styles.urgentBtnPrimary} onPress={() => void acknowledgeUrgent(true)}>
                  <Text style={styles.urgentBtnPrimaryText}>فتح الرسالة</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  safe: { backgroundColor: 'transparent' },
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  barDotWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  barDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  barLabel: { color: colors.textMuted, fontSize: font.xs, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionBtn: { padding: spacing.xs },
  dot: {
    position: 'absolute', top: -4, left: -6, minWidth: 17, height: 17, borderRadius: 9,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  dotText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  backdrop: { flex: 1, backgroundColor: 'rgba(2,8,6,0.5)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 60, paddingHorizontal: spacing.lg },
  panel: {
    backgroundColor: colors.bgSoft, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, width: '100%', maxWidth: 380,
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  panelTitle: { color: colors.text, fontSize: font.md, fontWeight: '900' },
  panelBadge: { backgroundColor: colors.infoBg ?? colors.successBg, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  panelBadgeText: { color: colors.info, fontSize: font.xs, fontWeight: '800' },
  empty: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center', paddingVertical: spacing.lg },
  item: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemIcon: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.infoBg ?? colors.successBg,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  itemIconUrgent: { backgroundColor: colors.dangerBg },
  itemTitle: { color: colors.text, fontSize: font.sm, fontWeight: '800', textAlign: 'right' },
  itemBody: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  itemTime: { color: colors.textMuted, fontSize: 10, textAlign: 'left', marginTop: 2 },
  panelFooter: { marginTop: spacing.sm, alignItems: 'center', paddingVertical: spacing.sm },
  panelFooterText: { color: colors.cyan, fontSize: font.sm, fontWeight: '800' },
  urgentBackdrop: { flex: 1, backgroundColor: 'rgba(2,8,6,0.75)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  urgentDialog: {
    backgroundColor: colors.bgSoft, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.danger + '55',
    padding: spacing.xl, width: '100%', maxWidth: 380, alignItems: 'center',
  },
  urgentSymbol: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.dangerBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  urgentKicker: { color: colors.danger, fontSize: font.xs, fontWeight: '900', textAlign: 'center' },
  urgentTitle: { color: colors.text, fontSize: font.lg, fontWeight: '900', textAlign: 'center', marginTop: spacing.xs },
  urgentBody: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'center', marginTop: spacing.sm, lineHeight: 22 },
  urgentRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, width: '100%' },
  urgentBtnSecondary: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
  urgentBtnSecondaryText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '800' },
  urgentBtnPrimary: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primary,
    alignItems: 'center',
  },
  urgentBtnPrimaryText: { color: '#052E22', fontSize: font.sm, fontWeight: '900' },
}));
