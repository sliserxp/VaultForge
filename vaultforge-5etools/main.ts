/* ========================
   VaultForge-5eTools Plugin
   ======================== */

/* ---------- Imports ---------- */
import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  Modal,
  SuggestModal,
  MarkdownView,
} from "obsidian";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import * as fs from "fs";
import * as path from "path";
// @ts-ignore — esbuild inlines this
import wasmBinary from "sql.js/dist/sql-wasm.wasm";

/* ---------- Settings ---------- */
interface VaultForge5eToolsSettings {
  dbPath: string;
  dataPath: string;
  lastUpdated: string;
}

const DEFAULT_SETTINGS: VaultForge5eToolsSettings = {
  dbPath: "5etools.db",
  dataPath: "data",
  lastUpdated: "",
};

/* ========================
   Helpers
   ======================== */
function pluginPath(plugin: Plugin, fileName?: string): string {
  const vaultPath = (plugin.app.vault.adapter as any).basePath;
  // @ts-ignore
  const relDir = plugin.manifest.dir;
  const absDir = path.join(vaultPath, relDir);
  return fileName ? path.join(absDir, fileName) : absDir;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function safeTableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

function walkJsonFiles(dir: string, fileList: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkJsonFiles(fullPath, fileList);
    } else if (entry.endsWith(".json")) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function resolveTableName(file: string): string {
  const base = path.basename(file, ".json");
  const parent = path.basename(path.dirname(file));

  if (parent === "data") {
    if (base.includes("item")) return "items";
    if (base.includes("spell")) return "spells";
    if (base.includes("bestiary")) return "bestiary";
    if (base.includes("class")) return "classes";
    if (base.includes("adventure")) return "adventure";
    if (base.includes("book")) return "book";
    if (base.includes("race")) return "races";
    return base;
  }
  return parent;
}

/* ========================
   Normalization Helpers
   ======================== */
function stripTags(text: string): string {
  return text.replace(/\{@[^} ]+ ([^}]+)\}/g, "$1");
}

function flattenEntries(entries: any[]): string {
  const result: string[] = [];
  for (const e of entries || []) {
    if (typeof e === "string") result.push(stripTags(e));
    else if (typeof e === "object" && e.entries) result.push(flattenEntries(e.entries));
    else if (e?.name) result.push(stripTags(e.name));
  }
  return result.join(" ");
}

function scoreEntry(entry: any): number {
  let score = 0;
  const rarityMap: Record<string, number> = {
    common: 5,
    uncommon: 15,
    rare: 30,
    "very rare": 50,
    legendary: 75,
    artifact: 90,
  };
  score += rarityMap[(entry.rarity || "").toLowerCase()] || 0;

  const desc = (entry.description || "").toLowerCase();
  if (desc.includes("+1 to attack")) score += 10;
  if (desc.includes("+2 to attack")) score += 20;
  if (desc.includes("resistance")) score += 8;
  if (desc.includes("immune")) score += 20;
  if (desc.includes("flight") || desc.includes("fly speed")) score += 15;
  if (desc.includes("invisible")) score += 15;
  if (desc.includes("teleport")) score += 15;
  if (desc.includes("advantage")) score += 5;
  if (desc.includes("at will")) score += 10;

  return Math.max(1, Math.min(score, 100));
}

function buildRequirements(raw: any, kind: string): string | null {
  const reqs: string[] = [];

  if (kind === "Feat" && raw.prerequisite) {
    for (const req of raw.prerequisite) {
      if (req.ability) {
        for (const ab of req.ability) {
          for (const ability in ab) {
            reqs.push(`${ability.toUpperCase()} ${ab[ability]}+`);
          }
        }
      }
      if (req.race) {
        const races = Array.isArray(req.race) ? req.race : [req.race];
        const names = races.map((r: any) =>
          typeof r === "string" ? r : `${r.name}${r.subrace ? " (" + r.subrace + ")" : ""}`
        );
        reqs.push("Race: " + names.join(", "));
      }
      if (req.feat) reqs.push("Feat: " + req.feat);
      if (req.class) reqs.push(`${req.class.name} level ${req.class.level || 1}+`);
    }
  }

  if (kind === "ClassFeature") {
    if (raw.class) reqs.push(`${raw.class} level ${raw.level || 1}+`);
    if (raw.subclass) reqs.push(`${raw.subclass} subclass, level ${raw.level || 1}+`);
  }

  if (kind === "Spell") {
    if (raw.level !== undefined) reqs.push(`Spell level ${raw.level}`);
    if (raw.classes) {
      const names = raw.classes.map((c: any) => (c.name ? c.name : c));
      reqs.push("Available to: " + names.join(", "));
    }
  }

  if (raw.reqAttune) reqs.push("Attunement: " + raw.reqAttune);

  return reqs.length ? reqs.join("; ") : null;
}

