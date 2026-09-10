// ============================================================
// عناصر التحكم: أزرار متدرجة، حقول إدخال، شارات، بطاقات
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useRef } from 'react';
import {
  ActivityIndicator, Animated, Pressable, StyleSheet, Text, TextInput,
  View, type TextInputProps, type ViewStyle,
} from 'react-native';
import { colors, font, gradients, radius, shadow, spacing } from '../theme';

// ------------------------------------------------------------
// الأزرار
// ------------------------------------------------------------

type ButtonVariant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger' | 'success';

/** لون النص فوق كل تدرج (تباين مقروء مع الهوية الجديدة) */
function gradientInk(variant: ButtonVariant): string {
  if (variant === 'primary') return '#052E22';
  if (variant === 'accent') return '#083344';
  if (variant === 'success') return '#052E16';
  return '#fff';
}

export function AppButton({
  title, onPress, icon, variant = 'primary', loading = false,
  disabled = false, small = false, style,
}: {
  title: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 8 }).start();
  const ink = variant === 'outline' || variant === 'ghost' ? colors.text : gradientInk(variant);
  const content = (
    <Animated.View style={[styles.btnInner, small && styles.btnInnerSmall, { transform: [{ scale }] }]}>
      {loading ? (
        <ActivityIndicator color={ink} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 19} color={ink} /> : null}
          <Text style={[styles.btnText, { color: ink }, small && { fontSize: font.sm }]}>
            {title}
          </Text>
        </>
      )}
    </Animated.View>
  );

  if (variant === 'primary' || variant === 'accent' || variant === 'danger' || variant === 'success') {
    const g = variant === 'primary' ? gradients.primary
      : variant === 'accent' ? gradients.accent
      : variant === 'danger' ? gradients.danger
      : gradients.success;
    return (
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.btnBase, shadow.glow, style,
          { opacity: isDisabled ? 0.5 : pressed ? 0.9 : 1 },
        ]}
      >
        <LinearGradient
          colors={g}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.btnGradient, small && { borderRadius: radius.md }]}
        >
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btnBase,
        variant === 'outline' ? styles.btnOutline : styles.btnGhost,
        { opacity: isDisabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

// ------------------------------------------------------------
// حقل الإدخال
// ------------------------------------------------------------

export function AppInput({
  label, icon, error, rightElement, style, textAlign, ...props
}: {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string | null;
  rightElement?: React.ReactNode;
} & TextInputProps) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <View style={[styles.inputWrap, error ? { borderColor: colors.danger } : null]}>
        {icon ? <Ionicons name={icon} size={18} color={colors.textMuted} style={{ marginHorizontal: spacing.sm }} /> : null}
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={[styles.input, style]}
          textAlign={textAlign ?? 'right'}
          {...props}
        />
        {rightElement}
      </View>
      {error ? <Text style={styles.inputError}>{error}</Text> : null}
    </View>
  );
}

// ------------------------------------------------------------
// البطاقات
// ------------------------------------------------------------

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 60, bounciness: 0 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 8 }).start()}
        style={({ pressed }) => [styles.card, shadow.card, { opacity: pressed ? 0.9 : 1 }, style]}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          {children}
        </Animated.View>
      </Pressable>
    );
  }
  return <View style={[styles.card, shadow.card, style]}>{children}</View>;
}

export function StatCard({
  icon, value, label, color = colors.primary, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string | number;
  label: string;
  color?: string;
  onPress?: () => void;
}) {
  return (
    <Card style={styles.statCard} onPress={onPress}>
      <View style={[styles.statIcon, { backgroundColor: color + '22', borderColor: color + '55' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionBar} />
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ flex: 1 }} />
      {action}
    </View>
  );
}

// ------------------------------------------------------------
// عنصر قائمة موحد
// ------------------------------------------------------------

