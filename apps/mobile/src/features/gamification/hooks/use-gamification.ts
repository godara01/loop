import { todayISO } from '@loop/shared';
import { useEffect, useState } from 'react';

import { useSession } from '@/core/providers/bootstrap-provider';

import {
  type CheckInSnapshot,
  type CoinLedgerSnapshot,
  type StreakSnapshot,
  type WalletSnapshot,
  observeCoinLedger,
  observeStreak,
  observeTodayCheckIn,
  observeWallet,
} from '../api/gamification-repository';

// ============ STREAK ============

export type StreakState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly snapshot: StreakSnapshot }
  | { readonly status: 'error'; readonly message: string };

export function useStreak(): StreakState {
  const { uid } = useSession();
  const [state, setState] = useState<StreakState>({ status: 'loading' });
  useEffect(
    () =>
      observeStreak(
        uid,
        (snapshot) => setState({ status: 'ready', snapshot }),
        (error) => setState({ status: 'error', message: error.message }),
      ),
    [uid],
  );
  return state;
}

// ============ WALLET ============

export type WalletState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly snapshot: WalletSnapshot }
  | { readonly status: 'error'; readonly message: string };

export function useWallet(): WalletState {
  const { uid } = useSession();
  const [state, setState] = useState<WalletState>({ status: 'loading' });
  useEffect(
    () =>
      observeWallet(
        uid,
        (snapshot) => setState({ status: 'ready', snapshot }),
        (error) => setState({ status: 'error', message: error.message }),
      ),
    [uid],
  );
  return state;
}

// ============ CHECK-IN ============

export type CheckInState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly snapshot: CheckInSnapshot }
  | { readonly status: 'error'; readonly message: string };

export function useTodayCheckIn(): CheckInState {
  const { uid } = useSession();
  const today = todayISO();
  const [state, setState] = useState<CheckInState>({ status: 'loading' });
  useEffect(
    () =>
      observeTodayCheckIn(
        uid,
        today,
        (snapshot) => setState({ status: 'ready', snapshot }),
        (error) => setState({ status: 'error', message: error.message }),
      ),
    [uid, today],
  );
  return state;
}

// ============ COIN LEDGER ============

export type CoinLedgerState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly snapshot: CoinLedgerSnapshot }
  | { readonly status: 'error'; readonly message: string };

export function useCoinLedger(): CoinLedgerState {
  const { uid } = useSession();
  const [state, setState] = useState<CoinLedgerState>({ status: 'loading' });
  useEffect(
    () =>
      observeCoinLedger(
        uid,
        (snapshot) => setState({ status: 'ready', snapshot }),
        (error) => setState({ status: 'error', message: error.message }),
      ),
    [uid],
  );
  return state;
}