export function normalizeAny(raw: any) {
  if (!raw || !raw.name) return null;

  let kind = "Unknown";
  if (raw.rarity || raw.reqAttune || raw.weight !== undefined) {
    kind = "Item";
  } else if (raw.prerequisite) {
    kind = "Feat";
  } else if (raw.level !== undefined && raw.school) {
    kind = "Spell";
  } else if (raw.class || raw.subclass) {
    kind = "ClassFeature";
  } else if (raw.entries && !raw.rarity && !raw.level) {
    kind = "MonsterTrait";
  }

  const normalized: any = {
    raw,
    name: raw.name,
    type: kind,
    rarity: raw.rarity || "Common",
    source: raw.source || "Unknown",
    description: flattenEntries(
      Array.isArray(raw.entries)
        ? raw.entries
        : Array.isArray(raw.desc)
        ? raw.desc
        : []
    ),
    requirements: buildRequirements(raw, kind),
    weight: raw.weight ?? null,
    attunement: raw.reqAttune ?? null,
    level: raw.level ?? null,
    school: raw.school ?? null,
    // Tags for categorization/search (prefer explicit tags, fall back to type/subtype)
    tags: (() => {
      const t = raw.tags ?? raw.type ?? raw.subtype ?? [];
      return Array.isArray(t) ? t : [t];
    })(),
  };

  normalized.strength = scoreEntry(normalized);
  if (kind === "Item") {
    normalized.value = raw.value ? Number(raw.value) / 100 : normalized.strength * 100;
  } else if (kind === "Spell") {
    normalized.value = normalized.strength * 50;
  } else if (kind === "ClassFeature") {
    normalized.value = normalized.strength * 75;
  } else {
    normalized.value = normalized.strength * 50;
  }

  return normalized;
}

/* ========================
   Database Layer
   ======================== */
let db: Database | null = null;

async function initDb() {
  const SQL = await initSqlJs({ wasmBinary });
  return SQL;
}

export async function loadDatabase(dbPath: string, force: boolean = false): Promise<Database> {
  console.log(`[VaultForge-5eTools] Attempting to load DB: ${dbPath}`);
  if (db && !force) return db;
  const SQL = await initDb();
  const fileBuffer = fs.readFileSync(dbPath);
  db = new SQL.Database(fileBuffer);
  console.log(`[VaultForge-5eTools] ✅ DB loaded successfully`);
  return db;
}

export async function buildDatabase(dataPath: string, dbPath: string) {
  console.log(`[VaultForge-5eTools] Starting DB build...`);
  console.log(`[VaultForge-5eTools] dataPath = ${dataPath}`);

  if (!fs.existsSync(dataPath)) throw new Error(`Data folder not found: ${dataPath}`);

  const files = walkJsonFiles(dataPath);
  console.log(`[VaultForge-5eTools] Found ${files.length} JSON files`);

  const SQL = await initDb();
  const newDb = new SQL.Database();

  let processed = 0;
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
      let tableName = safeTableName(resolveTableName(file));

      newDb.run(`CREATE TABLE IF NOT EXISTS ${tableName} (data TEXT)`);

      const rows = Array.isArray(raw)
        ? raw
        : Object.values(raw).find(v => Array.isArray(v)) || [];

      for (const row of rows as any[]) {
        const normalized = normalizeAny(row);
        if (!normalized) continue;
        newDb.run(`INSERT INTO ${tableName} VALUES (?)`, [JSON.stringify(normalized)]);
      }

      processed++;
      if (processed % 25 === 0) {
        console.log(`[VaultForge-5eTools] Imported ${processed}/${files.length}`);
      }
    } catch (e) {
      console.error(`[VaultForge-5eTools] Failed to import ${file}:`, e);
    }
  }

  const buffer = Buffer.from(newDb.export());
  fs.writeFileSync(dbPath, buffer);
  console.log(`[VaultForge-5eTools] ✅ DB built at ${dbPath}`);
  return newDb;
}

