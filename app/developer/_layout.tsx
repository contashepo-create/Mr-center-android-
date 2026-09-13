// ============================================================
// منطقة المطور — مجرد Stack؛ الحماية داخل كل صفحة عبر DeveloperGate
// (البوابة كانت هنا سابقاً داخل الـ Layout فتعطلت حقول الكتابة على أندرويد،
//  لذا نُقلت لصفحة عادية مثل باقي شاشات الدخول التي تعمل بلا مشاكل)
// ============================================================

import { Stack } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { CommunicationHub } from '../../src/components/CommunicationHub';
import { colors } from '../../src/theme';

export default function DeveloperLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <CommunicationHub area="developer" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </View>
  );
}
