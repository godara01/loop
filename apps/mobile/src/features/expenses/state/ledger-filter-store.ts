/**
 * The ledger filter for this session (docs/03 § Ledger filters). Not persisted:
 * a ledger that opens already filtered on the next launch would confuse people.
 *
 * Lives in the expenses feature, not core/state: core must never import a
 * feature (docs/10 import rule 2), and the filter type belongs to this feature.
 */

import { create } from 'zustand';

import { EMPTY_FILTER, type FilterFacet, type LedgerFilter, withoutFacet } from '../model/ledger-filter';

interface LedgerFilterState {
  readonly filter: LedgerFilter;
  readonly set: (patch: Partial<LedgerFilter>) => void;
  readonly setFilter: (filter: LedgerFilter) => void;
  readonly clear: () => void;
  readonly removeFacet: (facet: FilterFacet) => void;
}

export const useLedgerFilterStore = create<LedgerFilterState>((set) => ({
  filter: EMPTY_FILTER,
  set: (patch) => set((state) => ({ filter: { ...state.filter, ...patch } })),
  setFilter: (filter) => set({ filter }),
  clear: () => set({ filter: EMPTY_FILTER }),
  removeFacet: (facet) => set((state) => ({ filter: withoutFacet(state.filter, facet) })),
}));
