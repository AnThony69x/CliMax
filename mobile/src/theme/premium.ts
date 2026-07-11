import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Dirección "Solsticio": editorial y claro. El acento FIJO de marca (botones,
 * íconos, tarjetas activas — todo lo que no es la escena de clima en sí) es
 * el verde-azulado. El naranja cálido queda reservado como color dinámico de
 * `weatherScenes.ts` para cuando el clima real es soleado — no es el acento
 * general de la app.
 * `ink`, `surface` y `glass*` ya no son "casi blanco sobre casi negro" — son
 * "casi negro sobre piedra clara", así que cualquier pantalla que siga
 * usando estos tokens hereda el nuevo look sin más cambios.
 */
export const premiumColors = {
  ink: '#1b2027',
  inkMuted: 'rgba(27,32,39,0.66)',
  inkSubtle: 'rgba(27,32,39,0.48)',
  surface: '#eef0f2',
  surfaceElevated: 'rgba(255,255,255,0.92)',
  surfaceStrong: 'rgba(255,255,255,0.98)',
  glass: 'rgba(27,32,39,0.035)',
  glassStrong: 'rgba(27,32,39,0.06)',
  glassBorder: 'rgba(27,32,39,0.12)',
  glassBorderStrong: 'rgba(31,111,107,0.35)',
  glassBorderHi: 'rgba(27,32,39,0.2)',
  accent: '#1f6f6b',
  accentSoft: '#a9d4cf',
  accentDeep: '#0d2e2b',
  success: '#3f8f5c',
  warning: '#c98a2e',
  danger: '#b6432c',
  auroraAqua: 'rgba(31,111,107,0.16)',
  auroraTeal: 'rgba(31,111,107,0.12)',
  auroraGold: 'rgba(226,98,43,0.12)',
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