export function indexTable(db: Database, table: string): any[] {
  const stmt = db.prepare(`SELECT data FROM ${table}`);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(JSON.parse(stmt.getAsObject().data as string));
  }
  stmt.free();
  return rows;
}

// Append a single JSON-normalized object into a table and persist the DB file.
// This helper enables runtime additions (e.g., adding shop items/tags from UI).
export async function appendToDatabase(table: string, obj: any, dbPath: string) {
  const SQL = await initDb();
  let localDb: Database;
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    localDb = new SQL.Database(buf);
  } else {
    localDb = new SQL.Database();
  }

  try {
    // Ensure table exists and insert
    localDb.run(`CREATE TABLE IF NOT EXISTS ${table} (data TEXT)`);
    localDb.run(`INSERT INTO ${table} VALUES (?)`, [JSON.stringify(obj)]);

    // Persist back to disk
    const out = Buffer.from(localDb.export());
    fs.writeFileSync(dbPath, out);
  } catch (e) {
    console.error("[VaultForge-5eTools] appendToDatabase failed:", e);
    throw e;
  }
}

async function rebuildDatabase(plugin: VaultForge5eTools) {
  const dbPath = pluginPath(plugin, plugin.settings.dbPath);
  const dataPath = pluginPath(plugin, plugin.settings.dataPath);

  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    db = await buildDatabase(dataPath, dbPath);
    db = await loadDatabase(dbPath);
    new Notice("✅ 5eTools DB rebuilt");
  } catch (err) {
    console.error("[VaultForge-5eTools] Rebuild failed:", err);
    new Notice("❌ Failed to rebuild DB. Check console.");
  }
}

/* ========================
   Search API
   ======================== */
export async function search(
  query: string,
  type: "spells" | "items" | "monsters" | "races" | "classes" | "all" = "all"
): Promise<any[]> {
  if (!db) throw new Error("Database not loaded.");

  const q = normalizeName(query);
  const results: any[] = [];
  const tables =
    type === "all"
      ? ["spells", "items", "bestiary", "races", "classes", "feats"]
      : [type];

  for (const t of tables) {
    try {
      const rows = indexTable(db!, t);
      for (const row of rows) {
        if (row.name && normalizeName(row.name).includes(q)) {
          results.push({ type: t, ...row });
        }
      }
    } catch {
      console.warn(`[VaultForge-5eTools] No table for ${t}`);
    }
  }
  return results;
}

/* ========================
   UI Modals
   ======================== */
class SearchModal extends SuggestModal<string> {
  getSuggestions(query: string): string[] {
    if (!query) return [];
    return [query];
  }
  renderSuggestion(value: string, el: HTMLElement) {
    el.createEl("div", { text: `Search for: ${value}` });
  }
  async onChooseItem(query: string) { await this.runSearch(query); }
  async onChooseSuggestion(query: string) { await this.runSearch(query); }
  private async runSearch(query: string) {
    console.log("➡ Searching:", query);
    try {
      const results = await search(query, "all");
      if (!results.length) return new Notice(`No results for "${query}"`);
      new ResultsModal(this.app, results).open();
    } catch (err) {
      console.error("❌ Search failed:", err);
      new Notice("Search failed, check console.");
    }
  }
}

class ResultsModal extends SuggestModal<any> {
  results: any[];
  constructor(app: App, results: any[]) {
    super(app);
    this.results = results;
  }
  getSuggestions(): any[] { return this.results; }
  renderSuggestion(item: any, el: HTMLElement) {
    el.createEl("div", { text: `${item.type}: ${item.name} (${item.source || "?"})` });
  }
  async onChooseItem(item: any) { this.showPreview(item); }
  async onChooseSuggestion(item: any) { this.showPreview(item); }
  private showPreview(item: any) {
    new PreviewModal(this.app, item).open();
  }
}

