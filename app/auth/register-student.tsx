// ============================================================
// تسجيل طالب جديد — الخطوة ١: كود السنتر، الخطوة ٢: البيانات
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { AppButton, AppInput, Card } from '../../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { checkAvailability, fetchSignupLists, lookupCenterByCode, registerStudent } from '../../src/lib/api';
import { savePendingRegistration } from '../../src/lib/pendingRegistration';
import { useSession } from '../../src/lib/session';
import type { CenterLookup } from '../../src/lib/types';
import {
  arabicError, isAllowedEmailDomain, isValidEmail, isValidPhone, normalizeCenterCode, normalizePhone,
} from '../../src/lib/utils';
import { decodeCenterQr } from '../../src/lib/qr';
import { FormMessage, OptionPicker } from '../../src/components/pickers';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

export default function RegisterStudentScreen() {
  const { refresh } = useSession();
  const [step, setStep] = useState<1 | 2>(1);
  const [code, setCode] = useState('');
  const [center, setCenter] = useState<CenterLookup | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [password, setPassword] = useState('');
  const [grades, setGrades] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; grade_id: string | null }[]>([]);
  const [gradeId, setGradeId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanOpen, setScanOpen] = useState(false);
  const scanLock = useRef(false);

  // الخطوة ١: التحقق من كود السنتر
  const verifyCode = async (override?: string) => {
    setError(null);
    const normalized = normalizeCenterCode(override ?? code);
    if (!normalized) return setError('أدخل كود السنتر أولاً');
    setBusy(true);
    try {
      const found = await lookupCenterByCode(normalized);
      if (!found) {
        setError('كود السنتر غير صحيح — تأكد من الكود مع إدارة السنتر');
        return;
      }
      // ملاحظة: الدالة القديمة على الخادم لا ترجع status — الغياب يُعامل كفعّال
      if (found.status && found.status !== 'active') {
        setError('هذا السنتر موقوف حالياً — تواصل مع إدارته أو إدارة التطبيق');
        return;
      }
      setCenter(found);
      try {
        const lists = await fetchSignupLists(found.id);
        setGrades(lists.grades);
        setGroups(lists.groups);
      } catch {
        // القوائم اختيارية — التسجيل يكمل بدونها
      }
      setStep(2);
    } catch (e) {
      setError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  // الخطوة ٢: إنشاء الحساب
  const submit = async () => {
    setError(null);
    if (!fullName.trim()) return setError('أدخل اسمك الكامل');
    if (!isValidEmail(email)) return setError('أدخل بريداً إلكترونياً صحيحاً');
    if (!isAllowedEmailDomain(email)) {
      return setError('استخدم بريداً من موفر معروف (Gmail / Yahoo / Outlook / iCloud...) — الإيميلات المؤقتة مرفوضة');
    }
    if (!isValidPhone(phone)) return setError('أدخل رقم هاتف صحيح (8 أرقام على الأقل)');
    if (!isValidPhone(guardianPhone)) return setError('رقم هاتف ولي الأمر إجباري — أدخله بشكل صحيح');
    if (normalizePhone(phone) === normalizePhone(guardianPhone)) {
      return setError('رقم ولي الأمر يجب أن يختلف عن رقم هاتفك — لا تكتب نفس الرقم');
    }
    if (password.length < 6) return setError('كلمة المرور يجب ألا تقل عن 6 أحرف');
    if (!center) return setError('أدخل كود السنتر أولاً');

    setBusy(true);
    try {
      const availability = await checkAvailability(email, normalizePhone(phone));
      if (availability.email_taken) {
        setBusy(false);
        return setError('هذا البريد الإلكتروني مستخدم من قبل — سجّل دخولك أو استخدم بريداً آخر');
      }
      if (availability.phone_taken) {
        setBusy(false);
        return setError('رقم الهاتف مستخدم من قبل — لا يمكن تكراره حتى مع سنتر مختلف');
      }
      await registerStudent({
        centerId: center.id,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: normalizePhone(phone),
        guardianPhone: normalizePhone(guardianPhone),
        password,
        gradeId,
        groupId,
      });
      await refresh();
      Alert.alert(
        'تم إنشاء حسابك بنجاح',
        `أصبح حسابك مرتبطاً بسنتر «${center.name}» تلقائياً.\nلن تحتاج كود السنتر مرة أخرى عند تسجيل الدخول.`,
      );
    } catch (e) {
      const m = String((e as any)?.message ?? '').toLowerCase();
      // التأكيد مفعّل: نحفظ البيانات معلقة ونطلب تأكيد البريد ثم الدخول
      if (m.includes('email_confirmation_required')) {
        await savePendingRegistration({
          kind: 'student',
          email: email.trim().toLowerCase(),
          centerId: center.id,
          fullName: fullName.trim(),
          phone: normalizePhone(phone),
          guardianPhone: normalizePhone(guardianPhone),
          gradeId,
          groupId,
        });
        setBusy(false);
        Alert.alert(
          'أكّد بريدك الإلكتروني',
          'أرسلنا رابط تأكيد إلى بريدك لمنع الحسابات الوهمية.\nافتحه من نفس هذا الجهاز ثم سجّل دخولك وسيُرتبط حسابك بسنترك تلقائياً.',
          [{ text: 'تسجيل الدخول', onPress: () => router.push('/auth/login-student') }],
        );
        return;
      }
      setError(arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GradientScreen>
      <BackHeader title="تسجيل طالب جديد" subtitle={`الخطوة ${step} من 2`} />
      <KeyboardScreen>
        {step === 1 ? (
          <Card>
            <View style={styles.stepIcon}>
              <Ionicons name="key" size={30} color={colors.cyan} />
            </View>
            <Text style={styles.stepTitle}>أدخل كود السنتر</Text>
            <Text style={styles.stepSub}>
              احصل على الكود من إدارة سنترك — هو مفتاح ربط حسابك بسنترك ومجموعاتك
            </Text>
            <View style={{ height: spacing.lg }} />
            <AppInput
              label="كود السنتر"
              icon="shield-checkmark"
              placeholder="مثال: MR أو MRC7"
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              textAlign="left"
              style={{ writingDirection: 'ltr' }}
            />
            <FormMessage type="error" text={error} />
            <AppButton title="تحقق من الكود" icon="search" onPress={() => verifyCode()} loading={busy} />
            <View style={{ height: spacing.sm }} />
            <AppButton
              title="مسح باركود السنتر بدل الكتابة"
              icon="qr-code"
              variant="outline"
              small
              onPress={async () => {
                if (!permission?.granted) {
                  const res = await requestPermission();
                  if (!res.granted) {
                    setError('امنح إذن الكاميرا أولاً لمسح الباركود — أو اكتب الكود يدوياً');
                    return;
                  }
                }
                scanLock.current = false;
                setScanOpen(true);
              }}
            />
          </Card>
        ) : (
          <>
              {/* بطاقة السنتر المؤكد */}
            <Card style={styles.centerCard}>
              <View style={styles.centerRow}>
                <View style={styles.centerIcon}>
                  <Ionicons name="business" size={22} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.centerName}>{center?.name}</Text>
                  <Text style={styles.centerOwner}>المسئول: {center?.owner_name || '—'}</Text>
                </View>
                <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              </View>
              <Text style={styles.centerHint}>
                تأكد أن هذا هو سنترك قبل المتابعة — سيرتبط حسابك به نهائياً
              </Text>
            </Card>

            {grades.length > 0 || groups.length > 0 ? (
              <Card style={{ marginTop: spacing.md }}>
                <OptionPicker
                  label="صفك الدراسي (اختياري)"
                  icon="school"
                  value={gradeId}
                  options={grades.map((g) => ({ value: g.id, label: g.name }))}
                  onChange={(v) => { setGradeId(v); setGroupId(null); }}
                  placeholder="اختر صفك..."
                />
                <View style={{ height: spacing.sm }} />
                <OptionPicker
                  label="مجموعتك (اختياري)"
                  icon="albums"
                  value={groupId}
                  options={(gradeId ? groups.filter((g) => !g.grade_id || g.grade_id === gradeId) : groups)
                    .map((g) => ({ value: g.id, label: g.name }))}
                  onChange={setGroupId}
                  placeholder="اختر مجموعتك..."
                />
              </Card>
            ) : null}

            <Card style={{ marginTop: spacing.md }}>
              <AppInput
                label="الاسم الكامل"
                icon="person"
                placeholder="مثال: أحمد محمد علي"
                value={fullName}
                onChangeText={setFullName}
              />
              <AppInput
                label="البريد الإلكتروني"
                icon="mail"
                placeholder="example@mail.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textAlign="left"
                style={{ writingDirection: 'ltr' }}
              />
              <AppInput
                label="رقم هاتفك"
                icon="call"
                placeholder="01xxxxxxxxx"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                textAlign="left"
                style={{ writingDirection: 'ltr' }}
              />
              <AppInput
                label="رقم هاتف ولي الأمر (إجباري)"
                icon="people"
                placeholder="01xxxxxxxxx"
                value={guardianPhone}
                onChangeText={setGuardianPhone}
                keyboardType="phone-pad"
                textAlign="left"
                style={{ writingDirection: 'ltr' }}
              />
              <AppInput
                label="كلمة المرور"
                icon="lock-closed"
                placeholder="6 أحرف على الأقل"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textAlign="left"
                style={{ writingDirection: 'ltr' }}
              />

              <View style={styles.uniqueNote}>
                <Ionicons name="information-circle" size={18} color={colors.info} />
                <Text style={styles.uniqueNoteText}>
                  بريدك ورقم هاتفك فريدان على مستوى النظام كله — لا يمكن استخدامهما في حساب آخر.
                  وعند تسجيل الدخول لاحقاً لن تحتاج كود السنتر مرة أخرى.
                </Text>
              </View>

              <FormMessage type="error" text={error} />
              <AppButton title="إنشاء حسابي" icon="rocket" onPress={submit} loading={busy} />
              <View style={{ height: spacing.sm }} />
              <AppButton title="تغيير كود السنتر" variant="ghost" small onPress={() => { setStep(1); setError(null); }} />
            </Card>
          </>
        )}
      </KeyboardScreen>

      {/* ماسح باركود السنتر */}
      <Modal visible={scanOpen} animationType="slide" onRequestClose={() => setScanOpen(false)}>
        <View style={styles.scanWrap}>
          {permission?.granted ? (
            <CameraView
              style={styles.scanCamera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (scanLock.current) return;
                const decoded = decodeCenterQr(data);
                if (!decoded) return;
                scanLock.current = true;
                setScanOpen(false);
                setCode(decoded.code);
                void verifyCode(decoded.code);
              }}
            />
          ) : null}
          <View style={styles.scanOverlay} pointerEvents="none">
            <View style={styles.scanFrame} />
            <Text style={styles.scanHint}>وجّه الكاميرا لباركود السنتر المطبوع</Text>
          </View>
          <View style={styles.scanClose}>
            <AppButton title="إدخال الكود يدوياً" variant="ghost" small onPress={() => setScanOpen(false)} />
          </View>
        </View>
      </Modal>
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  stepIcon: {
    width: 64, height: 64, borderRadius: 32, alignSelf: 'center',
    backgroundColor: colors.cyan + '22', borderWidth: 1, borderColor: colors.cyan + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  stepTitle: {
    color: colors.text, fontSize: font.xl, fontWeight: '900',
    textAlign: 'center', marginTop: spacing.lg,
  },
  stepSub: {
    color: colors.textSecondary, fontSize: font.sm,
    textAlign: 'center', marginTop: spacing.sm, lineHeight: 20,
  },
  centerCard: { borderColor: colors.success + '55', backgroundColor: colors.successBg },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  centerIcon: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.success + '22', alignItems: 'center', justifyContent: 'center',
  },
  centerName: { color: colors.text, fontSize: font.lg, fontWeight: '800', textAlign: 'right' },
  centerOwner: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 2 },
  centerHint: {
    color: colors.textSecondary, fontSize: font.xs, marginTop: spacing.md,
    textAlign: 'right', lineHeight: 18,
  },
  uniqueNote: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.infoBg, borderWidth: 1, borderColor: colors.info + '44',
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  uniqueNoteText: {
    flex: 1, color: colors.info, fontSize: font.sm, textAlign: 'right', lineHeight: 20,
  },
  scanWrap: { flex: 1, backgroundColor: '#000', position: 'relative' },
  scanCamera: { ...StyleSheet.absoluteFillObject },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)',
  },
  scanFrame: {
    width: 250, height: 250, borderRadius: 12,
    borderWidth: 3, borderColor: colors.cyan, backgroundColor: 'transparent',
  },
  scanHint: { color: '#fff', fontSize: font.md, fontWeight: '700', marginTop: spacing.lg },
  scanClose: {
    position: 'absolute', bottom: spacing.xxl, left: spacing.lg, right: spacing.lg,
  },
}));
