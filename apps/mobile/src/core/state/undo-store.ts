/**
 * One app-wide undo slot, so an action taken on any screen can be undone from
 * wherever the user lands next. See docs/03-expenses.md#delete.
 */

import { create } from 'zustand';

export const UNDO_WINDOW_MS = 6000;

export interface UndoOffer {
  readonly id: number;
  readonly message: string;
  readonly undo: () => void;
}

interface UndoState {
  readonly offer: UndoOffer | null;
  readonly offerUndo: (message: string, undo: () => void) => void;
  readonly dismiss: (id: number) => void;
}

let nextId = 1;

export const useUndoStore = create<UndoState>()((set, get) => ({
  offer: null,
  offerUndo: (message, undo) => set({ offer: { id: nextId++, message, undo } }),
  // Keyed by id so a timer from an older offer cannot dismiss a newer one.
  dismiss: (id) => {
    if (get().offer?.id === id) set({ offer: null });
  },
}));
