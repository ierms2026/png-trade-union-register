import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // *.test.tsx files run in jsdom (needed for @testing-library/react
    // interactive tests — click, type, focus assertions). *.test.ts files
    // keep the default Node environment (no DOM needed; most are pure-logic
    // or renderToStaticMarkup tests). The per-file jsdom environment is also
    // set via the `// @vitest-environment jsdom` comment at the top of each
    // .test.tsx file — this glob is a belt-and-suspenders fallback for any
    // .test.tsx file that forgets the comment.
    ...(({
      environmentMatchGlobs: [
        ["src/lib/__tests__/**/*.test.tsx", "jsdom"],
      ],
    }) as Record<string, unknown>),
    setupFiles: ["./src/lib/__tests__/setup.ts"],
    // Include both .test.ts (Node env) and .test.tsx (jsdom env).
    include: ["src/lib/__tests__/**/*.test.ts", "src/lib/__tests__/**/*.test.tsx"],
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
