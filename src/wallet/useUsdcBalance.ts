// src/wallet/useUsdcBalance.ts
//
// Reads connected wallet's USDC SPL balance from the Solana RPC.
// Refresh-driven (no polling) — caller invokes refresh() on:
//   - Connect (initial fetch)
//   - Every successful Parse (so M4 sizing math sees fresh balance)
//   - ConfirmTrade resolution (so user sees post-trade deduction)

import { useCallback, useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

import { getRpcEndpoint } from "../storage/secureSettings";

const USDC_MAINNET_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

export interface UsdcBalanceState {
  balance: number | null; // USDC (decimal-adjusted, e.g. 50.123456)
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useUsdcBalance(walletAddress: string | null): UsdcBalanceState {
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rpc, setRpc] = useState<string>(DEFAULT_RPC);

  // Read RPC override from secureSettings once on mount.
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

  const refresh = useCallback(async () => {
    if (!walletAddress) {
      setBalance(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const conn = new Connection(rpc, "confirmed");
      const owner = new PublicKey(walletAddress);
      const ata = await getAssociatedTokenAddress(USDC_MAINNET_MINT, owner);
      try {
        const acc = await conn.getTokenAccountBalance(ata);
        setBalance(parseFloat(acc.value.uiAmountString ?? "0"));
      } catch (e) {
        // Distinguish "ATA doesn't exist" (= user never held USDC, balance is 0)
        // from real RPC errors (429, 5xx, network) which must surface to outer catch.
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes("could not find account")) {
          setBalance(0);
        } else {
          throw e;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, rpc]);

  // Auto-fetch on mount + whenever walletAddress or rpc changes (refresh
  // identity changes → effect re-runs). Fire-and-forget; no alive-flag here
  // — if a stale fetch resolves after a newer one, the user sees a brief
  // stale value then the fresh one. Acceptable at T10 scope.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { balance, isLoading, error, refresh };
}
