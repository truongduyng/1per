import { Platform } from 'react-native';

export const palette = {
  orange: '#FB923C',
  orangeStrong: '#F97316',
  white: '#FFFFFF',
  black: '#000000',

  // Orange alpha variants
  orange08: 'rgba(251,146,60,0.08)',
  orange06: 'rgba(251,146,60,0.06)',
  orange10: 'rgba(251,146,60,0.1)',
  orange12: 'rgba(251,146,60,0.12)',
  orange15: 'rgba(251,146,60,0.15)',
  orange16: 'rgba(251,146,60,0.16)',
  orange25: 'rgba(251,146,60,0.25)',
  orange30: 'rgba(251,146,60,0.3)',
  orange35: 'rgba(251,146,60,0.35)',

  // White alpha variants
  white04: 'rgba(255,255,255,0.04)',
  white05: 'rgba(255,255,255,0.05)',
  white06: 'rgba(255,255,255,0.06)',
  white08: 'rgba(255,255,255,0.08)',
  white10: 'rgba(255,255,255,0.1)',
  white12: 'rgba(255,255,255,0.12)',
  white14: 'rgba(255,255,255,0.14)',
  white15: 'rgba(255,255,255,0.15)',
  white20: 'rgba(255,255,255,0.2)',
  white25: 'rgba(255,255,255,0.25)',
  white30: 'rgba(255,255,255,0.3)',
  white32: 'rgba(255,255,255,0.32)',
  white35: 'rgba(255,255,255,0.35)',
  white38: 'rgba(255,255,255,0.38)',
  white40: 'rgba(255,255,255,0.4)',
  white42: 'rgba(255,255,255,0.42)',
  white45: 'rgba(255,255,255,0.45)',
  white50: 'rgba(255,255,255,0.5)',
  white55: 'rgba(255,255,255,0.55)',
  white60: 'rgba(255,255,255,0.6)',
  white62: 'rgba(255,255,255,0.62)',
  white70: 'rgba(255,255,255,0.7)',
  white75: 'rgba(255,255,255,0.75)',
  white80: 'rgba(255,255,255,0.8)',
  white85: 'rgba(255,255,255,0.85)',
} as const;

const tintColorLight = palette.orange;
const tintColorDark = palette.orange;

export const Colors = {
  light: {
    // nav / tab bar
    text: '#11181C',
    background: '#F2F2F7',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,

    // semantic surfaces
    screenBg: '#F2F2F7',
    heroBg: '#F2F2F7',
    cardBg: '#FFFFFF',
    cardBorder: 'rgba(15,23,42,0.16)',
    sheetBg: '#FFFFFF',
    sheetHandle: 'rgba(15,23,42,0.22)',
    inputBg: '#ECEEF2',
    inputBorder: 'rgba(15,23,42,0.18)',
    divider: 'rgba(15,23,42,0.12)',
    overlayBg: 'rgba(0,0,0,0.35)',

    // text
    textPrimary: '#0A0A0A',
    textSecondary: 'rgba(15,23,42,0.70)',
    textTertiary: 'rgba(15,23,42,0.56)',
    textQuaternary: 'rgba(15,23,42,0.44)',
    textPlaceholder: 'rgba(15,23,42,0.42)',
    textInverse: '#FFFFFF',

    // interactive
    iconPrimary: '#0A0A0A',
    iconSecondary: 'rgba(15,23,42,0.68)',
    iconTertiary: 'rgba(15,23,42,0.48)',

    // accent - orange stays the same in both themes
    accent: palette.orange,
    accentText: '#C2410C',
    accentBg: 'rgba(251,146,60,0.12)',
    accentBorder: 'rgba(251,146,60,0.35)',
    accentBgSubtle: 'rgba(251,146,60,0.08)',
    accentBorderSubtle: 'rgba(251,146,60,0.25)',

    // heatmap
    heatIdle: 'rgba(15,23,42,0.08)',
    heatIdleBorder: 'rgba(15,23,42,0.12)',
    heatLow: 'rgba(240,136,60,0.28)',
    heatMid: 'rgba(240,136,60,0.55)',
    heatHigh: palette.orange,
  },
  dark: {
    // nav / tab bar
    text: '#F2F3F4',
    background: '#1E1F22',
    tint: tintColorDark,
    icon: '#B4BAC0',
    tabIconDefault: '#B4BAC0',
    tabIconSelected: tintColorDark,

    // semantic surfaces
    // Lifted off near-black so cards and text separate clearly from the page.
    screenBg: '#1E1F22',
    heroBg: '#1E1F22',
    cardBg: 'rgba(255,255,255,0.09)',
    cardBorder: 'rgba(255,255,255,0.18)',
    sheetBg: '#26272B',
    sheetHandle: 'rgba(255,255,255,0.32)',
    inputBg: 'rgba(255,255,255,0.10)',
    inputBorder: 'rgba(255,255,255,0.26)',
    divider: 'rgba(255,255,255,0.16)',
    overlayBg: 'rgba(0,0,0,0.55)',

    // text - each step stays ≥ 4.5:1 against cardBg on screenBg (WCAG AA)
    textPrimary: '#F5F5F5',
    textSecondary: 'rgba(255,255,255,0.80)',
    textTertiary: 'rgba(255,255,255,0.68)',
    textQuaternary: 'rgba(255,255,255,0.58)',
    textPlaceholder: 'rgba(255,255,255,0.52)',
    textInverse: '#0A0A0A',

    // interactive
    iconPrimary: '#F5F5F5',
    iconSecondary: 'rgba(255,255,255,0.80)',
    iconTertiary: 'rgba(255,255,255,0.60)',

    // accent
    accent: palette.orange,
    accentText: palette.orange,
    accentBg: palette.orange15,
    accentBorder: 'rgba(251,146,60,0.45)',
    accentBgSubtle: palette.orange10,
    accentBorderSubtle: palette.orange35,

    // heatmap
    heatIdle: 'rgba(255,255,255,0.10)',
    heatIdleBorder: 'rgba(255,255,255,0.16)',
    heatLow: 'rgba(240,136,60,0.28)',
    heatMid: 'rgba(240,136,60,0.55)',
    heatHigh: palette.orange,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
