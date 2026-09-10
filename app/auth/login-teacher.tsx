import React from 'react';
import { BackHeader, GradientScreen, KeyboardScreen } from '../../src/components/layout';
import { LoginForm } from '../../src/components/LoginForm';

export default function LoginTeacherScreen() {
  return (
    <GradientScreen>
      <BackHeader title="دخول فريق العمل" />
      <KeyboardScreen>
        <LoginForm
          expectedRole="teacher"
          title="أهلاً بك"
          subtitle="دخول المدرس والمدير والسكرتير — يجب أن يفعّلك صاحب السنتر أولاً"
          icon="briefcase"
        />
      </KeyboardScreen>
    </GradientScreen>
  );
}
