import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    // 純粋関数のテストが中心のため node 環境で実行する。
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "components/**/*.{test,spec}.{ts,tsx}",
    ],
  },
});
