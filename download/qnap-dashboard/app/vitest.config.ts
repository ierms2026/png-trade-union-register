import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/lib/__tests__/setup.ts"],
    include: ["src/lib/__tests__/**/*.test.ts"],
    singleThread: true,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
