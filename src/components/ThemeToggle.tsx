// ============================================================
// أدوات تبديل الوضع الفاتح/الداكن: زر دائري صغير + صف كامل بمفتاح
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Switch, View, type ViewStyle } from 'react-native';
import { Text } from 'react-native';
import { useTheme } from '../lib/themeContext';
import { colors, font, radius, spacing, themedStyles } from '../theme';

/** زر دائري (شمس/قمر) — يوضع في الترويسات والشاشات العامة */
export function ThemeIconButton({ style }: { style?: ViewStyle }) {
  const { isDark, toggle } = useTheme();
  return (
    <Pressable
      onPress={toggle}
      hitSlop={8}
      style={[styles.iconBtn, style]}
      accessibilityLabel={isDark ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
      accessibilityRole="button"
    >
      <Ionicons name={isDark ? 'sunny' : 'moon'} size={19} color={colors.primary} />
    </Pressable>
  );
}

/** صف كامل بمفتاح تبديل — يوضع في قوائم الإعدادات */
export function ThemeToggleRow({ subtitle }: { subtitle?: string }) {
  const { isDark, toggle } = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: colors.primary + '1f', borderColor: colors.primary + '4d' }]}>
        <Ionicons name={isDark ? 'moon' : 'sunny'} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{isDark ? 'الوضع الداكن' : 'الوضع الفاتح'}</Text>
        <Text style={styles.sub}>{subtitle ?? 'بدّل بين الوضع الفاتح والداكن فوراً'}</Text>
      </View>
      <Switch
        value={!isDark}
        onValueChange={toggle}
        trackColor={{ false: colors.surfaceAlt, true: colors.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  iconBtn: {
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  icon: {
    width: 40, height: 40, borderRadius: radius.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: font.md, fontWeight: '700', textAlign: 'right' },
  sub: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
}));
