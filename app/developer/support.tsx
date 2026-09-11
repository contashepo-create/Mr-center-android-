// ============================================================
// دعم فني (المطور): كل محادثات السناتر في مكان واحد —
// قائمة بالسناتر + آخر رسالة + غير المقروء، وفتح محادثة والرد
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen, ScreenHeader } from '../../src/components/layout';
import { DeveloperGate } from '../../src/components/DeveloperGate';
import { devFetchSupportMessages, devSendSupportMessage } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { getSupabase } from '../../src/lib/supabase';
import type { SupportMessage } from '../../src/lib/types';
import { arabicError, formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

interface Thread {
  centerId: string;
  centerName: string;
  centerCode: string;
  messages: SupportMessage[];
  unread: number; // رسائل المالك بعد آخر رسالة مني
}

export default function DeveloperSupportScreen() {
  const { profile: devProfile, ready: profileReady } = useSession();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCenter, setOpenCenter] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [msgs, centers] = await Promise.all([
        devFetchSupportMessages(),
        getSupabase().from('centers').select('id,name,code').limit(1000),
      ]);
      const byId = new Map(((centers.data ?? []) as { id: string; name: string; code: string }[]).map((c) => [c.id, c]));
      const byCenter = new Map<string, SupportMessage[]>();
      for (const m of msgs) {
        if (!byCenter.has(m.center_id)) byCenter.set(m.center_id, []);
        byCenter.get(m.center_id)!.push(m);
      }
      const list: Thread[] = [...byCenter.entries()].map(([centerId, messages]) => {
        const lastMine = [...messages].reverse().find((m) => m.sender_role === 'developer');
        return {
          centerId,
          centerName: byId.get(centerId)?.name ?? 'سنتر',
          centerCode: byId.get(centerId)?.code ?? '',
          messages,
          unread: lastMine ? messages.filter((m) => m.sender_role === 'owner' && m.created_at > lastMine.created_at).length : messages.length,
        };
      }).sort((a, b) => (b.messages[b.messages.length - 1]?.created_at ?? '').localeCompare(a.messages[a.messages.length - 1]?.created_at ?? ''));
      setThreads(list);
    } catch (e) {
      Alert.alert('تعذر التحميل', arabicError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const thread = threads.find((t) => t.centerId === openCenter) ?? null;

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 120);
    return () => clearTimeout(t);
  }, [thread?.messages.length]);

  const reply = async () => {
    const text = draft.trim();
    if (!text || !thread || busy) return;
    setBusy(true);
    try {
      await devSendSupportMessage(thread.centerId, text);
      setDraft('');
      await load();
    } catch (e) {
      Alert.alert('تعذر الإرسال', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!profileReady || devProfile?.role !== 'super_admin') return <DeveloperGate />;

  return (
    <>
      <GradientScreen>
        {thread ? (
          <ScreenHeader
            title={thread.centerName}
            subtitle={`كود ${thread.centerCode} · ${thread.messages.length} رسالة`}
            onBack={() => setOpenCenter(null)}
          />
        ) : (
          <BackHeader
            title="الدعم الفني"
            subtitle={`${threads.length} محادثة`}
            right={
              <Pressable hitSlop={10} onPress={() => void load()}>
                <Ionicons name="refresh" size={22} color={colors.textSecondary} />
              </Pressable>
            }
          />
        )}

        {loading && !thread ? (
          <LoadingView message="جاري تحميل المحادثات..." />
        ) : thread ? (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
            <ScrollView ref={scrollRef} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }} showsVerticalScrollIndicator={false}>
              {thread.messages.map((m) => {
                const mine = m.sender_role === 'developer';
                return (
                  <View key={m.id} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOwner]}>
                    {!mine ? (
                      <Text style={styles.ownerName}>{m.sender_name || 'صاحب السنتر'}</Text>
                    ) : null}
                    <Text style={styles.bubbleText}>{m.body}</Text>
                    <Text style={styles.bubbleTime}>{formatDate(m.created_at)}</Text>
                  </View>
                );
              })}
            </ScrollView>
            <Card style={styles.inputCard}>
              <AppInput
                placeholder="اكتب ردك للسنتر..."
                value={draft}
                onChangeText={setDraft}
                multiline
                style={{ marginBottom: spacing.sm, minHeight: 60, textAlignVertical: 'top' }}
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <AppButton title="إرسال الرد" icon="send" small onPress={() => void reply()} loading={busy} />
                </View>
                <AppButton title="إغلاق" variant="ghost" small onPress={() => setOpenCenter(null)} />
              </View>
            </Card>
          </KeyboardAvoidingView>
        ) : threads.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg }}>
            <EmptyState
              icon="chatbubbles-outline"
              title="لا رسائل دعم بعد"
              message="حين يراسلك أي سنتر من «الدعم الفني» في تطبيقه ستظهر المحادثة هنا فوراً."
            />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            <SectionTitle title={`محادثات السناتر (${threads.length})`} />
            {threads.map((t) => {
              const last = t.messages[t.messages.length - 1];
              return (
                <Pressable key={t.centerId} onPress={() => { setOpenCenter(t.centerId); setDraft(''); }} style={styles.threadRow}>
                  <View style={styles.threadIcon}>
                    <Ionicons name="business" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.threadName} numberOfLines={1}>{t.centerName}</Text>
                    <Text style={styles.threadPreview} numberOfLines={1}>
                      {last?.sender_role === 'owner' ? '' : 'أنت: '}{last?.body ?? ''}
                    </Text>
                  </View>
                  {t.unread > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{t.unread > 9 ? '9+' : t.unread}</Text>
                    </View>
                  ) : (
                    <Text style={styles.threadDate}>{formatDate(last?.created_at ?? '')}</Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </GradientScreen>
    </>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  threadRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  threadIcon: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.primary + '22', borderWidth: 1, borderColor: colors.primary + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  threadName: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  threadPreview: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  threadDate: { color: colors.textMuted, fontSize: font.xs },
  unreadBadge: {
    minWidth: 24, height: 24, borderRadius: radius.full, backgroundColor: colors.danger,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  unreadText: { color: '#fff', fontSize: font.xs, fontWeight: '900' },
  bubble: { maxWidth: '82%', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  bubbleMine: {
    alignSelf: 'flex-start', backgroundColor: colors.primary + '26',
    borderWidth: 1, borderColor: colors.primary + '55',
  },
  bubbleOwner: {
    alignSelf: 'flex-end', backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  ownerName: { color: colors.info, fontSize: font.xs, fontWeight: '800', marginBottom: 4 },
  bubbleText: { color: colors.text, fontSize: font.md, textAlign: 'right', lineHeight: 22 },
  bubbleTime: { color: colors.textMuted, fontSize: font.xs, textAlign: 'left', marginTop: 4 },
  inputCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
}));
