export const colors = {
  bg: '#0A0C11',
  surface: '#12151D',
  surfaceAlt: '#1A1F2B',
  surfaceHigh: '#232A39',
  border: '#252C3B',
  text: '#F4F6FB',
  textMuted: '#8B94A7',
  textDim: '#5D6577',
  primary: '#7C5CFF',
  primarySoft: 'rgba(124, 92, 255, 0.16)',
  blue: '#4F8BFF',
  green: '#22C55E',
  greenSoft: 'rgba(34, 197, 94, 0.14)',
  red: '#F43F5E',
  redSoft: 'rgba(244, 63, 94, 0.14)',
  amber: '#F59E0B',
  amberSoft: 'rgba(245, 158, 11, 0.14)',
  infoSoft: 'rgba(79, 139, 255, 0.14)',
} as const;

export const gradients = {
  primary: ['#7C5CFF', '#4F8BFF'] as const,
  green: ['#16A34A', '#22C55E'] as const,
  red: ['#BE123C', '#F43F5E'] as const,
  card: ['#171B26', '#11141B'] as const,
};

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const levelColor = {
  danger: { fg: colors.red, bg: colors.redSoft },
  warning: { fg: colors.amber, bg: colors.amberSoft },
  success: { fg: colors.green, bg: colors.greenSoft },
  info: { fg: colors.blue, bg: colors.infoSoft },
} as const;

export const TRACKER_COLORS = ['#7C5CFF', '#4F8BFF', '#22C55E', '#F59E0B', '#F43F5E', '#14B8A6', '#EC4899', '#A3E635'];
