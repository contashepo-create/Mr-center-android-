// ============================================================
// ملف السنتر الكامل (المطور): المالك + الفريق + الطلاب + الاشتراكات + النشاط
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, EmptyState, LoadingView, SectionTitle } from '../../src/components/controls';
import { DeveloperGate } from '../../src/components/DeveloperGate';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import {
  devSetCenterStatus, fetchActivityLog, fetchMyCenter, logActivity,
} from '../../src/lib/api';
import { openWhatsApp } from '../../src/lib/whatsapp';
import { useSession } from '../../src/lib/session';
import { roleLabel } from '../../src/lib/staff';
import { planLabel } from '../../src/lib/billing';
import type { ActivityLog, Center, Profile, Student, Subscription } from '../../src/lib/types';
import { getSupabase } from '../../src/lib/supabase';
import { arabicError, formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

export default function CenterDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, ready } = useSession();
  const [center, setCenter] = useState<Center | null>(null);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [studentsCount, setStudentsCount] = useState(0);
  const [studentsSample, setStudentsSample] = useState<Student[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const sb = getSupabase();
      const [c, profs, stCount, stSample, subRows, act] = await Promise.all([
        fetchMyCenter(id),
        sb.from('profiles').select('*').eq('center_id', id).order('created_at', { ascending: false }).limit(200),
        sb.from('students').select('id', { count: 'exact', head: true }).eq('center_id', id),
        sb.from('students').select('id,name,phone,status,created_at').eq('center_id', id).order('created_at', { ascending: false }).limit(15),
        sb.from('center_subscriptions').select('*').eq('center_id', id).order('ends_on', { ascending: false }).limit(10),
        fetchActivityLog(id),
      ]);
      if (c) setCenter(c);
      setStaff(((profs.data ?? []) as Profile[]).filter((p) => p.role !== 'student'));
      setStudentsCount(stCount.count ?? 0);
      setStudentsSample((stSample.data ?? []) as Student[]);
      setSubs((subRows.data ?? []) as Subscription[]);
      setActivity(act.slice(0, 20));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!ready) {
    return <GradientScreen><LoadingView message="..." /></GradientScreen>;
  }
  if (profile?.role !== 'super_admin') return <DeveloperGate />;

  const owner = staff.find((p) => p.role === 'center_admin');
  const managers = staff.filter((p) => p.role === 'manager');
  const secretaries = staff.filter((p) => p.role === 'secretary');
  const teachers = staff.filter((p) => p.role === 'teacher');

  const toggleStatus = () => {
    if (!center) return;
    const suspending = center.status === 'active';
    Alert.alert(suspending ? 'إيقاف السنتر؟' : 'تفعيل السنتر؟', `سنتر «${center.name}»`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: suspending ? 'إيقاف' : 'تفعيل',
        style: suspending ? 'destructive' : 'default',
        onPress: async () => {
          try {
            await devSetCenterStatus(center.id, suspending ? 'suspended' : 'active');
            await logActivity(center.id, suspending ? 'center_suspended' : 'subscription_activated', suspending ? 'إيقاف من صفحة السنتر' : 'تفعيل من صفحة السنتر');
            await load();
          } catch (e) { Alert.alert('خطأ', arabicError(e)); }
        },
      },
    ]);
  };

  return (
    <GradientScreen>
      <BackHeader title="ملف السنتر" subtitle={center?.name ?? ''} />
      {loading || !center ? (
        <LoadingView message="جاري التحميل..." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          <Card style={{ ...styles.hero, borderColor: center.status === 'active' ? colors.success + '55' : colors.danger + '55' }}>
            <View style={styles.heroRow}>
              <Ionicons name="business" size={30} color={colors.cyan} />
              <View style={{ flex: 1 }}>
                <Text style={styles.heroName}>{center.name}</Text>
                <Text style={styles.heroMeta}>الكود: {center.code} · النوع: {center.kind === 'solo' ? 'مدرس خصوصي' : 'سنتر متكامل'}</Text>
                <Text style={styles.heroMeta}>الحالة: {center.status === 'active' ? 'فعّال' : 'موقوف'} · سُجل {formatDate(center.created_at)}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <AppButton title={center.status === 'active' ? 'إيقاف' : 'تفعيل'} icon={center.status === 'active' ? 'pause' : 'play'} small variant={center.status === 'active' ? 'danger' : 'success'} onPress={toggleStatus} />
              </View>
              {center.owner_phone ? (
                <View style={{ flex: 1 }}>
                  <AppButton
                    title="واتساب المالك" icon="logo-whatsapp" small variant="success"
                    onPress={async () => {
                      const ok = await openWhatsApp(center.owner_phone, `مرحباً ${center.owner_name} — معك إدارة تطبيق Mr Center.`);
                      if (!ok) Alert.alert('تعذر الفتح', 'الرقم غير صالح');
                    }}
                  />
                </View>
              ) : null}
            </View>
          </Card>

          <SectionTitle title="المالك" />
          <Card>
            <InfoRow label="الاسم" value={owner?.full_name || center.owner_name || '—'} />
            <InfoRow label="البريد" value={owner?.email || center.owner_email || '—'} />
            <InfoRow label="الهاتف" value={owner?.phone || center.owner_phone || '—'} />
          </Card>

          <SectionTitle title={`الفريق (مدير: ${managers.length} · سكرتير: ${secretaries.length} · مدرس: ${teachers.length})`} />
          {staff.filter((p) => p.role !== 'center_admin').length === 0 ? (
            <Card><Text style={styles.dimText}>لا يوجد فريق تابع</Text></Card>
          ) : staff.filter((p) => p.role !== 'center_admin').map((p) => (
            <Card key={p.id} style={styles.person}>
              <View style={styles.personHead}>
                <Text style={styles.personName} numberOfLines={1}>{p.full_name}</Text>
                <View style={styles.rolePill}>
                  <Text style={styles.roleText}>{roleLabel(p.role)}</Text>
                </View>
                <View style={[styles.rolePill, { backgroundColor: p.is_active ? colors.successBg : colors.warningBg }]}>
                  <Text style={[styles.roleText, { color: p.is_active ? colors.success : colors.warning }]}>
                    {p.is_active ? 'مفعّل' : 'خامل'}
                  </Text>
                </View>
              </View>
              <Text style={styles.personMeta}>{p.phone ?? ''}{p.email ? ` · ${p.email}` : ''}</Text>
            </Card>
          ))}

          <SectionTitle title={`الطلاب (${studentsCount})`} />
          {studentsSample.length === 0 ? (
            <Card><Text style={styles.dimText}>لا يوجد طلاب مسجلون</Text></Card>
          ) : studentsSample.map((s) => (
            <View key={s.id} style={styles.studentRow}>
              <Text style={styles.studentName} numberOfLines={1}>{s.name}</Text>
              <Text style={styles.studentMeta}>{s.status === 'active' ? 'نشط' : s.status === 'suspended' ? 'موقوف' : 'مؤرشف'}</Text>
            </View>
          ))}

          <SectionTitle title="سجل الاشتراكات" />
          {subs.length === 0 ? (
            <Card><Text style={styles.dimText}>لا يوجد سجل</Text></Card>
          ) : subs.map((s) => (
            <View key={s.id} style={styles.studentRow}>
              <Text style={styles.studentName}>{planLabel(s.plan_type)} · {s.status === 'active' ? 'فعّال' : s.status === 'suspended' ? 'موقوف' : 'منتهي'}</Text>
              <Text style={styles.studentMeta}>{s.starts_on} ← {s.ends_on}</Text>
            </View>
          ))}

          <SectionTitle title="أحدث العمليات" />
          {activity.length === 0 ? (
            <Card><Text style={styles.dimText}>لا عمليات مسجلة</Text></Card>
          ) : activity.map((a) => (
            <View key={a.id} style={styles.studentRow}>
              <Text style={styles.studentName} numberOfLines={1}>{a.action} — {a.details}</Text>
              <Text style={styles.studentMeta}>{a.actor_name} · {formatDate(a.created_at)}</Text>
            </View>
          ))}

          <View style={{ height: spacing.md }} />
          <AppButton title="اشتراكات السنتر" icon="card" small variant="outline" onPress={() => router.push('/developer/subscriptions')} />
        </ScrollView>
      )}
    </GradientScreen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderWidth: 1 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroName: { color: colors.text, fontSize: font.xl, fontWeight: '900', textAlign: 'right' },
  heroMeta: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 2 },
  dimText: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textSecondary, fontSize: font.md },
  infoValue: { color: colors.text, fontSize: font.md, fontWeight: '800', maxWidth: '60%' },
  person: { marginBottom: spacing.sm },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  personName: { flex: 1, color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  rolePill: { backgroundColor: colors.infoBg, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  roleText: { color: colors.info, fontSize: font.xs, fontWeight: '800' },
  personMeta: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  studentRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  studentName: { flex: 1, color: colors.text, fontSize: font.sm, fontWeight: '700', textAlign: 'right' },
  studentMeta: { color: colors.textMuted, fontSize: font.xs },
});
