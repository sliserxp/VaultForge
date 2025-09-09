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

        const data = parseYaml(yamlMatch[1]);
        res.json(data);
      } catch (err) {
        console.error("[VaultForge-Player] Error reading player:", err);
        res.status(500).json({ error: "Failed to load player" });
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
