import * as AppleAuthentication from "expo-apple-authentication";
import * as SecureStore from "expo-secure-store";

const APPLE_USER_KEY = "account.apple.user-id";
const SESSION_KEY = "account.sync.session";

let currentSessionToken: string | null = null;

export function getSessionToken() {
  return currentSessionToken;
}

export async function loadSessionToken() {
  currentSessionToken = await SecureStore.getItemAsync(SESSION_KEY);
  return currentSessionToken;
}

export async function setSessionToken(token: string) {
  currentSessionToken = token;
  await SecureStore.setItemAsync(SESSION_KEY, token);
}

export async function getStoredAppleUserId() {
  return SecureStore.getItemAsync(APPLE_USER_KEY);
}

export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error("Apple did not return an identity token.");
  }

  await SecureStore.setItemAsync(APPLE_USER_KEY, credential.user);
  return { userId: credential.user, identityToken: credential.identityToken };
}

export async function isAppleSignInAvailable() {
  return AppleAuthentication.isAvailableAsync();
}
