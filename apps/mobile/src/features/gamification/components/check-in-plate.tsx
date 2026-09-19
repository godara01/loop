/**
 * The daily check-in button. Pressing it banks the current day, awarding coins
 * and advancing the streak. See docs/06-gamification.md.
 */

import { colors, layout, space, type } from '@loop/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { haptic } from '@/lib/haptics';

export function CheckInPlate({
  onPress,
  isCheckedIn,
  disabled,
}: {
  onPress: () => void;
  isCheckedIn: boolean;
  disabled?: boolean;
}) {
  return (
    <Card accent="credit" hero style={styles.card}>
      <View style={styles.content}>
        <Ionicons
          name={isCheckedIn ? 'checkbox' : 'checkmark-circle-outline'}
          size={24}
          color={isCheckedIn ? colors.credit : colors.textMuted}
        />
        <View style={styles.textBlock}>
          <Text style={[styles.title, isCheckedIn && styles.titleChecked]}>
            {isCheckedIn ? 'DAY BANKED' : 'CHECK-IN TODAY'}
          </Text>
          <Text style={styles.subtitle}>
            {isCheckedIn
              ? 'Streak advanced, coins awarded.'
              : 'Log an expense or tap here to bank the day.'}
          </Text>
        </View>
      </View>
      {!isCheckedIn && (
        <TactileButton
          label="Check in"
          fullWidth
          disabled={disabled}
          onPress={() => {
            haptic('press');
            onPress();
          }}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...type.monoSm,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  titleChecked: {
    color: colors.credit,
  },
  subtitle: {
    ...type.bodyMd,
    color: colors.textMuted,
    flexWrap: 'wrap',
  },
});
