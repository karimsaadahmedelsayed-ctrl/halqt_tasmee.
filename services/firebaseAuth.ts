import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
  Auth
} from 'firebase/auth';
import { UserSession } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

let app: any = null;
export let auth: Auth | null = null;
let provider: GoogleAuthProvider | null = null;

try {
  if (firebaseConfig && firebaseConfig.apiKey) {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    
    // Permanent Local Persistence: groups and account remain saved permanently!
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn('Could not set local persistence:', err);
    });

    provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account' // Forces Google to show all accounts on the device!
    });
  }
} catch (err) {
  console.warn('Firebase initialization notice:', err);
}

export const SCOPES = ['profile', 'email'];

// Helper to format a Firebase User into our UserSession
const formatUserSession = async (user: User, customToken?: string): Promise<UserSession> => {
  const token = customToken || (await user.getIdToken());
  const cleanEmail = (user.email || '').toLowerCase().trim();
  const displayName = user.displayName || cleanEmail.split('@')[0] || 'قارئ القرآن';

  const userSession: UserSession = {
    id: 'p_' + user.uid.slice(0, 10),
    name: displayName,
    email: cleanEmail,
    token: token || 'token_' + Date.now(),
    uid: user.uid,
    picture: user.photoURL || undefined
  };

  // Save user session permanently in localStorage so groups and messages stay permanently accessible
  try {
    localStorage.setItem('t_user_session', JSON.stringify(userSession));
    sessionStorage.setItem('t_session_token', userSession.token);
    sessionStorage.setItem('t_session_name', userSession.name);
    sessionStorage.setItem('t_session_uid', userSession.uid);
    sessionStorage.setItem('t_session_email', userSession.email);
    if (userSession.picture) {
      sessionStorage.setItem('t_session_pic', userSession.picture);
    }
  } catch {}

  return userSession;
};

// Check for redirect login result (e.g., when returning from mobile Chrome redirect)
export const checkRedirectResult = async (): Promise<UserSession | null> => {
  if (!auth) return null;
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || (await result.user.getIdToken());
      return await formatUserSession(result.user, token);
    }
  } catch (err) {
    console.warn('Redirect result check notice:', err);
  }
  return null;
};

// Initiate Google Sign-In with popup (safely handling mobile without broken 400 redirect)
export const signInWithGoogle = async (): Promise<UserSession> => {
  if (!auth || !provider) {
    throw new Error('auth/uninitialized');
  }

  // Ensure local persistence is active so user stays logged in
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {}

  provider.setCustomParameters({
    prompt: 'select_account' // Always enforce account selection
  });

  try {
    // Attempt standard popup
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || (await user.getIdToken());
    return await formatUserSession(user, token);
  } catch (err: any) {
    // Never redirect to unwhitelisted origin on mobile to avoid Google Error 400!
    // Instead throw specific error so UI can open the official in-app Google Account Chooser
    console.warn('Google popup auth notice:', err?.code || err?.message);
    throw err;
  }
};

export const logoutGoogle = async (): Promise<void> => {
  try {
    if (auth) {
      await signOut(auth);
    }
  } catch {}

  // Wipe persistent session data upon explicit logout
  try {
    localStorage.removeItem('t_user_session');
    localStorage.removeItem('t_active_circle_id');
    sessionStorage.clear();
  } catch {}
};

export const subscribeToAuthChanges = (callback: (user: UserSession | null) => void) => {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, async (firebaseUser: User | null) => {
    if (firebaseUser) {
      const userSession = await formatUserSession(firebaseUser);
      callback(userSession);
    } else {
      callback(null);
    }
  });
};

// Generates direct Google OAuth 2.0 Auth URL with prompt: 'select_account'
export const getGoogleOAuthUrl = (): string => {
  const clientId = firebaseConfig.oAuthClientId || '206677198318-etr4rj9fhb4nb2orjcc8u2rgabu947fe.apps.googleusercontent.com';
  const redirectUri = typeof window !== 'undefined' ? window.location.origin : '';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
    prompt: 'select_account',
    include_granted_scopes: 'true'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};
