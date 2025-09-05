import esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const base = {
  entryPoints: ["main.ts"],
  bundle: true,
  outfile: "main.js",
  platform: "browser",
  external: ["obsidian"],
  format: "cjs",
  sourcemap: true,
  logLevel: "info",
};

const ctxPromise = esbuild.context(base);

if (isWatch) {
  const ctx = await ctxPromise;
  await ctx.watch();
  console.log("[Voice Actor] watching for changes...");
} else {
  await esbuild.build(base);
}
