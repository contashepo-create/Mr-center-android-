// ============================================================
// الشاشة الرئيسية (الترحيب): أزرار التسجيل والدخول لكل الأدوار
// + بوابة المطور المخفية (ضغطة مطولة على الشعار)
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../src/components/controls';
import { GradientScreen, KeyboardScreen } from '../src/components/layout';
import { useSession } from '../src/lib/session';
import { ConnectionSetup } from '../src/components/ConnectionSetup';
import { colors, font, gradients, radius, shadow, spacing } from '../src/theme';

export default function WelcomeScreen() {
  const { ready, configured, session, profile } = useSession();
  const [gateHint, setGateHint] = useState(false);

  // لو المستخدم مسجل دخوله بالفعل لا نظهر الترحيب (الحارس سيوجهه)
  if (ready && session && profile) {
    return (
      <GradientScreen>
        <View style={styles.centerFill}>
          <Image source={require('../assets/icon.png')} style={styles.logo} />
          <Text style={styles.loadingText}>جاري فتح حسابك...</Text>
        </View>
      </GradientScreen>
    );
  }

  // لا توجد مفاتيح اتصال → شاشة ضبط الاتصال الأولى (للمطور)
  if (ready && !configured) {
    return (
      <GradientScreen>
        <KeyboardScreen>
          <ConnectionSetup />
        </KeyboardScreen>
      </GradientScreen>
    );
  }

  return (
    <GradientScreen>
      <KeyboardScreen>
        {/* الشعار — ضغطة مطولة ٣ ثواني تفتح بوابة المطور المخفية */}
        <View style={styles.hero}>
          <Pressable
            onLongPress={() => {
              setGateHint(true);
              router.push('/developer');
            }}
            delayLongPress={2500}
          >
            <View style={styles.logoGlow}>
              <LinearGradient
                colors={gradients.primary}
                style={styles.logoRing}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <Image source={require('../assets/icon.png')} style={styles.logo} />
              </LinearGradient>
            </View>
          </Pressable>
          <Text style={styles.appName}>Mr Center</Text>
          <Text style={styles.tagline}>منصة إدارة السناتر التعليمية</Text>
          <Text style={styles.taglineAlt}>طلاب · مجموعات · حضور · مدفوعات · درجات</Text>
        </View>

        <View style={styles.buttons}>
          <AppButton
            title="إنشاء حساب سنتر جديد"
            icon="business"
            onPress={() => router.push('/auth/register-center')}
          />
          <View style={{ height: spacing.md }} />
          <AppButton
            title="تسجيل طالب جديد"
            icon="school"
            variant="accent"
            onPress={() => router.push('/auth/register-student')}
          />

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>لديك حساب بالفعل؟</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.rowButtons}>
            <View style={{ flex: 1 }}>
              <AppButton
                title="دخول مسئول السنتر"
                icon="person-circle"
                variant="outline"
                small
                onPress={() => router.push('/auth/login-admin')}
              />
            </View>
            <View style={{ width: spacing.md }} />
            <View style={{ flex: 1 }}>
              <AppButton
                title="دخول طالب"
                icon="person"
                variant="outline"
                small
                onPress={() => router.push('/auth/login-student')}
              />
            </View>
          </View>

          <Pressable style={styles.aboutLink} onPress={() => router.push('/about')}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.aboutText}>حول التطبيق</Text>
          </Pressable>
        </View>

        {gateHint ? null : null}
        <Text style={styles.footer}>نظام متعدد السناتر — كل سنتر معزول ببياناته الخاصة</Text>
      </KeyboardScreen>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.textSecondary, marginTop: spacing.lg, fontSize: font.md },
  hero: { alignItems: 'center', marginTop: spacing.xxl * 1.6, marginBottom: spacing.xxl },
  logoGlow: { ...shadow.glow },
  logoRing: {
    padding: 5, borderRadius: 44,
  },
  logo: { width: 120, height: 120, borderRadius: 40 },
  appName: {
    color: colors.text, fontSize: font.hero, fontWeight: '900', marginTop: spacing.lg,
    letterSpacing: 0.5,
  },
  tagline: { color: colors.text, fontSize: font.lg, fontWeight: '700', marginTop: spacing.xs },
  taglineAlt: { color: colors.textMuted, fontSize: font.sm, marginTop: spacing.xs },
  buttons: { marginTop: spacing.sm },
  dividerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginVertical: spacing.xl,
  },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: font.sm },
  rowButtons: { flexDirection: 'row' },
  aboutLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, marginTop: spacing.xl,
  },
  aboutText: { color: colors.textSecondary, fontSize: font.md, fontWeight: '600' },
  footer: {
    color: colors.textMuted, fontSize: font.xs, textAlign: 'center',
    marginTop: spacing.xxl, lineHeight: 18,
  },
});
