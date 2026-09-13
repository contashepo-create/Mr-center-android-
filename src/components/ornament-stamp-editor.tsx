// ============================================================
// محرر الأختام اليدوية لزخارف ورقة الاختبار (وضع «يدوي»):
// - اختيار رمز الزخرفة ثم الضغط على مكانه داخل مصغّر الورقة لوضعه
// - سحب أي ختم موجود لتحريكه بحرية (نسبة % من أبعاد الورقة)
// - ضغط على ختم لتحديده: تعديل حجمه (+/-) أو حذفه
// يطابق شكل البيانات المستخدم في src/lib/report.ts (ornamentsHtml)
// تماماً: OrnamentStamp { id, kind, x: 0..100, y: 0..100, size: px }
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  GestureResponderEvent, LayoutChangeEvent, PanResponder,
  Pressable, StyleSheet, Text, View,
} from 'react-native';
import { ALL_ORNAMENTS, ornamentGlyph } from '../lib/exam-ornaments';
import type { OrnamentStamp } from '../lib/types';
import { uuid } from '../lib/utils';
import { colors, font, radius, spacing, themedStyles } from '../theme';

/** نسبة ارتفاع/عرض مصغّر الورقة (تقريب لنسبة A4 العمودية) */
const CANVAS_ASPECT = 1.414;
const MIN_SIZE = 14;
const MAX_SIZE = 64;
const SIZE_STEP = 4;
const DEFAULT_STAMP_SIZE = 28;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

interface Props {
  stamps: OrnamentStamp[];
  opacity: number;
  onChangeStamps: (stamps: OrnamentStamp[]) => void;
}

