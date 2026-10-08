import { defineConfig } from "vitest/config";
import path from "path";

const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5433/uniao_test";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    globalSetup: ["tests/global-setup.ts"],
    env: {
      DATABASE_URL: TEST_URL,
      DIRECT_URL: TEST_URL,
      AUTH_SECRET: "test-secret-test-secret-test-secret-test-1234",
    },
  },
});
