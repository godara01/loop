/**
 * The signature Loop control: an extruded arcade plate.
 *
 * At rest it sits on a hard 4px offset shadow with no blur. On press it
 * translates down 3px and the plate collapses to 1px, so the button visibly
 * bottoms out. The haptic fires on press-in, not on release, because the
 * physical sensation has to coincide with the plate hitting the floor.
 */

import { palette, radius, space, type } from '@loop/shared';
import { type ReactNode, useCallback } from 'react';
import { Pressable, type StyleProp, StyleSheet, Text, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';

export type TactileVariant = 'primary' | 'secondary' | 'destructive' | 'social';

interface TactileButtonProps {
  label?: string;
  children?: ReactNode;
  onPress?: () => void;
  variant?: TactileVariant;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

const VARIANTS: Record<
  TactileVariant,
  { background: string; border: string; plate: string; text: string }
> = {
  primary: {
    background: palette.lime,
    border: palette.lime,
    plate: palette.limeShadow,
    text: palette.onAccent,
  },
  secondary: {
    background: palette.nested,
    border: palette.borderStrong,
    plate: palette.shadowSecondary,
    text: palette.text,
  },
  destructive: {
    background: palette.coral,
    border: palette.coral,
    plate: palette.coralShadow,
    text: palette.onAccent,
  },
  social: {
    background: palette.violet,
    border: palette.violet,
    plate: palette.violetShadow,
    text: palette.text,
  },
};

const REST_OFFSET = 4;
const PRESSED_OFFSET = 1;
const PRESS_TRAVEL = 3;

export function TactileButton({
  label,
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  fullWidth = false,
  style,
}: TactileButtonProps) {
  const pressed = useSharedValue(0);
  const theme = VARIANTS[variant];

  const animatedStyle = useAnimatedStyle(() => {
    const offset = REST_OFFSET - (REST_OFFSET - PRESSED_OFFSET) * pressed.value;
    return {
      transform: [{ translateY: PRESS_TRAVEL * pressed.value }],
      boxShadow: `0px ${offset}px 0px 0px ${theme.plate}`,
    };
  });

  const handlePressIn = useCallback(() => {
    pressed.value = withTiming(1, { duration: 40 });
    haptic('press');
  }, [pressed]);

  const handlePressOut = useCallback(() => {
    pressed.value = withTiming(0, { duration: 90 });
  }, [pressed]);

  return (
    <Pressable
      onPressIn={disabled ? undefined : handlePressIn}
      onPressOut={disabled ? undefined : handlePressOut}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[fullWidth && styles.fullWidth, style]}>
      <Animated.View
        style={[
          styles.plate,
          {
            backgroundColor: theme.background,
            borderColor: theme.border,
          },
          disabled && styles.disabled,
          animatedStyle,
        ]}>
        {children ?? (
          <Text style={[styles.label, { color: theme.text }]} numberOfLines={1}>
            {label}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fullWidth: {
    alignSelf: 'stretch',
  },
  plate: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    paddingVertical: space.base,
    paddingHorizontal: space.xl,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    ...type.headlineSm,
    textAlign: 'center',
  },
});