export function ListItem({
  title, subtitle, icon, iconColor = colors.primary, right, onPress, badge,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  badge?: { text: string; color: string; bg: string };
}) {
  return (
    <Card style={styles.listItem} onPress={onPress}>
      <View style={styles.listRow}>
        {icon ? (
          <View style={[styles.listIcon, { backgroundColor: iconColor + '1f', borderColor: iconColor + '4d' }]}>
            <Ionicons name={icon} size={18} color={iconColor} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={styles.listTitle} numberOfLines={1}>{title}</Text>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.badgeText, { color: badge.color }]}>{badge.text}</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? <Text style={styles.listSub} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {right}
        {onPress ? <Ionicons name="chevron-back" size={18} color={colors.textMuted} /> : null}
      </View>
    </Card>
  );
}

export function EmptyState({
  icon = 'albums-outline', title, message, action,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={icon} size={38} color={colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMsg}>{message}</Text> : null}
      {action ? <View style={{ marginTop: spacing.lg }}>{action}</View> : null}
    </View>
  );
}

/** مقبض الشيت السفلي — لمسة عصرية موحدة للنوافذ المنبثقة */
export function SheetHandle() {
  return <View style={styles.sheetHandle} />;
}

/** شاشة صلاحية مفقودة للمدرس (تُعرض بدل القسم المحجوب) */
export function NoAccess({ message }: { message?: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="lock-closed" size={38} color={colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>غير مصرح لك بهذا القسم</Text>
      <Text style={styles.emptyMsg}>
        {message ?? 'مسئول السنتر لم يفعّل لك هذه الصلاحية بعد — تواصل معه لتفعيلها.'}
      </Text>
    </View>
  );
}

export function LoadingView({ message }: { message?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
      {message ? <Text style={styles.loadingText}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheetHandle: {
    width: 44, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  btnBase: { borderRadius: radius.lg, overflow: 'hidden' },
  btnGradient: { borderRadius: radius.lg },
  btnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl,
  },
  btnInnerSmall: { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg },
  btnText: { color: '#fff', fontSize: font.lg, fontWeight: '800' },
  btnOutline: {
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderStrong,
  },
  btnGhost: { backgroundColor: 'transparent' },

  inputLabel: {
    color: colors.textSecondary, fontSize: font.sm, fontWeight: '700',
    marginBottom: spacing.xs + 2, textAlign: 'right',
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, minHeight: 52,
  },
  input: {
    flex: 1, color: colors.text, fontSize: font.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    writingDirection: 'rtl',
  },
  inputError: { color: colors.danger, fontSize: font.xs, marginTop: spacing.xs, textAlign: 'right' },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg,
  },
  statCard: { alignItems: 'center', paddingVertical: spacing.lg, flex: 1, minWidth: 100 },
  statIcon: {
    width: 42, height: 42, borderRadius: radius.full, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  statValue: { color: colors.text, fontSize: font.xl, fontWeight: '800' },
  statLabel: { color: colors.textSecondary, fontSize: font.xs, marginTop: 2, textAlign: 'center' },

  sectionRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.lg, marginBottom: spacing.md,
  },
  sectionBar: { width: 4, height: 20, borderRadius: 2, backgroundColor: colors.primary },
  sectionTitle: { color: colors.text, fontSize: font.lg, fontWeight: '800' },

  listItem: { marginBottom: spacing.sm, padding: spacing.md },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  listIcon: {
    width: 40, height: 40, borderRadius: radius.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  listTitle: { color: colors.text, fontSize: font.md, fontWeight: '700', flexShrink: 1 },
  listSub: { color: colors.textSecondary, fontSize: font.sm, marginTop: 2, textAlign: 'right' },
  badge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: font.xs, fontWeight: '700' },

  empty: { alignItems: 'center', paddingVertical: spacing.xxl * 1.5, paddingHorizontal: spacing.xl },
  emptyIconWrap: {
    width: 76, height: 76, borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  emptyTitle: { color: colors.text, fontSize: font.lg, fontWeight: '800', textAlign: 'center' },
  emptyMsg: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl * 2 },
  loadingText: { color: colors.textSecondary, marginTop: spacing.md, fontSize: font.sm },
});
