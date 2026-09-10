// ============================================================
// منطقة المطور — مجرد Stack؛ الحماية داخل كل صفحة عبر DeveloperGate
// (البوابة كانت هنا سابقاً داخل الـ Layout فتعطلت حقول الكتابة على أندرويد،
//  لذا نُقلت لصفحة عادية مثل باقي شاشات الدخول التي تعمل بلا مشاكل)
// ============================================================

import { Stack } from 'expo-router';
import React from 'react';
import { colors } from '../../src/theme';

export default function DeveloperLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
