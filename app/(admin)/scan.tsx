// ============================================================
// ماسح باركود الحضور (مسئول السنتر): امسح باركود الطالب من تطبيقه
// فيعرض بياناته الكاملة مع إجراءات سريعة (تحضير/تحصيل/ملف).
// العزل خادمي (RLS): باركود سنتر آخر لا يكشف أي بيانات.
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppButton, Card, EmptyState, LoadingView, NoAccess } from '../../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { FormMessage } from '../../src/components/pickers';
import { can } from '../../src/lib/staff';
import {
  fetchDuesForStudent, fetchGroups, fetchStudentById, fetchStudentGroups, fetchStudents,
  markStudentPresentToday,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { decodeStudentQr, isQrFresh } from '../../src/lib/qr';
import type { Due, Student } from '../../src/lib/types';
import { arabicError, formatMoney, todayIso } from '../../src/lib/utils';
import { colors, font, radius, spacing } from '../../src/theme';

type Phase = 'scan' | 'working' | 'result' | 'denied';

interface ScanResult {
  student: Student;
  groupName: string;
  attendGroupId: string | null;
  pending: Due[];
}

export default function ScanAttendanceScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [phase, setPhase] = useState<Phase>('scan');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [marked, setMarked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);
  const lock = useRef(false);

  // طلب إذن الكاميرا تلقائياً عند فتح الشاشة (إن لم يُحسم بعد)
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const reset = () => {
    setResult(null);
    setError(null);
    setMarked(false);
    setMatches([]);
    setPhase('scan');
    lock.current = false;
  };

  const deny = (message: string) => {
    setError(message);
    setPhase('denied');
  };

  /** بناء بطاقة الطالب من سجله (تُستخدم للمسح والبحث اليدوي) */
  const buildResult = async (student: Student) => {
    if (student.status !== 'active') throw new Error('student_not_active');
    const [groups, dues, extra] = await Promise.all([
      fetchGroups(centerId),
      fetchDuesForStudent(student.id),
      fetchStudentGroups(student.id).catch(() => [] as { group_id: string }[]),
    ]);
    const primary = groups.find((g) => g.id === student.group_id);
    const extraNames = extra
      .map((r) => groups.find((g) => g.id === r.group_id)?.name)
      .filter(Boolean) as string[];
    const attendGroupId = student.group_id ?? extra[0]?.group_id ?? null;
    setResult({
      student,
      groupName: primary
        ? primary.name + (extraNames.length > 0 ? ` (+${extraNames.length})` : '')
        : extraNames.length > 0 ? extraNames.join(' · ') : 'بدون مجموعة',
      attendGroupId,
      pending: dues.filter((d) => d.status !== 'paid'),
    });
    setPhase('result');
  };

  const searchManual = async () => {
    const q = query.trim();
    if (!q || !centerId) return;
    setSearching(true);
    try {
      setMatches(await fetchStudents(centerId, q));
    } catch (e) {
      Alert.alert('تعذر البحث', arabicError(e));
    } finally {
      setSearching(false);
    }
  };

  const openManual = async (student: Student) => {
    if (student.center_id !== centerId) {
      Alert.alert('مرفوض', 'هذا الطالب لا يخص سنترك.');
      return;
    }
    setPhase('working');
    setError(null);
    try {
      await buildResult(student);
    } catch (e) {
      deny(arabicError(e));
    }
  };

  const handleBarCode = async (data: string) => {
    if (lock.current || phase !== 'scan' || !centerId) return;
    lock.current = true;
    setPhase('working');
    setError(null);
    try {
      // 1) رمز لا يفكّه إلا تطبيقنا
      const decoded = decodeStudentQr(data);
      if (!decoded) {
        deny('رمز غير صالح — امسح باركود طالب من داخل تطبيق Mr Center فقط.');
        return;
      }
      // الباركود يومي: لقطة شاشة قديمة مرفوضة
      if (!isQrFresh(decoded, todayIso())) {
        deny('هذا الباركود منتهي (خاص بيوم آخر) — اطلب من الطالب فتح تطبيقه اليوم وعرض باركوده الجديد.');
        return;
      }
      // 2) عزل السناتر عميلياً (والخادم يؤكده عبر RLS)
      if (decoded.centerId !== centerId) {
        deny('هذا الباركود لا يخص سنترك — لا يمكن عرض بيانات هذا الطالب.');
        return;
      }
      // 3) الجلب يخضع لـ RLS: صف سنتر آخر يرد فارغاً
      const student = await fetchStudentById(decoded.studentId);
      if (!student || student.center_id !== centerId) {
        deny('هذا الباركود لا يخص سنترك — لا يمكن عرض بيانات هذا الطالب.');
        return;
      }
      await buildResult(student);
    } catch (e) {
      deny(arabicError(e));
    }
  };

  const markPresent = async () => {
    if (!result) return;
    setBusy(true);
    try {
      await markStudentPresentToday(centerId, {
        id: result.student.id,
        group_id: result.attendGroupId ?? result.student.group_id,
      });
      setMarked(true);
    } catch (e) {
      Alert.alert('تعذر التحضير', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const collect = () => {
    if (!result) return;
    if (result.pending.length === 0) {
      Alert.alert('لا مستحقات', `الطالب «${result.student.name}» مسدد لكل مستحقاته.`);
      return;
    }
    // التحصيل يبدأ بالأقدم أولاً (القائمة مرتبة من الأحدث)
    const oldest = result.pending[result.pending.length - 1];
    router.push(`/student/${result.student.id}?pay=${oldest.id}`);
  };

  const pendingTotal = (result?.pending ?? []).reduce((s, d) => s + (Number(d.amount) || 0), 0);

  if (!can(profile, 'attendance')) {
    return (
      <GradientScreen>
        <BackHeader title="مسح باركود الحضور" />
        <NoAccess />
      </GradientScreen>
    );
  }

  return (
    <GradientScreen>
      <BackHeader title="مسح باركود الحضور" subtitle="وجّه الكاميرا لباركود الطالب" />

      {!permission ? (
        <LoadingView message="جاري طلب إذن الكاميرا..." />
      ) : phase === 'result' && result ? (
        /* بطاقة الطالب — تظهر فوق أي وضع */
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Card>
            <View style={styles.studentHead}>
              <View style={styles.studentIcon}>
                <Ionicons name="person" size={24} color={colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.studentName} numberOfLines={1}>{result.student.name}</Text>
                <Text style={styles.studentMeta}>{result.groupName}</Text>
                {result.student.phone ? <Text style={styles.studentMeta}>{result.student.phone}</Text> : null}
              </View>
              {marked ? (
                <View style={styles.markedPill}>
                  <Ionicons name="checkmark" size={14} color={colors.success} />
                  <Text style={styles.markedText}>حاضر اليوم</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.duesRow}>
              <Ionicons name="wallet" size={16} color={pendingTotal > 0 ? colors.warning : colors.success} />
              <Text style={styles.duesText}>
                {pendingTotal > 0
                  ? `مستحق معلق: ${formatMoney(pendingTotal)} (${result.pending.length})`
                  : 'لا توجد مستحقات معلقة'}
              </Text>
            </View>
          </Card>

          <View style={{ height: spacing.md }} />
          <AppButton
            title={marked ? 'تم تحضيره اليوم' : 'تحضير الطالب اليوم'}
            icon="checkmark-done"
            variant="success"
            disabled={marked}
            onPress={markPresent}
            loading={busy}
          />
          <View style={{ height: spacing.sm }} />
          <AppButton title="تحصيل منه" icon="cash" onPress={collect} />
          <View style={{ height: spacing.sm }} />
          <AppButton
            title="الملف الكامل للطالب"
            icon="person-circle"
            variant="outline"
            onPress={() => router.push(`/student/${result.student.id}`)}
          />
          <View style={{ height: spacing.sm }} />
          <AppButton title={mode === 'manual' ? 'بحث عن طالب آخر' : 'مسح طالب آخر'} icon={mode === 'manual' ? 'search' : 'qr-code'} variant="ghost" small onPress={() => { reset(); }} />
        </View>
      ) : mode === 'manual' ? (
        /* البحث اليدوي يعمل دائماً حتى بلا إذن كاميرا */
        <KeyboardScreen>
          <View style={styles.modeRow}>
            <AppButton title="مسح بالكاميرا" icon="camera" small variant="outline" onPress={() => setMode('camera')} />
          </View>
          <Card>
            <Text style={styles.manualTitle}>ابحث بالاسم أو الهاتف</Text>
            <View style={styles.searchRow}>
              <View style={{ flex: 1 }}>
                <TextInput
                  placeholder="مثال: أحمد أو 010..."
                  placeholderTextColor={colors.textMuted}
                  value={query}
                  onChangeText={setQuery}
                  style={styles.searchInput}
                  textAlign="right"
                  returnKeyType="search"
                  onSubmitEditing={searchManual}
                />
              </View>
              <Pressable style={styles.searchBtn} onPress={searchManual} disabled={searching}>
                <Ionicons name="search" size={22} color="#052E22" />
              </Pressable>
            </View>
            {searching ? <LoadingView message="جاري البحث..." /> : null}
            {!searching && query.trim() && matches.length === 0 ? (
              <EmptyState icon="person-outline" title="لا نتائج" message="جرّب اسماً أو رقماً مختلفاً" />
            ) : matches.map((s) => (
              <Pressable key={s.id} onPress={() => openManual(s)} style={styles.matchRow}>
                <Ionicons name="person" size={18} color={colors.info} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.matchName}>{s.name}</Text>
                  {s.phone ? <Text style={styles.matchPhone}>{s.phone}</Text> : null}
                </View>
                <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </Card>
          {phase === 'working' ? <LoadingView message="جاري جلب بيانات الطالب..." /> : null}
          <FormMessage type="error" text={phase === 'denied' ? error : null} />
        </KeyboardScreen>
      ) : !permission.granted ? (
        <View style={styles.centerFill}>
          <Card style={{ marginHorizontal: spacing.lg }}>
            <View style={styles.permIcon}>
              <Ionicons name="camera" size={30} color={colors.primary} />
            </View>
            <Text style={styles.permTitle}>الكاميرا مطلوبة</Text>
            <Text style={styles.permText}>
              {permission.canAskAgain
                ? 'نحتاج الكاميرا لمسح باركود حضور الطلاب من تطبيقاتهم.'
                : 'تم رفض إذن الكاميرا نهائياً — افتح إعدادات التطبيق وفعّل الكاميرا يدوياً.'}
            </Text>
            <View style={{ height: spacing.lg }} />
            {permission.canAskAgain ? (
              <AppButton title="منح الإذن" icon="camera" onPress={() => { void requestPermission(); }} />
            ) : (
              <AppButton title="فتح إعدادات التطبيق" icon="settings" onPress={() => { void Linking.openSettings(); }} />
            )}
            <View style={{ height: spacing.sm }} />
            <AppButton title="بحث يدوي بدل الكاميرا" icon="search" variant="ghost" small onPress={() => setMode('manual')} />
          </Card>
        </View>
      ) : (
        /* الكاميرا */
        <View style={styles.cameraWrap}>
          <View style={styles.modeRow}>
            <AppButton title="بحث يدوي" icon="search" small variant="ghost" onPress={() => setMode('manual')} />
          </View>
          <CameraView
            style={styles.camera}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={phase === 'scan' ? ({ data }) => { void handleBarCode(data); } : undefined}
          />
          {/* طبقة الإطار فوق الكاميرا (CameraView لا يقبل أطفالاً) */}
          <View style={styles.overlay} pointerEvents="none">
            <View style={styles.frame} />
            <Text style={styles.hint}>ضع باركود الطالب داخل الإطار</Text>
          </View>
          {phase === 'working' ? <LoadingView message="جاري جلب بيانات الطالب..." /> : null}
          {phase === 'denied' ? (
            <View style={styles.deniedBox}>
              <FormMessage type="error" text={error} />
              <AppButton title="مسح مجدداً" icon="refresh" small onPress={reset} />
            </View>
          ) : null}
          <Pressable style={styles.torchBtn} onPress={() => setTorch((v) => !v)}>
            <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={22} color="#fff" />
          </Pressable>
        </View>
      )}
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, justifyContent: 'center' },
  permIcon: {
    width: 64, height: 64, borderRadius: radius.full, alignSelf: 'center',
    backgroundColor: colors.primary + '22', borderWidth: 1, borderColor: colors.primary + '55',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  permTitle: { color: colors.text, fontSize: font.lg, fontWeight: '900', textAlign: 'center' },
  permText: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },
  cameraWrap: { flex: 1, position: 'relative' },
  camera: { ...StyleSheet.absoluteFillObject },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)',
  },
  frame: {
    width: 250, height: 250, borderRadius: radius.lg,
    borderWidth: 3, borderColor: colors.cyan, backgroundColor: 'transparent',
  },
  hint: { color: '#fff', fontSize: font.md, fontWeight: '700', marginTop: spacing.lg },
  torchBtn: {
    position: 'absolute', bottom: spacing.xl, alignSelf: 'center',
    width: 52, height: 52, borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  deniedBox: { padding: spacing.lg },
  modeRow: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  manualTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right', marginBottom: spacing.md },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  searchInput: {
    flex: 1, color: colors.text, fontSize: font.md, textAlign: 'right',
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  searchBtn: {
    width: 52, height: 52, borderRadius: radius.md,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  matchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  matchName: { color: colors.text, fontSize: font.md, fontWeight: '700', textAlign: 'right' },
  matchPhone: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  studentHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  studentIcon: {
    width: 52, height: 52, borderRadius: radius.md,
    backgroundColor: colors.info + '1f', borderWidth: 1, borderColor: colors.info + '4d',
    alignItems: 'center', justifyContent: 'center',
  },
  studentName: { color: colors.text, fontSize: font.lg, fontWeight: '900', textAlign: 'right' },
  studentMeta: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 2 },
  markedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.successBg, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  markedText: { color: colors.success, fontSize: font.xs, fontWeight: '800' },
  duesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  duesText: { color: colors.text, fontSize: font.sm, fontWeight: '700', textAlign: 'right', flex: 1 },
});
