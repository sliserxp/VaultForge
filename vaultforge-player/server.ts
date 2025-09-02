import express from "express";
import { TFile, parseYaml } from "obsidian";
import { join } from "path";
import type VaultForgePlayer from "./main";  // import the plugin class

export function createServer(plugin: VaultForgePlayer) {
  const app = express();
  const port = plugin.settings.port || 3000;

  // Path to frontend bundle
  const distPath = join(
    (plugin.app.vault.adapter as any).basePath,
    ".obsidian",
    "plugins",
    plugin.manifest.id,
    "frontend",
    "dist"
  );

  // Serve frontend
  app.use("/", express.static(distPath));

  /* ---- API: list players ---- */
  app.get("/api/players", async (req, res) => {
    try {
      const folderPath = plugin.settings.playersPath || "Players";
      const folder = plugin.app.vault.getAbstractFileByPath(folderPath);

      if (!folder || !("children" in folder)) {
        return res.json([]);
      }

      const players = folder.children
        .filter(f => f instanceof TFile && f.extension === "md")
        .map(f => f.basename);

      res.json(players);
    } catch (err) {
      console.error("[VaultForge-Player] Error reading players:", err);
      res.status(500).json({ error: "Failed to load players" });
    }
  });

  /* ---- API: get specific player data ---- */
  app.get("/api/player/:name", async (req, res) => {
    try {
      const filePath = `${plugin.settings.playersPath}/${req.params.name}.md`;
      const file = plugin.app.vault.getAbstractFileByPath(filePath);

      if (!(file instanceof TFile)) {
        return res.status(404).json({ error: "Player not found" });
      }

      const content = await plugin.app.vault.read(file);
      const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!yamlMatch) return res.json({});

      const data = parseYaml(yamlMatch[1]);
      res.json(data);
    } catch (err) {
      console.error("[VaultForge-Player] Error reading player:", err);
      res.status(500).json({ error: "Failed to load player" });
    }
  });

  const server = app.listen(port, () => {
    console.log(`[VaultForge-Player] Server running at http://localhost:${port}`);
  });

  return server;
}

