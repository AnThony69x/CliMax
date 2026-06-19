import React from 'react';
import { Platform } from 'react-native';

import { GLASS_FILTER_ID } from './liquidGlassTokens';

/**
 * Filtro SVG de distorsión líquida (feTurbulence + feDisplacementMap).
 * Solo se renderiza en web; en iOS/Android el blur de expo-blur sustituye el efecto.
 */
export function GlassFilter() {
  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <svg
      aria-hidden
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <defs>
        <filter
          id={GLASS_FILTER_ID}
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05 0.05"
            numOctaves={1}
            seed={1}
            result="turbulence"
          />
          <feGaussianBlur
            in="turbulence"
            stdDeviation={2}
            result="blurredNoise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurredNoise"
            scale={70}
            xChannelSelector="R"
            yChannelSelector="B"
            result="displaced"
          />
          <feGaussianBlur in="displaced" stdDeviation={4} result="finalBlur" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}
