// ============================================================
// التسجيل المعلق: بيانات التسجيل المحفوظة على الجهاز لحين تأكيد البريد
// التدفق: signUp (بلا جلسة لأن Confirm email مفعّل) ← حفظ معلق ←
// المستخدم يؤكد بريده ← يسجل دخوله ← LoginForm يستكمل التسجيل تلقائياً
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PENDING = 'mrcenter.pending.registration';

export interface PendingCenterRegistration {
  kind: 'center';
  email: string;
  centerName: string;
  code: string;
  ownerName: string;
  phone: string;
  centerKind: string;
}

export interface PendingStudentRegistration {
  kind: 'student';
  email: string;
  centerId: string;
  fullName: string;
  phone: string;
  guardianPhone: string;
  gradeId: string | null;
  groupId: string | null;
}

export interface PendingTeacherRegistration {
  kind: 'teacher';
  email: string;
  inviteCode: string;
}

export type PendingRegistration = PendingCenterRegistration | PendingStudentRegistration | PendingTeacherRegistration;

export async function savePendingRegistration(p: PendingRegistration): Promise<void> {
  await AsyncStorage.setItem(KEY_PENDING, JSON.stringify(p));
}

export async function loadPendingRegistration(): Promise<PendingRegistration | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PENDING);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingRegistration;
    if (!parsed || (parsed.kind !== 'center' && parsed.kind !== 'student' && parsed.kind !== 'teacher') || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearPendingRegistration(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PENDING);
  } catch {
    // تجاهل
  }
}
