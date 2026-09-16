/**
 * The custom number pad. Not the system keyboard: no layout shift, mono digits,
 * and a haptic per key. See docs/03-expenses.md#the-number-pad.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { type CurrencyCode, colors, minorDigits, radius, space, type } from '@loop/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptic } from '@/lib/haptics';

import { type AmountInput, type AmountKey, pressKey } from '../model/amount-input';

const ROWS: AmountKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'backspace'],
];

const keyId = (key: AmountKey) => (key === '.' ? 'dot' : key);

export function AmountPad({
  value,
  currency,
  onChange,
}: {
  value: AmountInput;
  currency: CurrencyCode;
  onChange: (next: AmountInput) => void;
}) {
  const press = (key: AmountKey) => {
    const result = pressKey(value, key, currency);
    if (!result.accepted) {
      haptic('warning');
      return;
    }
    haptic(key === 'backspace' || key === 'clear' ? 'selection' : 'tap');
    onChange(result.input);
  };

  return (
    <View style={styles.pad}>
      {ROWS.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((key) => {
            // Zero-decimal currencies have no decimal point to press.
            if (key === '.' && minorDigits(currency) === 0) return <View key={key} style={styles.key} />;
            return (
              <Pressable
                key={key}
                testID={`pad-key-${keyId(key)}`}
                accessibilityRole="button"
                accessibilityLabel={key === 'backspace' ? 'Delete digit' : key === '.' ? 'Decimal point' : key}
                onPress={() => press(key)}
                onLongPress={key === 'backspace' ? () => press('clear') : undefined}
                style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}>
                {key === 'backspace' ? (
                  <Ionicons name="backspace-outline" size={22} color={colors.text} />
                ) : (
                  <Text style={styles.label}>{key}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  key: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  keyPressed: { backgroundColor: colors.chipActive },
  label: { ...type.monoLg, fontSize: 24, lineHeight: 28, color: colors.text },
});
