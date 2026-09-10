// ============================================================
// المدرسون التابعون: تفعيل/إيقاف + صلاحيات + إسناد مجموعات
// (للسنتر المتكامل فقط — الحساب المنفرد بلا مدرسين تابعين)
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, EmptyState, LoadingView, SectionTitle, NoAccess } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage } from '../../src/components/pickers';
import {
  assignTeacherGroups, deleteTeacher, fetchGroups, fetchMyCenter, fetchStaff, fetchTeacherGroups,
  logActivity, setTeacherActive, setTeacherPerms,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { isOwner, roleLabel, TEACHER_PERMS } from '../../src/lib/staff';
import { limitsFor } from '../../src/lib/billing';
import type { Center, Group, Profile, TeacherPermKey } from '../../src/lib/types';
import { arabicError, formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

export default function TeachersScreen() {
  const { profile, subscription } = useSession();
  const centerId = profile?.center_id ?? '';
  const [center, setCenter] = useState<Center | null>(null);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const [manageOpen, setManageOpen] = useState(false);
  const [current, setCurrent] = useState<Profile | null>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [assigned, setAssigned] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!centerId) return;
    try {
      const [c, t, g] = await Promise.all([
        fetchMyCenter(centerId), fetchStaff(centerId), fetchGroups(centerId),
      ]);
      setCenter(c); setTeachers(t); setGroups(g);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [centerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!isOwner(profile)) {
    return (
      <GradientScreen>
        <BackHeader title="فريق العمل" />
        <NoAccess message="إدارة الفريق خاصة بصاحب السنتر فقط." />
      </GradientScreen>
    );
  }

  const shown = roleFilter === 'all' ? teachers : teachers.filter((t) => t.role === roleFilter);

  const openManage = async (t: Profile) => {
    setCurrent(t);
    const p: Record<string, boolean> = {};
    for (const { key } of TEACHER_PERMS) p[key] = (t.perms as Record<string, boolean>)?.[key] === true;
    setPerms(p);
    setFormError(null);
    setManageOpen(true);
    try {
      setAssigned((await fetchTeacherGroups(t.id)).map((r) => r.group_id));
    } catch {
      setAssigned([]);
    }
  };

  const togglePerm = (key: TeacherPermKey) => {
    setPerms((p) => ({ ...p, [key]: !p[key] }));
  };

  const toggleGroup = (gid: string) => {
    setAssigned((prev) => (prev.includes(gid) ? prev.filter((g) => g !== gid) : [...prev, gid]));
  };

  const saveManage = async () => {
    if (!current) return;
    setBusy(true);
    setFormError(null);
    try {
      await setTeacherPerms(current.id, perms);
      await assignTeacherGroups(centerId, current.id, assigned);
      await logActivity(centerId, 'staff_activated', `${current.full_name} — تحديث صلاحيات (${assigned.length} مجموعات)`);
      setManageOpen(false);
      await load();
    } catch (e) {
      setFormError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (t: Profile) => {
    const activating = !t.is_active;
    Alert.alert(
      activating ? 'تفعيل المدرس؟' : 'إيقاف المدرس؟',
      activating
        ? `سيتمكن «${t.full_name}» من الدخول بالصلاحيات المحددة له.`
        : `سيُمنع «${t.full_name}» من الدخول فوراً (حسابه يبقى محفوظاً).`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: activating ? 'تفعيل' : 'إيقاف',
          style: activating ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await setTeacherActive(t.id, activating);
              await logActivity(centerId, activating ? 'staff_activated' : 'staff_suspended', `${t.full_name} (${roleLabel(t.role)})`);
              await load();
            } catch (e) { Alert.alert('تعذر التحديث', arabicError(e)); }
          },
        },
      ],
    );
  };

  const confirmDelete = (t: Profile) => {
    Alert.alert('حذف المدرس', `حذف ملف «${t.full_name}» نهائياً؟ (لن يستطيع الدخول بعدها)`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
          onPress: async () => {
            try {
              await deleteTeacher(t.id);
              await logActivity(centerId, 'staff_deleted', `${t.full_name} (${roleLabel(t.role)})`);
              await load();
            } catch (e) { Alert.alert('تعذر الحذف', arabicError(e)); }
          },
      },
    ]);
  };

  const activePerms = (t: Profile) => TEACHER_PERMS.filter(({ key }) => (t.perms as Record<string, boolean>)?.[key]);

  const counts = (r: string) => teachers.filter((t) => t.role === r && t.is_active).length;
  const limits = limitsFor(center?.kind, subscription?.plan_type);
  const limitText = (used: number, max: number, label: string) => `${label}: ${used}/${max}`;

  return (
    <GradientScreen>
      <BackHeader
        title="فريق العمل"
        subtitle={`مدير ${counts('manager')}/${limits.managers} · سكرتير ${counts('secretary')}/${limits.secretaries} · مدرس ${counts('teacher')}/${limits.teachers}`}
      />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : center?.kind === 'solo' ? (
        <EmptyState
          icon="person-outline"
          title="حساب مدرس خصوصي"
          message="حسابك فردي مستقل — تدير موادك وطلابك بنفسك ولا يوجد فريق تابع."
        />
      ) : (
        <>
          <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {([
                { v: 'all', label: `الكل (${teachers.length})` },
                { v: 'teacher', label: `مدرس (${counts('teacher')})` },
                { v: 'manager', label: `مدير (${counts('manager')})` },
                { v: 'secretary', label: `سكرتير (${counts('secretary')})` },
              ]).map((f) => (
                <Pressable
                  key={f.v}
                  onPress={() => setRoleFilter(f.v)}
                  style={[styles.chip, roleFilter === f.v && styles.chipActive]}
                >
                  <Text style={[styles.chipText, roleFilter === f.v && styles.chipTextActive]}>{f.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          {shown.length === 0 ? (
            <EmptyState
              icon="briefcase-outline"
              title="لا يوجد أفراد بعد"
              message="شارك كود سنترك مع فريقك ليسجلوا من «انضمام لفريق سنتر»، ثم فعّلهم من هنا وحدد صلاحياتهم ومجموعاتهم"
            />
          ) : (
            <FlatList
              data={shown}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Card style={styles.tCard}>
              <View style={styles.tHead}>
                <View style={[styles.tIcon, { opacity: item.is_active ? 1 : 0.5 }]}>
                  <Ionicons name="briefcase" size={20} color={item.is_active ? colors.primary : colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.tName} numberOfLines={1}>{item.full_name}</Text>
                    <View style={styles.rolePill}>
                      <Text style={styles.roleText}>{roleLabel(item.role)}</Text>
                    </View>
                  </View>
                  <Text style={styles.tMeta}>{item.phone ?? ''}{item.email ? ` · ${item.email}` : ''}</Text>
                  <Text style={styles.tMeta}>
                    {activePerms(item).length > 0
                      ? activePerms(item).map(({ label }) => label).slice(0, 3).join(' · ') + (activePerms(item).length > 3 ? '...' : '')
                      : 'بلا صلاحيات بعد'}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: item.is_active ? colors.successBg : colors.warningBg }]}>
                  <Text style={[styles.statusText, { color: item.is_active ? colors.success : colors.warning }]}>
                    {item.is_active ? 'مفعّل' : 'بانتظار التفعيل'}
                  </Text>
                </View>
              </View>
              <Text style={styles.tDate}>سجّل {formatDate(item.created_at)}</Text>
              <View style={styles.tActions}>
                <Pressable onPress={() => openManage(item)} style={styles.actionBtn}>
                  <Ionicons name="settings" size={15} color={colors.cyan} />
                  <Text style={[styles.actionText, { color: colors.cyan }]}>الصلاحيات</Text>
                </Pressable>
                <Pressable onPress={() => toggleActive(item)} style={styles.actionBtn}>
                  <Ionicons name={item.is_active ? 'pause' : 'play'} size={15} color={item.is_active ? colors.warning : colors.success} />
                  <Text style={[styles.actionText, { color: item.is_active ? colors.warning : colors.success }]}>
                    {item.is_active ? 'إيقاف' : 'تفعيل'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(item)} style={styles.actionBtn}>
                  <Ionicons name="trash" size={15} color={colors.danger} />
                  <Text style={[styles.actionText, { color: colors.danger }]}>حذف</Text>
                </Pressable>
              </View>
            </Card>
          )}
        />
          )}
        </>
      )}

      <Modal visible={manageOpen} transparent animationType="slide" onRequestClose={() => setManageOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>صلاحيات: {current?.full_name}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <SectionTitle
                title="الصلاحيات (فعّل/ألغِ)"
                action={
                  <Text
                    style={styles.selectAll}
                    onPress={() => {
                      const allOn = TEACHER_PERMS.every(({ key }) => perms[key]);
                      const next: Record<string, boolean> = {};
                      for (const { key } of TEACHER_PERMS) next[key] = !allOn;
                      setPerms(next);
                    }}
                  >
                    تحديد الكل
                  </Text>
                }
              />
              {TEACHER_PERMS.map(({ key, label, hint }) => (
                <Pressable key={key} onPress={() => togglePerm(key)} style={styles.permRow}>
                  <Ionicons
                    name={perms[key] ? 'checkbox' : 'square-outline'}
                    size={22} color={perms[key] ? colors.success : colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.permLabel}>{label}</Text>
                    <Text style={styles.permHint}>{hint}</Text>
                  </View>
                </Pressable>
              ))}
              <SectionTitle title="مجموعاته (نطاق عمله)" />
              {groups.length === 0 ? (
                <Text style={styles.dimText}>لا توجد مجموعات — أنشئها أولاً من شاشة المجموعات</Text>
              ) : groups.map((g) => (
                <Pressable key={g.id} onPress={() => toggleGroup(g.id)} style={styles.permRow}>
                  <Ionicons
                    name={assigned.includes(g.id) ? 'checkbox' : 'square-outline'}
                    size={22} color={assigned.includes(g.id) ? colors.primary : colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.permLabel}>{g.name}</Text>
                    {g.teacher_name ? <Text style={styles.permHint}>المدرس المسجل: {g.teacher_name}</Text> : null}
                  </View>
                </Pressable>
              ))}
              <FormMessage type="error" text={formError} />
              <AppButton title="حفظ" icon="checkmark" onPress={saveManage} loading={busy} />
              <View style={{ height: spacing.sm }} />
              <AppButton title="إلغاء" variant="ghost" small onPress={() => setManageOpen(false)} />
              <View style={{ height: spacing.xl }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary + '33', borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '700' },
  chipTextActive: { color: colors.text },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rolePill: {
    backgroundColor: colors.infoBg, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  roleText: { color: colors.info, fontSize: font.xs, fontWeight: '800' },
  selectAll: { color: colors.cyan, fontSize: font.sm, fontWeight: '700' },
  tCard: { marginBottom: spacing.md },
  tHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tIcon: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.primary + '22', borderWidth: 1, borderColor: colors.primary + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  tName: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  tMeta: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  tDate: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: spacing.sm },
  statusPill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusText: { fontSize: font.xs, fontWeight: '800' },
  tActions: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md, paddingVertical: spacing.sm,
  },
  actionText: { fontSize: font.sm, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bgSoft, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xl, paddingBottom: spacing.xxl * 1.5,
    borderWidth: 1, borderColor: colors.border, maxHeight: '94%',
  },
  modalTitle: {
    color: colors.text, fontSize: font.lg, fontWeight: '900',
    textAlign: 'center', marginBottom: spacing.lg,
  },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  permLabel: { color: colors.text, fontSize: font.md, fontWeight: '700', textAlign: 'right' },
  permHint: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  dimText: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
});
