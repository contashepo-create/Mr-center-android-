// ============================================================
// المدرسون التابعون: تفعيل/إيقاف + صلاحيات + إسناد مجموعات
// (للسنتر المتكامل فقط — الحساب المنفرد بلا مدرسين تابعين)
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { AppButton, AppInput, Card, EmptyState, LoadingView, SectionTitle, NoAccess } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage, OptionPicker } from '../../src/components/pickers';
import {
  assignTeacherGroups, createStaffInvite, deleteTeacher, devListInvites, fetchGroups, fetchMyCenter, fetchStaff, fetchTeacherGroups,
  logActivity, revokeStaffInvite, setTeacherActive, setTeacherPerms,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { isOwner, roleLabel, TEACHER_PERMS } from '../../src/lib/staff';
import { limitsFor } from '../../src/lib/billing';
import type { Center, Group, Profile, StaffInvite, TeacherPermKey } from '../../src/lib/types';
import { arabicError, formatDate } from '../../src/lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

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

  // دعوة موظف جديد (سكرتير/مدرس فقط — المدير هو صاحب السنتر ولا يُدعى)
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invName, setInvName] = useState('');
  const [invPhone, setInvPhone] = useState('');
  const [invRole, setInvRole] = useState<'secretary' | 'teacher'>('secretary');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [invBusy, setInvBusy] = useState(false);

  const load = useCallback(async () => {
    if (!centerId) return;
    try {
      const [c, t, g, inv] = await Promise.all([
        fetchMyCenter(centerId), fetchStaff(centerId), fetchGroups(centerId),
        devListInvites(centerId).catch(() => []),
      ]);
      setCenter(c); setTeachers(t); setGroups(g); setInvites(inv);
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

  const createInvite = async () => {
    if (!invName.trim()) { Alert.alert('بيانات ناقصة', 'أدخل اسم الموظف'); return; }
    setInvBusy(true);
    try {
      const code = await createStaffInvite({ centerId, name: invName, phone: invPhone, role: invRole });
      setInviteCode(code);
      await logActivity(centerId, 'staff_invite_created', `${invName} (${roleLabel(invRole)}) — كود دعوة`);
      await load();
    } catch (e) {
      Alert.alert('تعذر إنشاء الدعوة', arabicError(e));
    } finally { setInvBusy(false); }
  };

  const copyInvite = async (code: string) => {
    try { await Clipboard.setStringAsync(code); Alert.alert('تم النسخ', `كود الدعوة: ${code}`); }
    catch { Alert.alert('كود الدعوة', code); }
  };

  const revokeInvite = (inv: StaffInvite) => {
    Alert.alert('سحب الدعوة', `إلغاء كود دعوة «${inv.name}»؟ لن يعمل الكود بعد الآن.`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'سحب', style: 'destructive', onPress: async () => { try { await revokeStaffInvite(inv.id); await load(); } catch (e) { Alert.alert('تعذر السحب', arabicError(e)); } } },
    ]);
  };

  const counts = (r: string) => teachers.filter((t) => t.role === r && t.is_active).length;
  const limits = limitsFor(center?.kind, subscription?.plan_type);
  const limitText = (used: number, max: number, label: string) => `${label}: ${used}/${max}`;

  return (
    <GradientScreen>
      <BackHeader
        title="فريق العمل"
        subtitle={`المدير هو صاحب السنتر · سكرتير ${counts('secretary')}/${limits.secretaries} · مدرس ${counts('teacher')}/${limits.teachers}`}
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
          <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
            <AppButton title="دعوة موظف (سكرتير/مدرس)" icon="person-add" variant="outline" onPress={() => { setInviteCode(null); setInvName(''); setInvPhone(''); setInvRole('secretary'); setInviteOpen(true); }} />
          </View>
          {shown.length === 0 ? (
            <EmptyState
              icon="briefcase-outline"
              title="لا يوجد أفراد بعد"
              message="اضغط «دعوة موظف» لتوليد كود دعوة وأرسله لسكرتير أو مدرس ليسجل به حسابه، ثم فعّله من هنا وحدد صلاحياته ومجموعاته"
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
          {invites.filter((i) => i.status === 'pending').length > 0 ? (
            <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xl }}>
              <SectionTitle title="دعوات بانتظار التسجيل" />
              {invites.filter((i) => i.status === 'pending').map((inv) => (
                <Card key={inv.id} style={{ marginBottom: spacing.sm }}>
                  <View style={styles.nameRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tName}>{inv.name} — {roleLabel(inv.role)}</Text>
                      <Text style={styles.tMeta}>الكود: {inv.code} · بانتظار التسجيل بالكود</Text>
                    </View>
                    <Pressable onPress={() => copyInvite(inv.code)} style={styles.actionBtn}><Ionicons name="copy" size={14} color={colors.cyan} /><Text style={[styles.actionText, { color: colors.cyan }]}>نسخ</Text></Pressable>
                    <Pressable onPress={() => revokeInvite(inv)} style={styles.actionBtn}><Ionicons name="close-circle" size={14} color={colors.danger} /><Text style={[styles.actionText, { color: colors.danger }]}>سحب</Text></Pressable>
                  </View>
                </Card>
              ))}
            </View>
          ) : null}
        </>
      )}

      <Modal visible={inviteOpen} transparent animationType="slide" onRequestClose={() => setInviteOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>دعوة موظف جديد</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.permHint}>حد الباقة يُفرض تلقائياً (سكرتير/مدرس). المدير هو صاحب السنتر ولا يُضاف مدير إضافي.</Text>
              <AppInput label="اسم الموظف" value={invName} onChangeText={setInvName} placeholder="الاسم الكامل" />
              <AppInput label="رقم الهاتف (اختياري)" value={invPhone} onChangeText={setInvPhone} keyboardType="phone-pad" />
              <OptionPicker
                label="الدور"
                value={invRole}
                options={[{ value: 'secretary', label: 'سكرتير' }, { value: 'teacher', label: 'مدرس' }]}
                onChange={(v) => setInvRole(v as 'secretary' | 'teacher')}
              />
              {inviteCode ? (
                <Card>
                  <Text style={styles.modalTitle}>كود الدعوة</Text>
                  <Text style={{ color: colors.primary, fontSize: 30, fontWeight: '900', textAlign: 'center', letterSpacing: 3 }}>{inviteCode}</Text>
                  <Text style={styles.permHint}>أرسل الكود للموظف ليمرر من «دخول فريق العمل ← سجّل بالكود» مع بريده وكلمة مرور. يبقى حسابه خاملاً حتى تفعّله من هنا.</Text>
                  <AppButton title="نسخ الكود" icon="copy" variant="outline" small onPress={() => copyInvite(inviteCode)} />
                  <View style={{ height: spacing.sm }} />
                  <AppButton title="تم" icon="checkmark" small onPress={async () => { setInviteOpen(false); await load(); }} loading={invBusy} />
                </Card>
              ) : (
                <AppButton title="توليد كود الدعوة" icon="key" onPress={createInvite} loading={invBusy} />
              )}
              <View style={{ height: spacing.md }} />
              <AppButton title="إغلاق" variant="ghost" small onPress={() => setInviteOpen(false)} />
              <View style={{ height: spacing.xl }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

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

const styles = themedStyles(() => StyleSheet.create({
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
}));
