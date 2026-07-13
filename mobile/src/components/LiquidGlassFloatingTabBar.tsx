import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { premiumShadow } from '../theme/premium';

/**
 * Acentos Solsticio: pastilla de cristal clara, ícono activo en el naranja
 * de marca sobre la burbuja oscura, inactivo en tinta apagada.
 */
const ACTIVE_ACCENT = '#fdf6ef';
const INACTIVE = 'rgba(27, 32, 39, 0.42)';

const PILL_RADIUS = 34;
const BUBBLE_HEIGHT = 42;
const BUBBLE_RADIUS = 21;
const ROW_HORIZONTAL_PADDING = 8;
const ROW_VERTICAL_PADDING = 8;
const SWIPE_DISTANCE = 42;
const SWIPE_VELOCITY = 420;

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
  visibleRouteNames,
}: BottomTabBarProps & { visibleRouteNames?: string[] }) {
  const visibleRouteNameSet = visibleRouteNames ? new Set(visibleRouteNames) : null;
  const visibleRoutes = state.routes
    .map((route, originalIndex) => ({ route, originalIndex }))
    .filter(({ route }) => {
      if (visibleRouteNameSet) {
        return visibleRouteNameSet.has(route.name);
      }
      const options = descriptors[route.key]?.options as any;
      return options.href !== null;
    });
  const routeCount = Math.max(visibleRoutes.length, 1);
  const dockMaxWidth = routeCount <= 4 ? 390 : 520;
  const activeVisibleIndex = Math.max(
    0,
    visibleRoutes.findIndex(({ originalIndex }) => originalIndex === state.index),
  );
  const [rowWidth, setRowWidth] = useState(0);
  const tabWidth = rowWidth > 0 ? rowWidth / routeCount : 0;
  /** La burbuja abarca casi toda la pestaña para envolver textos largos como "Comunidad". */
  const bubbleWidth = Math.max(48, tabWidth - 8);
  const compactLabels = routeCount > 5;

  const translateX = useSharedValue(0);
  const stretch = useSharedValue(0);
  const isReady = useSharedValue(0);
  const ambient = useSharedValue(0);
  const dragIndex = useSharedValue(activeVisibleIndex);

  useEffect(() => {
    ambient.value = withTiming(1, {
      duration: 580,
      easing: Easing.out(Easing.cubic),
    });
  }, [ambient]);

  useEffect(() => {
    if (tabWidth <= 0) return;

    const targetX =
      ROW_HORIZONTAL_PADDING +
      activeVisibleIndex * tabWidth +
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
  }, [activeVisibleIndex, tabWidth, bubbleWidth, translateX, stretch, isReady]);

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

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    opacity: ambient.value,
    transform: [{ translateY: (1 - ambient.value) * 8 }],
    borderColor: interpolateColor(
      ambient.value,
      [0, 1],
      ['rgba(27,32,39,0.08)', 'rgba(226,98,43,0.28)'],
    ),
  }));

  const onRowLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width - ROW_HORIZONTAL_PADDING * 2;
    if (w !== rowWidth) setRowWidth(w);
  };

  const navigateToIndex = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= visibleRoutes.length || nextIndex === activeVisibleIndex) {
      return;
    }

    const route = visibleRoutes[nextIndex].route;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!event.defaultPrevented) {
      void Haptics.selectionAsync().catch(() => {});
      navigation.navigate(route.name, route.params);
    }
  };

  const handleSwipeEnd = (translationX: number, velocityX: number) => {
    const hasSwipeIntent =
      Math.abs(translationX) >= SWIPE_DISTANCE || Math.abs(velocityX) >= SWIPE_VELOCITY;

    if (!hasSwipeIntent) return;

    const direction = translationX < 0 ? 1 : -1;
    navigateToIndex(activeVisibleIndex + direction);
  };

  const handleDragPosition = (x: number) => {
    if (tabWidth <= 0) return;
    const nextIndex = Math.max(
      0,
      Math.min(visibleRoutes.length - 1, Math.floor((x - ROW_HORIZONTAL_PADDING) / tabWidth)),
    );
    navigateToIndex(nextIndex);
  };

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-18, 18])
    .failOffsetY([-18, 18])
    .onBegin(() => {
      dragIndex.value = activeVisibleIndex;
    })
    .onUpdate((event) => {
      if (tabWidth <= 0) return;
      const nextIndex = Math.max(
        0,
        Math.min(routeCount - 1, Math.floor((event.x - ROW_HORIZONTAL_PADDING) / tabWidth)),
      );
      if (nextIndex !== dragIndex.value) {
        dragIndex.value = nextIndex;
        runOnJS(handleDragPosition)(event.x);
      }
    })
    .onEnd((event) => {
      runOnJS(handleSwipeEnd)(event.translationX, event.velocityX);
    });

  return (
    <View
      style={[
        styles.anchor,
        {
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 12) + 10,
          paddingHorizontal: 18,
        },
      ]}>
      <View style={[styles.shadowWrap, { maxWidth: dockMaxWidth }]}>
        <GestureDetector gesture={swipeGesture}>
          <Animated.View style={[styles.pill, pillAnimatedStyle]}>
          {/* Capa 1: blur real (equivale a backdrop-filter: blur+saturate) */}
          <BlurView
            intensity={92}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
          {/* Capa 2: velo claro translúcido (deja ver la escena detrás, pero mantiene la pastilla legible) */}
          <View style={styles.pillDarkVeil} />
          {/* Capa 3: brillo superior (simula gradient diagonal de la guía) */}
          <View style={styles.pillTopHighlight} />
          {/* Capa 4: borde luminoso interior fino (filo de cristal) */}
          <View style={styles.pillEdgeHighlight} />

          <View style={styles.tabsRow} onLayout={onRowLayout}>
            {/* Burbuja líquida que se desplaza entre pestañas */}
            <Animated.View
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

            {visibleRoutes.map(({ route, originalIndex }) => {
              const { options } = descriptors[route.key];
              const isFocused = state.index === originalIndex;
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
                  void Haptics.selectionAsync().catch(() => {});
                  navigation.navigate(route.name, route.params);
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
                      style={[styles.label, compactLabels && styles.labelCompact, { color }]}>
                      {options.tabBarLabel}
                    </Text>
                  );
                } else {
                  labelNode = (
                    <Text
                      numberOfLines={1}
                      style={[styles.label, compactLabels && styles.labelCompact, { color }]}>
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
                      size: isFocused ? 25 : 23,
                    })}
                    {labelNode}
                  </View>
                </Pressable>
              );
            })}
          </View>
          </Animated.View>
        </GestureDetector>
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
    pointerEvents: 'box-none',
    zIndex: 100,
    elevation: 30,
  },
  shadowWrap: {
    width: '100%',
    alignItems: 'center',
    pointerEvents: 'box-none',
    borderRadius: PILL_RADIUS,
    ...premiumShadow('strong'),
  },
  pill: {
    width: '100%',
    borderRadius: PILL_RADIUS,
    minHeight: 64,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  /** Velo claro muy liviano: deja ver la escena de clima detrás del blur */
  pillDarkVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    pointerEvents: 'none',
  },
  /** Brillo sutil arriba para emular el gradient blanco translúcido */
  pillTopHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '55%',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderTopLeftRadius: PILL_RADIUS,
    borderTopRightRadius: PILL_RADIUS,
    pointerEvents: 'none',
  },
  pillEdgeHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: PILL_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(27, 32, 39, 0.08)',
    pointerEvents: 'none',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: ROW_HORIZONTAL_PADDING,
    paddingVertical: ROW_VERTICAL_PADDING,
    minHeight: 64,
  },
  tabHit: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    zIndex: 2,
  },
  activeBubble: {
    position: 'absolute',
    left: 0,
    overflow: 'hidden',
    zIndex: 1,
    pointerEvents: 'none',
  },
  activeBubbleTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1b2027',
  },
  activeBubbleRim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BUBBLE_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(226,98,43,0.45)',
  },
  /** Reflejo superior estilo "gota mojada" más sutil */
  activeBubbleGlossTop: {
    position: 'absolute',
    top: 2,
    left: 10,
    right: 10,
    height: BUBBLE_HEIGHT * 0.40,
    borderRadius: BUBBLE_RADIUS,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '900',
    marginTop: 2,
    letterSpacing: 0,
  },
  labelCompact: {
    fontSize: 10.5,
    maxWidth: 66,
  },
});

export default LiquidGlassFloatingTabBar;
