/* ========================
   VaultForge-Core Plugin
   ======================== */
import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  TFile,
  parseYaml,
  normalizePath
} from "obsidian";
import OpenAI from "openai";

/* ---------- Settings ---------- */
interface VaultForgeCoreSettings {
  apiKey: string;
  model: string;
  embeddingModel: string;
  chunkSize: number;
  maxResults: number;
  autoRebuild: boolean;
  useLocalIndex: boolean;
  indexGranularity: "file" | "chunk";
  developerMode: boolean;   // ✅ NEW
}

const DEFAULT_SETTINGS: VaultForgeCoreSettings = {
  apiKey: "",
  model: "gpt-4o",
  embeddingModel: "text-embedding-3-small",
  chunkSize: 500,
  maxResults: 5,
  autoRebuild: true,
  useLocalIndex: true,
  indexGranularity: "chunk",
  developerMode: false,     // ✅ default OFF
};

/* ---------- Vault Index Types ---------- */
interface VaultIndexEntry {
  path: string;
  yaml: Record<string, any>;
  tags: string[];
  headings: string[];
  text: string;
  embedding?: number[];
  lastHash?: string;
  related?: string[];
}

/* ---------- Helpers ---------- */
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
function chunkText(text: string, size = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    start += size - overlap;
  }
  return chunks;
}

/* ---------- Main Plugin ---------- */
export default class VaultForgeCorePlugin extends Plugin {
  settings!: VaultForgeCoreSettings;
  vaultIndex: VaultIndexEntry[] = [];
  openai: OpenAI | null = null;

  private log(...args: any[]) {   // ✅ only logs if dev mode is on
    if (this.settings?.developerMode) {
      console.log("[VaultForge-Core]", ...args);
    }
  }

  async onload() {
    this.log("Loading...");
    await this.loadSettings();
    await this.loadVaultIndex();

    this.addSettingTab(new VaultForgeSettingTab(this.app, this));
    this.addCommands();

    this.openai = new OpenAI({
      apiKey: this.settings.apiKey,
      dangerouslyAllowBrowser: true,
    });

    if (!this.vaultIndex || this.vaultIndex.length === 0) {
      this.log("No index found, building fresh...");
      await this.buildVaultIndex();
    } else {
      this.log(`Loaded cached index (${this.vaultIndex.length} entries).`);
    }

    if (this.settings.autoRebuild) {
      this.registerEvent(this.app.vault.on("create", () => this.buildVaultIndex()));
      this.registerEvent(this.app.vault.on("delete", () => this.buildVaultIndex()));
      this.registerEvent(this.app.vault.on("modify", () => this.buildVaultIndex()));
    }
  }

  /* ---------- Commands ---------- */
  addCommands() {
    this.addCommand({
      id: "vaultforge-core-test",
      name: "VaultForge-Core: Test Connection",
      callback: async () => {
        if (!this.settings.apiKey) {
          new Notice("⚠️ No API key set in VaultForge-Core settings.");
          return;
        }
        new Notice("✅ VaultForge-Core is active and settings are loaded!");
      },
    });

    this.addCommand({
      id: "vaultforge-core-rebuild-vault-index",
      name: "VaultForge: Rebuild Vault Index",
      callback: async () => {
        await this.buildVaultIndex();
      },
    });

    this.addCommand({
      id: "vaultforge-core-ask-vault-concise",
      name: "VaultForge: Ask Vault (Concise)",
      callback: async () => {
        const q = prompt("Enter concise query:");
        if (q) {
          const result = await this.askVaultConcise(q);
          new Notice(result.substring(0, 2000));
          this.log("[AskVaultConcise]", result);
        }
      },
    });

    this.addCommand({
      id: "vaultforge-core-ask-vault-detailed",
      name: "VaultForge: Ask Vault (Detailed)",
      callback: async () => {
        const q = prompt("Enter detailed query:");
        if (q) {
          const result = await this.askVault(q);
          new Notice(result.substring(0, 2000));
          this.log("[AskVaultDetailed]", result);
        }
      },
    });
  }