class PreviewModal extends Modal {
  item: any;
  formatted: string;
  constructor(app: App, item: any) {
    super(app);
    this.item = item;
    this.formatted = this.formatEntry();
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.item.name });
    const pre = contentEl.createEl("pre", { text: this.formatted });
    (pre.style as any).whiteSpace = "pre-wrap";
    const btnBar = contentEl.createEl("div", { attr: { style: "display:flex; gap:8px; margin-top:12px;" } });
    const copyBtn = btnBar.createEl("button", { text: "Copy to Clipboard" });
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(this.formatted);
      new Notice(`Copied ${this.item.name} to clipboard`);
    });
    const insertBtn = btnBar.createEl("button", { text: "Insert into Note" });
    insertBtn.addEventListener("click", () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view) {
        view.editor.replaceSelection(this.formatted + "\n");
        new Notice(`Inserted ${this.item.name} into note`);
      } else {
        new Notice("❌ No active note to insert into");
      }
    });
  }
  onClose() {
    this.contentEl.empty();
  }
  private formatEntry(): string {
    const lines: string[] = [];
    if (this.item.description) lines.push(this.item.description);
    const meta = [
      ["Type", this.item.type],
      ["Rarity", this.item.rarity],
      ["Source", this.item.source],
      ["Requirements", this.item.requirements],
      ["Weight", this.item.weight],
      ["Attunement", this.item.attunement],
      ["Level", this.item.level],
      ["School", this.item.school],
      ["Strength", this.item.strength],
      ["Value", this.item.value],
    ];
    for (const [label, val] of meta) {
      if (val) lines.push(`**${label}:** ${val}`);
    }
    return `### ${this.item.name}\n\n${lines.join("\n\n")}\n`;
  }
}

/* ========================
   Main Plugin
   ======================== */
export default class VaultForge5eTools extends Plugin {
  settings: VaultForge5eToolsSettings;
  async onload() {
    console.log("[VaultForge-5eTools] loaded ✅");
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new VaultForge5eToolsSettingTab(this.app, this));

    const dbPath = pluginPath(this, this.settings.dbPath);
    const dataPath = pluginPath(this, this.settings.dataPath);

    try {
      if (!fs.existsSync(dbPath)) {
        console.log("[VaultForge-5eTools] No DB found — building fresh...");
        db = await buildDatabase(dataPath, dbPath);
      } else {
        db = await loadDatabase(dbPath);
      }
    } catch (err) {
      console.error("Failed to init DB:", err);
      new Notice("VaultForge-5eTools failed to init DB.");
    }
    
    // Expose a lightweight API for other plugins (e.g., vaultforge-player) to read/modify tables.
    // Usage from another plugin: const vf = (app as any).vaultforge5etools; vf?.getTable('items')
    (this.app as any).vaultforge5etools = {
      getTable: (table: string) => (db ? indexTable(db, table) : []),
      searchName: (q: string, type: string = "all") => search(q, type as any),
      appendToDatabase: async (table: string, obj: any) => {
        try {
          const p = pluginPath(this, this.settings.dbPath);
          await appendToDatabase(table, obj, p);
          // reload in-memory DB (force reload to pick up appended row)
          db = await loadDatabase(p, true);
          return { success: true };
        } catch (e) {
          console.error("[VaultForge-5eTools] appendToDatabase failed via API:", e);
          return { success: false, error: String(e) };
        }
      },
    };

    this.addCommand({
      id: "5etools-search",
      name: "Search 5eTools",
      checkCallback: (checking) => {
        if (checking) return true;
        new SearchModal(this.app).open();
      },
    });
  }
  onunload() { console.log("[VaultForge-5eTools] stopped ❌"); }
}

/* ========================
   Settings Tab
   ======================== */
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
      .setDesc("SQLite DB file")
      .addText(text => text.setValue(this.plugin.settings.dbPath).onChange(async val => {
        this.plugin.settings.dbPath = val;
        await this.plugin.saveData(this.plugin.settings);
      }));

    new Setting(containerEl)
      .setName("Data Path")
      .setDesc("Folder with 5e.tools repo")
      .addText(text => text.setValue(this.plugin.settings.dataPath).onChange(async val => {
        this.plugin.settings.dataPath = val;
        await this.plugin.saveData(this.plugin.settings);
      }));

    new Setting(containerEl)
      .setName("Rebuild Database")
      .setDesc("Delete and rebuild the 5eTools DB.")
      .addButton(button =>
        button.setButtonText("Rebuild Now").setCta().onClick(async () => {
          await rebuildDatabase(this.plugin);
        })
      );
  }
}

