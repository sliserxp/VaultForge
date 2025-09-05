/* ========================
   VaultForge-5eTools Plugin
   ======================== */
import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
} from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { searchDb } from "./utils/search";
import { buildDatabase as buildWithSqlJs } from "./utils/importer";
import { update5eDatabase } from "./utils/updater";

interface VaultForge5eToolsSettings {
  dbPath: string;
  dataPath: string;       // local JSON folder
  lastUpdated: string;
}

const DEFAULT_SETTINGS: VaultForge5eToolsSettings = {
  dbPath: "5etools.db",
  dataPath: "",
  lastUpdated: "",
};

/* ---------- Main Plugin ---------- */
export default class VaultForge5eTools extends Plugin {
  settings: VaultForge5eToolsSettings;

  async onload() {
    console.log("[VaultForge-5eTools] loaded ✅");
    await this.loadSettings();

    const dbPath = path.join(this.manifest.dir, this.settings.dbPath);

    // Ensure DB exists
    if (!fs.existsSync(dbPath)) {
      new Notice("5eTools DB missing. Build or update it via settings.");
    }

    // Command: Test SQL.js
    this.addCommand({
      id: "test-sqljs",
      name: "Test SQL.js (SELECT 1+1)",
      callback: async () => {
        try {
          const { openDatabase } = await import("./utils/db");
          const db = await openDatabase(":memory:", this.manifest.dir); // ✅ pass pluginDir
          const res = db.exec("SELECT 1+1 AS result");
          console.log("[VaultForge-5eTools] SQL.js test result:", res);
          new Notice("SQL.js loaded ✅ (check console for result)");
        } catch (e) {
          console.error("[VaultForge-5eTools] SQL.js test failed ❌", e);
          new Notice("SQL.js failed ❌ (see console)");
        }
      },
    });

    // Command: Search DB
    this.addCommand({
      id: "search-5etools-db",
      name: "Search 5eTools DB (example: Fireball)",
      callback: async () => {
        const results = await searchDb(dbPath, this.manifest.dir, "fireball"); // ✅ pass pluginDir
        if (results.length) {
          new Notice(`Found: ${results[0].name}`);
          console.log(results[0]);
        } else {
          new Notice("No match ❌");
        }
      },
    });

    // Command: Update DB (remote)
    this.addCommand({
      id: "update-5etools-db",
      name: "Update 5eTools Database (remote)",
      callback: async () => {
        await this.updateDatabase(dbPath);
      },
    });

    // Command: Build DB (local JSON)
    this.addCommand({
      id: "build-5etools-db-local",
      name: "Build 5eTools Database (local JSON)",
      callback: async () => {
        await this.buildDatabase(dbPath);
      },
    });

    // Settings
    this.addSettingTab(new VaultForge5eToolsSettingTab(this.app, this));
  }

  onunload() {
    console.log("[VaultForge-5eTools] stopped ❌");
  }

  /* ---------- Remote Update ---------- */
  async updateDatabase(dbPath: string) {
    try {
      await update5eDatabase(this.manifest.dir, dbPath);
      this.settings.lastUpdated = new Date().toISOString();
      await this.saveSettings();
      new Notice("5eTools DB updated ✅");
    } catch (e) {
      console.error("[VaultForge-5eTools] Update failed ❌", e);
      new Notice("Failed to update 5eTools DB ❌");
    }
  }

  /* ---------- Local Build (sql.js) ---------- */
  async buildDatabase(dbPath: string) {
    try {
      if (!this.settings.dataPath) {
        new Notice("No data folder set ❌");
        return;
      }

      await buildWithSqlJs(this.settings.dataPath, dbPath, this.manifest.dir); // ✅ pass pluginDir

      this.settings.lastUpdated = new Date().toISOString();
      await this.saveSettings();

      new Notice("Local 5eTools DB built ✅");
    } catch (e) {
      console.error("[VaultForge-5eTools] Local build failed ❌", e);
      new Notice("Failed to build local DB ❌");
    }
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

/* ---------- Settings Tab ---------- */
class VaultForge5eToolsSettingTab extends PluginSettingTab {
  plugin: VaultForge5eTools;

  constructor(app: App, plugin: VaultForge5eTools) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "VaultForge-5eTools Settings" });

    new Setting(containerEl)
      .setName("Database Path")
      .setDesc("Path to 5eTools SQLite DB")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.dbPath)
          .onChange(async (value) => {
            this.plugin.settings.dbPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Data Folder Path")
      .setDesc("Folder containing 5eTools JSON data (items, spells, monsters, etc.)")
      .addText((text) =>
        text
          .setPlaceholder("/path/to/5etools-data")
          .setValue(this.plugin.settings.dataPath)
          .onChange(async (value) => {
            this.plugin.settings.dataPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Last Updated")
      .setDesc("When the DB was last rebuilt")
      .addText((text) =>
        text.setValue(this.plugin.settings.lastUpdated || "Never")
          .setDisabled(true)
      );

    new Setting(containerEl)
      .setName("Update DB (remote)")
      .setDesc("Download + rebuild the 5eTools database from GitHub/remote")
      .addButton((btn) =>
        btn
          .setButtonText("Update Now")
          .onClick(async () => {
            const dbPath = path.join(this.plugin.manifest.dir, this.plugin.settings.dbPath);
            await this.plugin.updateDatabase(dbPath);
          })
      );

    new Setting(containerEl)
      .setName("Build DB (local)")
      .setDesc("Build the SQLite DB from your local 5eTools JSON files")
      .addButton((btn) =>
        btn
          .setButtonText("Build Now")
          .onClick(async () => {
            const dbPath = path.join(this.plugin.manifest.dir, this.plugin.settings.dbPath);
            await this.plugin.buildDatabase(dbPath);
          })
      );
  }
}
