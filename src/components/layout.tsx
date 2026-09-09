// ============================================================
// مكونات التخطيط: شاشة متدرجة، ترويسة، حاوية لوحة مفاتيح
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar,
  StyleSheet, Text, View, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font, gradients, radius, spacing } from '../theme';

/** خلفية الشاشة المتدرجة الأساسية */
export function GradientScreen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.root, style]}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      {/* توهج علوي زخرفي */}
      <LinearGradient
        colors={['rgba(124,58,237,0.22)', 'transparent']}
        style={styles.glowTop}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        {children}
      </SafeAreaView>
    </View>
  );
}

/** ترويسة بعنوان وزر رجوع اختياري */
export function ScreenHeader({
  title, subtitle, onBack, right,
}: {
  title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={10}>
            <Ionicons name="chevron-forward" size={22} color={colors.text} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </View>
  );
}

export function BackHeader(props: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return <ScreenHeader {...props} onBack={() => router.back()} />;
}

/** حاوية تتعامل مع لوحة المفاتيح وتدعم التمرير */
export function KeyboardScreen({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  glowTop: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 260,
  },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backBtn: {
    width: 38, height: 38, borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    color: colors.text, fontSize: font.xl, fontWeight: '800', textAlign: 'right',
  },
  headerSub: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 2 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2 },
});
