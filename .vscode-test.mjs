import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "build/test/test/extension/**/*.test.js",
  launchArgs: ["--disable-extensions"],
});
