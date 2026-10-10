export type LinkErrorState =
  | { status: 'idle' }
  | { status: 'error'; message: string; action?: 'switch' | 'retry' | 'send-new' }
  | { status: 'success' };

export function linkErrorState(code: string): LinkErrorState {
  switch (code) {
    case 'auth/credential-already-in-use':
      return {
        status: 'error',
        message: 'That Google account already has Loop data.',
        action: 'switch',
      };
    case 'auth/provider-already-linked':
      return {
        status: 'error',
        message: 'Already linked.',
      };
    case 'auth/invalid-verification-code':
      return {
        status: 'error',
        message: 'That code did not match.',
        action: 'retry',
      };
    case 'auth/code-expired':
    case 'auth/session-expired':
      return {
        status: 'error',
        message: 'Code expired — send a new one.',
        action: 'send-new',
      };
    case 'auth/too-many-requests':
      return {
        status: 'error',
        message: 'Too many tries. Try again later.',
      };
    case 'auth/network-request-failed':
      return {
        status: 'error',
        message: 'Needs a connection.',
      };
    case 'SIGN_IN_CANCELLED':
      return { status: 'idle' };
    default:
      return {
        status: 'error',
        message: "Couldn't link right now.",
      };
  }
}