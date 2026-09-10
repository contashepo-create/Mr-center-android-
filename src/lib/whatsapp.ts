// ============================================================
// تكامل واتساب: روابط wa.me مباشرة من التطبيق (تُفتح في واتساب المثبت
// على جهاز المسئول — الإرسال يتم من جهازه لجهة الاتصال المختارة).
// لا وسيط ولا خوادم: مجرد تجهيز الرقم والنص وفتح المحادثة.
// ============================================================

import { Linking } from 'react-native';
import { normalizePhone } from './utils';

/** تحويل أي صيغة هاتف لصيغة wa.me (أرقام بكود الدولة بلا +) */
export function toWaNumber(phone: string | null | undefined): string | null {
  const d = normalizePhone(phone ?? '').replace(/^\+/, '').replace(/\D/g, '');
  if (!d) return null;
  if (/^01\d{9}$/.test(d)) return `2${d}`; // موبايل مصري: 01xxxxxxxxx ← 201xxxxxxxxx
  if (d.length >= 8 && d.length <= 15) return d;
  return null;
}

/** رابط محادثة واتساب برقم ونص جاهز — null لو الرقم غير صالح */
export function waLink(phone: string | null | undefined, text: string): string | null {
  const n = toWaNumber(phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

/** فتح محادثة واتساب — يرد false لو الرقم غير صالح أو تعذر الفتح */
export async function openWhatsApp(phone: string | null | undefined, text: string): Promise<boolean> {
  const url = waLink(phone, text);
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// قوالب الرسائل الجاهزة
// ------------------------------------------------------------

export function guardianReportText(input: {
  centerName: string; studentName: string; pendingTotal: number; pendingCount: number;
  present: number; absent: number; avgText?: string;
}): string {
  const rate = input.present + input.absent > 0
    ? ` (نسبة الحضور ${Math.round((input.present / (input.present + input.absent)) * 100)}%)`
    : '';
  return [
    `تقرير ${input.studentName} — ${input.centerName}`,
    `الحضور: ${input.present} · الغياب: ${input.absent}${rate}`,
    input.avgText ? `متوسط الدرجات: ${input.avgText}` : '',
    input.pendingCount > 0
      ? `المستحق المعلق: ${input.pendingTotal} ج.م (${input.pendingCount}) — برجاء السداد`
      : 'لا توجد مستحقات معلقة — شكراً لالتزامكم',
  ].filter(Boolean).join('\n');
}

export function examAlertText(centerName: string, title: string, subject: string, count: number, minutes: number): string {
  return [
    `امتحان جديد في ${centerName}`,
    `«${title}»${subject ? ` — ${subject}` : ''}`,
    `${count} أسئلة · المدة ${minutes} دقيقة · محاولة واحدة`,
    'ادخل تطبيق Mr Center ← الاختبارات لأدائه قبل إغلاقه',
  ].join('\n');
}

export function duesReminderText(centerName: string, studentName: string, monthLabel: string, amount: number): string {
  return [
    `${centerName} — تذكير بمستحق`,
    `الطالب: ${studentName}`,
    `${monthLabel}: ${amount} ج.م — برجاء السداد في أقرب وقت`,
  ].join('\n');
}

export function generalNoticeText(centerName: string, body: string): string {
  return `${centerName}\n${body}`;
}
