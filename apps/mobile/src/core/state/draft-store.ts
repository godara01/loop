/**
 * The expense entry draft. Lives outside the sheet so it survives a detour — to
 * create a category, say — and so an accidentally dismissed entry can be
 * restored. See docs/03-expenses.md#quick-add-behaviours.
 */

import { create } from 'zustand';

import { type AmountInput, EMPTY_AMOUNT } from '@/features/expenses/model/amount-input';

/** Reopening within this window after an abandoned entry restores the typed amount. */
const AMOUNT_MEMORY_MS = 60_000;

export interface ExpenseDraft {
  readonly amount: AmountInput;
  readonly categoryId: string | null;
  readonly description: string;
  readonly note: string;
  /** Whole days before today. 0 is today; the date control never goes below 0. */
  readonly daysAgo: number;
}

const EMPTY_DRAFT: ExpenseDraft = { amount: EMPTY_AMOUNT, categoryId: null, description: '', note: '', daysAgo: 0 };

interface DraftState {
  readonly draft: ExpenseDraft;
  readonly abandonedAt: number | null;
  /** Starts a new entry, keeping only a recently abandoned amount. */
  readonly startNew: (now: number) => void;
  readonly startFrom: (draft: ExpenseDraft) => void;
  readonly update: (patch: Partial<ExpenseDraft>) => void;
  readonly abandon: (now: number) => void;
  readonly clear: () => void;
}

export const useDraftStore = create<DraftState>()((set, get) => ({
  draft: EMPTY_DRAFT,
  abandonedAt: null,
  startNew: (now) => {
    const { draft, abandonedAt } = get();
    const remember = abandonedAt !== null && now - abandonedAt <= AMOUNT_MEMORY_MS;
    set({ draft: remember ? { ...EMPTY_DRAFT, amount: draft.amount } : EMPTY_DRAFT, abandonedAt: null });
  },
  startFrom: (draft) => set({ draft, abandonedAt: null }),
  update: (patch) => set({ draft: { ...get().draft, ...patch } }),
  abandon: (now) => set({ abandonedAt: now }),
  clear: () => set({ draft: EMPTY_DRAFT, abandonedAt: null }),
}));
