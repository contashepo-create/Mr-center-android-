// ============================================================
// الدعم الفني: محادثة مباشرة بين مالك السنتر والمطور
// (المالك يرى ويرسل لسنتره فقط — العزل خادمي بسياسات RLS)
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card, EmptyState, LoadingView, NoAccess } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { fetchSupportMessages, sendSupportMessage } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { isOwner } from '../../src/lib/staff';
import type { SupportMessage } from '../../src/lib/types';
import { arabicError, formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

export default function SupportScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!centerId) { setLoading(false); return; }
    try {
      setMessages(await fetchSupportMessages(centerId));
    } catch (e) {
      Alert.alert('تعذر التحميل', arabicError(e));
    } finally {
      setLoading(false);
    }
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    // آخر رسالة في أسفل المحادثة
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 120);
    return () => clearTimeout(t);
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await sendSupportMessage(centerId, text);
      setDraft('');
      setMessages(await fetchSupportMessages(centerId));
    } catch (e) {
      Alert.alert('تعذر الإرسال', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!isOwner(profile)) {
    return (
      <GradientScreen>
        <BackHeader title="الدعم الفني" />
        <NoAccess message="قناة الدعم خاصة بصاحب السنتر — تواصل مع إدارة سنترك" />
      </GradientScreen>
    );
  }

  const lastDevMsg = [...messages].reverse().find((m) => m.sender_role === 'developer');
  const unreadFromDev = lastDevMsg
    ? messages.filter((m) => m.sender_role === 'owner' && m.created_at > lastDevMsg.created_at).length === 0
      && messages[messages.length - 1]?.sender_role === 'developer'
    : false;

  return (
    <GradientScreen>
      <BackHeader
        title="الدعم الفني"
        subtitle="محادثة مباشرة مع مطور التطبيق"
        right={
          <Pressable hitSlop={10} onPress={() => void load()}>
            <Ionicons name="refresh" size={22} color={colors.textSecondary} />
          </Pressable>
        }
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        {loading ? (
          <LoadingView message="جاري تحميل المحادثة..." />
        ) : messages.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg }}>
            <EmptyState
              icon="chatbubbles-outline"
              title="لا رسائل بعد"
              message="عندك مشكلة أو استفسار؟ اكتب رسالتك هنا ويوصلني فوراً — وستجد ردي في نفس الشاشة."
            />
          </View>
        ) : (
          <ScrollView ref={scrollRef} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.xl }} showsVerticalScrollIndicator={false}>
            {unreadFromDev ? (
              <View style={styles.unreadNote}>
                <Ionicons name="alert-circle" size={16} color={colors.warning} />
                <Text style={styles.unreadText}>لديك رد جديد من المطور بالأسفل</Text>
              </View>
            ) : null}
            {messages.map((m) => {
              const mine = m.sender_role === 'owner';
              return (
                <View key={m.id} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleDev]}>
                  {!mine ? (
                    <View style={styles.devBadge}>
                      <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
                      <Text style={styles.devBadgeText}>المطور{m.sender_name ? ` · ${m.sender_name}` : ''}</Text>
                    </View>
                  ) : null}
                  <Text style={mine ? styles.bubbleTextMine : styles.bubbleTextDev}>{m.body}</Text>
                  <Text style={mine ? styles.bubbleTimeMine : styles.bubbleTimeDev}>{formatDate(m.created_at)}</Text>
                </View>
              );
            })}
          </ScrollView>
        )}
        <Card style={styles.inputCard}>
          <AppInput
            placeholder="اكتب رسالتك للمطور..."
            value={draft}
            onChangeText={setDraft}
            multiline
            style={{ marginBottom: spacing.sm, minHeight: 60, textAlignVertical: 'top' }}
          />
          <AppButton title="إرسال" icon="send" small onPress={() => void send()} loading={busy} />
        </Card>
      </KeyboardAvoidingView>
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  bubble: {
    maxWidth: '82%', borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm,
  },
  bubbleMine: {
    alignSelf: 'flex-start', backgroundColor: colors.primary + '26',
    borderWidth: 1, borderColor: colors.primary + '55',
  },
  bubbleDev: {
    alignSelf: 'flex-end', backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  devBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  devBadgeText: { color: colors.primary, fontSize: font.xs, fontWeight: '800' },
  bubbleTextMine: { color: colors.text, fontSize: font.md, textAlign: 'right', lineHeight: 22 },
  bubbleTextDev: { color: colors.text, fontSize: font.md, textAlign: 'right', lineHeight: 22 },
  bubbleTimeMine: { color: colors.textMuted, fontSize: font.xs, textAlign: 'left', marginTop: 4 },
  bubbleTimeDev: { color: colors.textMuted, fontSize: font.xs, textAlign: 'left', marginTop: 4 },
  unreadNote: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    marginBottom: spacing.md,
  },
  unreadText: { color: colors.warning, fontSize: font.xs, fontWeight: '800' },
  inputCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
}));
