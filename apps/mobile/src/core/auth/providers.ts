import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider } from '@react-native-firebase/auth';

const WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  '786081644010-nm45jstdl4toravsg3f8lhv4s93rvr96.apps.googleusercontent.com';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  configured = true;
}

export const signInWithGoogle = async () => {
  ensureConfigured();
  await GoogleSignin.hasPlayServices();
  await GoogleSignin.signIn();
  const { idToken } = await GoogleSignin.getTokens();
  const credential = GoogleAuthProvider.credential(idToken);
  return { credential };
};

export const linkWithGoogle = async () => {
  ensureConfigured();
  await GoogleSignin.hasPlayServices();
  await GoogleSignin.signIn();
  const { idToken } = await GoogleSignin.getTokens();
  const credential = GoogleAuthProvider.credential(idToken);
  return { credential };
};

export const signOutGoogle = async () => {
  try {
    await GoogleSignin.revokeAccess();
    await GoogleSignin.signOut();
  } catch {
    // Ignore errors on sign out
  }
};

export const getCurrentGoogleUser = async () => {
  try {
    return await GoogleSignin.getCurrentUser();
  } catch {
    return null;
  }
};
