/**
 * The bottom dock: a floating pill pod rather than a full-width bar, sitting
 * clear of the safe area so it lands in the thumb zone. The centre slot is the
 * lime "add expense" plate — the single most-used action in the app.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, layout, palette, radius, space, type } from '@loop/shared';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'planet-outline',
  squads: 'people-outline',
  activity: 'receipt-outline',
  profile: 'person-outline',
};

const LABELS: Record<string, string> = {
  index: 'ORBIT',
  squads: 'SQUADS',
  activity: 'LEDGER',
  profile: 'YOU',
};

/** expo-router vendors its own bottom-tabs, so take the prop type from there. */
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function TabDock({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingBottom: insets.bottom + layout.thumbZoneOffset }]}>
      <View style={styles.dock}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const icon = ICONS[route.name] ?? 'ellipse-outline';

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (focused || event.defaultPrevented) return;
            haptic('selection');
            navigation.navigate(route.name);
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={LABELS[route.name] ?? route.name}
              style={[styles.pod, focused && styles.podActive]}>
              <Ionicons
                name={icon}
                size={20}
                color={focused ? colors.onAccent : colors.textMuted}
              />
              {focused ? <Text style={styles.podLabel}>{LABELS[route.name]}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: palette.slate,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: space.xs + 2,
    boxShadow: `0px 4px 0px 0px ${palette.shadowBase}`,
  },
  pod: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    paddingHorizontal: space.base,
  },
  podActive: {
    backgroundColor: colors.credit,
  },
  podLabel: {
    ...type.monoSm,
    color: colors.onAccent,
  },
});
