/* ========================
   VaultForge-Player Plugin
   ======================== */
import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  Notice,
  parseYaml,
  stringifyYaml,
  normalizePath
} from "obsidian";
import QRCode from "qrcode";
import os from "os";
import express, { Request, Response } from "express";
import { join } from "path";
import type { Server } from "http";
import fs from "fs";

/* ---------- Shared Utils ---------- */
type ProficiencyLevel = "none" | "proficient" | "expertise";

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function skillModifier(
  abilityScore: number,
  proficiencyBonus: number,
  profLevel: ProficiencyLevel
): number {
  const mod = abilityModifier(abilityScore);
  if (profLevel === "proficient") return mod + proficiencyBonus;
  if (profLevel === "expertise") return mod + proficiencyBonus * 2;
  return mod;
}

/* ---------- Settings ---------- */
interface VaultForgePlayerSettings {
  port: number;
  playersPath: string;
  shopPath: string;
  lorePath: string;
  activePlayer: string;
}

const DEFAULT_SETTINGS: VaultForgePlayerSettings = {
  port: 3000,
  playersPath: "Players",
  shopPath: "Shop",
  lorePath: "Lore",
  activePlayer: "",
};

/* ---------- Deep Merge Helper ---------- */
function deepMerge(
  target: Record<string, any>,
  source: Record<string, any>
): Record<string, any> {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      if (!target[key] || typeof target[key] !== "object") {
        target[key] = {};
      }
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function parseIfJson(value: any): any {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function sanitizeData(data: any): any {
  if (Array.isArray(data)) {
    return data.map(parseIfJson).map(sanitizeData);
  } else if (typeof data === "object" && data !== null) {
    const result: any = {};
    for (const [k, v] of Object.entries(data)) {
      result[k] = sanitizeData(parseIfJson(v));
    }
    return result;
  }
  return parseIfJson(data);
}

/* ---------- Plugin ---------- */
export default class VaultForgePlayer extends Plugin {
  settings!: VaultForgePlayerSettings;
  server: Server | null = null;
  private updating = false;

  async onload() {
    console.log("[VaultForge-Player] loaded ✅");
    await this.loadSettings();
    this.addSettingTab(new VaultForgePlayerSettingTab(this.app, this));

    // Start Express server
    const app = express();
    const port = this.settings.port || 3000;

    // Serve frontend if built
    const distPath = join(
      (this.app.vault.adapter as any).basePath,
      ".obsidian",
      "plugins",
      this.manifest.id,
      "frontend",
      "dist"
    );
    // Set a permissive CSP so the frontend can fetch/connect to localhost without being blocked
    app.use((req, res, next) => {
      const csp =
        "default-src 'self'; " +
        `connect-src 'self' http://localhost:${port} http://127.0.0.1:${port} ws://localhost:${port} ws://127.0.0.1:${port}; ` +
        "img-src 'self' data: blob:; " +
        "style-src 'self' 'unsafe-inline'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "font-src 'self' data:; " +
        "frame-ancestors 'self'";
      res.setHeader("Content-Security-Policy", csp);
      next();
    });
    app.use("/", express.static(distPath));

    app.get("/api/items", async (_req: Request, res: Response) => {
      try {
        const vf = (this.app as any).vaultforge5etools;
        const items = vf ? vf.getTable('items') : [];
        res.json(items);
      } catch (err) {
        console.error("[VaultForge-Player] Error fetching items:", err);
        res.status(500).json({ error: "Failed to load items" });
      }
    });

    /* ---- List players ---- */
    app.get("/api/players", async (_req: Request, res: Response) => {
      try {
        const folderPath = this.settings.playersPath || "Players";
        const folder = this.app.vault.getAbstractFileByPath(folderPath);

        if (!(folder instanceof TFolder)) {
          return res.json([]);
        }

        const players = folder.children
        .filter((f): f is TFile => f instanceof TFile && f.extension === "md")
        .map(f => f.basename);

        res.json(players);
      } catch (err) {
        console.error("[VaultForge-Player] Error reading players:", err);
        res.status(500).json({ error: "Failed to load players" });
      }
    });

    /* ---- Get one player ---- */
    app.get("/api/player/:name", async (req: Request, res: Response) => {
      try {
        const filePath = `${this.settings.playersPath}/${req.params.name}.md`;
        const file = this.app.vault.getAbstractFileByPath(filePath);

        if (!(file instanceof TFile)) {
          return res.status(404).json({ error: "Player not found" });
        }

        const content = await this.app.vault.read(file);
      const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!yamlMatch) return res.json({});

      // Heuristic normalization to reduce common frontmatter formatting errors:
      // - convert tabs to two spaces
      // - add a space after ':' when missing in simple scalar cases (e.g., xp:100 => xp: 100)
      const rawYamlOriginal = yamlMatch[1];
      const rawYaml = rawYamlOriginal
        .replace(/\t/g, '  ')
        .replace(/:([^\s\n\-\[\{])/g, ': $1');

      try {
        const data = parseYaml(rawYaml);
        return res.json(data);
      } catch (e) {
        console.error("[VaultForge-Player] Failed to parse YAML frontmatter for", req.params.name, e);
        // Return empty sheet to avoid 500 and allow frontend to handle gracefully
        return res.json({});
      }
      } catch (err) {
        console.error("[VaultForge-Player] Error reading player:", err);
        // Return empty sheet instead of 500 so frontend can handle missing/invalid files
        return res.json({});
      }
    });

    /* ---- Update a player ---- */
    app.post(
      "/api/player/:name",
      express.json(),
      async (req: Request, res: Response) => {
        try {
          const filePath = `${this.settings.playersPath}/${req.params.name}.md`;
          const file = this.app.vault.getAbstractFileByPath(filePath);

          if (!(file instanceof TFile)) {
            return res.status(404).json({ error: "Player not found" });
          }

          const content = await this.app.vault.read(file);
          const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
          const current = yamlMatch ? parseYaml(yamlMatch[1]) || {} : {};
          const cleanedUpdates = sanitizeData(req.body);
          deepMerge(current, cleanedUpdates);

          const newYaml = "---\n" + stringifyYaml(current) + "---";
          const newContent = yamlMatch
            ? content.replace(/^---\n([\s\S]*?)\n---/, newYaml)
            : newYaml + "\n" + content;

          this.updating = true;
          await this.app.vault.modify(file, newContent);
          this.updating = false;

          res.json({ success: true, data: current });
        } catch (err) {
          this.updating = false;
          console.error("[VaultForge-Player] Error saving player:", err);
          res.status(500).json({ error: "Failed to save player" });
        }
      }
    );

    // VaultForge plugin proxy endpoints
    app.get("/api/vaultforge/search", async (req: Request, res: Response) => {
      try {
        const vf = (this.app as any).vaultforge5etools;
        if (!vf) return res.status(404).json({ error: "VaultForge plugin not available" });
        const q = String(req.query.q || "");
        const type = String(req.query.type || "all");
        // If searching classes, try class export index for stronger results
        if (type === 'classes' || type === 'class') {
          try {
            const api = (this.app as any).vaultforge5etools;
            // Ensure master index is built (not strictly required here, but keeps caches warm)
            api.masterIndex = api.masterIndex ?? await api.buildMasterIndex();
            const dataPathAbs = (this.app.vault.adapter as any).basePath + '/.obsidian/plugins/' + this.manifest.id.replace('vaultforge-player','vaultforge-5etools') + '/data';
            // Defer to the vf.readTableFromData via getTable('classes') which uses class/index.json when present
            const classes = await api.getTable('classes');
            const qn = q.toLowerCase();
            const filtered = classes.filter((c: any) =>
              (c.name && String(c.name).toLowerCase().includes(qn)) ||
              (c.subclasses && c.subclasses.some((s: any) => String((s && s.name) || s).toLowerCase().includes(qn)))
            );
            return res.json(filtered);
          } catch (er) {
            // fall through to generic search
          }
        }
        const results = await vf.searchName(q, type);
        res.json(results);
      } catch (e) {
        console.error("[VaultForge-Player] vaultforge search error", e);
        res.status(500).json({ error: "Search failed" });
      }
    });

    app.get("/api/vaultforge/export", async (req: Request, res: Response) => {
      try {
        const vf = (this.app as any).vaultforge5etools;
        if (!vf) return res.status(404).json({ error: "VaultForge plugin not available" });
        const uid = String(req.query.uid || "");
        const payload = await vf.exportForSheet(uid);
        if (!payload) return res.status(404).json({ error: "Not found" });
        res.json(payload);
      } catch (e) {
        console.error("[VaultForge-Player] vaultforge export error", e);
        res.status(500).json({ error: "Export failed" });
      }
    });

    // Serve master index for frontend fallback searches
    app.get("/vaultforge/cache/master-index.json", async (_req: Request, res: Response) => {
      try {
        const vf = (this.app as any).vaultforge5etools;
        if (!vf) return res.status(404).json({ error: "VaultForge plugin not available" });
        const idx = vf.masterIndex ?? await vf.buildMasterIndex();
        res.json(idx);
      } catch (e) {
        console.error("[VaultForge-Player] master-index error", e);
        res.status(500).json({ error: "Failed to load master index" });
      }
    });

    // Serve raw class index from 5eTools data (for class-specific searches)
    app.get("/vaultforge/data/class/index.json", async (_req: Request, res: Response) => {
      try {
        const base = (this.app.vault.adapter as any).basePath;
        const fp = join(base, ".obsidian", "plugins", "vaultforge-5etools", "data", "class", "index.json");
        if (!fs.existsSync(fp)) return res.status(404).json({ error: "class index not found" });
        res.setHeader("Content-Type", "application/json");
        res.send(fs.readFileSync(fp, "utf-8"));
      } catch (e) {
        console.error("[VaultForge-Player] class index error", e);
        res.status(500).json({ error: "Failed to load class index" });
      }
    });

    // Support PUT updates (compat with frontend using PUT)
    app.put(
      "/api/player/:name",
      express.json(),
      async (req: Request, res: Response) => {
        try {
          const filePath = `${this.settings.playersPath}/${req.params.name}.md`;
          const file = this.app.vault.getAbstractFileByPath(filePath);

          if (!(file instanceof TFile)) {
            return res.status(404).json({ error: "Player not found" });
          }

          const content = await this.app.vault.read(file);
          const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
          const current = yamlMatch ? parseYaml(yamlMatch[1]) || {} : {};
          const cleanedUpdates = sanitizeData(req.body);
          deepMerge(current, cleanedUpdates);

          const newYaml = "---\n" + stringifyYaml(current) + "---";
          const newContent = yamlMatch
            ? content.replace(/^---\n([\s\S]*?)\n---/, newYaml)
            : newYaml + "\n" + content;

          this.updating = true;
          await this.app.vault.modify(file, newContent);
          this.updating = false;

          res.json({ success: true, data: current });
        } catch (err) {
          this.updating = false;
          console.error("[VaultForge-Player] Error saving player (PUT):", err);
          res.status(500).json({ error: "Failed to save player" });
        }
      }
    );

    // Start server
    this.server = app.listen(port, () => {
      console.log(`[VaultForge-Player] server running at http://localhost:${port}`);
    });
  }

  onunload() {
    if (this.server) {
      this.server.close();
      console.log("[VaultForge-Player] stopped ❌");
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

/* ---------- Settings Tab ---------- */
class VaultForgePlayerSettingTab extends PluginSettingTab {
  plugin: VaultForgePlayer;

  constructor(app: App, plugin: VaultForgePlayer) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "VaultForge Player Settings" });

    /* ---- Port ---- */
    new Setting(containerEl)
      .setName("Server Port")
      .setDesc("Port to run the local server on")
      .addText(text =>
        text
          .setPlaceholder("3000")
          .setValue(this.plugin.settings.port.toString())
          .onChange(async value => {
            this.plugin.settings.port = parseInt(value) || 3000;
            await this.plugin.saveSettings();
          })
      );

    /* ---- Paths ---- */
    new Setting(containerEl)
      .setName("Players Path")
      .setDesc("Folder containing player .md files")
      .addText(text =>
        text
          .setPlaceholder("Players")
          .setValue(this.plugin.settings.playersPath)
          .onChange(async value => {
            this.plugin.settings.playersPath = normalizePath(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Shop Path")
      .setDesc("Folder containing shop data")
      .addText(text =>
        text
          .setPlaceholder("Shop")
          .setValue(this.plugin.settings.shopPath)
          .onChange(async value => {
            this.plugin.settings.shopPath = normalizePath(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Lore Path")
      .setDesc("Folder containing lore data")
      .addText(text =>
        text
          .setPlaceholder("Lore")
          .setValue(this.plugin.settings.lorePath)
          .onChange(async value => {
            this.plugin.settings.lorePath = normalizePath(value);
            await this.plugin.saveSettings();
          })
      );

    /* ---- Server Access ---- */
    const port = this.plugin.settings.port || 3000;
    const localUrl = `http://localhost:${port}`;
    let lanUrl = "";

    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]!) {
        if (net.family === "IPv4" && !net.internal) {
          lanUrl = `http://${net.address}:${port}`;
          break;
        }
      }
      if (lanUrl) break;
    }

    containerEl.createEl("h3", { text: "Server Access" });
    new Setting(containerEl).setName("Local URL").setDesc(localUrl);
    if (lanUrl) {
      new Setting(containerEl).setName("LAN URL").setDesc(lanUrl);
    }

    const qrTarget = lanUrl || localUrl;
    QRCode.toDataURL(qrTarget).then(url => {
      const img = containerEl.createEl("img");
      img.src = url;
      img.style.maxWidth = "150px";
    });

    /* ---- Active Player ---- */
    new Setting(containerEl)
      .setName("Active Player")
      .setDesc("Select which character to load")
      .addDropdown(drop => {
        const playersFolder = this.plugin.app.vault.getAbstractFileByPath(
          this.plugin.settings.playersPath
        );
        if (playersFolder && playersFolder instanceof TFolder) {
          playersFolder.children.forEach(file => {
            if (file instanceof TFile && file.path.endsWith(".md")) {
              const charName = file.basename;
              drop.addOption(charName, charName);
            }
          });
        }
        drop
          .setValue(this.plugin.settings.activePlayer || "")
          .onChange(async value => {
            this.plugin.settings.activePlayer = value;
            await this.plugin.saveSettings();
            this.display();
          });
      });
  }
}
