// ============================================================
// المدفوعات والمستحقات: توليد مستحقات شهرية + متابعة السداد
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import {
  AppButton, Card, EmptyState, ListItem, LoadingView, SectionTitle, StatCard,
} from '../../src/components/controls';
import { BackHeader, GradientScreen } from '../../src/components/layout';
import { FormMessage, OptionPicker } from '../../src/components/pickers';
import {
  fetchDues, fetchGroups, fetchStudents, generateDuesForGroup,
} from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { Due, Group, Student } from '../../src/lib/types';
import { arabicError, arabicMonth, formatMoney } from '../../src/lib/utils';
import { colors, font, spacing } from '../../src/theme';

export default function PaymentsScreen() {
  const { profile } = useSession();
  const centerId = profile?.center_id ?? '';
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [loading, setLoading] = useState(true);
  const [genGroup, setGenGroup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!centerId) return;
    try {
      const [s, g, d] = await Promise.all([
        fetchStudents(centerId),
        fetchGroups(centerId),
        fetchDues(centerId, month, year),
      ]);
      setStudents(s);
      setGroups(g);
      setDues(d);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [centerId, month, year]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const studentName = (id: string) => students.find((s) => s.id === id)?.name ?? 'طالب';
  const studentOf = (id: string) => students.find((s) => s.id === id);

  const generate = async () => {
    setMessage(null);
    const group = groups.find((g) => g.id === genGroup);
    if (!group) return;
    setBusy(true);
    try {
      const created = await generateDuesForGroup(centerId, group, month, year);
      setMessage(created > 0
        ? `تم توليد ${created} مستحق لمجموعة «${group.name}»`
        : 'كل طلاب المجموعة لديهم مستحقات مسجلة لهذا الشهر بالفعل');
      await load();
    } catch (e) {
      Alert.alert('تعذر التوليد', arabicError(e));
    } finally {
      setBusy(false);
    }
  };

  const paidList = dues.filter((d) => d.status === 'paid');
  const pendingList = dues.filter((d) => d.status !== 'paid');
  const paidTotal = paidList.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const pendingTotal = pendingList.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  return (
    <GradientScreen>
      <BackHeader title="المدفوعات والمستحقات" subtitle="الاستحقاقات الشهرية ومتابعة السداد" />

      {loading ? (
        <LoadingView message="جاري التحميل..." />
      ) : (
        <FlatList
          data={pendingList}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* اختيار الشهر والسنة */}
              <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <OptionPicker
                    label="الشهر"
                    value={String(month)}
                    options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: arabicMonth(i + 1) }))}
                    onChange={(v) => setMonth(Number(v))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <OptionPicker
                    label="السنة"
                    value={String(year)}
                    options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) }))}
                    onChange={(v) => setYear(Number(v))}
                  />
                </View>
              </View>

              {/* ملخص الشهر */}
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
                <StatCard icon="checkmark-circle" value={formatMoney(paidTotal)} label={`مسدد (${paidList.length})`} color={colors.success} />
                <StatCard icon="time" value={formatMoney(pendingTotal)} label={`معلق (${pendingList.length})`} color={colors.warning} />
              </View>

              {/* توليد المستحقات */}
              <Card style={{ marginBottom: spacing.md }}>
                <Text style={styles.cardTitle}>توليد مستحقات الشهر</Text>
                <OptionPicker
                  label="اختر المجموعة"
                  icon="albums"
                  value={genGroup}
                  options={groups.map((g) => ({
                    value: g.id,
                    label: g.name,
                    subtitle: `${g.students_count} طالب · ${formatMoney(g.monthly_fee)}`,
                  }))}
                  onChange={setGenGroup}
                  placeholder="اختر المجموعة..."
                />
                <FormMessage type="success" text={message} />
                <AppButton
                  title={`توليد مستحقات ${arabicMonth(month)} ${year}`}
                  icon="flash"
                  onPress={generate}
                  loading={busy}
                  disabled={!genGroup}
                  small
                />
              </Card>

              <SectionTitle title={`مستحقات معلقة — ${arabicMonth(month)} ${year}`} />
              {pendingList.length === 0 ? (
                <Card>
                  <Text style={styles.allPaid}>🎉 لا توجد مستحقات معلقة لهذا الشهر</Text>
                </Card>
              ) : null}
            </>
          }
          renderItem={({ item }) => (
            <ListItem
              title={studentName(item.student_id)}
              subtitle={formatMoney(item.amount)}
              icon="time"
              iconColor={colors.warning}
              badge={{ text: 'معلق', color: colors.warning, bg: colors.warningBg }}
              right={
                <AppButton
                  title="تحصيل"
                  icon="cash"
                  small
                  variant="success"
                  onPress={() => router.push(`/student/${item.student_id}?pay=${item.id}`)}
                />
              }
              onPress={() => router.push(`/student/${item.student_id}`)}
            />
          )}
          ListFooterComponent={
            paidList.length > 0 ? (
              <>
                <SectionTitle title="مستحقات مسددة" />
                {paidList.slice(0, 20).map((item) => (
                  <ListItem
                    key={item.id}
                    title={studentName(item.student_id)}
                    subtitle={formatMoney(item.amount)}
                    icon="checkmark-circle"
                    iconColor={colors.success}
                    badge={{ text: 'مسدد', color: colors.success, bg: colors.successBg }}
                    onPress={() => router.push(`/student/${item.student_id}`)}
                  />
                ))}
              </>
            ) : null
          }
        />
      )}
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  cardTitle: {
    color: colors.text, fontSize: font.md, fontWeight: '800',
    marginBottom: spacing.md, textAlign: 'right',
  },
  allPaid: {
    color: colors.success, fontSize: font.md, fontWeight: '700', textAlign: 'center',
  },
});