  /* ---------- Settings ---------- */
  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings || {});
    this.vaultIndex = data?.vaultIndex || [];
  }

  async saveSettings() {
    await this.saveData({
      settings: this.settings,
      vaultIndex: this.vaultIndex,
    });
  }

  /* ---------- Vault Index Load/Save ---------- */
  private getIndexPath(): string {
    return normalizePath(`${this.manifest.dir}/index.json`);
  }

  async loadVaultIndex() {
    if (!this.settings.useLocalIndex) {
      this.log("Local index disabled. Starting empty.");
      this.vaultIndex = [];
      return;
    }

    try {
      const path = this.getIndexPath();
      if (await this.app.vault.adapter.exists(path)) {
        const raw = await this.app.vault.adapter.read(path);
        this.vaultIndex = JSON.parse(raw);
        this.log("Loaded index.json");
      }
    } catch (err) {
      console.error("[VaultForge-Core] Failed to load index.json:", err);
      this.vaultIndex = [];
    }
  }

  async saveVaultIndex() {
    if (!this.settings.useLocalIndex) {
      this.log("Skipping saveVaultIndex (disabled in settings).");
      return;
    }
    try {
      const path = this.getIndexPath();
      await this.app.vault.adapter.write(path, JSON.stringify(this.vaultIndex, null, 2));
      this.log("Saved index.json");
    } catch (err) {
      console.error("[VaultForge-Core] Failed to save index.json:", err);
    }
  }
