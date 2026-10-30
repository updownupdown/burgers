/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

// The Pages workflow sets BUILD_NUMBER to the Actions run number; local builds show "dev".
const build = process.env.BUILD_NUMBER || "dev";
const commit = (process.env.GITHUB_SHA || "local").slice(0, 7);
const builtAt = new Date().toISOString();

function versionFile(): Plugin {
  return {
    name: "version-file",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ build, commit, builtAt }),
      });
      // The service worker's cache name carries the build so each deploy replaces the last.
      const id = build === "dev" ? `dev-${Date.now()}` : build;
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: readFileSync(new URL("./pwa/sw.js", import.meta.url), "utf8").replaceAll("__BUILD__", id),
      });
    },
  };
}

// Relative base so the build works at https://<user>.github.io/burgers/ and inside an Android WebView.
export default defineConfig({
  base: "./",
  define: {
    __BUILD__: JSON.stringify(build),
    __COMMIT__: JSON.stringify(commit),
    __BUILT_AT__: JSON.stringify(builtAt),
  },
  plugins: [versionFile()],
  // Agent worktrees live under .claude/; their copies of the tests aren't ours to run.
  test: { exclude: ["**/node_modules/**", "**/dist/**", ".claude/**"] },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 900,
    // ui.html is the component review page (src/ui/library.ts); it ships beside the game at /ui.html.
    rollupOptions: { input: { main: "index.html", ui: "ui.html" } },
  },
});