export function OrnamentStampEditor({ stamps, opacity, onChangeStamps }: Props) {
  const [selectedKind, setSelectedKind] = useState<string>(ALL_ORNAMENTS[0]?.kind ?? 'star');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const stampsRef = useRef(stamps);
  stampsRef.current = stamps;

  const previewOpacity = clamp(typeof opacity === 'number' ? opacity : 0.18, 0.15, 0.85);

  const handleCanvasLayout = (e: LayoutChangeEvent) => {
    canvasSizeRef.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
  };

  const updateStamp = (id: string, patch: Partial<OrnamentStamp>) => {
    onChangeStamps(stampsRef.current.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeStamp = (id: string) => {
    onChangeStamps(stampsRef.current.filter((s) => s.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  };

  const handleCanvasTap = (e: GestureResponderEvent) => {
    const { width, height } = canvasSizeRef.current;
    if (!width || !height) return;
    const { locationX, locationY } = e.nativeEvent;
    const x = clamp((locationX / width) * 100, 0, 100);
    const y = clamp((locationY / height) * 100, 0, 100);
    const stamp: OrnamentStamp = { id: uuid(), kind: selectedKind, x, y, size: DEFAULT_STAMP_SIZE };
    onChangeStamps([...stampsRef.current, stamp]);
    setSelectedId(stamp.id);
  };

  const selected = stamps.find((s) => s.id === selectedId) ?? null;

  return (
    <View>
      <Text style={styles.hint}>
        اختر رمزاً من الأسفل ثم اضغط داخل الإطار لوضعه — اسحب أي ختم لتحريكه، واضغط عليه لتعديل حجمه أو حذفه.
      </Text>

      <View style={styles.kindRow}>
        {ALL_ORNAMENTS.map((orn) => {
          const active = orn.kind === selectedKind;
          return (
            <Pressable
              key={orn.kind}
              style={[styles.kindChip, active && styles.kindChipActive]}
              onPress={() => setSelectedKind(orn.kind)}
            >
              <Text style={styles.kindChipText}>{orn.glyph}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.canvas} onLayout={handleCanvasLayout}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={handleCanvasTap} />
        {stamps.map((stamp) => (
          <StampMarker
            key={stamp.id}
            stamp={stamp}
            selected={stamp.id === selectedId}
            previewOpacity={previewOpacity}
            canvasSizeRef={canvasSizeRef}
            onSelect={() => setSelectedId(stamp.id)}
            onMove={(x, y) => updateStamp(stamp.id, { x, y })}
          />
        ))}
        {stamps.length === 0 && (
          <View style={styles.emptyHint} pointerEvents="none">
            <Text style={styles.emptyHintText}>لا توجد أختام بعد — اضغط داخل الإطار لإضافة أول ختم</Text>
          </View>
        )}
      </View>

      {selected && (
        <View style={styles.editRow}>
          <Text style={styles.editLabel}>{ornamentGlyph(selected.kind)}  الحجم: {selected.size}px</Text>
          <View style={styles.editButtons}>
            <Pressable
              style={styles.stepBtn}
              onPress={() => updateStamp(selected.id, { size: clamp(selected.size - SIZE_STEP, MIN_SIZE, MAX_SIZE) })}
            >
              <Ionicons name="remove" size={16} color={colors.text} />
            </Pressable>
            <Pressable
              style={styles.stepBtn}
              onPress={() => updateStamp(selected.id, { size: clamp(selected.size + SIZE_STEP, MIN_SIZE, MAX_SIZE) })}
            >
              <Ionicons name="add" size={16} color={colors.text} />
            </Pressable>
            <Pressable style={[styles.stepBtn, styles.deleteBtn]} onPress={() => removeStamp(selected.id)}>
              <Ionicons name="trash" size={16} color={colors.danger} />
            </Pressable>
          </View>
        </View>
      )}

      {stamps.length > 0 && (
        <Pressable
          style={styles.clearAll}
          onPress={() => { onChangeStamps([]); setSelectedId(null); }}
        >
          <Text style={styles.clearAllText}>حذف كل الأختام اليدوية</Text>
        </Pressable>
      )}
    </View>
  );
}

function StampMarker({
  stamp, selected, previewOpacity, canvasSizeRef, onSelect, onMove,
}: {
  stamp: OrnamentStamp;
  selected: boolean;
  previewOpacity: number;
  canvasSizeRef: React.MutableRefObject<{ width: number; height: number }>;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}) {
  // مراجع «آخر قيمة» لتفادي الإغلاقات القديمة (stale closures) داخل PanResponder
  // الذي يُنشأ مرة واحدة فقط عبر useRef.
  const startRef = useRef({ x: stamp.x, y: stamp.y });
  const stampRef = useRef(stamp);
  stampRef.current = stamp;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
      onPanResponderGrant: () => {
        startRef.current = { x: stampRef.current.x, y: stampRef.current.y };
        onSelectRef.current();
      },
      onPanResponderMove: (_evt, gesture) => {
        const { width, height } = canvasSizeRef.current;
        if (!width || !height) return;
        const nx = clamp(startRef.current.x + (gesture.dx / width) * 100, 0, 100);
        const ny = clamp(startRef.current.y + (gesture.dy / height) * 100, 0, 100);
        onMoveRef.current(nx, ny);
      },
    }),
  ).current;

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        styles.marker,
        {
          left: `${stamp.x}%`,
          top: `${stamp.y}%`,
          width: stamp.size,
          height: stamp.size,
          marginLeft: -stamp.size / 2,
          marginTop: -stamp.size / 2,
        },
        selected && styles.markerSelected,
      ]}
    >
      <Text style={{ fontSize: stamp.size * 0.7, opacity: previewOpacity }}>{ornamentGlyph(stamp.kind)}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  hint: { color: colors.textSecondary, fontSize: font.xs, marginBottom: spacing.sm, lineHeight: 18 },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  kindChip: {
    width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
  },
  kindChipActive: { backgroundColor: colors.successBg, borderColor: colors.success },
  kindChipText: { fontSize: font.md },
  canvas: {
    width: '100%', aspectRatio: 1 / CANVAS_ASPECT, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
    overflow: 'hidden', marginBottom: spacing.sm,
  },
  emptyHint: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  emptyHintText: { color: colors.textMuted, fontSize: font.xs, textAlign: 'center' },
  marker: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center', borderRadius: radius.full,
  },
  markerSelected: {
    borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primary + '22',
  },
  editRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm,
  },
  editLabel: { color: colors.text, fontSize: font.sm, fontWeight: '700' },
  editButtons: { flexDirection: 'row', gap: spacing.xs },
  stepBtn: {
    width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  deleteBtn: { borderColor: colors.danger },
  clearAll: { alignSelf: 'center', paddingVertical: spacing.xs },
  clearAllText: { color: colors.danger, fontSize: font.xs, fontWeight: '700' },
}));