async askVault(query: string): Promise<string> {
  console.log("=== [VaultForge-Core] askVault START ===");
  console.log("[VaultForge-Core] Query:", query);

  const q = query.toLowerCase();

  /* ---------- 1. Direct metadata + text match ---------- */
  let matches = this.vaultIndex.filter((entry) => {
    const yamlMatch = Object.entries(entry.yaml || {}).some(
      ([k, v]) =>
        String(k).toLowerCase().includes(q) ||
        String(v).toLowerCase().includes(q)
    );

    const tagMatch = (entry.tags || []).some(
      (t) => q.includes(t.toLowerCase()) || t.toLowerCase().includes(q)
    );

    const pathMatch = entry.path.toLowerCase().includes(q);
    const textMatch = entry.text.toLowerCase().includes(q);

    return yamlMatch || tagMatch || pathMatch || textMatch;
  });

  console.log("[VaultForge-Core] Direct matches found:", matches.length);

  /* ---------- 2. If no direct matches, use embeddings ---------- */
  if (matches.length === 0) {
    console.log("[VaultForge-Core] No direct match. Falling back to embeddings…");

    try {
      const [qVec] = await this.embedMany([query]);
      if (!qVec) throw new Error("No query embedding returned.");

      matches = this.vaultIndex
        .filter((e) => e.embedding)
        .map((entry) => ({
          ...entry,
          score: this.cosineSim(entry.embedding!, qVec),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, this.settings.maxResults);

      console.log("[VaultForge-Core] Embedding matches found:", matches.length);
    } catch (err) {
      console.error("[VaultForge-Core] Embedding search failed:", err);
    }
  }

  /* ---------- 3. Fallback ---------- */
  if (matches.length === 0) {
    matches = this.vaultIndex.slice(0, this.settings.maxResults);
  }

  /* ---------- 4. Build result preview ---------- */
  const results = matches
    .slice(0, this.settings.maxResults)
    .map((entry) => {
      const yamlPreview = Object.entries(entry.yaml || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");

      const headingPreview =
        entry.headings?.slice(0, 3).join(" | ") || "";
      const excerpt = entry.text
        .substring(0, 500)
        .replace(/\n+/g, " ");

      const related = entry.related?.length
        ? entry.related.map((r) => `- [[${r}]]`).join("\n")
        : "None";

      return `**${entry.path}**
YAML: ${yamlPreview}
Headings: ${headingPreview}

Excerpt:
${excerpt}...

**Related Files**
${related}`;
    })
    .join("\n---\n");

  console.log("[VaultForge-Core] askVault returning context length:", results.length);
  console.log("=== [VaultForge-Core] askVault END ===");

  return results;
}

 
 /* ---------- GPT Calls ---------- */
  async chat(
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    modelOverride?: string
  ): Promise<string> {
    if (!this.openai) {
      new Notice("⚠️ OpenAI not initialized. Check your API key.");
      return "No OpenAI client.";
    }
    try {
      const response = await this.openai.chat.completions.create({
        model: modelOverride || this.settings.model,
        messages: messages as any,
      });
      return response.choices[0]?.message?.content ?? "";
    } catch (err: any) {
      console.error("[VaultForge-Core][Chat] Error:", err);
      new Notice("❌ Chat request failed. See console for details.");
      return "Error: " + err.message;
    }
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (!this.openai) throw new Error("OpenAI not initialized.");
    const cleanTexts = texts
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .map((t) => t.slice(0, 7000));
    if (cleanTexts.length === 0) return [];
    try {
      const res = await this.openai.embeddings.create({
        model: this.settings.embeddingModel,
        input: cleanTexts,
      });
      return res.data.map((obj) => obj.embedding);
    } catch (err) {
      console.error("[VaultForge-Core][Embed] Error:", err);
      return [];
    }
  }

  async askVaultConcise(query: string): Promise<string> {
    const detailed = await this.askVault(query);
    const first = detailed.split("\n---\n")[0] ?? detailed;
    const lines = first.split("\n");
    const header = lines.find(l => l.startsWith("**")) ?? "";
    const excerptIdx = lines.findIndex(l => l.startsWith("Excerpt:"));
    const excerpt = excerptIdx >= 0 ? lines.slice(excerptIdx, excerptIdx + 3).join("\n") : "";
    return [header, excerpt].filter(Boolean).join("\n");
  }

/* ---------- Vault Index ---------- */
  async buildVaultIndex() {
  console.log("[VaultForge-Core] Building vault index...");
  const files = this.app.vault.getMarkdownFiles();
  const newIndex: VaultIndexEntry[] = [];

  const oldIndex = this.vaultIndex || [];

  for (const file of files) {
    const cache = this.app.metadataCache.getFileCache(file);
    const content = await this.app.vault.read(file);

    const yaml = cache?.frontmatter ?? {};
    const tags = (cache?.tags ?? []).map((t) => t.tag.replace(/^#/, ""));
    const headings = (cache?.headings ?? []).map((h) => h.heading);

    if (this.settings.indexGranularity === "chunk") {
      // 🔹 Split content into chunks
      for (let i = 0; i < content.length; i += this.settings.chunkSize) {
        const chunk = content.slice(i, i + this.settings.chunkSize);
        const chunkHash = await hashString(chunk);

        const oldEntry = oldIndex.find(
          (e) => e.path === file.path && e.lastHash === chunkHash
        );

        let embedding: number[] | undefined = oldEntry?.embedding;

        if (!oldEntry) {
          console.log(`[VaultForge-Core] Re-embedding chunk of ${file.path}`);
          const vecs = await this.embedMany([chunk]);
          embedding = vecs[0];
        } else {
          console.log(`[VaultForge-Core] Using cached embedding for chunk of ${file.path}`);
        }

        newIndex.push({
          path: file.path,
          yaml,
          tags,
          headings,
          text: chunk,
          embedding,
          lastHash: chunkHash,
        });
      }
    } else {
      // 🔹 Per-file embedding
      const fileHash = await hashString(content);
      const oldEntry = oldIndex.find((e) => e.path === file.path);

      let embedding: number[] | undefined = oldEntry?.embedding;

      if (!oldEntry || oldEntry.lastHash !== fileHash) {
        console.log(`[VaultForge-Core] Re-embedding ${file.path}`);
        const vecs = await this.embedMany([content]);
        embedding = vecs[0];
      } else {
        console.log(`[VaultForge-Core] Using cached embedding for ${file.path}`);
      }

      newIndex.push({
        path: file.path,
        yaml,
        tags,
        headings,
        text: content,
        embedding,
        lastHash: fileHash,
      });
    }
  }

  // ✅ Auto-link related entries by tags
  for (const entry of newIndex) {
    entry.related = newIndex
      .filter((e) => e !== entry && e.tags.some((t) => entry.tags.includes(t)))
      .map((e) => e.path.replace(/\.md$/, "")); // use wikilinks
  }

  this.vaultIndex = newIndex;

  if (this.settings.useLocalIndex) {
    await this.saveVaultIndex();
  } else {
    await this.saveData({ settings: this.settings, vaultIndex: this.vaultIndex });
  }

  new Notice(`✅ Vault index updated (${this.vaultIndex.length} entries).`);
  console.log("[VaultForge-Core][VaultIndex]", this.vaultIndex);
}

  /* ---------- Helper for embeddings ---------- */
  private cosineSim(a: number[], b: number[]): number {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
    return dot / (magA * magB);
  }

  /* ---------- Public API ---------- */
  getAPI() {
    return {
      askVault: this.askVault.bind(this),
      askVaultConcise: this.askVaultConcise.bind(this),
      getIndex: () => this.vaultIndex,
      chat: this.chat.bind(this),
      embedMany: this.embedMany.bind(this),
    };
  }
}

/* ---------- Settings Tab ---------- */
class VaultForgeSettingTab extends PluginSettingTab {
  plugin: VaultForgeCorePlugin;
  constructor(app: App, plugin: VaultForgeCorePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "VaultForge-Core Settings" });

    new Setting(containerEl)
      .setName("Chunk Size")
      .setDesc("Max characters per chunk for indexing")
      .addText((text) =>
        text.setPlaceholder("500")
          .setValue((this.plugin.settings.chunkSize ?? 500).toString())
          .onChange(async (value) => {
            this.plugin.settings.chunkSize = parseInt(value) || 500;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-Rebuild Index")
      .setDesc("Automatically rebuild the index when files are modified")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoRebuild ?? true)
          .onChange(async (value) => {
            this.plugin.settings.autoRebuild = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Use Local Index")
      .setDesc("Cache embeddings in index.json to avoid re-sending unchanged files to the API")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.useLocalIndex ?? true)
          .onChange(async (value) => {
            this.plugin.settings.useLocalIndex = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Index granularity")
      .setDesc("Choose whether embeddings are per file (faster, less precise) or per chunk (slower, more detailed).")
      .addDropdown((drop) => {
        drop.addOption("file", "Per File");
        drop.addOption("chunk", "Per Chunk (recommended)");
        drop.setValue(this.plugin.settings.indexGranularity ?? "chunk");
        drop.onChange(async (value) => {
          this.plugin.settings.indexGranularity = value as "file" | "chunk";
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Max Results")
      .setDesc("Maximum number of matches to return from AskVault")
      .addText((text) =>
        text.setPlaceholder("5")
          .setValue((this.plugin.settings.maxResults ?? 5).toString())
          .onChange(async (value) => {
            this.plugin.settings.maxResults = parseInt(value) || 5;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("OpenAI API Key")
      .setDesc("Enter your OpenAI API key")
      .addText((text) =>
        text.setPlaceholder("sk-...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    const embeddingModels = ["text-embedding-3-small", "text-embedding-3-large"];
    new Setting(containerEl)
      .setName("Embedding Model")
      .setDesc("Choose which model to use for vault indexing")
      .addDropdown((drop) => {
        embeddingModels.forEach((m) => drop.addOption(m, m));
        drop.setValue(this.plugin.settings.embeddingModel ?? "text-embedding-3-small");
        drop.onChange(async (value) => {
          this.plugin.settings.embeddingModel = value;
          await this.plugin.saveSettings();
        });
      });

    const models = ["gpt-5", "gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-3.5-turbo"];
    new Setting(containerEl)
      .setName("Default GPT Model")
      .setDesc("Choose which GPT model to use for chat responses")
      .addDropdown((drop) => {
        models.forEach((m) => drop.addOption(m, m));
        drop.setValue(this.plugin.settings.model ?? "gpt-4o");
        drop.onChange(async (value) => {
          this.plugin.settings.model = value;
          await this.plugin.saveSettings();
        });
      });

    // ✅ Developer Mode
    new Setting(containerEl)
      .setName("Developer Mode")
      .setDesc("Enable verbose logging for debugging VaultForge-Core")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.developerMode ?? false)
          .onChange(async (value) => {
            this.plugin.settings.developerMode = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

