/**
 * Theme tokens. `colors` / `gradients` / `levelColor` are live objects: applyTheme() swaps their
 * values in place, and the root layout remounts the screens so everything re-renders with them.
 * Module-level style sheets must be wrapped in themed() so they rebuild after a switch.
 */
export type ThemeMode = 'dark' | 'light';

const shared = {
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
};

const palettes = {
  dark: {
    ...shared,
    bg: '#0A0C11',
    surface: '#12151D',
    surfaceAlt: '#1A1F2B',
    surfaceHigh: '#232A39',
    border: '#1E2431',
    borderStrong: '#2A3243',
    text: '#F4F6FB',
    textMuted: '#8B94A7',
    textDim: '#5D6577',
  },
  light: {
    ...shared,
    primary: '#6A48F5',
    green: '#16A34A',
    red: '#E11D48',
    amber: '#D97706',
    blue: '#2F6FEB',
    bg: '#F4F5F9',
    surface: '#FFFFFF',
    surfaceAlt: '#EEF0F5',
    surfaceHigh: '#E2E6EE',
    border: '#E3E6EE',
    borderStrong: '#CDD3DF',
    text: '#11141C',
    textMuted: '#5A6375',
    textDim: '#949CAE',
  },
};

const cardGradients = { dark: ['#171B26', '#11141B'] as const, light: ['#FFFFFF', '#FAFBFD'] as const };

export type Palette = typeof palettes.dark;
export const colors: Palette = { ...palettes.dark };

export const gradients: { primary: readonly [string, string]; green: readonly [string, string]; red: readonly [string, string]; card: readonly [string, string] } = {
  primary: ['#7C5CFF', '#4F8BFF'],
  green: ['#16A34A', '#22C55E'],
  red: ['#BE123C', '#F43F5E'],
  card: cardGradients.dark,
};

export const radius = { sm: 12, md: 16, lg: 24, xl: 30, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 20, xl: 28, xxl: 40 } as const;

export const levelColor = {
  danger: { fg: colors.red, bg: colors.redSoft },
  warning: { fg: colors.amber, bg: colors.amberSoft },
  success: { fg: colors.green, bg: colors.greenSoft },
  info: { fg: colors.blue, bg: colors.infoSoft },
};

export const TRACKER_COLORS = ['#7C5CFF', '#4F8BFF', '#22C55E', '#F59E0B', '#F43F5E', '#14B8A6', '#EC4899', '#A3E635'];

let current: ThemeMode = 'dark';
let version = 0;

export const themeMode = () => current;
export const isDark = () => current === 'dark';

/** Swap every token to the given palette. Returns true if anything changed. */
export function applyTheme(mode: ThemeMode) {
  if (mode === current) return false;
  current = mode;
  version++;
  Object.assign(colors, palettes[mode]);
  gradients.card = cardGradients[mode];
  Object.assign(levelColor.danger, { fg: colors.red, bg: colors.redSoft });
  Object.assign(levelColor.warning, { fg: colors.amber, bg: colors.amberSoft });
  Object.assign(levelColor.success, { fg: colors.green, bg: colors.greenSoft });
  Object.assign(levelColor.info, { fg: colors.blue, bg: colors.infoSoft });
  return true;
}

/** A style sheet that rebuilds itself after the theme changes. Use instead of a module-level StyleSheet.create. */
export function themed<T extends object>(make: () => T): T {
  let built = -1;
  let cache = {} as T;
  return new Proxy({} as T, {
    get(_, key) {
      if (built !== version) {
        cache = make();
        built = version;
      }
      return cache[key as keyof T];
    },
  });
}
