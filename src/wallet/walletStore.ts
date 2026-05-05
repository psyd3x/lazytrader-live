// src/wallet/walletStore.ts
//
// Persists MWA session state in expo-secure-store (Android Keystore,
// AES-256, hardware-backed on most modern devices). Extends the M3
// secureSettings pattern — keys are namespaced under "mwa.*" so they
// don't collide with Birdeye/LLM keys.
//
// auth_token persistence enables silent reauth on subsequent signs
// (MWA spec — no Phantom prompt for sign if auth_token is fresh).

import * as SecureStore from "expo-secure-store";

const KEYS = {
  authToken: "mwa.auth_token",
  address: "mwa.address",
  label: "mwa.wallet_label",
} as const;

export interface WalletState {
  authToken: string | null;
  address: string | null;
  label: string | null;
}

export const walletStore = {
  async save(authToken: string, address: string, label?: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.authToken, authToken);
    await SecureStore.setItemAsync(KEYS.address, address);
    if (label) {
      await SecureStore.setItemAsync(KEYS.label, label);
    }
  },

  async load(): Promise<WalletState> {
    const [authToken, address, label] = await Promise.all([
      SecureStore.getItemAsync(KEYS.authToken),
      SecureStore.getItemAsync(KEYS.address),
      SecureStore.getItemAsync(KEYS.label),
    ]);
    return { authToken, address, label };
  },

  async clear(): Promise<void> {
    await Promise.all(
      Object.values(KEYS).map((k) => SecureStore.deleteItemAsync(k)),
    );
  },
};
