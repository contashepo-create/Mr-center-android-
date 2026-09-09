// ============================================================
// نظام الألوان والتصميم الموحد للتطبيق (داكن احترافي بالدرجات)
// ============================================================

export const colors = {
  // الخلفيات
  bg: '#0A0E1A',
  bgSoft: '#0E1424',
  surface: '#131B31',
  surfaceAlt: '#1A2440',
  surfaceGlass: 'rgba(26, 36, 64, 0.55)',
  border: 'rgba(148, 163, 184, 0.16)',
  borderStrong: 'rgba(148, 163, 184, 0.30)',

  // الألوان الأساسية (تدرج بنفسجي → نيلي → أزرق)
  primary: '#7C3AED',
  primaryDark: '#5B21B6',
  indigo: '#4F46E5',
  blue: '#2563EB',
  cyan: '#22D3EE',
  cyanDark: '#0891B2',

  // حالات
  success: '#34D399',
  successBg: 'rgba(52, 211, 153, 0.12)',
  warning: '#FBBF24',
  warningBg: 'rgba(251, 191, 36, 0.12)',
  danger: '#F87171',
  dangerBg: 'rgba(248, 113, 113, 0.12)',
  info: '#60A5FA',
  infoBg: 'rgba(96, 165, 250, 0.12)',

  // النصوص
  text: '#F1F5F9',
  textSecondary: '#A6B0C3',
  textMuted: '#64748B',
  textOnPrimary: '#FFFFFF',
} as const;

type GradientColors = readonly [string, string, ...string[]];

export const gradients: Record<string, GradientColors> = {
  primary: ['#7C3AED', '#4F46E5', '#2563EB'],
  screen: ['#0A0E1A', '#0D1330', '#101A3E'],
  header: ['rgba(124, 58, 237, 0.35)', 'rgba(37, 99, 235, 0.12)', 'transparent'],
  card: ['rgba(124, 58, 237, 0.16)', 'rgba(34, 211, 238, 0.06)'],
  accent: ['#22D3EE', '#2563EB'],
  success: ['#059669', '#34D399'],
  danger: ['#DC2626', '#F87171'],
  gold: ['#F59E0B', '#FBBF24'],
};

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
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 10,
  },
} as const;
