/**
 * The bottom dock: a floating pill pod rather than a full-width bar, sitting
 * clear of the safe area so it lands in the thumb zone. The centre slot is the
 * lime "add expense" plate — the single most-used action in the app.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, layout, palette, radius, space, type } from '@loop/shared';
import { Tabs, router } from 'expo-router';
import { type ComponentProps, Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'planet-outline',
  activity: 'receipt-outline',
  profile: 'person-outline',
};

const LABELS: Record<string, string> = {
  index: 'ORBIT',
  activity: 'LEDGER',
  profile: 'YOU',
};

/** The add plate sits after this many tabs, so it lands in the middle of the dock. */
const ADD_PLATE_AFTER = 1;

/** expo-router vendors its own bottom-tabs, so take the prop type from there. */
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function TabDock({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingBottom: insets.bottom + layout.thumbZoneOffset }]}>
      <View style={styles.dock} testID="tab-dock">
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
            <Fragment key={route.key}>
            {index === ADD_PLATE_AFTER ? (
              <Pressable
                testID="dock-add"
                accessibilityRole="button"
                accessibilityLabel="Log an expense"
                onPressIn={() => haptic('press')}
                onPress={() => router.push('/expense/new')}
                style={({ pressed }) => [styles.addPlate, pressed && styles.addPlatePressed]}>
                <Ionicons name="add" size={28} color={colors.onAccent} />
              </Pressable>
            ) : null}
            <Pressable
              testID={`tab-${route.name}`}
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
            </Fragment>
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
  // A raised lime plate: the single most-used action in the app.
  addPlate: {
    width: 52,
    height: 52,
    marginHorizontal: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: palette.lime,
    borderWidth: 1.5,
    borderColor: palette.lime,
    boxShadow: `0px 4px 0px 0px ${palette.limeShadow}`,
  },
  addPlatePressed: {
    transform: [{ translateY: 3 }],
    boxShadow: `0px 1px 0px 0px ${palette.limeShadow}`,
  },
});
