import { useEffect, useState } from 'react';

import { useSession } from '@/core/providers/bootstrap-provider';

import { type CategoriesSnapshot, observeCategories } from '../api/category-repository';

export type CategoriesState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly snapshot: CategoriesSnapshot }
  | { readonly status: 'error'; readonly message: string };

/** The signed-in user's categories, live, from the offline cache first. */
export function useCategories(): CategoriesState {
  const { uid } = useSession();
  const [state, setState] = useState<CategoriesState>({ status: 'loading' });

  useEffect(
    () =>
      observeCategories(
        uid,
        (snapshot) => setState({ status: 'ready', snapshot }),
        (error) => setState({ status: 'error', message: error.message }),
      ),
    [uid],
  );

  return state;
}
