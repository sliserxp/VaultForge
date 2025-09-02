// esbuild.config.js
const esbuild = require("esbuild");

const options = {
  entryPoints: ["main.ts"],
  bundle: true,
  outfile: "main.js",
  platform: "node",   // Obsidian is Electron
  format: "cjs",      // CommonJS
  target: ["es2020"],
  external: ["obsidian"], // leave Obsidian API alone
  sourcemap: false,
};

async function build() {
  if (process.argv.includes("--watch")) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log("👀 Watching for changes...");
  } else {
    await esbuild.build(options);
    console.log("✅ Build complete");
  }
}

build().catch(() => process.exit(1));

