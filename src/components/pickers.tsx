// ============================================================
// منتقيات: قائمة خيارات منبثقة + منتقي أيام الأسبوع + رسائل النماذج
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '../theme';
import { arabicDay, formatTimeAr, minutesToTime24, timeToMinutes, WEEK_DAYS } from '../lib/utils';

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const v = String(i * 5).padStart(2, '0');
  return { value: v, label: v };
});
const PERIOD_OPTIONS = [
  { value: 'am', label: 'صباحاً (ص)' },
  { value: 'pm', label: 'مساءً (م)' },
];

/** منتقي وقت بالأرقام (ساعة + دقيقة + ص/م) — يُخزن "HH:MM" */
export function TimePicker({
  label, value, onChange, icon = 'time',
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const minutes = timeToMinutes(value);
  const h24 = minutes === null ? null : Math.floor(minutes / 60) % 24;
  const hour12 = h24 === null ? null : (h24 % 12 === 0 ? 12 : h24 % 12);
  const minute = minutes === null ? null : String(minutes % 60).padStart(2, '0');
  const period = h24 === null ? null : h24 < 12 ? 'am' : 'pm';

  const pick = (h: number | null, mi: number | null, p: 'am' | 'pm' | null) => {
    const hh = h ?? hour12 ?? 12;
    const mm = mi ?? (minute === null ? 0 : Number(minute));
    const pp = p ?? period ?? 'pm';
    let h24v = hh % 12;
    if (pp === 'pm') h24v += 12;
    onChange(minutesToTime24(h24v * 60 + mm));
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={styles.timeHead}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        {minutes !== null ? <Text style={styles.timePreview}>{formatTimeAr(value)}</Text> : null}
      </View>
      <View style={styles.timeRow}>
        <View style={{ flex: 1.2 }}>
          <OptionPicker
            icon={icon}
            value={hour12 === null ? null : String(hour12)}
            options={HOUR_OPTIONS}
            onChange={(v) => pick(Number(v), null, null)}
            placeholder="الساعة"
          />
        </View>
        <View style={{ flex: 1.2 }}>
          <OptionPicker
            value={minute}
            options={MINUTE_OPTIONS}
            onChange={(v) => pick(null, Number(v), null)}
            placeholder="الدقيقة"
          />
        </View>
        <View style={{ flex: 1.4 }}>
          <OptionPicker
            value={period}
            options={PERIOD_OPTIONS}
            onChange={(v) => pick(null, null, v as 'am' | 'pm')}
            placeholder="ص/م"
          />
        </View>
      </View>
    </View>
  );
}

export interface Option {
  value: string;
  label: string;
  subtitle?: string;
}

/** زر يفتح قائمة خيارات منبثقة من الأسفل */
export function OptionPicker({
  label, value, options, onChange, placeholder = 'اختر...', icon,
}: {
  label?: string;
  value: string | null;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.pickerBtn} onPress={() => setOpen(true)}>
        {icon ? <Ionicons name={icon} size={18} color={colors.textMuted} style={{ marginHorizontal: spacing.sm }} /> : null}
        <Text style={[styles.pickerText, !selected && { color: colors.textMuted }]}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} style={{ marginHorizontal: spacing.sm }} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{label ?? 'اختر'}</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {options.length === 0 ? (
                <Text style={styles.noOptions}>لا توجد خيارات متاحة</Text>
              ) : options.map((o) => (
                <Pressable
                  key={o.value}
                  style={[styles.option, o.value === value && styles.optionActive]}
                  onPress={() => { onChange(o.value); setOpen(false); }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionText}>{o.label}</Text>
                    {o.subtitle ? <Text style={styles.optionSub}>{o.subtitle}</Text> : null}
                  </View>
                  {o.value === value ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** منتقي أيام الحصص (متعدد) */
export function DaysPicker({
  label = 'أيام المجموعة', value, onChange,
}: {
  label?: string;
  value: string[];
  onChange: (days: string[]) => void;
}) {
  const toggle = (day: string) => {
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day]);
  };
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.daysWrap}>
        {WEEK_DAYS.map((d) => {
          const active = value.includes(d);
          return (
            <Pressable
              key={d}
              onPress={() => toggle(d)}
              style={[styles.dayChip, active && styles.dayChipActive]}
            >
              <Text style={[styles.dayText, active && styles.dayTextActive]}>{arabicDay(d)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** رسالة نجاح/خطأ داخل النماذج — الخطأ معه زر نسخ لإرساله للدعم */
export function FormMessage({ type, text }: { type: 'error' | 'success' | 'info'; text: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  const color = type === 'error' ? colors.danger : type === 'success' ? colors.success : colors.info;
  const bg = type === 'error' ? colors.dangerBg : type === 'success' ? colors.successBg : colors.infoBg;
  const icon = type === 'error' ? 'alert-circle' : type === 'success' ? 'checkmark-circle' : 'information-circle';
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* تجاهل */ }
  };
  return (
    <View style={[styles.msg, { backgroundColor: bg, borderColor: color + '55' }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.msgText, { color }]} selectable>{text}</Text>
      {type === 'error' ? (
        <Pressable hitSlop={8} onPress={copy} style={styles.copyBtn}>
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={color} />
          {copied ? <Text style={[styles.copyText, { color }]}>اتنسخ</Text> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  timeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timePreview: {
    color: colors.cyan, fontSize: font.sm, fontWeight: '800',
    backgroundColor: colors.cyan + '1f', borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 4, marginBottom: spacing.xs + 2,
  },
  timeRow: { flexDirection: 'row', gap: spacing.sm },
  label: {
    color: colors.textSecondary, fontSize: font.sm, fontWeight: '700',
    marginBottom: spacing.xs + 2, textAlign: 'right',
  },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, minHeight: 52,
  },
  pickerText: { flex: 1, color: colors.text, fontSize: font.md, textAlign: 'right', paddingHorizontal: spacing.md },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgSoft, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.lg, paddingBottom: spacing.xxl, borderWidth: 1, borderColor: colors.border,
  },
  sheetHandle: {
    width: 44, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  sheetTitle: { color: colors.text, fontSize: font.lg, fontWeight: '800', textAlign: 'center', marginBottom: spacing.md },
  noOptions: { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderRadius: radius.md, marginBottom: spacing.xs,
  },
  optionActive: { backgroundColor: colors.surfaceAlt },
  optionText: { color: colors.text, fontSize: font.md, fontWeight: '600', textAlign: 'right' },
  optionSub: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'right', marginTop: 2 },

  daysWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dayChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  dayChipActive: { backgroundColor: colors.primary + '33', borderColor: colors.primary },
  dayText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '600' },
  dayTextActive: { color: colors.text },

  msg: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  msgText: { flex: 1, fontSize: font.sm, fontWeight: '600', textAlign: 'right', lineHeight: 20 },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.full, backgroundColor: 'rgba(0,0,0,0.15)',
  },
  copyText: { fontSize: font.xs, fontWeight: '800' },
});
