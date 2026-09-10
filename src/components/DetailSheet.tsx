// ============================================================
// نوافذ تفاصيل حديثة: نافذة سفلية ناعمة (Sheet) بمقبض وأيقونة
// وعنوان وسطر تعريفي ونص كامل قابل للتمرير — تحل محل التنبيهات
// القديمة (Alert) في عرض الإعلانات والإشعارات والتفاصيل.
// ============================================================

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { AppButton, SheetHandle } from './controls';
import { colors, font, radius, spacing, themedStyles } from '../theme';

export function DetailSheet({
  visible, onClose, icon = 'information-circle', iconColor, tint = 'primary',
  title, meta, body, children, footer,
}: {
  visible: boolean;
  onClose: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  tint?: 'primary' | 'warning' | 'info' | 'danger' | 'success';
  title: string;
  meta?: string;
  body?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!visible) return null;
  const accent = iconColor
    ?? (tint === 'warning' ? colors.warning
      : tint === 'info' ? colors.info
        : tint === 'danger' ? colors.danger
          : tint === 'success' ? colors.success
            : colors.primary);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <SheetHandle />
          <View style={[styles.head, { backgroundColor: accent + '1f', borderColor: accent + '4d' }]}>
            <Ionicons name={icon} size={26} color={accent} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            {body ? <Text style={styles.body}>{body}</Text> : null}
            {children}
          </ScrollView>
          {footer ? <View style={styles.footerWrap}>{footer}</View> : null}
          <View style={{ height: spacing.sm }} />
          <AppButton title="إغلاق" variant="ghost" small onPress={onClose} />
          <View style={{ height: spacing.xl }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** بطاقة إعلان حديثة (مشتركة بين لوحة الإدارة وواجهة الطالب) */
export function AnnouncementCard({
  title, body, meta, pinned, onPress,
}: {
  title: string;
  body: string;
  meta?: string;
  pinned?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <View style={[cardStyles.card, pinned && cardStyles.cardPinned]}>
        <View style={cardStyles.headRow}>
          <View style={[cardStyles.icon, pinned && cardStyles.iconPinned]}>
            <Ionicons name="megaphone" size={19} color={pinned ? colors.warning : colors.info} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={cardStyles.title} numberOfLines={2}>{title}</Text>
            {meta ? <Text style={cardStyles.meta}>{meta}</Text> : null}
          </View>
          {pinned ? (
            <View style={cardStyles.pinPill}>
              <Ionicons name="pin" size={11} color={colors.warning} />
              <Text style={cardStyles.pinText}>مثبت</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-back" size={16} color={colors.textMuted} />
        </View>
        <Text style={cardStyles.preview} numberOfLines={2}>{body}</Text>
        <Text style={cardStyles.more}>اضغط لعرض التفاصيل كاملة</Text>
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2,8,6,0.66)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgSoft,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xl, borderWidth: 1, borderColor: colors.border,
    maxHeight: '92%',
  },
  head: {
    width: 62, height: 62, borderRadius: radius.lg, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
  },
  title: {
    color: colors.text, fontSize: font.lg, fontWeight: '900',
    textAlign: 'center', marginTop: spacing.md,
  },
  meta: { color: colors.textMuted, fontSize: font.xs, textAlign: 'center', marginTop: spacing.xs },
  body: {
    color: colors.text, fontSize: font.md, textAlign: 'right',
    lineHeight: 28, marginTop: spacing.lg,
  },
  footerWrap: { marginTop: spacing.lg },
}));

const cardStyles = themedStyles(() => StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: spacing.md,
  },
  cardPinned: { borderColor: colors.warning + '66', backgroundColor: colors.warning + '10' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.info + '1f', borderWidth: 1, borderColor: colors.info + '4d',
    alignItems: 'center', justifyContent: 'center',
  },
  iconPinned: { backgroundColor: colors.warning + '1f', borderColor: colors.warning + '55' },
  title: { color: colors.text, fontSize: font.md, fontWeight: '800', textAlign: 'right' },
  meta: { color: colors.textMuted, fontSize: font.xs, textAlign: 'right', marginTop: 2 },
  pinPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.warningBg, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  pinText: { color: colors.warning, fontSize: font.xs, fontWeight: '800' },
  preview: {
    color: colors.textSecondary, fontSize: font.sm, textAlign: 'right',
    lineHeight: 21, marginTop: spacing.md,
  },
  more: { color: colors.cyan, fontSize: font.xs, fontWeight: '700', textAlign: 'left', marginTop: spacing.sm },
}));
