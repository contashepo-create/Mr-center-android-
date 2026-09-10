// ============================================================
// حساب الطالب: بياناته + سنتره وكوده + تسجيل الخروج
// ============================================================

import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Card, ListItem, SectionTitle } from '../../src/components/controls';
import { GradientScreen, KeyboardScreen, ScreenHeader } from '../../src/components/layout';
import { fetchGroups, fetchMyCenter, fetchStudentById } from '../../src/lib/api';
import { useFocusEffect } from 'expo-router';
import { useSession } from '../../src/lib/session';
import type { Center, Group, Student } from '../../src/lib/types';
import { formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

export default function StudentProfileScreen() {
  const { profile, signOut } = useSession();
  const [center, setCenter] = useState<Center | null>(null);
  const [groupName, setGroupName] = useState('—');
  const [recordName, setRecordName] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.center_id) return;
    try {
      const [c, groups, s] = await Promise.all([
        fetchMyCenter(profile.center_id),
        fetchGroups(profile.center_id),
        profile.student_id ? fetchStudentById(profile.student_id) : Promise.resolve(null),
      ]);
      setCenter(c);
      setGroupName(groups.find((g) => g.id === s?.group_id)?.name ?? 'لم تُسند لمجموعة بعد');
      // اسم سجل الطالب لدى الإدارة أدق من اسم الحساب إن اختلفا
      setRecordName(s?.name ?? null);
    } catch { /* ignore */ }
  }, [profile?.center_id, profile?.student_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const confirmSignOut = () => {
    Alert.alert('تسجيل الخروج', 'هل تريد تسجيل الخروج من حسابك؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <GradientScreen>
      <ScreenHeader title="حسابي" />
      <KeyboardScreen>
        {/* بطاقة الطالب */}
        <Card style={{ alignItems: 'center', marginTop: spacing.sm }}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(profile?.full_name ?? '؟').trim().charAt(0)}</Text>
          </View>
          <Text style={styles.name}>{recordName ?? profile?.full_name}</Text>
          <Text style={styles.email}>{profile?.email}</Text>
          {profile?.phone ? <Text style={styles.phone}>{profile.phone}</Text> : null}
        </Card>

        {/* سنترك */}
        <SectionTitle title="سنترك" />
        <Card>
          <Row label="السنتر" value={center?.name ?? '—'} />
          <Row label="كود السنتر" value={center?.code ?? '—'} highlight />
          <Row label="المسئول" value={center?.owner_name ?? '—'} />
          <Row label="مجموعتك" value={groupName} />
          <Row label="عضو منذ" value={formatDate(profile?.created_at)} />
          <Text style={styles.note}>
            حسابك مرتبط بسنترك تلقائياً منذ التسجيل — لن تحتاج كود السنتر عند تسجيل الدخول.
          </Text>
        </Card>

        <SectionTitle title="عام" />
        <ListItem
          title="حول التطبيق"
          icon="information-circle"
          iconColor={colors.textSecondary}
          onPress={() => router.push('/about')}
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
      <Text style={[styles.rowValue, highlight && { color: colors.cyan, letterSpacing: 2 }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 84, height: 84, borderRadius: radius.full,
    backgroundColor: colors.primary + '33', borderWidth: 2, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  avatarText: { color: colors.text, fontSize: 34, fontWeight: '900' },
  name: { color: colors.text, fontSize: font.xl, fontWeight: '900', textAlign: 'center' },
  email: { color: colors.textSecondary, fontSize: font.sm, marginTop: 4 },
  phone: { color: colors.textMuted, fontSize: font.sm, marginTop: 2 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.textSecondary, fontSize: font.md },
  rowValue: { color: colors.text, fontSize: font.md, fontWeight: '800', maxWidth: '60%' },
  note: {
    color: colors.textMuted, fontSize: font.xs, marginTop: spacing.md,
    textAlign: 'right', lineHeight: 18,
  },
});
