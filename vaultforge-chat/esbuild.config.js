// esbuild.config.js
const esbuild = require("esbuild");

const options = {
  entryPoints: ["main.ts"],
  bundle: true,
  outfile: "main.js",
  platform: "node",   // Obsidian is Electron
  format: "cjs",      // CommonJS required
  target: ["es2020"],
  external: ["obsidian"], // don’t bundle Obsidian API
  sourcemap: false,
};

async function build() {
  if (process.argv.includes("--watch")) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log("👀 VaultForge-Chat watching for changes...");
  } else {
    await esbuild.build(options);
    console.log("✅ VaultForge-Chat build complete");
  }
}

build().catch(() => process.exit(1));

