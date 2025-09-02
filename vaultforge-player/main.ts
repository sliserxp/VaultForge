/* ========================
   VaultForge-Player Plugin
   ======================== */
import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  Notice,
  parseYaml,
  stringifyYaml,
  normalizePath
} from "obsidian";
import QRCode from "qrcode";
import os from "os";
import express from "express";
import { join } from "path";

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
  if (profLevel === "expertise") return mod + (proficiencyBonus * 2);
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

/* ---------- Skill Ability Map ---------- */
const SKILLS: Record<string, string> = {
  acrobatics: "dexterity",
  animal_handling: "wisdom",
  arcana: "intelligence",
  athletics: "strength",
  deception: "charisma",
  history: "intelligence",
  insight: "wisdom",
  intimidation: "charisma",
  investigation: "intelligence",
  medicine: "wisdom",
  nature: "intelligence",
  perception: "wisdom",
  performance: "charisma",
  persuasion: "charisma",
  religion: "intelligence",
  sleight_of_hand: "dexterity",
  stealth: "dexterity",
  survival: "wisdom",
};

/* ---------- Plugin ---------- */
export default class VaultForgePlayer extends Plugin {
  settings: VaultForgePlayerSettings;
  server: any;

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
    
// List players
app.get("/api/players", async (req, res) => {
  try {
    const folderPath = this.settings.playersPath || "Players";
    const folder = this.app.vault.getAbstractFileByPath(folderPath);

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

// Get one player’s data
app.get("/api/player/:name", async (req, res) => {
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

    // Ensure index.html fallback
    app.get("/", (req, res) => {
      res.sendFile(join(distPath, "index.html"));
    });

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
          .onChange(async (value) => {
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
          .onChange(async (value) => {
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
          .onChange(async (value) => {
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
          .onChange(async (value) => {
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
        const playersFolder = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.playersPath);
        if (playersFolder && "children" in playersFolder) {
          playersFolder.children.forEach(file => {
            if (file instanceof TFile && file.path.endsWith(".md")) {
              const charName = file.basename;
              drop.addOption(charName, charName);
            }
          });
        }
        drop.setValue(this.plugin.settings.activePlayer || "")
          .onChange(async (value) => {
            this.plugin.settings.activePlayer = value;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    /* ---- Skills Section ---- */
    if (this.plugin.settings.activePlayer) {
      const filePath = `${this.plugin.settings.playersPath}/${this.plugin.settings.activePlayer}.md`;
      const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        this.plugin.app.vault.read(file).then(content => {
          const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (!yamlMatch) return;
          const data = parseYaml(yamlMatch[1]);

          const profBonus = data.proficiency_bonus ?? 2;
          containerEl.createEl("h3", { text: "Skills" });

          Object.entries(SKILLS).forEach(([skill, ability]) => {
            const abilityScore = data.abilities?.[ability] ?? 10;
            const level: ProficiencyLevel = data.skills?.[skill] ?? "none";
            const score = skillModifier(abilityScore, profBonus, level);

            new Setting(containerEl)
              .setName(`${skill.charAt(0).toUpperCase() + skill.slice(1)} (${score >= 0 ? "+" : ""}${score})`)
              .setDesc(`Based on ${ability.toUpperCase()}`)
              .addDropdown(drop => {
                drop.addOption("none", "None");
                drop.addOption("proficient", "Proficient");
                drop.addOption("expertise", "Expertise");
                drop.setValue(level);
                drop.onChange(async (val: ProficiencyLevel) => {
                  data.skills[skill] = val;
                  const newYaml = "---\n" + stringifyYaml(data) + "---";
                  const newContent = content.replace(/^---\n([\s\S]*?)\n---/, newYaml);
                  await this.plugin.app.vault.modify(file, newContent);
                  this.display();
                });
              });
          });
        }).catch(err => {
          new Notice("Failed to read player file");
          console.error(err);
        });
      }
    }
  }
}

