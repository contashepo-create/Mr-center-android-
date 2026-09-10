// ============================================================
// هوية Mr Center البصرية: «كربون المستقبل» — داكن فحمي + نعناعي
// كهربائي + كهرماني، مع وضع فاتح كامل بنفس الهوية.
//
// كيف يعمل الوضعان دون إعادة بناء كل شاشة؟
//  • colors / gradients كائنات «حية» عبر Proxy تقرأ لوحة الوضع الحالي
//    وقت العرض — فكل استخدام داخل JSX يتبع الوضع فوراً.
//  • themedStyles(() => StyleSheet.create({...})) يبني الأنماط كسولاً
//    ويعيد بناءها عند تبديل الوضع (بدل التقاط ألوان الوضع القديم).
//  • مزوّد الثيم في src/lib/themeContext.tsx يعيد رسم الشجرة عند التبديل.
// ============================================================

export type ThemeMode = 'dark' | 'light';

export interface Palette {
  isDark: boolean;

  // الخلفيات
  bg: string;
  bgSoft: string;
  surface: string;
  surfaceAlt: string;
  surfaceGlass: string;
  border: string;
  borderStrong: string;

  // الألوان الأساسية (نعناعي كهربائي → فيروزي عميق)
  primary: string;
  primaryDark: string;
  indigo: string;
  blue: string;
  cyan: string;
  cyanDark: string;

  // حالات
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  info: string;
  infoBg: string;

  // النصوص
  text: string;
  textSecondary: string;
  textMuted: string;
  textOnPrimary: string;
}

// ------------------------------------------------------------ 
// اللوحة الداكنة (الهوية الأصلية — بلا أي تغيير)
// ------------------------------------------------------------
const DARK: Palette = {
  isDark: true,

  bg: '#060A12',
  bgSoft: '#0A101D',
  surface: '#0F1729',
  surfaceAlt: '#16213A',
  surfaceGlass: 'rgba(22, 33, 58, 0.55)',
  border: 'rgba(148, 184, 190, 0.16)',
  borderStrong: 'rgba(148, 184, 190, 0.30)',

  primary: '#00E5A0',
  primaryDark: '#00A878',
  indigo: '#0EA5A4',
  blue: '#2563EB',
  cyan: '#22D3EE',
  cyanDark: '#0891B2',

  success: '#34D399',
  successBg: 'rgba(52, 211, 153, 0.12)',
  warning: '#FBBF24',
  warningBg: 'rgba(251, 191, 36, 0.12)',
  danger: '#F87171',
  dangerBg: 'rgba(248, 113, 113, 0.12)',
  info: '#60A5FA',
  infoBg: 'rgba(96, 165, 250, 0.12)',

  text: '#F1F5F9',
  textSecondary: '#A6B0C3',
  textMuted: '#64748B',
  textOnPrimary: '#052E22',
};

// ------------------------------------------------------------
// اللوحة الفاتحة (نفس الهوية: نعناعي على أبيض ضبابي)
// ------------------------------------------------------------
const LIGHT: Palette = {
  isDark: false,

  bg: '#F1F6F3',
  bgSoft: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#E7F0EC',
  surfaceGlass: 'rgba(255, 255, 255, 0.65)',
  border: 'rgba(7, 46, 38, 0.12)',
  borderStrong: 'rgba(7, 46, 38, 0.24)',

  primary: '#00A87A',
  primaryDark: '#008F68',
  indigo: '#0B7C7B',
  blue: '#1D4ED8',
  cyan: '#0E7490',
  cyanDark: '#155E75',

  success: '#047857',
  successBg: 'rgba(4, 120, 87, 0.10)',
  warning: '#B45309',
  warningBg: 'rgba(180, 83, 9, 0.10)',
  danger: '#DC2626',
  dangerBg: 'rgba(220, 38, 38, 0.08)',
  info: '#1D4ED8',
  infoBg: 'rgba(29, 78, 216, 0.08)',

  text: '#0A1F1A',
  textSecondary: '#3E5A52',
  textMuted: '#667A73',
  textOnPrimary: '#04352A',
};

const PALETTES: Record<ThemeMode, Palette> = { dark: DARK, light: LIGHT };

