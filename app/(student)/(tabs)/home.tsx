// ============================================================
// الرئيسية للطالب: بطاقة ترحيب + مجموعتي + إعلانات السنتر
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Card, ListItem, LoadingView, SectionTitle, StatCard } from '../../../src/components/controls';
import { GradientScreen, KeyboardScreen } from '../../../src/components/layout';
import { AnnouncementCard, DetailSheet } from '../../../src/components/DetailSheet';
import {
  fetchAnnouncements, fetchDuesForStudent, fetchGroups, fetchHonorees, fetchMyAttendance,
  fetchMyCenter, fetchMyNotifications, fetchStudentById,
} from '../../../src/lib/api';
import type { Honoree } from '../../../src/lib/api';
import { encodeStudentQr } from '../../../src/lib/qr';
import { useSession } from '../../../src/lib/session';
import type { Announcement, Center, Group, Student } from '../../../src/lib/types';
import { formatDays, formatDate, todayIso } from '../../../src/lib/utils';
import { colors, font, gradients, radius, spacing, themedStyles } from '../../../src/theme';

export default function StudentHome() {
  const { profile } = useSession();
  const [center, setCenter] = useState<Center | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [honorees, setHonorees] = useState<Honoree[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [stats, setStats] = useState({ present: 0, absent: 0, pendingDues: 0 });
  const [loading, setLoading] = useState(true);
  const [viewingAnn, setViewingAnn] = useState<Announcement | null>(null);

  const load = useCallback(async () => {
    if (!profile?.center_id || !profile.student_id) { setLoading(false); return; }
    try {
      const [c, s, groups, anns, att, dues, hors, notifs] = await Promise.all([
        fetchMyCenter(profile.center_id),
        fetchStudentById(profile.student_id),
        fetchGroups(profile.center_id),
        fetchAnnouncements(profile.center_id),
        fetchMyAttendance(profile.student_id),
        fetchDuesForStudent(profile.student_id),
        fetchHonorees(profile.center_id),
        fetchMyNotifications().catch(() => []),
      ]);
      setUnreadCount(notifs.filter((n) => !n.is_read).length);
      setCenter(c);
      setHonorees(hors.slice(0, 3));
      setStudent(s);
      setGroup(groups.find((g) => g.id === s?.group_id) ?? null);
      setAnnouncements(anns.slice(0, 20));
      let present = 0; let absent = 0;
      for (const a of att) {
        if (a.status === 'present' || a.status === 'late') present++;
        else if (a.status === 'absent') absent++;
      }
      setStats({
        present,
        absent,
        pendingDues: dues.filter((d) => d.status !== 'paid').length,
      });
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [profile?.center_id, profile?.student_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading && !student) {
    return <GradientScreen><LoadingView message="جاري تحميل صفحتك..." /></GradientScreen>;
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
            <Text style={styles.hello}>أهلاً بك في منصتك التعليمية</Text>
            <Text style={styles.name} numberOfLines={1}>{profile?.full_name ?? ''}</Text>
            <Text style={styles.centerLine}>{center?.name ?? ''}</Text>
          </View>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>{(profile?.full_name ?? '؟').trim().charAt(0)}</Text>
          </View>
        </LinearGradient>

        {/* مجموعتي */}
        <Card style={styles.groupCard}>
          <View style={styles.groupRow}>
            <View style={styles.groupIcon}>
              <Ionicons name="albums" size={22} color={colors.cyan} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.groupLabel}>مجموعتي</Text>
              <Text style={styles.groupName}>{group?.name ?? 'لم تُسند لمجموعة بعد'}</Text>
              {group ? (
                <Text style={styles.groupMeta}>
                  {formatDays(group.days)}
                  {group.start_time ? ` · ${group.start_time}${group.end_time ? ' - ' + group.end_time : ''}` : ''}
                </Text>
              ) : (
                <Text style={styles.groupMeta}>ستظهر مجموعتك هنا فور إسنادك من إدارة السنتر</Text>
              )}
            </View>
          </View>
        </Card>

        {/* ملخص سريع */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <StatCard icon="checkmark-done" value={stats.present} label="حضور" color={colors.success} onPress={() => router.push('/my-attendance')} />
          <StatCard icon="close-circle" value={stats.absent} label="غياب" color={colors.danger} onPress={() => router.push('/my-attendance')} />
          <StatCard icon="time" value={stats.pendingDues} label="مستحق معلق" color={colors.warning} onPress={() => router.push('/my-payments')} />
        </View>

        {/* باركود الحضور الخاص بالطالب */}
        {student && profile?.center_id ? (
          <Card style={styles.qrCard}>
            <View style={styles.qrRow}>
              <View style={styles.groupIcon}>
                <Ionicons name="qr-code" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupLabel}>باركود حضوري</Text>
                <Text style={styles.groupMeta}>اعرضه لمسئول السنتر لمسحه وتسجيل حضورك فوراً — يتجدد كل يوم</Text>
              </View>
            </View>
            <View style={styles.qrBox}>
              {(() => {
                const v = profile.center_id && student.id ? encodeStudentQr(profile.center_id, student.id, todayIso()) : '';
                return v ? (
                  <QRCode
                    value={v}
                    size={180}
                    color="#0A0E1A"
                    backgroundColor="#FFFFFF"
                  />
                ) : (
                  <Text style={styles.qrName}>تعذر توليد الباركود</Text>
                );
              })()}
            </View>
            <Text style={styles.qrName}>{student.name}</Text>
          </Card>
        ) : null}

        {/* إشعارات غير مقروءة */}
        {unreadCount > 0 ? (
          <Pressable onPress={() => router.push('/my-notifications')}>
            <Card style={styles.notifBanner}>
              <Ionicons name="notifications" size={22} color={colors.primary} />
              <Text style={styles.notifText}>لديك {unreadCount} إشعارات جديدة من سنترك</Text>
              <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
            </Card>
          </Pressable>
        ) : null}

        {/* أقسامي */}
        <SectionTitle title="أقسامي" />
        <ListItem title="إشعارات السنتر" subtitle={unreadCount > 0 ? `${unreadCount} غير مقروء` : 'رسائل إدارة سنترك'} icon="notifications" iconColor={colors.primary} onPress={() => router.push('/my-notifications')} />
        <ListItem title="الاختبارات" subtitle="أدِّ امتحاناتك وشاهد نتائجك" icon="document-text" iconColor={colors.primary} onPress={() => router.push('/my-exams')} />
        <ListItem title="جدولي الأسبوعي" subtitle="مواعيد حصص مجموعتك" icon="calendar" iconColor={colors.cyan} onPress={() => router.push('/my-schedule')} />
        <ListItem title="مكتبة السنتر" subtitle="شرف وملفات وروابط مهمة" icon="library" iconColor={colors.warning} onPress={() => router.push('/my-library')} />
        <ListItem title="استفساراتي" subtitle="راسل إدارة سنترك" icon="chatbubbles" iconColor={colors.info} onPress={() => router.push('/my-inquiries')} />
        <ListItem title="الاستبيانات" subtitle="شارك رأيك" icon="list" iconColor={colors.success} onPress={() => router.push('/my-surveys')} />

        {/* أوائل السنتر */}
        {honorees.length > 0 ? (
          <>
            <SectionTitle title="أوائل سنترك 🏆" />
            {honorees.map((h, i) => (
              <View key={h.id} style={styles.honorRow}>
                <View style={styles.honorRank}>
                  <Text style={styles.honorRankText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.honorName}>{h.name}</Text>
                  {h.details ? <Text style={styles.honorDetails} numberOfLines={1}>{h.details}</Text> : null}
                </View>
                <Ionicons name="trophy" size={20} color={colors.warning} />
              </View>
            ))}
          </>
        ) : null}

        {/* الإعلانات */}
        <SectionTitle title={`إعلانات ${center?.name ?? 'السنتر'}`} />
        {announcements.length === 0 ? (
          <Card>
            <Text style={styles.emptyText}>لا توجد إعلانات حالياً — ستظهر هنا فور نشرها</Text>
          </Card>
        ) : (
          announcements.map((a) => (
            <AnnouncementCard
              key={a.id}
              title={a.title}
              body={a.body}
              pinned={a.pinned}
              meta={formatDate(a.created_at)}
              onPress={() => setViewingAnn(a)}
            />
          ))
        )}
      </KeyboardScreen>

      {/* عرض إعلان كامل بنافذة حديثة */}
      <DetailSheet
        visible={!!viewingAnn}
        onClose={() => setViewingAnn(null)}
        icon="megaphone"
        tint={viewingAnn?.pinned ? 'warning' : 'info'}
        title={viewingAnn?.title ?? ''}
        meta={`من إدارة ${center?.name ?? 'السنتر'} · ${formatDate(viewingAnn?.created_at ?? '')}`}
        body={viewingAnn?.body ?? ''}
      />
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  heroCard: {
    borderRadius: radius.lg, padding: spacing.xl, marginTop: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  hello: { color: 'rgba(4,46,34,0.75)', fontSize: font.md, fontWeight: '600' },
  name: { color: '#052E22', fontSize: font.xxl, fontWeight: '900', marginTop: 2 },
  centerLine: { color: 'rgba(4,46,34,0.8)', fontSize: font.sm, marginTop: spacing.sm },
  avatarCircle: {
    width: 60, height: 60, borderRadius: radius.full,
    backgroundColor: 'rgba(4,46,34,0.15)', borderWidth: 2, borderColor: 'rgba(4,46,34,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { color: '#052E22', fontSize: font.xxl, fontWeight: '900' },
  groupCard: { marginTop: spacing.md },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  groupIcon: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: colors.cyan + '22', borderWidth: 1, borderColor: colors.cyan + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  groupLabel: { color: colors.textMuted, fontSize: font.xs, fontWeight: '700', textAlign: 'right' },
  groupName: { color: colors.text, fontSize: font.lg, fontWeight: '800', textAlign: 'right', marginTop: 2 },
  groupMeta: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 4, lineHeight: 19 },
  emptyText: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'center', lineHeight: 20 },
  notifBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md,
    borderColor: colors.primary + '66', backgroundColor: colors.primary + '11',
  },
  notifText: { flex: 1, color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  honorRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.warning + '44',
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  honorRank: {
    width: 32, height: 32, borderRadius: radius.full,
    backgroundColor: colors.warning + '22', alignItems: 'center', justifyContent: 'center',
  },
  honorRankText: { color: colors.warning, fontSize: font.md, fontWeight: '900' },
  honorName: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  honorDetails: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  qrCard: { marginTop: spacing.md, alignItems: 'center' },
  qrRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
  qrBox: {
    backgroundColor: '#FFFFFF', borderRadius: radius.md,
    padding: spacing.lg, marginTop: spacing.lg,
  },
  qrName: { color: colors.text, fontSize: font.md, fontWeight: '800', marginTop: spacing.md, textAlign: 'center' },
}));
