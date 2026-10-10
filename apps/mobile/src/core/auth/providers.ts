import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider } from '@react-native-firebase/auth';
import { linkErrorState } from './link-errors';

// Configure Google Sign-in (client ID from Firebase console)
// Note: The actual client ID should be in your firebase configuration files.
// For Expo, we can use the googleServicesFile from app.json to get it.
// However, the GoogleSignin component needs to be configured with the webClientId.
// We'll assume it's set up via the expo plugin and we can use the default configuration.
// If needed, we can read from process.env or a config file, but for now we rely on the plugin.

export const signInWithGoogle = async () => {
  try {
    await GoogleSignin.hasPlayServices();
    await GoogleSignin.signIn();
    const { idToken } = await GoogleSignin.getTokens();
    const credential = GoogleAuthProvider.credential(idToken);
    return { credential };
  } catch (error) {
    // Map error to our linkErrorState format if needed
    throw error;
  }
};

export const linkWithGoogle = async () => {
  try {
    await GoogleSignin.hasPlayServices();
    await GoogleSignin.signIn();
    const { idToken } = await GoogleSignin.getTokens();
    const credential = GoogleAuthProvider.credential(idToken);
    return { credential };
  } catch (error) {
    throw error;
  }
};

export const signOutGoogle = async () => {
  try {
    await GoogleSignin.revokeAccess();
    await GoogleSignin.signOut();
  } catch (error) {
    // Ignore errors on sign out
  }
};

export const getCurrentGoogleUser = async () => {
  try {
    return await GoogleSignin.getCurrentUser();
  } catch (error) {
    return null;
  }
};