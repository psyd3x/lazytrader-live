// src/wallet/useConnect.ts
//
// Connect + SIWS in a single Phantom/Solflare prompt. Per MWA spec,
// `sign_in_payload` on `authorize` returns `sign_in_result` in the same
// response — no separate signMessage round-trip.
//
// On connect: saves auth_token + address to walletStore.
// On disconnect: clears walletStore AND fires wallet-side deauthorize.
//
// API notes (verified against @wallet-ui/react-native-web3js@4.1.0 types):
//   - useMobileWallet().account is Account | undefined (not null).
//   - account.address is web3.js PublicKey; .toBase58() is the address string.
//   - signIn(SignInPayload) => SignInOutput — no auth_token on the result.
//     The MWA auth_token lives in store.$authToken (nanostores atom); the
//     store updates it internally during authorize. We read it immediately
//     after signIn() resolves.
//   - disconnect() fires wallet-side deauthorize.

import { useCallback, useEffect, useState } from "react";
import { useMobileWallet } from "@wallet-ui/react-native-web3js";

import { walletStore } from "./walletStore";

export interface ConnectState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  authToken: string | null;
  connectAndSignIn: () => Promise<void>;
  disconnect: () => Promise<void>;
}

function makeNonce(): string {
  // crypto.randomUUID is provided by react-native-get-random-values
  // (loaded in entry file polyfills).
  return crypto.randomUUID();
}

export function useConnect(): ConnectState {
  const { account, signIn, disconnect: mwaDisconnect, store } = useMobileWallet();
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Hydrate from walletStore on mount (silent reauth path).
  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await walletStore.load();
      if (alive && stored.authToken) {
        setAuthToken(stored.authToken);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const connectAndSignIn = useCallback(async () => {
    setIsConnecting(true);
    try {
      await signIn({
        domain: "lazytrader.live",
        statement: "Sign in to LazyTrader",
        nonce: makeNonce(),
      });
      // signIn() resolves after authorize completes; the store updates
      // $authToken internally. Read it immediately after resolution.
      const token = store.$authToken.get() ?? null;
      // account may still be updating — read from store.$selectedAccount
      // which is guaranteed fresh at this point.
      const selectedAccount = store.$selectedAccount.get();
      const addr = selectedAccount?.address.toBase58() ?? null;
      if (token && addr) {
        await walletStore.save(token, addr, selectedAccount?.label);
        setAuthToken(token);
      }
    } finally {
      setIsConnecting(false);
    }
  }, [signIn, store]);

  const disconnect = useCallback(async () => {
    try {
      await mwaDisconnect();
    } catch {
      // wallet-side deauthorize may fail if token is already invalid;
      // we still want to clear local state.
    }
    await walletStore.clear();
    setAuthToken(null);
  }, [mwaDisconnect]);

  return {
    address: account?.address.toBase58() ?? null,
    isConnected: account !== undefined && authToken !== null,
    isConnecting,
    authToken,
    connectAndSignIn,
    disconnect,
  };
}
