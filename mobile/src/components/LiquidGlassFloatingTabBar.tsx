import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import React, { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/**
 * Acentos basados en la referencia liquid-glass + paleta CliMax.
 * Mantén el azul del mockup o cambia a `#7CD9A4` para usar el verde de la marca.
 */
const ACTIVE_ACCENT = '#5AC8FA';
const INACTIVE = 'rgba(255, 255, 255, 0.85)';

const PILL_RADIUS = 34;
const BUBBLE_HEIGHT = 46;
const BUBBLE_RADIUS = 23;
const ROW_HORIZONTAL_PADDING = 6;
const ROW_VERTICAL_PADDING = 8;

/**
 * Tab bar flotante "liquid glass" con:
 *  - Pastilla con BlurView + tinte oscuro translúcido + borde luminoso (transparencia tipo guía).
 *  - Burbuja única absoluta que se desliza entre pestañas con spring (efecto gota).
 *  - Squash & stretch (scaleX↑ / scaleY↓) durante la transición → sensación líquida.
 */
export function LiquidGlassFloatingTabBar({
  state,
  descriptors,
  navigation,
  insets,
}: BottomTabBarProps) {
  const routeCount = state.routes.length;
  const [rowWidth, setRowWidth] = useState(0);
  const tabWidth = rowWidth > 0 ? rowWidth / routeCount : 0;
  /** La burbuja abarca casi toda la pestaña para envolver textos largos como "Comunidad". */
  const bubbleWidth = Math.max(52, tabWidth - 4);

  const translateX = useSharedValue(0);
  const stretch = useSharedValue(0);
  const isReady = useSharedValue(0);

  useEffect(() => {
    if (tabWidth <= 0) return;

    const targetX =
      ROW_HORIZONTAL_PADDING +
      state.index * tabWidth +
      (tabWidth - bubbleWidth) / 2;

    if (isReady.value === 0) {
      translateX.value = targetX;
      isReady.value = 1;
      return;
    }

    translateX.value = withSpring(targetX, {
      mass: 0.9,
      damping: 16,
      stiffness: 160,
      overshootClamping: false,
    });

    stretch.value = withSequence(
      withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 320, easing: Easing.inOut(Easing.quad) }),
    );
  }, [state.index, tabWidth, bubbleWidth, translateX, stretch, isReady]);

  const bubbleAnimatedStyle = useAnimatedStyle(() => {
    const s = stretch.value;
    return {
      transform: [
        { translateX: translateX.value },
        { scaleX: 1 + s * 0.35 },
        { scaleY: 1 - s * 0.18 },
      ],
      opacity: isReady.value,
    };
  });

  const onRowLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width - ROW_HORIZONTAL_PADDING * 2;
    if (w !== rowWidth) setRowWidth(w);
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.anchor,
        {
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 12) + 10,
          paddingHorizontal: 18,
        },
      ]}>
      <View pointerEvents="box-none" style={styles.shadowWrap}>
        <View style={styles.pill}>
          {/* Capa 1: blur real (equivale a backdrop-filter: blur+saturate) */}
          <BlurView
            intensity={92}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          {/* Capa 2: velo oscuro translúcido (rgba(0,0,0,~0.32)) */}
          <View pointerEvents="none" style={styles.pillDarkVeil} />
          {/* Capa 3: brillo superior (simula gradient diagonal de la guía) */}
          <View pointerEvents="none" style={styles.pillTopHighlight} />
          {/* Capa 4: borde luminoso interior fino (filo de cristal) */}
          <View pointerEvents="none" style={styles.pillEdgeHighlight} />

          <View style={styles.tabsRow} onLayout={onRowLayout}>
            {/* Burbuja líquida que se desplaza entre pestañas */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.activeBubble,
                {
                  width: bubbleWidth,
                  height: BUBBLE_HEIGHT,
                  borderRadius: BUBBLE_RADIUS,
                  top:
                    (60 - BUBBLE_HEIGHT) / 2 + ROW_VERTICAL_PADDING - 8,
                },
                bubbleAnimatedStyle,
              ]}>
              <BlurView
                intensity={26}
                tint="light"
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.activeBubbleTint} />
              <View style={styles.activeBubbleRim} />
              <View style={styles.activeBubbleGlossTop} />
            </Animated.View>

            {state.routes.map((route, index) => {
              const { options } = descriptors[route.key];
              const isFocused = state.index === index;
              const color = isFocused ? ACTIVE_ACCENT : INACTIVE;

              const titleText =
                typeof options.title === 'string' ? options.title : route.name;

              const onPress = () => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              };

              const onLongPress = () => {
                navigation.emit({
                  type: 'tabLongPress',
                  target: route.key,
                });
              };

              let labelNode: ReactNode = null;
              if (options.tabBarShowLabel !== false) {
                if (typeof options.tabBarLabel === 'function') {
                  labelNode = options.tabBarLabel({
                    focused: isFocused,
                    color,
                    position: 'below-icon',
                    children: titleText,
                  });
                } else if (typeof options.tabBarLabel === 'string') {
                  labelNode = (
                    <Text
                      numberOfLines={1}
                      style={[styles.label, { color }]}>
                      {options.tabBarLabel}
                    </Text>
                  );
                } else {
                  labelNode = (
                    <Text
                      numberOfLines={1}
                      style={[styles.label, { color }]}>
                      {titleText}
                    </Text>
                  );
                }
              }

              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isFocused }}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  style={styles.tabHit}>
                  <View style={styles.tabContent}>
                    {options.tabBarIcon?.({
                      focused: isFocused,
                      color,
                      size: 22,
                    })}
                    {labelNode}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  shadowWrap: {
    maxWidth: 520,
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.42,
        shadowRadius: 26,
      },
      android: {
        elevation: 18,
      },
      default: {},
    }),
  },
  pill: {
    borderRadius: PILL_RADIUS,
    minHeight: 62,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  /** Velo oscuro: rgba(0,0,0,0.32) ~ acerca a la doc DARK preset */
  pillDarkVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  /** Brillo sutil arriba para emular el gradient blanco translúcido */
  pillTopHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '55%',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderTopLeftRadius: PILL_RADIUS,
    borderTopRightRadius: PILL_RADIUS,
  },
  pillEdgeHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: PILL_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: ROW_HORIZONTAL_PADDING,
    paddingVertical: ROW_VERTICAL_PADDING,
    minHeight: 62,
  },
  tabHit: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    zIndex: 2,
  },
  activeBubble: {
    position: 'absolute',
    left: 0,
    overflow: 'hidden',
    zIndex: 1,
  },
  activeBubbleTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  activeBubbleRim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BUBBLE_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  /** Reflejo superior estilo "gota mojada" más sutil */
  activeBubbleGlossTop: {
    position: 'absolute',
    top: 2,
    left: 10,
    right: 10,
    height: BUBBLE_HEIGHT * 0.40,
    borderRadius: BUBBLE_RADIUS,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.15,
  },
});

export default LiquidGlassFloatingTabBar;
