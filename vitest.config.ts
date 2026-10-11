import { defineConfig } from "vitest/config";

// Every test in spec/ runs against the running app, which spec/global-setup.ts
// finds. Only spec/ runs: a test anywhere else needs adding to `include`.
export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts"],
    globalSetup: ["./spec/global-setup.ts"],
    // Every file shares one running app and its one database. Some checks
    // read global state (e.g. how many stars the sky has) while other files
    // create stars, so files run one at a time rather than racing.
    fileParallelism: false,
  },
});
