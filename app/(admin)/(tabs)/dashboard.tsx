// ============================================================
// لوحة مسئول السنتر الرئيسية: إحصائيات + إجراءات سريعة + الإعلانات
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, ListItem, LoadingView, SectionTitle, StatCard } from '../../../src/components/controls';
import { GradientScreen, KeyboardScreen } from '../../../src/components/layout';
import {
  fetchAdminStats, fetchAnnouncements, fetchMyCenter, type AdminStats,
} from '../../../src/lib/api';
import { useSession } from '../../../src/lib/session';
import { can, isOwner } from '../../../src/lib/staff';
import type { Announcement, Center } from '../../../src/lib/types';
import { formatMoney } from '../../../src/lib/utils';
import { colors, font, gradients, radius, spacing, themedStyles } from '../../../src/theme';

export default function AdminDashboard() {
  const { profile, subscription } = useSession();
  const [center, setCenter] = useState<Center | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  const isTeacher = !isOwner(profile);
  const load = useCallback(async () => {
    if (!profile?.center_id) return;
    try {
      const [c, s, a] = await Promise.all([
        fetchMyCenter(profile.center_id),
        fetchAdminStats(profile.center_id),
        fetchAnnouncements(profile.center_id),
      ]);
      setCenter(c);
      setStats(s);
      setAnnouncements(a.slice(0, 3));
    } catch {
      // تُعرض البيانات القديمة إن وجدت
    } finally {
      setLoading(false);
    }
  }, [profile?.center_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading && !stats) {
    return <GradientScreen><LoadingView message="جاري تحميل لوحة التحكم..." /></GradientScreen>;
  }

  return (
    <GradientScreen>
      <KeyboardScreen>
        {/* بطاقة الترحيب */}
        <LinearGradient
          colors={gradients.primary}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>مرحباً {profile?.full_name ?? 'بك'} في لوحة السنتر</Text>
            <Text style={styles.centerName} numberOfLines={1}>{center?.name ?? 'سنترك'}</Text>
            <View style={styles.codePill}>
              <Ionicons name="key" size={13} color="#052E22" />
              <Text style={styles.codePillText}>كود السنتر: {center?.code ?? '—'}</Text>
            </View>
          </View>
          <Ionicons name="school" size={58} color="rgba(4,46,34,0.3)" />
        </LinearGradient>

        {/* مركز الإشعارات والرسائل — ظاهر لكل الأدوار مع احترام صلاحيات الخادم */}
        <View style={styles.topActions}>
          <QuickAction icon="notifications" label="الإشعارات" color={colors.warning} onPress={() => router.push('/notifications')} />
          <QuickAction icon="chatbubbles" label="الرسائل" color={colors.cyan} onPress={() => router.push('/inquiries')} />
        </View>

        {/* حالة الاشتراك — للمالك فقط */}
        {!isTeacher && subscription ? (
          <Card style={styles.subCard} onPress={() => router.push('/admin-settings')}>
            <View style={styles.subRow}>
              <Ionicons
                name={subscription.status === 'active' ? 'checkmark-circle' : 'alert-circle'}
                size={20}
                color={subscription.status === 'active' ? colors.success : colors.warning}
              />
              <Text style={styles.subText}>
                الاشتراك: {subscription.status === 'active' ? 'فعّال' : subscription.status === 'suspended' ? 'موقوف' : 'منتهي'}
                {subscription.days_left !== null && subscription.days_left !== undefined && subscription.days_left > 0
                  ? ` — متبقي ${subscription.days_left} يوم`
                  : subscription.status === 'active' ? ' — تنتهي اليوم' : ''}
              </Text>
              <Ionicons name="chevron-back" size={16} color={colors.textMuted} />
            </View>
          </Card>
        ) : null}

        {/* الإحصائيات */}
        <SectionTitle title="نظرة سريعة" />
        <View style={styles.statsRow}>
          <StatCard icon="people" value={stats?.students ?? 0} label="طالب نشط" color={colors.info} onPress={() => router.push('/students')} />
          <View style={{ width: spacing.sm }} />
          <StatCard icon="albums" value={stats?.groups ?? 0} label="مجموعة" color={colors.primary} onPress={() => router.push('/groups')} />
        </View>
        <View style={[styles.statsRow, { marginTop: spacing.sm }]}>
          <StatCard icon="checkmark-done" value={stats?.presentToday ?? 0} label="حاضر اليوم" color={colors.success} onPress={() => router.push('/attendance')} />
          <View style={{ width: spacing.sm }} />
          <StatCard icon="close-circle" value={stats?.absentToday ?? 0} label="غائب اليوم" color={colors.danger} onPress={() => router.push('/attendance')} />
        </View>
        <View style={[styles.statsRow, { marginTop: spacing.sm }]}>
          <StatCard icon="wallet" value={stats?.unpaidDues ?? 0} label="مستحق معلق" color={colors.warning} onPress={() => router.push('/payments')} />
          <View style={{ width: spacing.sm }} />
          <StatCard icon="cash" value={formatMoney(stats?.paidThisMonth ?? 0)} label="مدفوع هذا الشهر" color={colors.cyan} onPress={() => router.push('/payments')} />
        </View>

        {/* إجراءات سريعة (حسب الصلاحية — بلا إضافة طلاب للمدرس) */}
        <SectionTitle title="إجراءات سريعة" />
        <View style={styles.actionsRow}>
          {can(profile, 'attendance') ? (
            <QuickAction icon="qr-code" label="مسح باركود" color={colors.primary} onPress={() => router.push('/scan')} />
          ) : null}
          {!isTeacher ? (
            <QuickAction icon="person-add" label="طالب جديد" color={colors.info} onPress={() => router.push('/students?add=1')} />
          ) : null}
          {can(profile, 'attendance') ? (
            <QuickAction icon="checkmark-done-circle" label="تسجيل حضور" color={colors.success} onPress={() => router.push('/attendance')} />
          ) : null}
          {can(profile, 'announcements') ? (
            <QuickAction icon="megaphone" label="إعلان جديد" color={colors.warning} onPress={() => router.push('/announcements')} />
          ) : null}
        </View>
        <View style={[styles.actionsRow, { marginTop: spacing.sm }]}>
          {can(profile, 'collect') ? (
            <QuickAction icon="wallet" label="المدفوعات" color={colors.cyan} onPress={() => router.push('/payments')} />
          ) : null}
          <QuickAction icon="albums" label="المجموعات" color={colors.warning} onPress={() => router.push('/groups')} />
        </View>

        {/* آخر الإعلانات */}
        <SectionTitle
          title="آخر الإعلانات"
          action={
            <Text style={styles.moreLink} onPress={() => router.push('/announcements')}>عرض الكل</Text>
          }
        />
        {announcements.length === 0 ? (
          <Card>
            <Text style={styles.emptyText}>لا توجد إعلانات بعد — أضف أول إعلان ليظهر لطلابك فوراً</Text>
          </Card>
        ) : (
          announcements.map((a) => (
            <ListItem
              key={a.id}
              title={a.title}
              subtitle={a.body}
              icon="megaphone"
              iconColor={a.pinned ? colors.warning : colors.info}
              badge={a.pinned ? { text: 'مثبت', color: colors.warning, bg: colors.warningBg } : undefined}
              onPress={() => router.push('/announcements')}
            />
          ))
        )}
      </KeyboardScreen>
    </GradientScreen>
  );
}

function QuickAction({ icon, label, color, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress: () => void;
}) {
  return (
    <Card style={styles.actionCard} onPress={onPress}>
      <View style={[styles.actionIcon, { backgroundColor: color + '22', borderColor: color + '55' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Card>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  heroCard: {
    borderRadius: radius.lg, padding: spacing.xl,
    flexDirection: 'row', alignItems: 'center',
    marginTop: spacing.md,
  },
  hello: { color: 'rgba(4,46,34,0.75)', fontSize: font.md, fontWeight: '600' },
  centerName: { color: '#052E22', fontSize: font.xxl, fontWeight: '900', marginTop: 2 },
  codePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 5, marginTop: spacing.md,
    alignSelf: 'flex-start',
  },
  codePillText: { color: '#052E22', fontSize: font.sm, fontWeight: '800', letterSpacing: 1 },
  subCard: { marginTop: spacing.md, paddingVertical: spacing.md },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  subText: { flex: 1, color: colors.text, fontSize: font.sm, fontWeight: '700', textAlign: 'right' },
  statsRow: { flexDirection: 'row' },
  topActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  actionCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg, paddingHorizontal: 4 },
  actionIcon: {
    width: 46, height: 46, borderRadius: radius.full, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  actionLabel: { color: colors.text, fontSize: font.xs, fontWeight: '700', textAlign: 'center' },
  moreLink: { color: colors.cyan, fontSize: font.sm, fontWeight: '700' },
  emptyText: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'center', lineHeight: 20 },
}));
