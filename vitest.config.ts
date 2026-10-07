import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
    environment: "node",
    benchmark: { include: ["test/bench/**/*.bench.ts"] },
    coverage: { reportsDirectory: "build/coverage" },
  },
});
