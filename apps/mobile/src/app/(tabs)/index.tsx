/**
 * Orbit — the dashboard. Net position across every squad, the streak capsule,
 * and the settle-up path, in that order of visual weight.
 */

import {
  colors,
  formatMoney,
  layout,
  money,
  radius,
  settleUp,
  space,
  type,
  gaugeSegments,
} from '@loop/shared';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, MonoTag, Perforation } from '@/components/ui/surface';
import { TactileButton } from '@/components/ui/tactile-button';
import { StreakCapsule } from '@/components/ui/streak-capsule';
import { CURRENCY, EXPENSES, ME, nameOf } from '@/data/mock';
import { haptic } from '@/lib/haptics';

export default function OrbitScreen() {
  const insets = useSafeAreaInsets();

  const { net, transfers } = useMemo(() => {
    const { balances, transfers } = settleUp(EXPENSES, CURRENCY);
    const mine = balances.find((b) => b.memberId === ME)?.net ?? money(0, CURRENCY);
    return { net: mine, transfers };
  }, []);

  const owedToYou = net.minor >= 0;
  const myTransfers = transfers.filter((t) => t.from === ME || t.to === ME);
  const settled = transfers.length - myTransfers.length;
  const segments = gaugeSegments(transfers.length === 0 ? 1 : settled / transfers.length);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.base, paddingBottom: 140 },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ORBIT</Text>
          <Text style={styles.title}>Your position</Text>
        </View>
        <StreakCapsule days={12} />
      </View>

      <Card hero accent={owedToYou ? 'credit' : 'debit'} style={styles.heroCard}>
        <MonoTag tone={owedToYou ? 'credit' : 'debit'}>
          {owedToYou ? 'net receivable' : 'net payable'}
        </MonoTag>
        <Text
          style={[styles.heroAmount, { color: owedToYou ? colors.credit : colors.debit }]}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {formatMoney(money(Math.abs(net.minor), net.currency))}
        </Text>
        <Text style={styles.heroCaption}>
          {owedToYou
            ? 'across your active squads, in your favour'
            : 'across your active squads, outstanding'}
        </Text>

        <Perforation />

        <View style={styles.gauge}>
          {Array.from({ length: 8 }, (_, i) => (
            <View
              key={i}
              style={[styles.gaugeSegment, i < segments && styles.gaugeSegmentLit]}
            />
          ))}
        </View>
        <Text style={styles.gaugeLabel}>
          {settled}/{transfers.length} SETTLEMENTS CLEARED
        </Text>
      </Card>

      <Text style={styles.sectionTitle}>Settle path</Text>
      {myTransfers.length === 0 ? (
        <Card>
          <Text style={styles.empty}>Everything is square. Nothing to settle.</Text>
        </Card>
      ) : (
        myTransfers.map((transfer) => {
          const outgoing = transfer.from === ME;
          return (
            <Card
              key={`${transfer.from}-${transfer.to}`}
              accent={outgoing ? 'debit' : 'credit'}
              style={styles.transferCard}>
              <View style={styles.transferRow}>
                <View style={styles.transferText}>
                  <Text style={styles.transferWho}>
                    {outgoing ? `You pay ${nameOf(transfer.to)}` : `${nameOf(transfer.from)} pays you`}
                  </Text>
                  <Text style={styles.transferMeta}>
                    {outgoing ? 'OUTGOING' : 'INCOMING'}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.transferAmount,
                    { color: outgoing ? colors.debit : colors.credit },
                  ]}>
                  {formatMoney(transfer.amount)}
                </Text>
              </View>
            </Card>
          );
        })
      )}

      <TactileButton
        label="Settle up"
        fullWidth
        onPress={() => haptic('settleSuccess')}
        style={styles.cta}
      />
      <TactileButton
        label="Split a bill"
        variant="secondary"
        fullWidth
        onPress={() => haptic('splitConfirm')}
        style={styles.ctaSecondary}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: layout.screenMargin,
    gap: space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  eyebrow: {
    ...type.monoSm,
    color: colors.textMuted,
  },
  title: {
    ...type.headlineLg,
    color: colors.text,
    marginTop: 2,
  },
  heroCard: {
    gap: space.sm,
  },
  heroAmount: {
    ...type.displayLg,
    fontSize: 44,
    lineHeight: 48,
  },
  heroCaption: {
    ...type.bodyMd,
    color: colors.textMuted,
  },
  gauge: {
    flexDirection: 'row',
    gap: space.xs,
  },
  gaugeSegment: {
    flex: 1,
    height: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
  },
  gaugeSegmentLit: {
    backgroundColor: colors.credit,
    borderColor: colors.credit,
  },
  gaugeLabel: {
    ...type.monoSm,
    color: colors.textMuted,
    marginTop: space.xs,
  },
  sectionTitle: {
    ...type.headlineSm,
    color: colors.text,
    marginTop: space.sm,
  },
  transferCard: {
    paddingVertical: space.base,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  transferText: {
    flex: 1,
    gap: 4,
  },
  transferWho: {
    ...type.bodyLg,
    color: colors.text,
  },
  transferMeta: {
    ...type.monoSm,
    color: colors.textMuted,
  },
  transferAmount: {
    ...type.monoLg,
    fontSize: 18,
  },
  empty: {
    ...type.bodyMd,
    color: colors.textMuted,
  },
  cta: {
    marginTop: space.base,
  },
  ctaSecondary: {
    marginTop: space.sm,
  },
});
