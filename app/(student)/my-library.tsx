// ============================================================
// مكتبة الطالب: لوحة الشرف + ملفات ومذكرات + روابط مهمة لسنتره
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, LoadingView, SectionTitle } from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { fetchHonorees, fetchImportantLinks, fetchSharedFiles, type Honoree, type ImportantLink, type SharedFile } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { colors, font, radius, spacing } from '../../src/theme';

export default function StudentLibraryScreen() {
  const { profile } = useSession();
  const [honorees, setHonorees] = useState<Honoree[]>([]);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [links, setLinks] = useState<ImportantLink[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.center_id) { setLoading(false); return; }
    try {
      const [h, f, l] = await Promise.all([
        fetchHonorees(profile.center_id),
        fetchSharedFiles(profile.center_id),
        fetchImportantLinks(profile.center_id),
      ]);
      setHonorees(h); setFiles(f); setLinks(l);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [profile?.center_id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openUrl = (url: string | null) => {
    if (!url) return;
    const fixed = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    Linking.openURL(fixed).catch(() => Alert.alert('تعذر الفتح', 'الرابط غير صحيح'));
  };

  return (
    <GradientScreen>
      <BackHeader title="مكتبة السنتر" subtitle="شرف وملفات وروابط" />
      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          <SectionTitle title={`لوحة الشرف (${honorees.length})`} />
          {honorees.length === 0 ? (
            <Card><Text style={styles.dimText}>لا توجد تكريمات بعد — اجتهد وكن أولهم</Text></Card>
          ) : honorees.map((h) => (
            <Card key={h.id} style={styles.honorCard}>
              <View style={styles.rankCircle}>
                <Ionicons name="trophy" size={18} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.honorName}>{h.name}</Text>
                {h.details ? <Text style={styles.honorDetails}>{h.details}</Text> : null}
              </View>
              <Ionicons name="trophy" size={24} color={colors.warning} />
            </Card>
          ))}

          <SectionTitle title={`الملفات والمذكرات (${files.length})`} />
          {files.length === 0 ? (
            <Card><Text style={styles.dimText}>لا توجد ملفات منشورة بعد</Text></Card>
          ) : files.map((f) => (
            <Pressable key={f.id} onPress={() => openUrl(f.file_url)}>
              <Card style={styles.linkCard}>
                <View style={styles.linkIcon}>
                  <Ionicons name="document-text" size={20} color={colors.info} />
                </View>
                <Text style={styles.linkName} numberOfLines={2}>{f.name}</Text>
                <Ionicons name="open-outline" size={18} color={colors.textMuted} />
              </Card>
            </Pressable>
          ))}

          <SectionTitle title={`روابط مهمة (${links.length})`} />
          {links.length === 0 ? (
            <Card><Text style={styles.dimText}>لا توجد روابط بعد</Text></Card>
          ) : links.map((l) => (
            <Pressable key={l.id} onPress={() => openUrl(l.url)}>
              <Card style={styles.linkCard}>
                <View style={[styles.linkIcon, { backgroundColor: colors.success + '1f', borderColor: colors.success + '4d' }]}>
                  <Ionicons name="link" size={20} color={colors.success} />
                </View>
                <Text style={styles.linkName} numberOfLines={2}>{l.name}</Text>
                <Ionicons name="open-outline" size={18} color={colors.textMuted} />
              </Card>
            </Pressable>
          ))}

          {honorees.length === 0 && files.length === 0 && links.length === 0 ? (
            <EmptyState icon="library-outline" title="المكتبة فارغة" message="ستظهر هنا تكريمات وملفات وروابط سنترك" />
          ) : null}
        </ScrollView>
      )}
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  dimText: { color: colors.textMuted, fontSize: font.sm, textAlign: 'center' },
  honorCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  rankCircle: {
    width: 38, height: 38, borderRadius: radius.full,
    backgroundColor: colors.warning + '22', borderWidth: 1, borderColor: colors.warning + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { color: colors.warning, fontSize: font.md, fontWeight: '900' },
  honorName: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  honorDetails: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 2 },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  linkIcon: {
    width: 42, height: 42, borderRadius: radius.md, borderWidth: 1,
    backgroundColor: colors.info + '1f', borderColor: colors.info + '4d',
    alignItems: 'center', justifyContent: 'center',
  },
  linkName: { flex: 1, color: colors.text, fontSize: font.md, fontWeight: '700', textAlign: 'right' },
});
