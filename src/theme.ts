// ============================================================
// هوية Mr Center البصرية: «كربون المستقبل» — داكن فحمي + نعناعي
// كهربائي + كهرماني، بلا البنفسجي التقليدي
// (الوضع الداكن هو الهوية المعتمدة — لا يوجد وضع فاتح)
// ============================================================

export const colors = {
  // الخلفيات (فحمي مزرق عميق)
  bg: '#060A12',
  bgSoft: '#0A101D',
  surface: '#0F1729',
  surfaceAlt: '#16213A',
  surfaceGlass: 'rgba(22, 33, 58, 0.55)',
  border: 'rgba(148, 184, 190, 0.16)',
  borderStrong: 'rgba(148, 184, 190, 0.30)',

  // الألوان الأساسية (نعناعي كهربائي → فيروزي عميق)
  primary: '#00E5A0',
  primaryDark: '#00A878',
  indigo: '#0EA5A4',
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
  textOnPrimary: '#052E22',
} as const;

type GradientColors = readonly [string, string, ...string[]];

export const gradients: Record<string, GradientColors> = {
  primary: ['#00E5A0', '#0EA5A4', '#0B3B4F'],
  screen: ['#060A12', '#081220', '#0A1B2B'],
  header: ['rgba(0, 229, 160, 0.22)', 'rgba(34, 211, 238, 0.10)', 'transparent'],
  card: ['rgba(0, 229, 160, 0.12)', 'rgba(34, 211, 238, 0.05)'],
  accent: ['#22D3EE', '#0EA5A4'],
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
    shadowColor: '#00E5A0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
} as const;
