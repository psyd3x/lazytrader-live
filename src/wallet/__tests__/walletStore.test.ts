import { describe, expect, test, vi, beforeEach } from "vitest";

// Mock expo-secure-store before importing walletStore
const mem = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (k: string) => mem.get(k) ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => { mem.set(k, v); }),
  deleteItemAsync: vi.fn(async (k: string) => { mem.delete(k); }),
}));

import { walletStore } from "../walletStore";

describe("walletStore", () => {
  beforeEach(() => mem.clear());

  test("save + load round-trip with all fields", async () => {
    await walletStore.save("token-abc", "5myNNm...uAKx", "Phantom");
    const loaded = await walletStore.load();
    expect(loaded.authToken).toBe("token-abc");
    expect(loaded.address).toBe("5myNNm...uAKx");
    expect(loaded.label).toBe("Phantom");
  });

  test("save without label leaves label undefined on load", async () => {
    await walletStore.save("token-abc", "5myNNm...uAKx");
    const loaded = await walletStore.load();
    expect(loaded.label).toBeNull();
  });

  test("clear removes all three keys", async () => {
    await walletStore.save("token-abc", "addr", "Phantom");
    await walletStore.clear();
    const loaded = await walletStore.load();
    expect(loaded.authToken).toBeNull();
    expect(loaded.address).toBeNull();
    expect(loaded.label).toBeNull();
  });

  test("load on empty store returns nulls", async () => {
    const loaded = await walletStore.load();
    expect(loaded).toEqual({ authToken: null, address: null, label: null });
  });
});
