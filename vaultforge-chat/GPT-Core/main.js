"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* ========================
   GPT-Core Plugin
   ======================== */
const obsidian_1 = require("obsidian");
const openai_1 = __importDefault(require("openai"));
const DEFAULT_SETTINGS = {
    apiKey: "",
    model: "gpt-4o",
    embeddingModel: "text-embedding-3-small",
    chunkSize: 500,
    maxResults: 5,
    autoRebuild: true,
};
/*---------- Helpers ----------*/
async function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
/* ---------- Plugin ---------- */
class GPTCorePlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.vaultIndex = [];
        this.openai = null;
    }
    async onload() {
        console.log("[GPT-Core] Loading...");
        await this.loadSettings();
        this.addSettingTab(new GPTCoreSettingTab(this.app, this));
        this.addCommands();
        this.openai = new openai_1.default({ apiKey: this.settings.apiKey });
        await this.buildVaultIndex();
        if (this.settings.autoRebuild) {
            this.registerEvent(this.app.vault.on("create", () => this.buildVaultIndex()));
            this.registerEvent(this.app.vault.on("delete", () => this.buildVaultIndex()));
            this.registerEvent(this.app.vault.on("modify", () => this.buildVaultIndex()));
        }
    }
    /* ---------- Commands ---------- */
    addCommands() {
        // Test connection
        this.addCommand({
            id: "gpt-core-test",
            name: "GPT-Core: Test Connection",
            callback: async () => {
                if (!this.settings.apiKey) {
                    new obsidian_1.Notice("⚠️ No API key set in GPT-Core settings.");
                    return;
                }
                new obsidian_1.Notice("✅ GPT-Core is active and settings are loaded!");
            },
        });
        // Rebuild index
        this.addCommand({
            id: "rebuild-vault-index",
            name: "GPT: Rebuild Vault Index",
            callback: async () => {
                await this.buildVaultIndex();
            },
        });
        // Concise AskVault
        this.addCommand({
            id: "ask-vault-concise",
            name: "GPT: Ask Vault (Concise)",
            callback: async () => {
                const q = prompt("Enter concise query:");
                if (q) {
                    const result = this.askVaultConcise(q);
                    new obsidian_1.Notice(result.substring(0, 2000));
                    console.log("[AskVaultConcise]", result);
                }
            }
        });
        // Detailed AskVault
        this.addCommand({
            id: "ask-vault-detailed",
            name: "GPT: Ask Vault (Detailed)",
            callback: async () => {
                const q = prompt("Enter detailed query:");
                if (q) {
                    const result = await this.askVault(q);
                    new obsidian_1.Notice(result.substring(0, 2000));
                    console.log("[AskVaultDetailed]", result);
                }
            }
        });
    }
    /* ---------- Settings ---------- */
    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings || {});
        this.vaultIndex = data?.vaultIndex || [];
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
    /* ---------- GPT Calls ---------- */
    async chat(messages, modelOverride) {
        if (!this.openai) {
            new obsidian_1.Notice("⚠️ OpenAI not initialized. Check your API key.");
            return "No OpenAI client.";
        }
        try {
            const response = await this.openai.chat.completions.create({
                model: modelOverride || this.settings.model,
                messages: messages, // ✅ cast so OpenAI accepts it
            });
            return response.choices[0]?.message?.content ?? "";
        }
        catch (err) {
            console.error("[GPT-Core][Chat] Error:", err);
            new obsidian_1.Notice("❌ Chat request failed. See console for details.");
            return "Error: " + err.message;
        }
    }
    async embedMany(texts) {
        if (!this.openai) {
            new obsidian_1.Notice("⚠️ OpenAI not initialized. Check your API key.");
            return [];
        }
        try {
            const response = await this.openai.embeddings.create({
                model: this.settings.embeddingModel,
                input: texts,
            });
            return response.data.map((d) => d.embedding);
        }
        catch (err) {
            console.error("[GPT-Core][Embed] Error:", err);
            new obsidian_1.Notice("❌ Embedding request failed. See console for details.");
            return [];
        }
    }
    /* ---------- Vault Index ---------- */
    async buildVaultIndex() {
        console.log("[GPT-Core] Building vault index...");
        const files = this.app.vault.getMarkdownFiles();
        const newIndex = [];
        // Load old cache from plugin data (if exists)
        const oldIndex = this.vaultIndex || [];
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const content = await this.app.vault.read(file);
            const yaml = cache?.frontmatter ?? {};
            const tags = (cache?.tags ?? []).map(t => t.tag.replace(/^#/, ""));
            const headings = (cache?.headings ?? []).map(h => h.heading);
            const hash = await hashString(content);
            // Try to find existing entry
            const oldEntry = oldIndex.find(e => e.path === file.path);
            let embedding = oldEntry?.embedding;
            // Re-embed only if file changed
            if (!oldEntry || oldEntry.lastHash !== hash) {
                console.log(`[GPT-Core] Re-embedding ${file.path}`);
                const vecs = await this.embedMany([content]);
                embedding = vecs[0];
            }
            newIndex.push({
                path: file.path,
                yaml,
                tags,
                headings,
                text: content,
                embedding,
                lastHash: hash,
            });
        }
        this.vaultIndex = newIndex;
        // Persist cache
        await this.saveData({ settings: this.settings, vaultIndex: this.vaultIndex });
        new obsidian_1.Notice(`✅ Vault index built with ${this.vaultIndex.length} files (embeddings updated where needed).`);
        console.log("[GPT-Core][VaultIndex]", this.vaultIndex);
    }
    /* ---------- Context Retrieval ---------- */
    askVaultConcise(query) {
        const q = query.toLowerCase();
        const matches = this.vaultIndex.filter(entry => {
            const yamlMatch = Object.entries(entry.yaml || {})
                .some(([k, v]) => String(k).toLowerCase().includes(q) ||
                String(v).toLowerCase().includes(q));
            const tagMatch = entry.tags.some(t => q.includes(t.toLowerCase()) || t.toLowerCase().includes(q));
            const pathMatch = entry.path.toLowerCase().includes(q);
            return yamlMatch || tagMatch || pathMatch;
        });
        if (matches.length === 0)
            return `No concise match for "${query}".`;
        return matches.slice(0, this.settings.maxResults).map(entry => {
            const yamlPreview = Object.entries(entry.yaml || {})
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ");
            const headingPreview = entry.headings?.slice(0, 3).join(" | ") || "";
            return `**${entry.path}**\nYAML: ${yamlPreview}\nHeadings: ${headingPreview}`;
        }).join("\n---\n");
    }
    async askVault(query) {
        const q = query.toLowerCase();
        const matches = this.vaultIndex.filter(entry => {
            const yamlMatch = Object.entries(entry.yaml || {})
                .some(([k, v]) => String(k).toLowerCase().includes(q) ||
                String(v).toLowerCase().includes(q));
            const tagMatch = entry.tags.some(t => q.includes(t.toLowerCase()) || t.toLowerCase().includes(q));
            const pathMatch = entry.path.toLowerCase().includes(q);
            return yamlMatch || tagMatch || pathMatch;
        });
        if (matches.length === 0) {
            return `No detailed match for "${query}". (Embedding search not yet implemented.)`;
        }
        return matches.slice(0, this.settings.maxResults).map(entry => {
            const yamlPreview = Object.entries(entry.yaml || {})
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ");
            const headingPreview = entry.headings?.slice(0, 3).join(" | ") || "";
            const excerpt = entry.text.substring(0, 500).replace(/\n+/g, " ");
            return `**${entry.path}**\nYAML: ${yamlPreview}\nHeadings: ${headingPreview}\n\nExcerpt:\n${excerpt}...`;
        }).join("\n---\n");
    }
    /* ---------- Public API ---------- */
    getAPI() {
        return {
            askVault: this.askVault.bind(this),
            askVaultConcise: this.askVaultConcise.bind(this),
            getIndex: () => this.vaultIndex,
            chat: this.chat.bind(this),
            embedMany: this.embedMany.bind(this)
        };
    }
}
exports.default = GPTCorePlugin;
/* ---------- Settings Tab ---------- */
class GPTCoreSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "GPT-Core Settings" });
        // Chunk size
        new obsidian_1.Setting(containerEl)
            .setName("Chunk Size")
            .setDesc("Max characters per chunk for indexing")
            .addText((text) => text
            .setPlaceholder("500")
            .setValue((this.plugin.settings.chunkSize ?? 500).toString())
            .onChange(async (value) => {
            this.plugin.settings.chunkSize = parseInt(value) || 500;
            await this.plugin.saveSettings();
        }));
        // Auto rebuild
        new obsidian_1.Setting(containerEl)
            .setName("Auto-Rebuild Index")
            .setDesc("Automatically rebuild the index when files are modified")
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.autoRebuild ?? true)
            .onChange(async (value) => {
            this.plugin.settings.autoRebuild = value;
            await this.plugin.saveSettings();
        }));
        // 🔢 Max results
        new obsidian_1.Setting(containerEl)
            .setName("Max Results")
            .setDesc("Maximum number of matches to return from AskVault")
            .addText((text) => text
            .setPlaceholder("5")
            .setValue((this.plugin.settings.maxResults ?? 5).toString())
            .onChange(async (value) => {
            this.plugin.settings.maxResults = parseInt(value) || 5;
            await this.plugin.saveSettings();
        }));
        // Api Key
        new obsidian_1.Setting(containerEl)
            .setName("OpenAI API Key")
            .setDesc("Enter your OpenAI API key")
            .addText((text) => text
            .setPlaceholder("sk-...")
            .setValue(this.plugin.settings.apiKey)
            .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
        }));
        // Embedding model dropdown
        const embeddingModels = ["text-embedding-3-small", "text-embedding-3-large"];
        new obsidian_1.Setting(containerEl)
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
        // Model dropdown
        const models = ["gpt-5", "gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-3.5-turbo"];
        new obsidian_1.Setting(containerEl)
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
    }
}
