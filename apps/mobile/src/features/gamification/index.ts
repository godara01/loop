/** The gamification feature's public surface. Import from here, never from a deep path. */
export { saveCheckIn } from './api/gamification-repository';
export { CheckInPlate } from './components/check-in-plate';
export { CoinAwardChip } from './components/coin-award-chip';
export { StreakBurst } from './components/streak-burst';
export { claimCelebration } from './model/celebration-budget';
export { useStreak, useTodayCheckIn, useWallet } from './hooks/use-gamification';
export { CoinsHistoryScreen } from './screens/coins-history-screen';
