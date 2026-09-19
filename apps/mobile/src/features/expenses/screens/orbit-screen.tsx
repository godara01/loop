/**
 * Orbit — today at a glance: what has been spent, and the last few entries.
 * Phase 4: streak capsule, check-in plate, coins chip, optimistic preview, milestone celebration.
 */

import {
  type Category,
  colors,
  formatMoney,
  layout,
  money,
  space,
  sum,
  todayISO,
  type,
} from '@loop/shared';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, MonoTag, Perforation } from '@/components/ui/surface';
import { StreakCapsule } from '@/components/ui/streak-capsule';
import { TactileButton } from '@/components/ui/tactile-button';
import { useSession } from '@/core/providers/bootstrap-provider';
import { useSettings } from '@/core/providers/settings-provider';
import { useCategories } from '@/features/categories';
import { saveCheckIn } from '@/features/gamification/api/gamification-repository';
import { CheckInPlate } from '@/features/gamification/components/check-in-plate';
import { CoinAwardChip } from '@/features/gamification/components/coin-award-chip';
import { StreakBurst } from '@/features/gamification/components/streak-burst';
import {
  useStreak,
  useTodayCheckIn,
  useWallet,
} from '@/features/gamification/hooks/use-gamification';
import { haptic } from '@/lib/haptics';

import { ExpenseRow } from '../components/expense-row';
import { useExpensesForLastDays, useRecentExpenses } from '../hooks/use-expenses';

const RECENT_COUNT = 5;

export function OrbitScreen() {
  const insets = useSafeAreaInsets();
  const { uid, profile } = useSession();
  const { settings } = useSettings();
  const today = useExpensesForLastDays(1);
  const recent = useRecentExpenses(RECENT_COUNT);
  const categoriesState = useCategories();
  const streakState = useStreak();
  const walletState = useWallet();
  const checkInState = useTodayCheckIn();

  const [optimisticCoins, setOptimisticCoins] = useState<number | null>(null);
  const [showBurst, setShowBurst] = useState(false);

  const categoriesById = useMemo(
    () =>
      new Map<string, Category>(
        categoriesState.status === 'ready'
          ? categoriesState.snapshot.categories.map((c) => [c.id, c])
          : [],
      ),
    [categoriesState],
  );

  const todayIso = todayISO();
  const todays =
    today.status === 'ready'
      ? today.snapshot.expenses.filter((e) => e.localDate === todayIso)
      : [];
  const total = sum(
    todays.map((e) => e.total),
    profile.currency,
  );
  const zeroSpend = todays.length === 0;

  const streakDays = streakState.status === 'ready' ? streakState.snapshot.streak.current : 0;
  const walletCoins = walletState.status === 'ready' ? walletState.snapshot.wallet.coinBalance : 0;
  const todayCheckedIn = checkInState.status === 'ready' && checkInState.snapshot.todayExists;

  const handleCheckIn = useCallback(async () => {
    try {
      await saveCheckIn(uid, todayIso);
      haptic('streakAdvance');
      if (!settings.keepItPlain) {
        setOptimisticCoins(zeroSpend ? 8 : 5);
        if (streakDays + 1 === 7 || streakDays + 1 === 30 || streakDays + 1 === 100) {
          setShowBurst(true);
        }
      }
    } catch (err) {
      console.warn('Check-in error:', err);
    }
  }, [uid, todayIso, zeroSpend, settings.keepItPlain, streakDays]);

  const showGamification = !settings.keepItPlain;

  return (
    <ScrollView
      testID="screen-orbit"
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.base, paddingBottom: 160 },
      ]}
      showsVerticalScrollIndicator={false}>
      <View>
        <Text style={styles.eyebrow}>ORBIT</Text>
        <Text style={styles.title}>Today</Text>
      </View>

      <Card hero accent="credit" style={styles.hero}>
        <MonoTag tone="credit">spent today</MonoTag>
        <Text
          testID="orbit-today-total"
          style={styles.heroAmount}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {formatMoney(today.status === 'ready' ? total : money(0, profile.currency))}
        </Text>
        <Text style={styles.caption} testID="orbit-today-count">
          {todays.length === 0
            ? 'Nothing logged today.'
            : `${todays.length} ${todays.length === 1 ? 'expense' : 'expenses'} logged`}
        </Text>
      </Card>

      <View style={styles.checkInContainer}>
        <CheckInPlate
          onPress={handleCheckIn}
          isCheckedIn={todayCheckedIn}
          disabled={streakState.status !== 'ready' || checkInState.status !== 'ready'}
        />
        {showGamification && (
          <CoinAwardChip
            amount={optimisticCoins}
            onFinish={() => setOptimisticCoins(null)}
          />
        )}
      </View>

      {showGamification && (
        <View style={styles.streakRow}>
          <View style={styles.streakWrapper}>
            <StreakCapsule
              days={streakDays}
              onPress={() => {
                if (streakDays === 7 || streakDays === 30 || streakDays === 100) {
                  setShowBurst(true);
                }
              }}
            />
            <StreakBurst active={showBurst} onComplete={() => setShowBurst(false)} />
          </View>
          {walletCoins > 0 && (
            <View style={styles.coinChip} testID="orbit-coin-balance">
              <Text style={styles.coinAmount}>{walletCoins}</Text>
              <Text style={styles.coinLabel}> COINS</Text>
            </View>
          )}
        </View>
      )}

      <TactileButton
        label="Log an expense"
        fullWidth
        onPress={() => router.push('/expense/new')}
      />

      <Text style={styles.section}>Recent</Text>
      <Card>
        {recent.status === 'ready' && recent.snapshot.expenses.length > 0 ? (
          recent.snapshot.expenses.map((expense, index) => (
            <View key={expense.id}>
              {index > 0 ? <Perforation style={styles.tightPerforation} /> : null}
              <ExpenseRow
                expense={expense}
                category={categoriesById.get(expense.categoryId)}
                pending={recent.snapshot.pendingIds.has(expense.id)}
                onPress={() =>
                  router.push({ pathname: '/expense/[id]', params: { id: expense.id } })
                }
              />
            </View>
          ))
        ) : (
          <Text style={styles.empty} testID="orbit-recent-empty">
            {recent.status === 'loading'
              ? 'Loading…'
              : 'Your first expense will show up here.'}
          </Text>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: layout.screenMargin, gap: space.md },
  eyebrow: { ...type.monoSm, color: colors.textMuted },
  title: { ...type.headlineLg, color: colors.text, marginTop: 2 },
  hero: { gap: space.sm },
  heroAmount: { ...type.displayLg, fontSize: 44, lineHeight: 50, color: colors.credit },
  caption: { ...type.bodyMd, color: colors.textMuted },
  checkInContainer: {
    position: 'relative',
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  streakWrapper: {
    position: 'relative',
  },
  coinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.credit,
    borderRadius: 99,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  coinAmount: {
    ...type.monoLg,
    color: colors.credit,
  },
  coinLabel: {
    ...type.monoSm,
    color: colors.textMuted,
  },
  section: { ...type.headlineSm, color: colors.text, marginTop: space.sm },
  empty: { ...type.bodyMd, color: colors.textMuted, paddingVertical: space.sm },
  tightPerforation: { marginVertical: 0 },
});
