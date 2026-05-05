// src/wallet/MwaProvider.tsx
//
// App-root MWA provider. Mounts @wallet-ui/react-native-web3js's
// MobileWalletProvider with our app identity and the user-configured
// RPC endpoint (default = public mainnet RPC; override in Settings).
//
// All wallet hooks (useConnect, useUsdcBalance) depend on this being
// mounted above them in the tree.

import { type ReactNode, useEffect, useState } from "react";
import { MobileWalletProvider } from "@wallet-ui/react-native-web3js";

import { getRpcEndpoint } from "../storage/secureSettings";

export const APP_IDENTITY = {
  name: "LazyTrader",
  uri: "https://lazytrader.live",
  icon: "favicon.png",
} as const;

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

export function MwaProvider({ children }: { children: ReactNode }) {
  const [rpc, setRpc] = useState<string>(DEFAULT_RPC);

  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await getRpcEndpoint();
      if (alive && stored && stored.trim().length > 0) {
        setRpc(stored.trim());
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <MobileWalletProvider
      chain="solana:mainnet"
      endpoint={rpc}
      identity={APP_IDENTITY}
    >
      {children}
    </MobileWalletProvider>
  );
}