type GradientColors = readonly [string, string, ...string[]];
interface GradientSet {
  primary: GradientColors;
  screen: GradientColors;
  header: GradientColors;
  card: GradientColors;
  accent: GradientColors;
  success: GradientColors;
  danger: GradientColors;
  gold: GradientColors;
}

// تدرجات كل وضع — البطاقات النعناعية تحتفظ بدرجة متوسطة
// ليظل النص الداكن (#052E22) مقروءاً فوقها في الوضعين.
const DARK_GRADIENTS: GradientSet = {
  primary: ['#00E5A0', '#0EA5A4', '#0B3B4F'],
  screen: ['#060A12', '#081220', '#0A1B2B'],
  header: ['rgba(0, 229, 160, 0.22)', 'rgba(34, 211, 238, 0.10)', 'transparent'],
  card: ['rgba(0, 229, 160, 0.12)', 'rgba(34, 211, 238, 0.05)'],
  accent: ['#22D3EE', '#0EA5A4'],
  success: ['#059669', '#34D399'],
  danger: ['#DC2626', '#F87171'],
  gold: ['#F59E0B', '#FBBF24'],
};

const LIGHT_GRADIENTS: GradientSet = {
  primary: ['#00C489', '#00A87A', '#0B7A61'],
  screen: ['#F7FAF9', '#F2F6F4', '#ECF2F0'],
  header: ['rgba(0, 168, 122, 0.16)', 'rgba(14, 116, 144, 0.07)', 'transparent'],
  card: ['rgba(0, 168, 122, 0.08)', 'rgba(14, 116, 144, 0.04)'],
  accent: ['#0E7490', '#0B7C7B'],
  success: ['#047857', '#10B981'],
  danger: ['#B91C1C', '#EF4444'],
  gold: ['#B45309', '#D97706'],
};

const GRADIENTS: Record<ThemeMode, GradientSet> = {
  dark: DARK_GRADIENTS, light: LIGHT_GRADIENTS,
};

// ------------------------------------------------------------
// حالة الوضع الحالي (وحدة واحدة مشتركة قبل أي رسم)
// ------------------------------------------------------------
let currentMode: ThemeMode = 'dark';
const listeners = new Set<() => void>();

export function getThemeMode(): ThemeMode {
  return currentMode;
}

export function isDarkMode(): boolean {
  return currentMode === 'dark';
}

/** تبديل الوضع عالمياً — تستدعيه من مزوّد الثيم (يعيد رسم الشجرة) */
export function setThemeMode(next: ThemeMode): void {
  if (next === currentMode) return;
  currentMode = next;
  for (const l of listeners) {
    try { l(); } catch { /* تجاهل */ }
  }
}

/** اشتراك في تغيّر الوضع (للمزوّد والاختبارات) */
export function onThemeChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// ------------------------------------------------------------
// اللوحات الحية: كل قراءة colors.x / gradients.x وقت العرض
// تعود بقيمة الوضع الحالي — فلا تلزم تعديلات في الشاشات.
// ------------------------------------------------------------
export const colors: Palette = new Proxy({} as Palette, {
  get(_t, key: string) {
    return (PALETTES[currentMode] as unknown as Record<string, unknown>)[key];
  },
});

export const gradients: GradientSet = new Proxy({} as GradientSet, {
  get(_t, key: string) {
    return (GRADIENTS[currentMode] as unknown as Record<string, unknown>)[key];
  },
});

/**
 * أنماط وحدة على مستوى الملف تتبع الوضع:
 * const styles = themedStyles(() => StyleSheet.create({ ... colors.x ... }));
 * تُبنى كسولاً عند أول استخدام وتُعاد بناؤها تلقائياً عند تبديل الوضع
 * (لا تُلتقط ألوان الوضع القديم أبداً).
 */
export function themedStyles<T extends Record<string, unknown>>(factory: () => T): T {
  let cache: { mode: ThemeMode; value: T } | null = null;
  return new Proxy({} as T, {
    get(_t, key: string) {
      if (!cache || cache.mode !== currentMode) {
        cache = { mode: currentMode, value: factory() };
      }
      return cache.value[key];
    },
  });
}

// ------------------------------------------------------------
// ثوابت التصميم (لا تتغير بين الوضعين)
// ------------------------------------------------------------
export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const font = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  hero: 32,
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  glow: {
    shadowColor: '#00E5A0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
} as const;
