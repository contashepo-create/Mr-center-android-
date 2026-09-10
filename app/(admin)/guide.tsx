// ============================================================
// دليل الاستخدام: شرح أقسام التطبيق لمسئول السنتر خطوة بخطوة
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { colors, font, radius, spacing, themedStyles } from '../../src/theme';

const GUIDES: { icon: keyof typeof Ionicons.glyphMap; title: string; steps: string[] }[] = [
  {
    icon: 'business', title: 'البداية: كود السنتر',
    steps: [
      'كود سنترك ثابت وفريد — تجده في الرئيسية أعلى الشاشة.',
      'شاركه مع طلابك من «المزيد ← مشاركة» ليسجلوا به مرة واحدة فقط.',
      'لن يُطلب الكود من الطالب مرة أخرى عند الدخول.',
    ],
  },
  {
    icon: 'albums', title: 'المجموعات والمواعيد',
    steps: [
      'أنشئ المجموعة: الاسم + الصف + الأيام + الموعد بالأرقام + نظام التسعير (شهري/أسبوعي/بالحصة).',
      'بطاقة المجموعة تعرض كل التفاصيل من الخارج.',
      '«الجدول الأسبوعي» يعرض حصص كل يوم وينبهك لأي تعارض مواعيد.',
    ],
  },
  {
    icon: 'people', title: 'الطلاب',
    steps: [
      'أضف طالباً يدوياً أو دعه يسجل بنفسه بالكود — وإن سجل بنفس هاتف سجل موجود سيُرتبط به تلقائياً.',
      'ابحث بالاسم/الهاتف وصفِّ حسب المجموعة من الشرائح أعلى القائمة.',
      'اضغط بطاقة الطالب لفتح ملفه: مستحقات ودرجات ودفعات وسجل نشاط وتقرير PDF.',
      'غيّر حالة الطالب (نشط/موقوف/مؤرشف) من نموذج التعديل.',
    ],
  },
  {
    icon: 'checkmark-done', title: 'الحضور',
    steps: [
      'اختر المجموعة وتنقل بين الأيام بالأسهم — الحصة تُبنى تلقائياً.',
      'علّم كل طالب: حاضر/متأخر/غائب ثم احفظ.',
      'الأسرع: «مسح باركود» من الرئيسية — الطالب يعرض باركوده من تطبيقه وتمسحه أنت.',
    ],
  },
  {
    icon: 'wallet', title: 'المدفوعات',
    steps: [
      'ولّد مستحقات الشهر لمجموعة بضغطة — المبلغ يُحسب حسب نظام تسعيرها.',
      'حصّل من القائمة أو من ملف الطالب، واربط الدفعة بمستحقها.',
      '«التقارير» تعرض المحصل والمعلق للشهر وتُصدَّر PDF.',
    ],
  },
  {
    icon: 'document-text', title: 'الاختبارات',
    steps: [
      'أنشئ اختباراً بأنواع: اختياري / صح-خطأ (تصحيح تلقائي) / مقالي (تصححه يدوياً) — مع درجة لكل سؤال.',
      'عاين الورقة قبل النشر، ثم انشرها — والطالب يؤديها بمؤقت ومحاولة واحدة فقط.',
      'تابع النتائج واعتمد درجات المقالي، واطبع نسخة ورقية PDF عند الحاجة.',
    ],
  },
  {
    icon: 'briefcase', title: 'فريق العمل والمدرس',
    steps: [
      'شارك الكود مع مدرسيك ومديرك وسكرتيرك ليسجلوا من «انضمام لفريق سنتر».',
      'فعّلهم من «المدرسون» وحدد لكل واحد 10 صلاحيات ومجموعاته — وأوقف أياً منهم بضغطة.',
      'حدود باقتك (عدد المدرسين والسكرتارية) تُطبق تلقائياً عند التفعيل.',
    ],
  },
  {
    icon: 'card', title: 'الباقات والترقية',
    steps: [
      'تجربتك 7 أيام بمزايا كاملة — بعدها اطلب الترقية من «الباقات والترقية».',
      'اختر الباقة والمدة واكتب تاريخ وقيمة التحويل — والمطور يعتمدها فتتفعل فوراً.',
      'تابع طلباتك وحالة اشتراكك من نفس الشاشة.',
    ],
  },
  {
    icon: 'logo-whatsapp', title: 'واتساب والإشعارات',
    steps: [
      '«واتساب السنتر» يرسل تقارير وتنبيهات ومستحقات لأرقام الطلاب وأولياء أمورهم.',
      '«إشعارات الطلاب» بث جماعي مجاني داخل التطبيق مع عدّاد من قرأ.',
    ],
  },
  {
    icon: 'chatbubbles', title: 'الطلبات والاستفسارات',
    steps: [
      'طلبات الطلاب (سؤال/نقل/تسجيل) تصلك هنا — رد عليها مع حالة: رد/قبول/رفض.',
      'الطالب يرى ردك في تطبيقه فوراً.',
    ],
  },
  {
    icon: 'library', title: 'المكتبة والتواصل',
    steps: [
      'لوحة الشرف والملفات والروابط تظهر لطلابك في «المكتبة» لديهم.',
      'الإعلانات تصلهم فور النشر — ثبّت المهم منها.',
      'الاستبيانات تجمع آراء الطلاب وتعرض إجابات كل منهم.',
    ],
  },
  {
    icon: 'settings', title: 'الإعدادات والنسخ الاحتياطي',
    steps: [
      'من الإعدادات: بيانات سنترك، واتساب التواصل، وفتح/إغلاق تسجيل الطلاب الجدد.',
      'خذ نسخة احتياطية (JSON) دورياً واحتفظ بها خارج الهاتف.',
      'حالة اشتراكك وأيامه المتبقية ظاهرة أعلى الإعدادات.',
    ],
  },
];

export default function GuideScreen() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <GradientScreen>
      <BackHeader title="دليل الاستخدام" subtitle="خطوة بخطوة" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <SectionTitle title="كيف تدير سنترك؟" />
        {GUIDES.map((g, i) => {
          const expanded = open === i;
          return (
            <Card key={i} style={{ marginBottom: spacing.sm }}>
              <Pressable onPress={() => setOpen(expanded ? null : i)} style={styles.head}>
                <View style={styles.iconWrap}>
                  <Ionicons name={g.icon} size={20} color={colors.primary} />
                </View>
                <Text style={styles.title}>{g.title}</Text>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
              </Pressable>
              {expanded ? g.steps.map((s, si) => (
                <View key={si} style={styles.stepRow}>
                  <Text style={styles.stepNum}>{si + 1}</Text>
                  <Text style={styles.stepText}>{s}</Text>
                </View>
              )) : null}
            </Card>
          );
        })}
      </ScrollView>
    </GradientScreen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 42, height: 42, borderRadius: radius.md,
    backgroundColor: colors.primary + '22', borderWidth: 1, borderColor: colors.primary + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  stepRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignItems: 'flex-start' },
  stepNum: {
    width: 24, height: 24, borderRadius: radius.full, textAlign: 'center', textAlignVertical: 'center',
    backgroundColor: colors.success + '22', color: colors.success, fontWeight: '800', fontSize: font.sm,
  },
  stepText: { flex: 1, color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', lineHeight: 22 },
}));
