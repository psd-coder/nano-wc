// @ts-check
import { defineConfig } from "astro/config";
import { readFileSync } from "node:fs";

const srcPath = new URL("../src", import.meta.url).pathname;

function moduleReferencePlugin(moduleName, srcEntry, distEntry) {
  return {
    name: `nano-wc-${moduleName}`,
    enforce: "pre",
    resolveId(id) {
      if (id === `${moduleName}?url`) return `\0${moduleName}-url`;
      if (id === moduleName) return srcEntry;
    },
    load(id) {
      if (id !== `\0${moduleName}-url`) return;
      // Embed as data URI so the srcdoc iframe can load it
      // without cross-origin or filesystem constraints.
      const src = readFileSync(distEntry, "utf-8");
      const dataUri = `data:text/javascript;charset=utf-8,${encodeURIComponent(src)}`;
      return `export default ${JSON.stringify(dataUri)};`;
    },
  };
}

// https://astro.build/config
export default defineConfig({
  site: "https://psd-coder.github.io",
  base: process.env.CI ? "/nano-wc/" : "/",
  vite: {
    plugins: [
      moduleReferencePlugin(
        "nano-wc",
        `${srcPath}/index.ts`,
        "../dist/index.mjs",
      ),
      moduleReferencePlugin(
        "nano-wc/render",
        `${srcPath}/render.ts`,
        "../dist/render.mjs",
      ),
    ],
  },
});
