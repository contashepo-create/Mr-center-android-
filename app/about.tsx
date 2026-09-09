// ============================================================
// صفحة «حول التطبيق» — المحتوى يديره المطور من لوحة التحكم
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, LoadingView } from '../src/components/controls';
import { BackHeader, GradientScreen, KeyboardScreen } from '../src/components/layout';
import { fetchPublicConfig } from '../src/lib/supabase';
import type { PublicConfig } from '../src/lib/types';
import { colors, font, radius, spacing } from '../src/theme';

export default function AboutScreen() {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);

  useEffect(() => {
    fetchPublicConfig().then(setCfg);
  }, []);

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <GradientScreen>
      <BackHeader title="حول التطبيق" />
      <KeyboardScreen>
        {cfg === null ? (
          <LoadingView message="جاري تحميل المحتوى..." />
        ) : (
          <>
            <Card style={{ alignItems: 'center' }}>
              <View style={styles.logoBadge}>
                <Ionicons name="school" size={30} color={colors.cyan} />
              </View>
              <Text style={styles.title}>{cfg.about_title || 'Mr Center'}</Text>
              <Text style={styles.version}>الإصدار {version}</Text>
              <Text style={styles.body}>
                {cfg.about_body || 'تطبيق إدارة السناتر التعليمية.'}
              </Text>
            </Card>

            {cfg.global_message ? (
              <Card style={styles.msgCard}>
                <View style={styles.msgRow}>
                  <Ionicons name="megaphone" size={20} color={colors.warning} />
                  <Text style={styles.msgTitle}>رسالة من إدارة التطبيق</Text>
                </View>
                <Text style={styles.msgBody}>{cfg.global_message}</Text>
              </Card>
            ) : null}

            {(cfg.contact_whatsapp || cfg.contact_email) ? (
              <Card style={{ marginTop: spacing.md }}>
                <Text style={styles.contactTitle}>تواصل معنا</Text>
                {cfg.contact_whatsapp ? (
                  <View style={{ marginTop: spacing.md }}>
                    <AppButton
                      title="واتساب"
                      icon="logo-whatsapp"
                      variant="success"
                      small
                      onPress={() => Linking.openURL(`https://wa.me/${cfg.contact_whatsapp}`)}
                    />
                  </View>
                ) : null}
                {cfg.contact_email ? (
                  <View style={{ marginTop: spacing.sm }}>
                    <AppButton
                      title={cfg.contact_email}
                      icon="mail"
                      variant="outline"
                      small
                      onPress={() => Linking.openURL(`mailto:${cfg.contact_email}`)}
                    />
                  </View>
                ) : null}
              </Card>
            ) : null}

            <Text style={styles.copyright}>
              نظام متعدد السناتر بعزل كامل للبيانات — جميع الحقوق محفوظة © {new Date().getFullYear()}
            </Text>
          </>
        )}
      </KeyboardScreen>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  logoBadge: {
    width: 64, height: 64, borderRadius: radius.lg,
    backgroundColor: colors.cyan + '22', borderWidth: 1, borderColor: colors.cyan + '55',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: font.xxl, fontWeight: '900' },
  version: { color: colors.textMuted, fontSize: font.sm, marginTop: spacing.xs },
  body: {
    color: colors.textSecondary, fontSize: font.md, textAlign: 'center',
    marginTop: spacing.lg, lineHeight: 26,
  },
  msgCard: { marginTop: spacing.md, borderColor: colors.warning + '44' },
  msgRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  msgTitle: { color: colors.warning, fontSize: font.md, fontWeight: '800' },
  msgBody: { color: colors.textSecondary, fontSize: font.md, marginTop: spacing.sm, lineHeight: 24, textAlign: 'right' },
  contactTitle: { color: colors.text, fontSize: font.lg, fontWeight: '800', textAlign: 'right' },
  copyright: {
    color: colors.textMuted, fontSize: font.xs, textAlign: 'center',
    marginTop: spacing.xxl, lineHeight: 18,
  },
});
