// ============================================================
// بوابة الجهاز: تسجّل زيارة الجهاز مرة واحدة عند الإقلاع (يطابق
// VisitorTracker على الويب)، وتمنع أي جهاز حجبه المطور من
// استخدام التطبيق بشاشة كاملة بدل السماح بالمتابعة.
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GradientScreen } from './layout';
import { colors, font, radius, spacing, themedStyles } from '../theme';
import { isDeviceBlocked, trackVisit } from '../lib/visitors';

export function DeviceGate({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [isBlocked] = await Promise.all([isDeviceBlocked(), trackVisit()]);
      if (!cancelled) {
        setBlocked(isBlocked);
        setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (checked && blocked) {
    return (
      <GradientScreen>
        <View style={styles.wrap}>
          <View style={styles.iconWrap}>
            <Ionicons name="ban" size={40} color={colors.danger} />
          </View>
          <Text style={styles.title}>تم حجب هذا الجهاز</Text>
          <Text style={styles.body}>
            هذا الجهاز محجوب من إدارة التطبيق. إذا كنت تعتقد أن هذا خطأ، راجع صفحة «حول التطبيق» للتواصل مع الإدارة.
          </Text>
        </View>
      </GradientScreen>
    );
  }

  return <>{children}</>;
}

const styles = themedStyles(() => StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  iconWrap: {
    width: 92, height: 92, borderRadius: radius.full,
    backgroundColor: colors.dangerBg, borderWidth: 2, borderColor: colors.danger + '66',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl,
  },
  title: { color: colors.text, fontSize: font.xxl, fontWeight: '900', textAlign: 'center' },
  body: {
    color: colors.textSecondary, fontSize: font.md, textAlign: 'center',
    marginTop: spacing.md, lineHeight: 26,
  },
}));
