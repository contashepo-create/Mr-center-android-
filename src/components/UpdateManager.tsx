// ============================================================
// مدير التحديث التلقائي: يفحص عند الإقلاع، يعرض ما الجديد،
// يحمّل بشريط تقدم، ويثبّت فوق القديم. الوضع الإجباري يحظر التطبيق.
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import {
  checkForUpdate, downloadAndInstall, getCurrentVersionLabel, type UpdateInfo,
} from '../lib/updater';
import { useSession } from '../lib/session';
import { colors, font, gradients, radius, shadow, spacing } from '../theme';
import { AppButton } from './controls';

type Phase = 'idle' | 'prompt' | 'downloading' | 'error';

export function UpdateManager() {
  const { ready } = useSession();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    // تأخير بسيط حتى تستقر واجهة التطبيق قبل ظهور نافذة التحديث
    const t = setTimeout(() => {
      checkForUpdate()
        .then((u) => {
          if (u) {
            setInfo(u);
            setPhase('prompt');
          }
        })
        .catch(() => {});
    }, 2500);
    return () => clearTimeout(t);
  }, [ready]);

  const startUpdate = async () => {
    if (!info) return;
    setPhase('downloading');
    setError(null);
    setProgress(0);
    try {
      await downloadAndInstall(info.apk_url, setProgress);
      // بعد فتح المثبّت نبقي النافذة في وضع «أكمل التثبيت»
      setPhase('prompt');
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  };

  if (!info) return null;
  const forced = info.force_update;

  return (
    <Modal visible={phase !== 'idle'} transparent animationType="fade" onRequestClose={() => { if (!forced) setPhase('idle'); }}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, shadow.glow]}>
          <LinearGradient
            colors={gradients.primary}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.headerBand}
          >
            <Ionicons name={forced ? 'alert-circle' : 'rocket'} size={30} color="#fff" />
            <Text style={styles.headerTitle}>
              {forced ? 'تحديث إجباري مطلوب' : 'يوجد إصدار جديد!'}
            </Text>
            <Text style={styles.headerVersion}>الإصدار {info.latest_version}</Text>
          </LinearGradient>

          <View style={styles.body}>
            {phase === 'downloading' ? (
              <>
                <Text style={styles.changelogTitle}>جاري تحميل التحديث...</Text>
                <View style={styles.progressTrack}>
                  <LinearGradient
                    colors={gradients.accent}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={[styles.progressFill, { width: `${Math.max(4, Math.round(progress * 100))}%` }]}
                  />
                </View>
                <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
                <Text style={styles.hint}>لا تغلق التطبيق حتى يكتمل التحميل</Text>
              </>
            ) : (
              <>
                {info.changelog ? (
                  <>
                    <Text style={styles.changelogTitle}>ما الجديد في هذا الإصدار:</Text>
                    <Text style={styles.changelog}>{info.changelog}</Text>
                  </>
                ) : null}
                {phase === 'error' && error ? (
                  <Text style={styles.error}>{error}</Text>
                ) : null}
                <Text style={styles.current}>إصدارك الحالي: {getCurrentVersionLabel()}</Text>

                <AppButton
                  title={phase === 'error' ? 'إعادة المحاولة' : 'تحديث وتثبيت الآن'}
                  icon="cloud-download"
                  onPress={startUpdate}
                />
                {!forced ? (
                  <View style={{ height: spacing.sm }} />
                ) : null}
                {!forced ? (
                  <AppButton
                    title="لاحقاً"
                    variant="ghost"
                    small
                    onPress={() => setPhase('idle')}
                  />
                ) : null}
                {forced ? (
                  <Text style={styles.forcedNote}>
                    هذا التحديث ضروري لاستمرار عمل التطبيق — لن تستطيع الاستمرار بدونه.
                  </Text>
                ) : null}
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
  },
  sheet: {
    width: '100%', maxWidth: 420,
    backgroundColor: colors.bgSoft, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  headerBand: { alignItems: 'center', paddingVertical: spacing.xl },
  headerTitle: { color: '#fff', fontSize: font.xl, fontWeight: '900', marginTop: spacing.sm },
  headerVersion: { color: 'rgba(255,255,255,0.9)', fontSize: font.md, fontWeight: '700', marginTop: 2 },
  body: { padding: spacing.xl },
  changelogTitle: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  changelog: {
    color: colors.textSecondary, fontSize: font.md, textAlign: 'right',
    marginTop: spacing.sm, lineHeight: 24, marginBottom: spacing.md,
  },
  current: {
    color: colors.textMuted, fontSize: font.sm, textAlign: 'center',
    marginBottom: spacing.lg,
  },
  hint: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center', marginTop: spacing.md },
  error: {
    color: colors.danger, fontSize: font.sm, textAlign: 'center',
    marginBottom: spacing.md, lineHeight: 20,
  },
  forcedNote: {
    color: colors.warning, fontSize: font.sm, textAlign: 'center',
    marginTop: spacing.lg, lineHeight: 20,
  },
  progressTrack: {
    height: 12, borderRadius: radius.full, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginTop: spacing.lg,
  },
  progressFill: { height: '100%', borderRadius: radius.full },
  progressText: {
    color: colors.cyan, fontSize: font.lg, fontWeight: '900',
    textAlign: 'center', marginTop: spacing.sm,
  },
});
