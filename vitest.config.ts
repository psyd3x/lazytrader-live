import { defineConfig } from "vitest/config";

/**
 * Pure-TS engine tests only — restricted to `src/smc/**` so vitest never tries
 * to load React Native, Expo, or other native-bridged code that needs a JSC
 * runtime. Add other pure-TS modules here as the codebase grows.
 */
export default defineConfig({
  test: {
    include: ["src/smc/**/*.test.ts"],
    environment: "node",
    reporters: ["default"],
  },
});
