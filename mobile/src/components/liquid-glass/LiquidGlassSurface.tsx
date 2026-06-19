import { BlurView } from 'expo-blur';
import React from 'react';
import {
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { GlassFilter } from './GlassFilter';
import {
  LIQUID_GLASS_SHADOW_DARK,
  LIQUID_GLASS_SHADOW_LIGHT,
  liquidGlassWebBackdrop,
} from './liquidGlassTokens';

type LiquidGlassSurfaceProps = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius: number;
  /** Intensidad del BlurView de fondo */
  blurIntensity?: number;
  blurTint?: 'light' | 'dark' | 'default';
  /** Velo oscuro encima del blur (0–1) */
  darkVeilOpacity?: number;
  /** Variante visual: barra completa o burbuja activa */
  variant?: 'bar' | 'bubble';
};

/**
 * Superficie “liquid glass” con capas del componente de referencia:
 * blur, sombras inset (web), filtro SVG (web) y brillos simulados (nativo).
 */
export function LiquidGlassSurface({
  children,
  style,
  borderRadius,
  blurIntensity = 88,
  blurTint = 'dark',
  darkVeilOpacity = 0.32,
  variant = 'bar',
}: LiquidGlassSurfaceProps) {
  const isBubble = variant === 'bubble';
  const webGlassShadow = isBubble
    ? LIQUID_GLASS_SHADOW_LIGHT
    : LIQUID_GLASS_SHADOW_DARK;

  return (
    <View
      style={[
        styles.root,
        { borderRadius },
        Platform.OS === 'web' && ({ boxShadow: webGlassShadow } as ViewStyle),
        style,
      ]}>
      <BlurView
        intensity={blurIntensity}
        tint={blurTint}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />

      {/* Capa de sombra volumétrica (referencia liquid-glass-button) */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius },
          styles.glassShadowShell,
        ]}
      />

      {/* Distorsión líquida vía filtro SVG — solo web */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius, overflow: 'hidden' },
          liquidGlassWebBackdrop as ViewStyle,
        ]}
      />

      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            backgroundColor: `rgba(0, 0, 0, ${darkVeilOpacity})`,
          },
        ]}
      />

      <View
        pointerEvents="none"
        style={[
          styles.topHighlight,
          {
            borderTopLeftRadius: borderRadius,
            borderTopRightRadius: borderRadius,
            opacity: isBubble ? 0.12 : 0.08,
          },
        ]}
      />

      {/* Biseles inset simulados en nativo */}
      <View
        pointerEvents="none"
        style={[
          styles.bevelTL,
          {
            borderTopLeftRadius: borderRadius,
            opacity: isBubble ? 0.35 : 0.5,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.bevelBR,
          {
            borderBottomRightRadius: borderRadius,
            opacity: isBubble ? 0.2 : 0.35,
          },
        ]}
      />

      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            borderWidth: 1,
            borderColor: isBubble
              ? 'rgba(255, 255, 255, 0.28)'
              : 'rgba(255, 255, 255, 0.18)',
          },
        ]}
      />

      <View style={styles.content}>{children}</View>
      <GlassFilter />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
  glassShadowShell: {
    backgroundColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
      default: {},
    }),
  },
  topHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '52%',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  bevelTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '42%',
    height: '42%',
    backgroundColor: 'rgba(0, 0, 0, 0.14)',
  },
  bevelBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: '38%',
    height: '38%',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  content: {
    zIndex: 10,
    width: '100%',
  },
});
