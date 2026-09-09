import React from 'react';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { LoginForm } from '../../src/components/LoginForm';

export default function LoginAdminScreen() {
  return (
    <GradientScreen>
      <BackHeader title="تسجيل دخول مسئول السنتر" />
      <KeyboardScreen>
        <LoginForm
          expectedRole="admin"
          title="أهلاً بك مجدداً"
          subtitle="سجّل دخولك بالبريد وكلمة المرور اللذين سجلت بهما سنترك"
          icon="person-circle"
        />
      </KeyboardScreen>
    </GradientScreen>
  );
}
