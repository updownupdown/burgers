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
  build: { target: "es2020", chunkSizeWarningLimit: 900 },
});
