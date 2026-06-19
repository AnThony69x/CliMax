import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
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

import { LiquidGlassSurface } from './liquid-glass/LiquidGlassSurface';

const ACTIVE_ACCENT = '#5AC8FA';
const INACTIVE = 'rgba(255, 255, 255, 0.85)';

const PILL_RADIUS = 34;
const BUBBLE_HEIGHT = 46;
const BUBBLE_RADIUS = 23;
const ROW_HORIZONTAL_PADDING = 6;
const ROW_VERTICAL_PADDING = 8;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Tab bar flotante con efecto liquid glass (referencia liquid-glass-button):
 * superficie con blur + filtro SVG en web + biseles inset,
 * burbuja activa deslizante con squash & stretch.
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
      style={[
        styles.anchor,
        {
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 12) + 10,
          paddingHorizontal: 18,
        },
      ]}>
      <View style={styles.shadowWrap}>
        <LiquidGlassSurface
          borderRadius={PILL_RADIUS}
          blurIntensity={92}
          blurTint="dark"
          darkVeilOpacity={0.28}
          variant="bar"
          style={styles.pill}>
          <View style={styles.tabsRow} onLayout={onRowLayout}>
            <Animated.View
              style={[
                styles.activeBubbleWrap,
                {
                  width: bubbleWidth,
                  height: BUBBLE_HEIGHT,
                  borderRadius: BUBBLE_RADIUS,
                  top:
                    (60 - BUBBLE_HEIGHT) / 2 + ROW_VERTICAL_PADDING - 8,
                },
                bubbleAnimatedStyle,
              ]}>
              <LiquidGlassSurface
                borderRadius={BUBBLE_RADIUS}
                blurIntensity={36}
                blurTint="light"
                darkVeilOpacity={0.06}
                variant="bubble"
                style={styles.activeBubbleFill}>
                <View style={styles.activeBubbleGlossTop} />
              </LiquidGlassSurface>
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
                    <Text numberOfLines={1} style={[styles.label, { color }]}>
                      {options.tabBarLabel}
                    </Text>
                  );
                } else {
                  labelNode = (
                    <Text numberOfLines={1} style={[styles.label, { color }]}>
                      {titleText}
                    </Text>
                  );
                }
              }

              return (
                <TabPressable
                  key={route.key}
                  isFocused={isFocused}
                  onPress={onPress}
                  onLongPress={onLongPress}>
                  <View style={styles.tabContent}>
                    {options.tabBarIcon?.({
                      focused: isFocused,
                      color,
                      size: 22,
                    })}
                    {labelNode}
                  </View>
                </TabPressable>
              );
            })}
          </View>
        </LiquidGlassSurface>
      </View>
    </View>
  );
}

function TabPressable({
  children,
  isFocused,
  onPress,
  onLongPress,
}: {
  children: ReactNode;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        scale.value = withTiming(1.05, { duration: 150 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 200 });
      }}
      style={[styles.tabHit, animatedStyle]}>
      {children}
    </AnimatedPressable>
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
  },
  shadowWrap: {
    maxWidth: 520,
    width: '100%',
    pointerEvents: 'box-none',
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
      web: {
        boxShadow: '0px 14px 26px rgba(0, 0, 0, 0.42)',
      },
      default: {},
    }),
  },
  pill: {
    minHeight: 62,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255, 255, 255, 0.22)',
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
  activeBubbleWrap: {
    position: 'absolute',
    left: 0,
    zIndex: 1,
    pointerEvents: 'none',
    overflow: 'hidden',
  },
  activeBubbleFill: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  activeBubbleGlossTop: {
    position: 'absolute',
    top: 2,
    left: 10,
    right: 10,
    height: BUBBLE_HEIGHT * 0.4,
    borderRadius: BUBBLE_RADIUS,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
