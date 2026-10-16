import { getAuth, PhoneAuthProvider } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { linkWithGoogle, signInWithGoogle, signOutGoogle, getCurrentGoogleUser } from './providers';

// Factory function to create link service with injectable dependencies
export const createLinkService = ({
  getAuth,
  getFirestore,
  linkWithGoogle,
  signInWithGoogle,
  signOutGoogle,
  getCurrentGoogleUser,
}: {
  getAuth: () => any;
  getFirestore: () => any;
  linkWithGoogle: () => Promise<{ credential: any }>;
  signInWithGoogle: () => Promise<{ credential: any }>;
  signOutGoogle: () => Promise<void>;
  getCurrentGoogleUser: () => Promise<any | null>;
}) => {
  // Helper to check if the current user is anonymous
  const isAnonymous = (): boolean => {
    const currentUser = getAuth().currentUser;
    return !!currentUser && currentUser.isAnonymous;
  };

  // Helper to get the number of linked providers for the current user
  const getLinkedProvidersCount = async (): Promise<number> => {
    const currentUser = getAuth().currentUser;
    if (!currentUser) return 0;
    return currentUser.providerData.length;
  };

  // Simple implementation of waitForPendingWrites - in a real app this would wait for Firestore writes
  const waitForPendingWrites = async (firestore: any) => {
    // For now, we'll just return immediately
    // In a production app, this would listen for pending writes
    return Promise.resolve();
  };

  // Sign in with provider, deleting the throwaway anonymous uid first
  const signInWithProvider = async (provider: 'google') => {
    if (isAnonymous()) {
      // Delete the anonymous user
      const currentUser = getAuth().currentUser;
      if (currentUser) {
        await currentUser.delete();
      }
    }

    // Now sign in with the provider
    const { credential } = await signInWithGoogle();
    await getAuth().signInWithCredential(credential);
    return { credential };
  };

  // Link provider to current account (assuming current user is not anonymous)
  const linkWithProvider = async (provider: 'google') => {
    const { credential } = await linkWithGoogle();
    await getAuth().currentUser?.linkWithCredential(credential);
    return { credential };
  };

  // Switch account: sign out current, sign in with provider (which will be the existing account)
  const switchAccount = async (provider: 'google') => {
    await signOutGoogle();
    const { credential } = await signInWithGoogle();
    await getAuth().signInWithCredential(credential);
    return { credential };
  };

  // Sign out of all providers and delete the anonymous user if no providers left
  const signOutSafely = async () => {
    await signOutGoogle();
    await getAuth().signOut();
  };

  // Unlink provider from current account
  const unlinkProvider = async (provider: 'google') => {
    await getAuth().currentUser?.unlinkProvider(provider);
  };

  // Phone authentication methods
  // Linking must only VERIFY the number. signInWithPhoneNumber can sign the
  // device in as the phone's own user (Android instant verification, and the
  // Auth emulator), after which linkWithCredential fails and the anonymous
  // user's data is orphaned. verifyPhoneNumber never changes the current user.
  const sendPhoneOtp = async (phoneNumber: string, forceResend = false): Promise<{ verificationId: string | null }> => {
    // The listener's own promise only settles on auto-verify or timeout on
    // Android; the OTP sheet needs the verificationId as soon as the code is sent.
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (verificationId: string | null) => {
        if (settled) return;
        settled = true;
        resolve({ verificationId });
      };
      getAuth()
        .verifyPhoneNumber(phoneNumber, forceResend)
        .on(
          'state_changed',
          (snapshot: { state: string; verificationId: string; error: unknown }) => {
            if (snapshot.state === 'error') {
              if (!settled) {
                settled = true;
                reject(snapshot.error);
              }
              return;
            }
            // 'sent', or 'verified'/'timeout' on Android: all carry the id the credential needs.
            settle(snapshot.verificationId ?? null);
          },
          (error: unknown) => {
            if (!settled) {
              settled = true;
              reject(error);
            }
          },
        );
    });
  };

  const verifyPhoneOtp = async (verificationId: string, code: string) => {
    const credential = PhoneAuthProvider.credential(verificationId, code);
    return credential;
  };

  // Link phone credentials to current user
  const linkPhoneCredential = async (credential: any) => {
    await getAuth().currentUser?.linkWithCredential(credential);
  };

  // Return an object with all the methods we want to expose
  return {
    isAnonymous,
    getLinkedProvidersCount,
    signInWithProvider,
    linkWithProvider,
    switchAccount,
    signOutSafely,
    unlinkProvider,
    waitForPendingWrites, // Export for backward compatibility
    // Phone auth methods
    sendPhoneOtp,
    verifyPhoneOtp,
    linkPhoneCredential,
  };
};

// Create the link service instance with the actual dependencies
export const linkService = createLinkService({
  getAuth,
  getFirestore,
  linkWithGoogle,
  signInWithGoogle,
  signOutGoogle,
  getCurrentGoogleUser,
});

// Also export the individual functions for backward compatibility and explicit use
export const { 
  isAnonymous, 
  getLinkedProvidersCount, 
  signInWithProvider, 
  linkWithProvider, 
  switchAccount, 
  signOutSafely, 
  unlinkProvider, 
  waitForPendingWrites,
  // Phone auth methods
  sendPhoneOtp,
  verifyPhoneOtp,
  linkPhoneCredential,
} = linkService;