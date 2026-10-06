import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/lib/__tests__/setup.ts"],
    include: ["src/lib/__tests__/**/*.test.ts"],
    // Run test files one at a time (no parallelism) because the tests share
    // a single SQLite test database (db/test.db). fileParallelism: false
    // serializes file execution so two files can't clobber the same DB row
    // at the same time. Each file still gets its own module isolate so the
    // setup.ts DB wipe runs fresh per file.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
