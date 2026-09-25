/**
 * Animated "+N" chip that rises from the action and fades out.
 * See docs/06-gamification.md#presentation.
 */

import { colors, radius, space, type } from '@loop/shared';
import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export function CoinAwardChip({
  amount,
  onFinish,
}: {
  amount: number | null;
  onFinish?: () => void;
}) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (amount !== null && amount > 0) {
      translateY.value = 0;
      opacity.value = 1;

      translateY.value = withTiming(-30, { duration: 600 });
      opacity.value = withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0, { duration: 200 }, (finished) => {
          if (finished && onFinish) {
            // Callback when finished
          }
        }),
      );
    } else {
      opacity.value = 0;
    }
  }, [amount, onFinish, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!amount || amount <= 0) return null;

  return (
    <Animated.View style={[styles.chip, animatedStyle]} pointerEvents="none">
      <Text style={styles.plus}>+</Text>
      <Text style={styles.amount}>{amount}</Text>
      <Text style={styles.label}> COINS</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.credit,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    alignSelf: 'center',
    position: 'absolute',
    top: -20,
    zIndex: 999,
  },
  plus: {
    ...type.monoSm,
    color: colors.onAccent,
    fontWeight: '700',
  },
  amount: {
    ...type.monoSm,
    color: colors.onAccent,
    fontWeight: '700',
  },
  label: {
    ...type.monoSm,
    fontSize: 10,
    color: colors.onAccent,
    fontWeight: '600',
  },
});
