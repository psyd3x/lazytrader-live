import { defineConfig } from "vitest/config";

/**
 * Pure-TS engine tests only — restricted to `src/smc/**`, `src/data/**`,
 * and `src/parser/**` so vitest never tries to load React Native, Expo, or
 * other native-bridged code that needs a JSC runtime. Add other pure-TS
 * modules here as the codebase grows.
 */
export default defineConfig({
  test: {
    include: ["src/smc/**/*.test.ts", "src/data/**/*.test.ts", "src/parser/**/*.test.ts"],
    environment: "node",
    reporters: ["default"],
  },
});
