import React from 'react';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { LoginForm } from '../../src/components/LoginForm';

export default function LoginStudentScreen() {
  return (
    <GradientScreen>
      <BackHeader title="تسجيل دخول طالب" />
      <KeyboardScreen>
        <LoginForm
          expectedRole="student"
          title="أهلاً بك مجدداً"
          subtitle="سجّل دخولك بالبريد وكلمة المرور — حسابك مرتبط بسنترك تلقائياً منذ التسجيل"
          icon="school"
        />
      </KeyboardScreen>
    </GradientScreen>
  );
}
