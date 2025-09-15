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
import * as fs from "fs";
import * as path from "path";


/* ---------- Settings ---------- */
interface VaultForge5eToolsSettings {
  dbPath: string;
  dataPath: string;
  lastUpdated: string;
}

const DEFAULT_SETTINGS: VaultForge5eToolsSettings = {
  dbPath: "5etools.db",
  dataPath: "data",
  lastUpdated: "", // checked
};

/* ========================
   Helpers
   ======================== */
function pluginPath(plugin: Plugin, fileName?: string): string {
  const vaultPath = (plugin.app.vault.adapter as any).basePath;
  // @ts-ignore
  const relDir = plugin.manifest.dir;
  const absDir = path.join(String(vaultPath), String(relDir));
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

import { normalizeAny, ensureNormalized, deepMergeRaw } from "./vf-normalize";
import { VF_MAPS } from "./vf-maps";

async function readTableFromData(dataPath: string, table: string): Promise<any[]> {
  const results: any[] = [];
  if (!fs.existsSync(dataPath)) return results;

  // Resolve category aliases (allow callers to pass 'monsters' or 'bestiary' etc.)
  const resolved = (VF_MAPS.categoryAliases as any)?.[table] ?? (table === "monsters" ? "bestiary" : table);
  const desired = resolved;

  // Determine files to read. Prefer index.json files inside category folders when available.
  const filesToRead: string[] = [];

  try {
    // Use preferred index path if configured for this category
    const prefIndex = (VF_MAPS.preferredIndexPaths as any)?.[resolved];
    if (prefIndex) {
      const idxPath = path.join(dataPath, prefIndex);
      if (fs.existsSync(idxPath)) {
        const idx = JSON.parse(fs.readFileSync(idxPath, "utf-8"));
        const unique = Array.from(new Set(Object.values(idx)));
        for (const fn of unique) {
          if (String(fn).toLowerCase().includes("foundry")) continue; // exclude foundry variants
          filesToRead.push(path.join(path.dirname(idxPath), String(fn)));
        }
      }
    }

    // Fall back to known folder index patterns
    if (resolved === "spells") {
      const idxPath = path.join(dataPath, "spells", "index.json");
      if (fs.existsSync(idxPath)) {
        const idx = JSON.parse(fs.readFileSync(idxPath, "utf-8"));
        const unique = Array.from(new Set(Object.values(idx)));
        for (const fn of unique) {
          if (String(fn).toLowerCase().includes("foundry")) continue;
          filesToRead.push(path.join(dataPath, "spells", String(fn)));
        }
      }
    }

    if (resolved === "bestiary") {
      const idxPath = path.join(dataPath, "bestiary", "index.json");
      if (fs.existsSync(idxPath)) {
        const idx = JSON.parse(fs.readFileSync(idxPath, "utf-8"));
        const unique = Array.from(new Set(Object.values(idx)));
        for (const fn of unique) {
          if (String(fn).toLowerCase().includes("foundry")) continue;
          filesToRead.push(path.join(dataPath, "bestiary", String(fn)));
        }
      }
    }

    if (resolved === "classes" || resolved === "class") {
      const idxPath = path.join(dataPath, "class", "index.json");
      if (fs.existsSync(idxPath)) {
        const idx = JSON.parse(fs.readFileSync(idxPath, "utf-8"));
        const unique = Array.from(new Set(Object.values(idx)));
        for (const fn of unique) {
          if (String(fn).toLowerCase().includes("foundry")) continue;
          filesToRead.push(path.join(dataPath, "class", String(fn)));
        }
      }
    }

    // Items: include common item files (base, canonical and fluff) but skip foundry files
    if (resolved === "items") {
      const candidates = ["items-base.json", "items.json", "fluff-items.json", "items.json"];
      for (const c of candidates) {
        const itemsPath = path.join(dataPath, c);
        if (fs.existsSync(itemsPath) && !path.basename(itemsPath).toLowerCase().startsWith("foundry")) filesToRead.push(itemsPath);
      }
    }
  } catch (e) {
    // If index parsing fails, fall back to full-scan below
    console.warn("[VaultForge-5eTools] failed to read index file:", e);
  }

  // If we didn't collect files from index, fall back to scanning all JSON files
  if (!filesToRead.length) {
    const all = walkJsonFiles(dataPath);
    for (const f of all) {
      if (safeTableName(resolveTableName(f)) === desired) {
        const bn = path.basename(f).toLowerCase();
        if (bn.startsWith("foundry") || bn.includes("foundry-") || bn.includes("foundry")) continue;
        filesToRead.push(f);
      }
    }
  }

  // Read and normalize rows from each selected file — build a UID map and deep-merge raws across files
  const uidMap: Record<string, { raw: any; files: string[] }> = {};

  for (const file of filesToRead) {
    try {
      if (!fs.existsSync(file)) continue;
      const rawFile = JSON.parse(fs.readFileSync(file, "utf-8"));

      // Prefer category-specific keys for better results
      let rows: any[] = [];
      if (desired === "spells") rows = rawFile.spell ?? rawFile.spells ?? (Array.isArray(rawFile) ? rawFile : []);
      else if (desired === "bestiary") rows = rawFile.monster ?? rawFile.monsters ?? (Array.isArray(rawFile) ? rawFile : []);
      else if (desired === "items") rows = rawFile.item ?? rawFile.items ?? (Array.isArray(rawFile) ? rawFile : []);
      else rows = Array.isArray(rawFile) ? rawFile : Object.values(rawFile).find(v => Array.isArray(v)) || [];

      for (const r of rows as any[]) {
        (r as any).__table = desired;
        (r as any).__file = path.relative(dataPath, file);

        const src = (r as any).source || "Unknown";
        const name = (r as any).name || (r as any).title || null;
        if (!name) continue;
        const uid = `${name}|${src}`;

        if (!uidMap[uid]) {
          uidMap[uid] = { raw: JSON.parse(JSON.stringify(r)), files: [path.relative(dataPath, file)] };
        } else {
          uidMap[uid].raw = deepMergeRaw(uidMap[uid].raw, r);
          const rel = path.relative(dataPath, file);
          if (!uidMap[uid].files.includes(rel)) uidMap[uid].files.push(rel);
        }
      }
    } catch (e) {
      console.warn("[VaultForge-5eTools] failed to read file", file, e);
    }
  }

  // Normalize merged raws and emit results
  for (const uid of Object.keys(uidMap)) {
    try {
      const mergedRaw = uidMap[uid].raw;
      mergedRaw.__file = uidMap[uid].files.join(",");

      const norm = normalizeAny(mergedRaw);
      if (!norm) continue;
      norm.uid = uid;
      norm.file = mergedRaw.__file;

      results.push(norm);

      // Emit subraces (merged) as separate entries
      try {
        if (desired === 'races' && mergedRaw && mergedRaw.subraces) {
          const srs = Array.isArray(mergedRaw.subraces) ? mergedRaw.subraces : Array.isArray(mergedRaw.subrace) ? mergedRaw.subrace : [];
          for (const sr of srs) {
            const srName = typeof sr === 'string' ? sr : (sr && sr.name) || null;
            const srSource = (sr && sr.source) || mergedRaw.source || 'Unknown';
            if (!srName) continue;
            const rawSub: any = deepMergeRaw(mergedRaw, Object.assign({}, mergedRaw, { name: srName, source: srSource }));
            rawSub.__file = mergedRaw.__file;
            const normSub = normalizeAny(rawSub);
            if (!normSub) continue;
            normSub.uid = `${normSub.name}|${normSub.source || srSource}`;
            normSub.file = rawSub.__file;
            normSub.parent = norm.name;
            results.push(normSub);
          }
        }
      } catch (e) {
        // ignore subrace processing errors
      }

      // Emit subclasses (merged) as separate entries
      try {
        if (desired === 'classes' && mergedRaw && (mergedRaw.subclasses || mergedRaw.subclass)) {
          const subs = Array.isArray(mergedRaw.subclasses) ? mergedRaw.subclasses : Array.isArray(mergedRaw.subclass) ? mergedRaw.subclass : [];
          for (const sc of subs) {
            const scName = typeof sc === 'string' ? sc : (sc && (sc.name ?? sc.subclass)) || null;
            const scSource = (sc && sc.source) || mergedRaw.source || 'Unknown';
            if (!scName) continue;
            const rawSub: any = deepMergeRaw(mergedRaw, Object.assign({}, mergedRaw, { name: scName, source: scSource }));
            rawSub.__file = mergedRaw.__file;
            const normSub = normalizeAny(rawSub);
            if (!normSub) continue;
            normSub.uid = `${normSub.name}|${normSub.source || scSource}`;
            normSub.file = rawSub.__file;
            normSub.parent = norm.name;
            results.push(normSub);
          }
        }
      } catch (e) {
        // ignore subclass processing errors
      }

    } catch (e) {
      console.warn("[VaultForge-5eTools] failed to normalize merged uid", uid, e);
    }
  }

  return results;
}
async function buildMasterIndex(dataPath: string, outPath?: string) {
  const cats = ['items','spells','classes','races','backgrounds','feats','monsters','vehicles','optionalFeatures','variantRules','conditionsDiseases','traps','hazards','tables','cults','deities','psionics','maneuvers','invocations','adventures','books','languages','skills','loot','generated'];
  const index: any = {};
  for (const cat of cats) {
    index[cat] = {};
    const qcat = cat === 'monsters' ? 'bestiary' : (cat === 'classes' ? 'classes' : cat);
    const rows = await readTableFromData(dataPath, qcat);
    for (const r of rows) {
      if (!r.uid) continue;
      index[cat][r.uid] = { category: qcat === 'classes' ? 'class' : qcat, file: r.file || '' };

      // For classes, also index subclasses if present on the raw object
      try {
        if (cat === 'classes' && r.raw) {
          const subs = r.raw.subclasses ?? r.raw.subclass ?? null;
          if (Array.isArray(subs)) {
            for (const sc of subs) {
              const scName = typeof sc === 'string' ? sc : (sc && (sc.name ?? sc.subclass)) || null;
              const scSource = (sc && sc.source) || r.source || 'Unknown';
              if (scName) {
                const scUid = `${scName}|${scSource}`;
                index[cat][scUid] = { category: 'class', file: r.file || '' };
              }
            }
          }
        }
      } catch (e) {
        // ignore subclass indexing errors
      }

      // For races, also index subraces if present on the raw object
      try {
        if (cat === 'races' && r.raw) {
          const srs = r.raw.subraces ?? r.raw.subrace ?? null;
          if (Array.isArray(srs)) {
            for (const sr of srs) {
              const srName = typeof sr === 'string' ? sr : (sr && sr.name) || null;
              const srSource = (sr && sr.source) || r.source || 'Unknown';
              if (srName) {
                const srUid = `${srName}|${srSource}`;
                index[cat][srUid] = { category: 'races', file: r.file || '' };
              }
            }
          }
        }
      } catch (e) {
        // ignore subrace indexing errors
      }
    }
  }
  if (outPath) {
    const dir = path.dirname(outPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(index, null, 2));
  }
  return index;
}
const dataCache: Record<string, any[]> = {};

// File-mode only — legacy SQL functions removed. Use the plugin API via (app as any).vaultforge5etools

export const fileMode = true;

async function rebuildDatabase(plugin: VaultForge5eTools) {
  // Rebuild not applicable in file-mode; inform user.
  new Notice("Rebuild not supported in file-mode. Use the /data folder directly.");
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
      const vf = (this.app as any).vaultforge5etools;
      let results = await vf.searchName(query, "all");
      results = results.map((r: any) => ensureNormalized(r));
      // Interleave results by category to avoid showing only one dominant type (e.g., spells)
      const grouped: Record<string, any[]> = {};
      for (const r of results) {
        const c = r.category ?? r.type ?? "unknown";
        if (!grouped[c]) grouped[c] = [];
        grouped[c].push(r);
      }
      const interleaved: any[] = [];
      let added = true;
      while (added && interleaved.length < 200) {
        added = false;
        for (const k of Object.keys(grouped)) {
          const arr = grouped[k];
          if (arr && arr.length) {
            interleaved.push(arr.shift() as any);
            added = true;
          }
        }
      }
      if (interleaved.length) results = interleaved;
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
  getSuggestions(query: string): any[] {
    if (!query) return this.results;
    const qn = normalizeName(query);
    const fieldToString = (val: any) => {
      if (val === null || val === undefined) return "";
      if (typeof val === "string") return val;
      if (typeof val === "number" || typeof val === "boolean") return String(val);
      if (Array.isArray(val)) return val.map(v => (typeof v === "string" ? v : JSON.stringify(v))).join(" ");
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    };

    return this.results.filter((r: any) => {
      if (!r) return false;
      if (r.__search && typeof r.__search === "string" && r.__search.includes(qn)) return true;
      if (r.parent && normalizeName(fieldToString(r.parent)).includes(qn)) return true;
      if (r.name && normalizeName(String(r.name)).includes(qn)) return true;
      if (r.raw && (r.raw as any).name && normalizeName(String((r.raw as any).name)).includes(qn)) return true;
      for (const f of VF_MAPS.searchFields) {
        let v = (r as any)[f];
        if (v === undefined && r.raw) v = (r.raw as any)[f];
        if (v === undefined) continue;
        if (normalizeName(fieldToString(v)).includes(qn)) return true;
      }
      return false;
    });
  }
  renderSuggestion(item: any, el: HTMLElement) {
    el.createEl("div", { text: `${item.category ?? item.type}: ${item.name} (${item.source || "?"})` });
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
    const copyForSheetBtn = btnBar.createEl("button", { text: "Copy for Sheet" });
    copyForSheetBtn.addEventListener("click", async () => {
      try {
        const api = (this.app as any).vaultforge5etools;
        // use uid when available, otherwise construct as name|source
        const uid = this.item.uid ?? `${this.item.name}|${this.item.source ?? "Unknown"}`;
        const payload = await api.exportForSheet(uid);
        if (!payload) {
          new Notice("Failed to build sheet payload");
          return;
        }
        await navigator.clipboard.writeText(JSON.stringify(payload));
        new Notice(`Copied ${this.item.name} JSON for sheet`);
      } catch (e) {
        console.error("Copy for sheet failed", e);
        new Notice("Failed to copy sheet payload (see console)");
      }
    });
  }
  onClose() {
    this.contentEl.empty();
  }
  private formatEntry(): string {
    const lines: string[] = [];
    if (this.item.description) lines.push(this.item.description);

    // Add explicit trait/race/class info where available
    if (this.item.traits && Array.isArray(this.item.traits) && this.item.traits.length) {
      lines.push("**Traits:** " + this.item.traits.join(", "));
    }
    if (this.item.race) lines.push("**Race:** " + this.item.race);
    if (this.item.creature_type) lines.push("**Creature Type:** " + this.item.creature_type);
    if (this.item.size) lines.push("**Size:** " + this.item.size);
    if (this.item.speed) lines.push("**Speed:** " + this.item.speed);

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

    // Show class/subclass if present on normalized object
    if ((this.item as any).class) lines.push("**Class:** " + (this.item as any).class);
    if ((this.item as any).subclass) lines.push("**Subclass:** " + (this.item as any).subclass);

    return `### ${this.item.name}\n\n${lines.join("\n\n")}\n`;
  }
}

/* ========================
   Main Plugin
   ======================== */
export default class VaultForge5eTools extends Plugin {
  settings!: VaultForge5eToolsSettings;
  async onload() {
    console.log("[VaultForge-5eTools] loaded ✅");
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new VaultForge5eToolsSettingTab(this.app, this));

    const dbPath = pluginPath(this, this.settings.dbPath);
    const dataPath = pluginPath(this, this.settings.dataPath);

    try {
      if (!fs.existsSync(dataPath)) {
        throw new Error("5eTools /data folder missing!");
      }
      // Using the raw /data folder on-disk. We'll read files directly instead of using SQL.
      console.log("[VaultForge-5eTools] Using raw /data folder at", dataPath);
    } catch (err) {
      console.error("Failed to access data folder:", err);
      new Notice("VaultForge-5eTools failed to access /data folder.");
    }
    
    // Expose a lightweight API for other plugins (e.g., vaultforge-player) to read/modify tables.
    // Usage from another plugin: const vf = (app as any).vaultforge5etools; await vf?.getTable('items')
    (this.app as any).vaultforge5etools = {
      masterIndex: null as any,
      buildMasterIndex: async () => {
        const dataPathAbs = pluginPath(this, this.settings.dataPath);
        const out = pluginPath(this, "cache/master-index.json");
        const idx = await buildMasterIndex(dataPathAbs, out);
        (this.app as any).vaultforge5etools.masterIndex = idx;
        return idx;
      },
      getTable: async (table: string) => {
        const dataPathAbs = pluginPath(this, this.settings.dataPath);
        if (!dataCache[table]) {
          dataCache[table] = await readTableFromData(dataPathAbs, table);
        }
        // Ensure every entry is normalized and has a strength
        dataCache[table] = dataCache[table].map((e: any) => ensureNormalized(e));
        return dataCache[table];
      },
      refreshCache: async (table?: string) => {
        const dataPathAbs = pluginPath(this, this.settings.dataPath);
        if (table) {
          dataCache[table] = await readTableFromData(dataPathAbs, table);
          return { success: true, table };
        } else {
          for (const k of Object.keys(dataCache)) delete dataCache[k];
          return { success: true };
        }
      },
      // Fast single-uid lookup using the master index (builds index when missing)
      getByUid: async (uid: string) => {
        const api = (this.app as any).vaultforge5etools;
        const idx = api.masterIndex ?? await api.buildMasterIndex();
        for (const cat of Object.keys(idx)) {
          if (idx[cat] && idx[cat][uid]) {
            const meta = idx[cat][uid];
            const dataPathAbs = pluginPath(this, this.settings.dataPath);
            const rows = await readTableFromData(dataPathAbs, meta.category === 'class' ? 'classes' : meta.category);
            const found = rows.find((r: any) => r.uid === uid);
            return found ? ensureNormalized(found) : null;
          }
        }
        return null;
      },
      searchName: async (q: string, type: string = "all") => {
        const dataPathAbs = pluginPath(this, this.settings.dataPath);
        const types = type === "all" ? ["spells", "items", "bestiary", "races", "classes", "feats"] : [type === "monsters" ? "bestiary" : type];
        let results: any[] = [];
        const qn = normalizeName(q);
        const isSingleToken = /^[a-z0-9]+$/.test(qn) && qn.length > 0;
        // Ensure helper to stringify fallback field values (kept for compatibility)
        const fieldToString = (val: any): string => {
          if (val === null || val === undefined) return "";
          if (typeof val === "string") return val;
          if (typeof val === "number" || typeof val === "boolean") return String(val);
          if (Array.isArray(val)) return val.map(v => (typeof v === "string" ? v : JSON.stringify(v))).join(" ");
          if (typeof val === "object") return JSON.stringify(val);
          return String(val);
        };
        for (const t of types) {
          const rawRows = dataCache[t] ?? (await readTableFromData(dataPathAbs, t));
          const rows = rawRows.map((r: any) => ensureNormalized(r));
          for (const row of rows) {
            // Fast path: use cached normalized search blob if present
            if (row.__search && typeof row.__search === "string") {
              if (!isSingleToken) {
                if (row.__search.includes(qn)) {
                  results.push({ category: t, ...row });
                  continue;
                }
              } else {
                const sTokens = (row.__search.match(/[a-z0-9]+/g) || []);
                if (sTokens.includes(qn)) {
                  results.push({ category: t, ...row });
                  continue;
                }
              }
            }
            // Check parent (for subraces/subclasses emitted as separate entries)
            if (row.parent) {
              const ptoken = normalizeName(fieldToString(row.parent));
              if (ptoken.includes(qn)) { results.push({ category: t, ...row }); continue; }
            }
            // Check name fields directly as extra fast path
            if (row.name && normalizeName(String(row.name)).includes(qn)) { results.push({ category: t, ...row }); continue; }
            if (row.raw && (row.raw as any).name && normalizeName(String((row.raw as any).name)).includes(qn)) { results.push({ category: t, ...row }); continue; }
            // Fallback: per-field checks using VF_MAPS.searchFields
            let matched = false;
            for (const field of VF_MAPS.searchFields) {
              let val = (row as any)[field];
              if (val === undefined && row.raw) val = (row.raw as any)[field];
              if (val === undefined) continue;
              const fv = normalizeName(fieldToString(val));
              if (fv.includes(qn)) {
                matched = true;
                break;
              }
            }
            if (matched) results.push({ category: t, ...row });
          }
        }
        // If the query is a single short token (e.g., 'elf'), require it to appear in primary fields
        if (isSingleToken) {
          const allowedCats = new Set(["races","bestiary","feats","classes"]);
          results = results.filter((r: any) => {
            const cat = String((r.category ?? r.type ?? "")).toLowerCase();
            if (!allowedCats.has(cat)) return false;
            const q = qn;
            // exact name match
            if (r.name && normalizeName(String(r.name)) === q) return true;
            // race exact
            if (r.race && normalizeName(String(r.race)) === q) return true;
            // parent (subrace/subclass)
            if (r.parent && normalizeName(String(r.parent)) === q) return true;
            // traits array exact
            if (Array.isArray(r.traits) && r.traits.some((t: any) => normalizeName(String(t)) === q)) return true;
            // traitTags / tags
            if (Array.isArray((r as any).traitTags) && (r as any).traitTags.some((t: any) => normalizeName(String(t)) === q)) return true;
            if (Array.isArray((r as any).tags) && (r as any).tags.some((t: any) => normalizeName(String(t)) === q)) return true;
            // creature type tokens
            if (r.creature_type && normalizeName(String(r.creature_type)).split(/[^a-z0-9]+/).includes(q)) return true;
            // classes list (objects or strings)
            if (r.classes) {
              const cls = Array.isArray(r.classes) ? r.classes : [r.classes];
              if (cls.some((c: any) => normalizeName(String((c && c.name) ?? c)) === q)) return true;
            }
            return false;
          });
        }
        return results;
      },

      exportForSheet: async (uid: string) => {
        const api = (this.app as any).vaultforge5etools;
        const entry = await api.getByUid(uid);
        if (!entry) return null;
        const norm = ensureNormalized(entry);
        return {
          uid: norm.uid,
          name: norm.name,
          type: norm.type || (norm as any).__table || null,
          source: norm.source || null,
          description: norm.description || null,
          rarity: norm.rarity || null,
          level: norm.level ?? null,
          school: norm.school || null,
          weight: norm.weight ?? null,
          attunement: norm.attunement ?? null,
          traits: norm.traits || [],
          classes: norm.classes || [],
          race: norm.race || null,
          speed: norm.speed || null,
          value: norm.value ?? null,
          raw: norm.raw ?? null,
        };
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
      .setName("Data Path")
      .setDesc("Folder containing the 5e.tools 'data' folder")
      .addText(text => text.setValue(this.plugin.settings.dataPath).onChange(async val => {
        this.plugin.settings.dataPath = val;
        await this.plugin.saveData(this.plugin.settings);
      }));

    new Setting(containerEl)
      .setName("Rebuild Index")
      .setDesc("Regenerate the master index from the /data folder.")
      .addButton(button =>
        button.setButtonText("Rebuild Index").setCta().onClick(async () => {
          const dataPath = pluginPath(this.plugin, this.plugin.settings.dataPath);
          await buildMasterIndex(dataPath, pluginPath(this.plugin, "cache/master-index.json"));
          new Notice("Master index rebuilt");
        })
      );
  }
}

