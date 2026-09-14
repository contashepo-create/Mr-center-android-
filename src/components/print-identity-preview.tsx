// ============================================================
// معاينة حية لهوية الطباعة (شعار + علامة مائية + تذييل) قبل الحفظ.
// نظير React Native لمكوّني الويب print-identity-preview.tsx و
// watermark-preview.tsx — يقرأ نفس الحسابات من src/lib/printing.ts
// (brandForCenter/watermarkDisplayText/watermarkRepeatCount/
// watermarkGridColumns/documentFooterText) فتبقى المعاينة مطابقة
// لما يُنتجه buildReportHtml وقت الطباعة الفعلية.
// ============================================================

import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  documentFooterText, watermarkDisplayText, watermarkGridColumns, watermarkRepeatCount,
  type CenterPrintBranding,
} from '../lib/printing';
import { colors, font, radius, spacing, themedStyles } from '../theme';

const SHEET_ASPECT = 1.414; // تقريب A4 عمودي

function rotationFor(direction: CenterPrintBranding['watermark_direction']): string {
  if (direction === 'diagonal') return '-35deg';
  if (direction === 'vertical') return '-90deg';
  return '0deg';
}

function logoStyle(position: CenterPrintBranding['logo_position']) {
  const base = { position: 'absolute' as const };
  if (position === 'top_right') return { ...base, top: 10, right: 10 };
  if (position === 'top_left') return { ...base, top: 10, left: 10 };
  if (position === 'top_center') return { ...base, top: 8, alignSelf: 'center' as const, left: '50%' as const, marginLeft: -21 };
  if (position === 'bottom_right') return { ...base, bottom: 10, right: 10 };
  return { ...base, bottom: 10, left: 10 };
}

/** طبقة العلامة المائية — شبكة نصوص/صور شفافة تدور حسب الاتجاه المختار. */
function WatermarkPreview({ branding }: { branding: CenterPrintBranding }) {
  if (!branding.watermark_enabled) return null;
  const count = watermarkRepeatCount(branding);
  const text = watermarkDisplayText(branding);
  const columns = watermarkGridColumns(branding);
  const rotate = rotationFor(branding.watermark_direction);
  const marks = Array.from({ length: count }, (_, i) => i);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.watermarkLayer,
        branding.watermark_layer === 'front' ? styles.watermarkFront : styles.watermarkBehind,
        { opacity: branding.watermark_opacity },
      ]}
    >
      <View style={[styles.watermarkGrid, { flexBasis: `${100 / columns}%` }]}>
        {marks.map((i) => (
          <View key={i} style={[styles.watermarkCell, { width: `${100 / columns}%` }]}>
            <View style={{ transform: [{ rotate }] }}>
              {branding.watermark_image ? (
                <Image source={{ uri: branding.watermark_image }} style={styles.watermarkImage} resizeMode="contain" />
              ) : null}
              {text ? (
                <Text
                  numberOfLines={1}
                  style={[styles.watermarkText, { color: branding.watermark_color, fontSize: Math.min(branding.watermark_font_size, 30) }]}
                >
                  {text}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** مصغّر ورقة رسمية بالهوية الحالية — يقرأ مباشرة من CenterPrintBranding. */
export function PrintIdentityPreview({ branding, compact = false }: { branding: CenterPrintBranding; compact?: boolean }) {
  const footer = documentFooterText(branding);
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={[styles.sheet, { aspectRatio: 1 / SHEET_ASPECT }]}>
        <WatermarkPreview branding={branding} />
        {branding.logo_url ? (
          <Image
            source={{ uri: branding.logo_url }}
            style={[styles.logo, logoStyle(branding.logo_position), { width: branding.logo_size * 0.6, height: branding.logo_size * 0.6 }]}
            resizeMode="contain"
          />
        ) : null}

        <View style={styles.content}>
          {branding.header_show_center_name ? <Text style={styles.headerName}>{branding.center_name}</Text> : null}
          <Text style={styles.headerTitle}>نموذج مستند رسمي</Text>
          <Text style={styles.headerSub}>معاينة مباشرة للشعار والعلامة المائية والتذييل.</Text>

          <View style={styles.lines}>
            <View style={[styles.line, { width: '100%' }]} />
            <View style={[styles.line, { width: '81%' }]} />
            <View style={[styles.line, { width: '90%' }]} />
          </View>

          <View style={styles.table}>
            <View style={[styles.tr, styles.thRow]}>
              <Text style={[styles.th, { flex: 0.6 }]}>البند</Text>
              <Text style={[styles.th, { flex: 2 }]}>البيان</Text>
              <Text style={[styles.th, { flex: 1 }]}>القيمة</Text>
            </View>
            <View style={styles.tr}>
              <Text style={[styles.td, { flex: 0.6 }]}>١</Text>
              <Text style={[styles.td, { flex: 2 }]}>نموذج بيانات للطباعة</Text>
              <Text style={[styles.td, { flex: 1 }]}>—</Text>
            </View>
            <View style={styles.tr}>
              <Text style={[styles.td, { flex: 0.6 }]}>٢</Text>
              <Text style={[styles.td, { flex: 2 }]}>يظهر الشعار في الموضع المحدد</Text>
              <Text style={[styles.td, { flex: 1 }]}>—</Text>
            </View>
          </View>
        </View>

        {footer ? (
          <Text style={[styles.footer, { fontSize: Math.max(8, branding.footer_font_size) }]} numberOfLines={1}>
            {footer}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  wrap: {
    alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    padding: spacing.md,
  },
  wrapCompact: { padding: spacing.sm },
  sheet: {
    width: '100%', maxWidth: 340, backgroundColor: '#ffffff', borderRadius: 4,
    overflow: 'hidden', position: 'relative',
  },
  watermarkLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  watermarkFront: { zIndex: 3 },
  watermarkBehind: { zIndex: 0 },
  watermarkGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', height: '100%', alignContent: 'center' },
  watermarkCell: { alignItems: 'center', justifyContent: 'center', padding: 2 },
  watermarkImage: { width: 40, height: 40 },
  watermarkText: { fontWeight: '900', textAlign: 'center' },
  logo: { zIndex: 2 },
  content: { padding: spacing.lg, paddingTop: spacing.xl, zIndex: 1 },
  headerName: { color: '#08765a', fontWeight: '800', fontSize: font.xs },
  headerTitle: { color: '#173c31', fontWeight: '900', fontSize: font.lg, marginTop: 4 },
  headerSub: { color: '#62766d', fontSize: font.xs, marginTop: 4 },
  lines: { gap: 8, marginVertical: spacing.md },
  line: { height: 6, borderRadius: 999, backgroundColor: '#e5eee9' },
  table: { borderWidth: 1, borderColor: '#cfe1d8', borderRadius: 4, overflow: 'hidden' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#cfe1d8' },
  thRow: { backgroundColor: '#e8f5ee' },
  th: { color: '#07563f', fontWeight: '800', fontSize: 10, padding: 6, textAlign: 'right' },
  td: { color: '#173c31', fontSize: 10, padding: 6, textAlign: 'right' },
  footer: {
    position: 'absolute', bottom: 6, left: 12, right: 12, zIndex: 2,
    color: '#687d73', textAlign: 'center', borderTopWidth: 1, borderTopColor: '#bed1c6', paddingTop: 4,
  },
}));
