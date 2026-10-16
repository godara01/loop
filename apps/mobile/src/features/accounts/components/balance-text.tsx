import { type Account, type Money, colors, formatMoney, type } from '@loop/shared';
import { StyleSheet, Text, View } from 'react-native';

import { balanceDisplay } from '../model/accounts-view';

/** A balance in mono, with the card OUTSTANDING / CREDIT label (docs/18 § Screens). */
export function BalanceText({ account, balance, large = false, testID }: { account: Account; balance: Money; large?: boolean; testID?: string }) {
  const display = balanceDisplay(account, balance);
  const color = display.tone === 'debit' ? colors.debit : display.tone === 'credit' ? colors.credit : colors.text;
  return (
    <View style={styles.wrap}>
      {display.label ? <Text style={[styles.label, { color }]}>{display.label}</Text> : null}
      <Text testID={testID} style={[large ? styles.large : styles.amount, { color }]} numberOfLines={1} adjustsFontSizeToFit={large}>
        {formatMoney(display.amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-end' },
  label: { ...type.monoSm },
  amount: { ...type.monoMd },
  large: { ...type.displayLg },
});
