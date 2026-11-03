import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { cpSync, mkdirSync } from "node:fs";
import { build } from "esbuild";
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
mkdirSync("public/editor-assets", { recursive: true });
const patchedSanitizer = {
  name: "patched-sanitizer",
  setup(builder) {
    builder.onResolve({ filter: /dompurify\/dompurify\.js$/ }, () => ({
      path: resolve("node_modules/dompurify/dist/purify.es.mjs"),
    }));
  },
};
await build({
  plugins: [patchedSanitizer],
  absWorkingDir: process.cwd(),
  entryPoints: ["scripts/editor-entry.mjs"],
  bundle: true,
  format: "iife",
  globalName: "DataForgeMonaco",
  outfile: "public/editor-assets/editor.js",
  minify: true,
  loader: { ".ttf": "file" },
  legalComments: "eof",
});
await build({
  absWorkingDir: process.cwd(),
  entryPoints: ["node_modules/monaco-editor/esm/vs/editor/editor.worker.js"],
  bundle: true,
  format: "iife",
  outfile: "public/editor-assets/editor.worker.js",
  minify: true,
  legalComments: "eof",
});
mkdirSync("public/sample-data", { recursive: true });
cpSync(
  "../sample-data/retail_sales.csv",
  "public/sample-data/retail_sales.csv",
);
