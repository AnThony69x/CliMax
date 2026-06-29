import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const premiumColors = {
  ink: '#f8fafc',
  inkMuted: 'rgba(226,232,240,0.78)',
  inkSubtle: 'rgba(148,163,184,0.92)',
  surface: '#050914',
  surfaceElevated: 'rgba(12,18,34,0.82)',
  surfaceStrong: 'rgba(8,13,28,0.94)',
  glass: 'rgba(255,255,255,0.075)',
  glassStrong: 'rgba(255,255,255,0.115)',
  glassBorder: 'rgba(255,255,255,0.15)',
  glassBorderStrong: 'rgba(125,211,252,0.35)',
  accent: '#38bdf8',
  accentSoft: '#7dd3fc',
  accentDeep: '#082f49',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#fb7185',
  auroraAqua: 'rgba(56,189,248,0.24)',
  auroraTeal: 'rgba(45,212,191,0.12)',
  auroraGold: 'rgba(251,191,36,0.08)',
};

export const premiumRadii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 30,
  pill: 999,
};

export const premiumSpacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
};

export const premiumType = {
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.25,
    textTransform: 'uppercase',
    color: premiumColors.inkSubtle,
  } satisfies TextStyle,
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0,
    color: premiumColors.ink,
  } satisfies TextStyle,
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0,
    color: premiumColors.ink,
  } satisfies TextStyle,
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: premiumColors.inkMuted,
  } satisfies TextStyle,
};

export function premiumShadow(level: 'soft' | 'medium' | 'strong' = 'medium'): ViewStyle {
  const map = {
    soft: { opacity: 0.16, radius: 12, height: 8, elevation: 3 },
    medium: { opacity: 0.24, radius: 20, height: 12, elevation: 6 },
    strong: { opacity: 0.38, radius: 30, height: 20, elevation: 14 },
  }[level];

  return {
    ...Platform.select<ViewStyle>({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: map.height },
        shadowOpacity: map.opacity,
        shadowRadius: map.radius,
      },
      android: {
        elevation: map.elevation,
      },
      web: {
        boxShadow: `0px ${map.height}px ${map.radius}px rgba(0, 0, 0, ${map.opacity})`,
      },
      default: {},
    }),
  };
}

export const premiumSurface = {
  card: {
    backgroundColor: premiumColors.surfaceElevated,
    borderColor: premiumColors.glassBorder,
    borderWidth: 1,
    borderRadius: premiumRadii.xl,
    overflow: 'hidden',
    ...premiumShadow('medium'),
  } satisfies ViewStyle,
  hairline: {
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
  } satisfies ViewStyle,
};
