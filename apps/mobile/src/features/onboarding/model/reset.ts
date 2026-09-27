/**
 * "Reset app": wipe the account and start over. Pure model; X4 is the screen.
 *
 * A reset deletes server data through a callable, so it needs a connection —
 * an offline reset would only clear this device and leave the account behind,
 * which is worse than refusing. The confirmation word is exact and
 * case-sensitive so it can't be satisfied by accident or autocorrect.
 */

export const RESET_CONFIRMATION = 'RESET';
export const RESET_OFFLINE_MESSAGE = 'Reset needs a connection';

/** Only the exact word. `reset`, ` RESET` and `RESET ` do not count. */
export function isResetConfirmed(input: string): boolean {
  return input === RESET_CONFIRMATION;
}

/**
 * After server data is deleted: an anonymous account has nothing to return to,
 * so the auth user is deleted too; a linked account keeps its sign-in and is
 * signed out.
 */
export function resetPlan(auth: { readonly isAnonymous: boolean }): 'delete-user' | 'sign-out' {
  return auth.isAnonymous ? 'delete-user' : 'sign-out';
}

export type ResetState =
  | { readonly status: 'idle' }
  | { readonly status: 'confirming'; readonly input: string }
  | { readonly status: 'deleting' }
  | { readonly status: 'done' }
  | { readonly status: 'error'; readonly message: string };

export type ResetEvent =
  | { readonly type: 'start' }
  | { readonly type: 'type'; readonly input: string }
  | { readonly type: 'confirm'; readonly online: boolean }
  | { readonly type: 'succeeded' }
  | { readonly type: 'failed'; readonly message: string }
  | { readonly type: 'cancel' };

export const INITIAL_RESET_STATE: ResetState = { status: 'idle' };

/**
 * idle → confirming → deleting → done | error. Events that don't apply to the
 * current state are ignored, so a stray double tap can't skip a step.
 */
export function resetReducer(state: ResetState, event: ResetEvent): ResetState {
  switch (state.status) {
    case 'idle':
      return event.type === 'start' ? { status: 'confirming', input: '' } : state;
    case 'confirming':
      if (event.type === 'type') return { status: 'confirming', input: event.input };
      if (event.type === 'cancel') return INITIAL_RESET_STATE;
      if (event.type === 'confirm') {
        if (!isResetConfirmed(state.input)) return state;
        return event.online ? { status: 'deleting' } : { status: 'error', message: RESET_OFFLINE_MESSAGE };
      }
      return state;
    case 'deleting':
      if (event.type === 'succeeded') return { status: 'done' };
      if (event.type === 'failed') return { status: 'error', message: event.message };
      return state;
    case 'error':
      if (event.type === 'start') return { status: 'confirming', input: '' };
      if (event.type === 'cancel') return INITIAL_RESET_STATE;
      return state;
    case 'done':
      return state;
  }
}
