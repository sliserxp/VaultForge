"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/*============Imports==========*/
const obsidian_1 = require("obsidian");
const DEFAULT_SETTINGS = {
    apiKey: "",
    answerModel: "gpt-4o",
    embedModel: "text-embedding-3-small",
    dialogueContextLines: 6,
    npcFolder: "NPCs",
    includedFolders: ["NPCs", "Items", "Locations", "Factions", "Lore"],
    excludedFolders: ["Transcripts", "SessionLogs"],
    playerFolder: "Players",
    locationFolder: "Locations",
    itemFolder: "Items",
    transcriptFolder: "Transcripts",
    npcTemplateFile: "Templates/NPC.md",
    locationTemplateFile: "Templates/Location.md",
    itemTemplateFile: "Templates/Item.md",
    maxChunkChars: 1200,
    topK: 8,
    index: null
};
/* ===============Utilities===================*/
function safeSlug(name) {
    return String(name || "Untitled")
        .trim()
        .replace(/[\/\\:*?"<>|#^\[\]]+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\s/g, "_")
        .slice(0, 120);
}
function formatLinks(key, value) {
    if (!value)
        return "Unknown";
    // If it's already a string
    if (typeof value === "string") {
        return `[[${key}/${value}]]`;
    }
    // If it's an array of strings
    if (Array.isArray(value)) {
        return value.map(v => `[[${key}/${v}]]`).join(", ");
    }
    return String(value);
}
function tryParseJSON(text) {
    try {
        // Strip Markdown code fences like ```json ... ```
        text = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
        return JSON.parse(text);
    }
    catch (e) {
        console.warn("Failed to parse JSON:", e, text);
        return null;
    }
}
function getAllFolders(app) {
    const folders = [];
    const walk = (folder, prefix = "") => {
        for (const child of folder.children) {
            if (child instanceof obsidian_1.TFolder) {
                const path = prefix ? `${prefix}/${child.name}` : child.name;
                folders.push(path);
                walk(child, path);
            }
        }
    };
    const root = app.vault.getRoot();
    walk(root);
    return folders.sort();
}
async function ensureFolder(app, folderPath) {
    if (!folderPath || folderPath === "/")
        return;
    const parts = folderPath.split("/").filter(Boolean);
    let cur = "";
    for (const p of parts) {
        cur = cur ? `${cur}/${p}` : p;
        if (!(await app.vault.adapter.exists(cur)))
            await app.vault.createFolder(cur);
    }
}
async function getCharacterChoices(app, folderPath) {
    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof obsidian_1.TFolder))
        return [];
    const files = [];
    const walk = (folder) => {
        for (const child of folder.children) {
            if (child instanceof obsidian_1.TFile && child.extension === "md") {
                files.push(child.basename);
            }
            else if (child instanceof obsidian_1.TFolder) {
                walk(child);
            }
        }
    };
    walk(folder);
    return files.sort();
}
async function getTemplateChoices(app, folder) {
    const files = app.vault.getFiles();
    return files
        .filter(f => f.path.startsWith(folder + "/") && f.path.endsWith(".md"))
        .map(f => f.path.replace(folder + "/", "").replace(".md", ""));
}
async function upsertAppend(app, path, toAppend) {
    await ensureFolder(app, path.split("/").slice(0, -1).join("/"));
    if (await app.vault.adapter.exists(path)) {
        const f = app.vault.getAbstractFileByPath(path);
        if (f && f instanceof obsidian_1.TFile) {
            const cur = await app.vault.read(f);
            await app.vault.modify(f, `${cur}\n${toAppend}`);
        }
    }
    else {
        await app.vault.create(path, toAppend);
    }
}
function getHeaderFromMarkdown(md) {
    const m = md.match(/^#\s*(.+)$/m);
    return m ? m[1].trim() : "";
}
function chunkMarkdown(md, maxChars) {
    const parts = [];
    let carry = "";
    const lines = md.split("\n");
    for (const line of lines) {
        if ((carry + "\n" + line).length > maxChars) {
            if (carry.trim())
                parts.push(carry.trim());
            carry = line;
        }
        else {
            carry = carry ? carry + "\n" + line : line;
        }
    }
    if (carry.trim())
        parts.push(carry.trim());
    return parts;
}
function cosine(a, b) {
    if (!a || !b || !a.length || !b.length)
        return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (!na || !nb)
        return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
function truncateForEmbedding(s, maxChars = 3500) {
    s = (s || "").replace(/\r/g, "").trim();
    return s.length > maxChars ? s.slice(0, maxChars) : s;
}
function parseFrontmatter(md) {
    const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!m)
        return { data: {}, body: md };
    const yaml = m[1];
    const body = md.slice(m[0].length);
    const data = {};
    yaml.split("\n").forEach((line) => {
        const mm = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.+)\s*$/);
        if (mm) {
            let v = mm[2].trim();
            if (/^\[.*\]$/.test(v)) {
                v = v.replace(/^\[|\]$/g, "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
            }
            else {
                v = v.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
            }
            data[mm[1]] = v;
        }
    });
    return { data, body };
}
function normalizeAliases(v) {
    if (!v)
        return [];
    if (Array.isArray(v))
        return v.map(x => String(x).trim()).filter(Boolean);
    return String(v).split(",").map(x => x.trim()).filter(Boolean);
}
function extractTranscriptBlock(md) {
    const idx = md.lastIndexOf("\n## Transcript");
    if (idx === -1)
        return "";
    return md.slice(idx).split("\n").slice(1).join("\n");
}
function collectDialogueLines(block) {
    return String(block)
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => /^\*\*\[[^\]]+\]\:\*\*\s*/.test(l));
}
async function getRecentTranscriptLines(app, npcPath, n) {
    const f = app.vault.getAbstractFileByPath(npcPath);
    if (!(f && f instanceof obsidian_1.TFile))
        return [];
    const md = await app.vault.read(f);
    const block = extractTranscriptBlock(md);
    const lines = collectDialogueLines(block);
    if (!lines.length)
        return [];
    return lines.slice(-Math.max(0, n));
}
function formattedTurn(speaker, listener, line, reply) {
    return `**[${speaker}]:** "${line}"\n**[${listener}]:** ${reply}\n`;
}
/*===============Modal================*/
class InputModal extends obsidian_1.Modal {
    constructor(app, prompt, onSubmit, initial) {
        super(app);
        this.prompt = prompt;
        this.onSubmit = onSubmit;
        this.initial = initial;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: this.prompt });
        const input = contentEl.createEl("textarea");
        if (this.initial)
            input.value = this.initial;
        const btn = contentEl.createEl("button", { text: "OK" });
        btn.addEventListener("click", () => { this.close(); this.onSubmit((input.value || "").trim()); });
    }
    onClose() { this.contentEl.empty(); }
}
class OutputModal extends obsidian_1.Modal {
    constructor(app, titleText, body) {
        super(app);
        this.titleText = titleText;
        this.body = body;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: this.titleText });
        // Scrollable, copyable output
        const box = contentEl.createEl("pre");
        box.style.whiteSpace = "pre-wrap";
        box.style.wordBreak = "break-word";
        box.style.maxHeight = "60vh";
        box.style.overflow = "auto";
        box.textContent = this.body;
        const btnRow = contentEl.createEl("div");
        btnRow.style.marginTop = "12px";
        const copyBtn = btnRow.createEl("button", { text: "Copy" });
        copyBtn.addEventListener("click", async () => {
            await navigator.clipboard.writeText(this.body);
            new obsidian_1.Notice("Copied to clipboard");
        });
    }
    onClose() {
        this.contentEl.empty();
    }
}
class ChoiceModal extends obsidian_1.FuzzySuggestModal {
    constructor(app, items, onChoose) {
        super(app);
        this.items = items;
        this.onChoose = onChoose;
    }
    getItems() {
        return this.items;
    }
    getItemText(item) {
        return item;
    }
    onChooseItem(item, evt) {
        this.onChoose(item);
    }
}
/* ==============Main Plugin================ */
class GPT5Plugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.settings = { ...DEFAULT_SETTINGS };
    }
    //--------chat-------//
    async chat(messages) {
        if (!this.settings.apiKey)
            return "[No API key set]";
        try {
            const res = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.settings.apiKey}`
                },
                body: JSON.stringify({
                    model: this.settings.answerModel,
                    messages
                })
            });
            const data = await res.json();
            return data.choices?.[0]?.message?.content ?? "[No response]";
        }
        catch (err) {
            console.error(err);
            return "[Error calling API]";
        }
    }
    //--------EmbedMany--------//
    async embedMany(texts) {
        if (!this.settings.apiKey)
            return texts.map(() => []);
        try {
            // Clean inputs
            const inputs = texts
                .map(t => truncateForEmbedding(t))
                .filter(t => t && t.trim().length > 0);
            if (inputs.length === 0)
                return texts.map(() => []);
            const res = await fetch("https://api.openai.com/v1/embeddings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.settings.apiKey}`
                },
                body: JSON.stringify({
                    model: this.settings.embedModel,
                    input: inputs
                })
            });
            const data = await res.json();
            if (!data.data) {
                console.error("Embedding error:", data);
                return texts.map(() => []);
            }
            return data.data.map((d) => d.embedding) ?? [];
        }
        catch (err) {
            console.error(err);
            return texts.map(() => []);
        }
    }
    //--------BuildVaultIndex--------//
    async buildVaultIndex() {
        const files = this.app.vault.getMarkdownFiles();
        const chunks = [];
        for (const file of files) {
            const path = file.path;
            // Skip excluded folders
            if (this.settings.excludedFolders.some(f => path.startsWith(f + "/")))
                continue;
            // If includedFolders is set, only keep files inside them
            if (this.settings.includedFolders.length > 0 &&
                !this.settings.includedFolders.some(f => path.startsWith(f + "/"))) {
                continue;
            }
            const md = await this.app.vault.read(file);
            const header = getHeaderFromMarkdown(md);
            const parts = chunkMarkdown(md, this.settings.maxChunkChars).filter(p => p && p.trim().length > 0);
            const embeddings = await this.embedMany(parts);
            for (let i = 0; i < parts.length; i++) {
                chunks.push({
                    path: file.path,
                    header,
                    text: parts[i],
                    vec: embeddings[i] ?? []
                });
            }
        }
        this.settings.index = {
            version: 1,
            model: this.settings.embedModel,
            dims: (chunks[0]?.vec?.length ?? 0),
            chunks,
            lastBuiltAt: Date.now()
        };
        await this.saveSettings();
        new obsidian_1.Notice(`Vault index built with ${chunks.length} chunks`);
    }
    //--------AskVault--------//
    async askVault(question) {
        const idx = this.settings.index;
        if (!idx || !idx.chunks?.length) {
            return "Index is empty. Run: GPT → Rebuild Vault Index.";
        }
        const [qVec] = await this.embedMany([question]);
        if (!qVec)
            return "Failed to embed query.";
        const scored = idx.chunks.map((c) => ({ c, s: cosine(qVec, c.vec) }));
        scored.sort((a, b) => b.s - a.s);
        const top = scored.slice(0, this.settings.topK).map((x) => x.c);
        const context = top.map((t, i) => `[#${i + 1}] ${t.path}${t.header ? " — " + t.header : ""}\n${t.text}`).join("\n\n");
        return await this.chat([
            { role: "system", content: "Answer using ONLY the provided context. If insufficient, say so." },
            { role: "user", content: `Q: ${question}\n\nContext:\n${context}` }
        ]);
    }
    //===========ONLOAD==========//
    async onload() {
        await this.loadSettings();
        /* ---------- Core Commands ---------- */
        /* ---------- Chat-Selftest ---------- */
        this.addCommand({
            id: "chat-selftest",
            name: "GPT: Chat Self-Test",
            callback: async () => {
                const reply = await this.chat([{ role: "user", content: "Hello!" }]);
                new obsidian_1.Notice("GPT reply: " + reply);
            }
        });
        /* ---------- Rebuild-Index ---------- */
        this.addCommand({
            id: "rebuild-index",
            name: "GPT: Rebuild Vault Index",
            callback: async () => {
                await this.buildVaultIndex();
            }
        });
        /* ---------- Ask-Vault ---------- */
        this.addCommand({
            id: "ask-vault",
            name: "GPT: Ask Vault",
            callback: async () => {
                new InputModal(this.app, "Ask the Vault", async (question) => {
                    const ans = await this.askVault(question);
                    new obsidian_1.Notice("Answer: " + ans.slice(0, 200));
                }).open();
            }
        });
        /* ---------- Embed-Selftest ---------- */
        this.addCommand({
            id: "embed-selftest",
            name: "GPT: Embed Self-Test",
            callback: async () => {
                const vecs = await this.embedMany(["hello world"]);
                new obsidian_1.Notice("Embedding dims: " + (vecs[0]?.length ?? 0));
            }
        });
        /* ---------- Generate Npc ---------- */
        this.addCommand({
            id: "generate-npc",
            name: "GPT: Generate NPC",
            callback: async () => {
                new InputModal(this.app, "Enter NPC Name (leave blank to auto-generate)", async (npcName) => {
                    new InputModal(this.app, `Describe ${npcName || "the NPC"}`, async (prompt) => {
                        if (!prompt)
                            return;
                        // Pull vault context
                        const context = await this.askVault(`Provide relevant lore, history, or notes about NPCs, factions, and locations related to: ${npcName || "this NPC"}`);
                        const response = await this.chat([
                            {
                                role: "system",
                                content: "Reply ONLY with valid JSON. JSON must include ALL fields: name, aliases, race, gender, age, role, faction, location, alignment, status, voice, tone, accent, description, personality, abilities. If unsure, use 'Unknown'."
                            },
                            { role: "user", content: `NPC Name: ${npcName || "Generate a fitting name"}\n` +
                                    `Prompt: ${prompt}\n\n` +
                                    `Relevant context from vault:\n${context}`
                            }
                        ]);
                        let npc = tryParseJSON(response) || {
                            name: npcName || "",
                            aliases: "",
                            race: "Unknown",
                            gender: "Unknown",
                            age: "Unknown",
                            role: "Unknown",
                            faction: "Unknown",
                            location: "Unknown",
                            alignment: "Unknown",
                            status: "Unknown",
                            voice: "alloy",
                            tone: "Unknown",
                            accent: "Unknown",
                            description: response,
                            personality: "",
                            abilities: ""
                        };
                        if (npcName && npcName.trim())
                            npc.name = npcName.trim();
                        if (!npc.name)
                            npc.name = `Generated_NPC_${Date.now()}`;
                        const templateFile = this.app.vault.getAbstractFileByPath(this.settings.npcTemplateFile);
                        let template = "";
                        if (templateFile && templateFile instanceof obsidian_1.TFile) {
                            template = await this.app.vault.read(templateFile);
                        }
                        else {
                            template = `# {{name}}\n\n## Description\n{{description}}`;
                        }
                        const keys = [
                            "name", "aliases", "race", "gender", "age", "role", "faction", "location",
                            "alignment", "status", "voice", "tone", "accent",
                            "description", "personality", "abilities"
                        ];
                        let content = template;
                        keys.forEach(key => {
                            let val = npc[key] && String(npc[key]).trim() ? npc[key] : "Unknown";
                            if (key === "location")
                                val = formatLinks("Locations", npc[key]);
                            if (key === "faction")
                                val = formatLinks("Factions", npc[key]);
                            content = content.replace(new RegExp(`{{${key}}}`, "g"), val);
                        });
                        content = content.replace(/{{\w+}}/g, "Unknown");
                        const filePath = `${this.settings.npcFolder}/${safeSlug(npc.name)}.md`;
                        await upsertAppend(this.app, filePath, content);
                        new obsidian_1.Notice(`NPC generated at ${filePath}`);
                    }).open();
                }).open();
            }
        });
        /* ---------- Generate Location ---------*/
        this.addCommand({
            id: "generate-location",
            name: "GPT: Generate Location",
            callback: async () => {
                new InputModal(this.app, "Enter Location Name (leave blank to auto-generate)", async (locationName) => {
                    new InputModal(this.app, `Describe ${locationName || "the location"}`, async (prompt) => {
                        if (!prompt)
                            return;
                        // Pull vault context
                        const context = await this.askVault(`Provide relevant lore, history, and connections for ${locationName || "this location"}, including factions and NPCs.`);
                        const response = await this.chat([
                            {
                                role: "system",
                                content: "Reply ONLY with valid JSON. JSON must include ALL fields: name, region, population, government, faction, alignment, status, description, npcs, history. If unsure, use 'Unknown'."
                            },
                            { role: "user", content: `Location Name: ${locationName || "Generate a fitting name"}\n` +
                                    `Prompt: ${prompt}\n\n` +
                                    `Relevant context from vault:\n${context}`
                            }
                        ]);
                        let loc = tryParseJSON(response) || {
                            name: locationName || "",
                            region: "Unknown",
                            population: "Unknown",
                            government: "Unknown",
                            faction: "Unknown",
                            alignment: "Unknown",
                            status: "Unknown",
                            description: response,
                            npcs: "",
                            history: ""
                        };
                        if (locationName && locationName.trim())
                            loc.name = locationName.trim();
                        if (!loc.name)
                            loc.name = `Generated_Location_${Date.now()}`;
                        const templateFile = this.app.vault.getAbstractFileByPath(this.settings.locationTemplateFile);
                        let template = "";
                        if (templateFile && templateFile instanceof obsidian_1.TFile) {
                            template = await this.app.vault.read(templateFile);
                        }
                        else {
                            template = `# {{name}}\n\n## Description\n{{description}}`;
                        }
                        const keys = ["name", "region", "population", "government", "faction", "alignment", "status", "description", "npcs", "history"];
                        let content = template;
                        keys.forEach(key => {
                            let val = loc[key] && String(loc[key]).trim() ? loc[key] : "Unknown";
                            if (key === "faction")
                                val = formatLinks("Factions", loc[key]);
                            if (key === "npcs")
                                val = formatLinks("NPCs", loc[key]);
                            content = content.replace(new RegExp(`{{${key}}}`, "g"), val);
                        });
                        content = content.replace(/{{\w+}}/g, "Unknown");
                        const filePath = `${this.settings.locationFolder}/${safeSlug(loc.name)}.md`;
                        await upsertAppend(this.app, filePath, content);
                        new obsidian_1.Notice(`Location generated at ${filePath}`);
                    }).open();
                }).open();
            }
        });
        /* ---------- Generate Item ---------- */
        this.addCommand({
            id: "generate-item",
            name: "GPT: Generate Item",
            callback: async () => {
                new InputModal(this.app, "Enter Item Name (leave blank to auto-generate)", async (itemName) => {
                    new InputModal(this.app, `Describe ${itemName || "the item"}`, async (prompt) => {
                        if (!prompt)
                            return;
                        // Pull vault context
                        const context = await this.askVault(`Provide relevant lore, history, or notes about items, locations, and factions related to: ${itemName || "this item"}`);
                        const response = await this.chat([
                            {
                                role: "system",
                                content: "Reply ONLY with valid JSON. JSON must include ALL fields: name, rarity, material, origin, faction, value, status, description, abilities, lore. If unsure, use 'Unknown'."
                            },
                            { role: "user", content: `Item Name: ${itemName || "Generate a fitting name"}\n` +
                                    `Prompt: ${prompt}\n\n` +
                                    `Relevant context from vault:\n${context}`
                            }
                        ]);
                        let item = tryParseJSON(response) || {
                            name: itemName || "",
                            rarity: "Unknown",
                            material: "Unknown",
                            origin: "Unknown",
                            faction: "Unknown",
                            value: "Unknown",
                            status: "Unknown",
                            description: response,
                            abilities: "",
                            lore: ""
                        };
                        if (itemName && itemName.trim())
                            item.name = itemName.trim();
                        if (!item.name)
                            item.name = `Generated_Item_${Date.now()}`;
                        const templateFile = this.app.vault.getAbstractFileByPath(this.settings.itemTemplateFile);
                        let template = "";
                        if (templateFile && templateFile instanceof obsidian_1.TFile) {
                            template = await this.app.vault.read(templateFile);
                        }
                        else {
                            template = `# {{name}}\n\n## Description\n{{description}}`;
                        }
                        const keys = ["name", "rarity", "material", "origin", "faction", "value", "status", "description", "abilities", "lore"];
                        let content = template;
                        keys.forEach(key => {
                            let val = item[key] && String(item[key]).trim() ? item[key] : "Unknown";
                            if (key === "origin")
                                val = formatLinks("Locations", item[key]);
                            if (key === "faction")
                                val = formatLinks("Factions", item[key]);
                            content = content.replace(new RegExp(`{{${key}}}`, "g"), val);
                        });
                        content = content.replace(/{{\w+}}/g, "Unknown");
                        const filePath = `${this.settings.itemFolder}/${safeSlug(item.name)}.md`;
                        await upsertAppend(this.app, filePath, content);
                        new obsidian_1.Notice(`Item generated at ${filePath}`);
                    }).open();
                }).open();
            }
        });
        //--------Expand_Context--------//
        this.addCommand({
            id: "expand-context",
            name: "GPT: Expand Context",
            callback: async () => {
                new InputModal(this.app, "Enter topic name (NPC, Faction, Item, Guild, etc.)", async (topic) => {
                    if (!topic)
                        return;
                    try {
                        console.log("[ExpandContext] Topic:", topic);
                        // 1. Get vault context
                        const context = await this.askVault(`Provide all known details about: ${topic}`);
                        console.log("[ExpandContext] Vault context:", context);
                        // 2. Ask GPT if topic exists/partial/missing
                        const response = await this.chat([
                            { role: "system", content: "Reply ONLY with JSON. {status: 'exists'|'partial'|'missing'}." },
                            { role: "user", content: `Topic: ${topic}\nVault context:\n${context}` }
                        ]);
                        console.log("[ExpandContext] GPT status:", response);
                        const result = tryParseJSON(response);
                        if (!result?.status) {
                            new obsidian_1.Notice("ExpandContext: GPT did not return valid JSON (check console).");
                            return;
                        }
                        // 3. Check vault for existing note
                        const allFiles = this.app.vault.getMarkdownFiles();
                        let file = allFiles.find(f => f.basename.toLowerCase() === topic.toLowerCase());
                        // CASE: Exists or Partial
                        if (result.status === "exists" || result.status === "partial") {
                            if (file) {
                                console.log("[ExpandContext] Found existing file:", file.path);
                                new InputModal(this.app, `Add info to ${topic}`, async (addition) => {
                                    if (!addition)
                                        return;
                                    const md = await this.app.vault.read(file);
                                    const { data: fm, body } = parseFrontmatter(md);
                                    const choices = ["Integrate into body (GPT)", "Append as new section"];
                                    new ChoiceModal(this.app, choices, async (choice) => {
                                        let newBody = body;
                                        if (choice.startsWith("Integrate")) {
                                            const expansion = await this.chat([
                                                { role: "system", content: "Expand the note body. Do NOT touch YAML frontmatter. Return ONLY updated body content." },
                                                { role: "user", content: `Current body:\n${body}\n\nAddition:\n${addition}` }
                                            ]);
                                            newBody = expansion.trim();
                                        }
                                        else {
                                            newBody = body + `\n\n## Added Context\n${addition}`;
                                        }
                                        let newContent = md;
                                        if (Object.keys(fm).length) {
                                            const yamlBlock = md.match(/^---\n[\s\S]*?\n---\n?/);
                                            if (yamlBlock) {
                                                newContent = yamlBlock[0] + newBody.trim();
                                            }
                                            else {
                                                newContent = newBody.trim();
                                            }
                                        }
                                        else {
                                            newContent = newBody.trim();
                                        }
                                        await this.app.vault.modify(file, newContent);
                                        new obsidian_1.Notice(`Updated ${topic} with new info (${choice}).`);
                                    }).open();
                                }).open();
                                return;
                            }
                            else {
                                console.log("[ExpandContext] No file found, treating as missing.");
                                result.status = "missing"; // fallback to creation
                            }
                        }
                        // CASE: Missing → create with template
                        if (result.status === "missing") {
                            const templates = await getTemplateChoices(this.app, "Templates");
                            if (!templates.length) {
                                new obsidian_1.Notice("ExpandContext: No templates found in /Templates.");
                                return;
                            }
                            new ChoiceModal(this.app, templates, async (chosenTemplate) => {
                                console.log("[ExpandContext] Using template:", chosenTemplate);
                                const templatePath = `Templates/${chosenTemplate}.md`;
                                const tFile = this.app.vault.getAbstractFileByPath(templatePath);
                                if (!tFile || !(tFile instanceof obsidian_1.TFile)) {
                                    new obsidian_1.Notice("Template not found.");
                                    return;
                                }
                                const template = await this.app.vault.read(tFile);
                                const { data: fm, body } = parseFrontmatter(template);
                                const outputFolder = fm.folder || chosenTemplate + "s";
                                const fill = await this.chat([
                                    { role: "system", content: `
                  You are an assistant generating structured Obsidian markdown notes.
                  Rules:
                  - Reply ONLY with JSON.
                  - JSON keys must match placeholders in the template.
                  - For any references to other entities (NPCs, Factions, Guilds, Locations, Items),
                    always format them as Obsidian wiki links: [[Entity Name]].
                  - Fill all placeholders. If no info, use "Unknown".
                ` },
                                    { role: "user", content: `Topic: ${topic}\nContext:\n${context}\nTemplate:\n${body}` }
                                ]);
                                console.log("[ExpandContext] GPT fill:", fill);
                                const fields = tryParseJSON(fill) || {};
                                let content = body;
                                Object.keys(fields).forEach(key => {
                                    content = content.replace(new RegExp(`{{${key}}}`, "g"), fields[key] || "Unknown");
                                });
                                content = content.replace(/{{\w+}}/g, "Unknown");
                                const filePath = `${outputFolder}/${safeSlug(topic)}.md`;
                                await ensureFolder(this.app, outputFolder);
                                await upsertAppend(this.app, filePath, content);
                                new obsidian_1.Notice(`Generated new ${chosenTemplate}: ${filePath}`);
                            }).open();
                        }
                    }
                    catch (err) {
                        console.error("[ExpandContext] Error:", err);
                        new obsidian_1.Notice("ExpandContext failed (see console).");
                    }
                }).open();
            }
        });
        /* ---------- NPC Dialogue with Dropdowns ---------- */
        this.addCommand({
            id: "npc-respond",
            name: "GPT: NPC Respond",
            callback: async () => {
                const view = this.app.workspace.getActiveViewOfType(obsidian_1.MarkdownView);
                if (!view || !view.file) {
                    new obsidian_1.Notice("No active markdown file");
                    return;
                }
                const file = view.file;
                const md = await this.app.vault.read(file);
                const defaultNpcName = getHeaderFromMarkdown(md) || file.basename;
                // Build choice lists
                const players = await getCharacterChoices(this.app, this.settings.playerFolder);
                const npcs = await getCharacterChoices(this.app, this.settings.npcFolder);
                const choices = ["Player (custom)"]
                    .concat(players.map(p => `Player: ${p}`))
                    .concat(npcs.map(n => `NPC: ${n}`));
                // Speaker modal
                new ChoiceModal(this.app, choices, (speakerChoice) => {
                    const speaker = speakerChoice.replace(/^Player: |^NPC: /, "");
                    /// Listener modal
                    new ChoiceModal(this.app, choices, async (listenerChoice) => {
                        const listener = listenerChoice.replace(/^Player: |^NPC: /, "");
                        /// Line input
                        new InputModal(this.app, `${speaker} says to ${listener}:`, async (line) => {
                            if (!line)
                                return;
                            const recent = await getRecentTranscriptLines(this.app, file.path, this.settings.dialogueContextLines);
                            const transcriptContext = recent.join("\n");
                            // Lore context
                            const lore = await this.askVault(`Provide relevant background lore or notes for characters: ${speaker}, ${listener}`);
                            // Generate reply
                            const ans = await this.chat([
                                { role: "system", content: "Use the transcript and lore to continue the conversation in-character." },
                                { role: "user", content: `Transcript so far:\n${transcriptContext}\n\n` +
                                        `Lore context:\n${lore}\n\n` +
                                        `${speaker}: "${line}"\n${listener}:`
                                }
                            ]);
                            // Save into a transcript file instead of the NPC note
                            const transcriptPath = `${this.settings.transcriptFolder}/${safeSlug(listener)}.md`;
                            await upsertAppend(this.app, transcriptPath, formattedTurn(speaker, listener, line, ans));
                        }).open();
                    }).open();
                }).open();
            }
        });
        this.addCommand({
            id: "chat-with-vault",
            name: "GPT: Chat with Vault",
            callback: async () => {
                if (!this.app) {
                    new obsidian_1.Notice("Error: app not available");
                    return;
                }
                new InputModal(this.app, "Ask GPT using Vault context", async (question) => {
                    if (!question)
                        return;
                    try {
                        const context = await this.askVault(`Provide all known details relevant to: ${question}`);
                        const response = await this.chat([
                            { role: "system", content: "You are a helpful DM assistant. Use vault context when relevant." },
                            { role: "user", content: `Vault context:\n${context}\n\nUser question:\n${question}` }
                        ]);
                        new OutputModal(this.app, "GPT Response", response || "No response").open();
                    }
                    catch (err) {
                        console.error("[ChatWithVault Error]", err);
                        new obsidian_1.Notice("Error during chat with vault. Check console.");
                    }
                }).open();
            },
        });
        this.addSettingTab(new GPT5SettingTab(this.app, this));
    }
    async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
    async saveSettings() { await this.saveData(this.settings); }
}
exports.default = GPT5Plugin;
/* ==================Settings UI====================== */
class GPT5SettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "GPT5 Plugin Settings" });
        // Included Folders
        new obsidian_1.Setting(containerEl)
            .setName("Included Folders")
            .setDesc("Only these folders will be indexed (leave blank = all). Comma-separated.")
            .addText(text => text
            .setPlaceholder("NPCs, Items, Locations, Lore")
            .setValue(this.plugin.settings.includedFolders.join(", "))
            .onChange(async (value) => {
            this.plugin.settings.includedFolders = value.split(",").map(v => v.trim()).filter(Boolean);
            await this.plugin.saveSettings();
        }));
        // Excluded Folders
        new obsidian_1.Setting(containerEl)
            .setName("Excluded Folders")
            .setDesc("Folders to ignore when indexing. Comma-separated.")
            .addText(text => text
            .setPlaceholder("Transcripts, SessionLogs")
            .setValue(this.plugin.settings.excludedFolders.join(", "))
            .onChange(async (value) => {
            this.plugin.settings.excludedFolders = value.split(",").map(v => v.trim()).filter(Boolean);
            await this.plugin.saveSettings();
        }));
        // Location Template
        new obsidian_1.Setting(containerEl)
            .setName("Location Template File")
            .setDesc("Path to a markdown file in your vault for location template")
            .addText(text => text
            .setPlaceholder("Templates/Location.md")
            .setValue(this.plugin.settings.locationTemplateFile || "")
            .onChange(async (value) => {
            this.plugin.settings.locationTemplateFile = value.trim();
            await this.plugin.saveSettings();
        }));
        // Item Template
        new obsidian_1.Setting(containerEl)
            .setName("Item Template File")
            .setDesc("Path to a markdown file in your vault for item template")
            .addText(text => text
            .setPlaceholder("Templates/Item.md")
            .setValue(this.plugin.settings.itemTemplateFile || "")
            .onChange(async (value) => {
            this.plugin.settings.itemTemplateFile = value.trim();
            await this.plugin.saveSettings();
        }));
        // NPC Template File
        new obsidian_1.Setting(containerEl)
            .setName("NPC Template File")
            .setDesc("Path to a markdown file in your vault to use as the NPC template")
            .addText(text => text
            .setPlaceholder("Templates/NPC.md")
            .setValue(this.plugin.settings.npcTemplateFile || "")
            .onChange(async (value) => {
            this.plugin.settings.npcTemplateFile = value.trim();
            await this.plugin.saveSettings();
        }));
        // Transcript Folder
        new obsidian_1.Setting(containerEl)
            .setName("Transcript Folder")
            .setDesc("Folder to save NPC dialogue transcripts")
            .addDropdown(drop => {
            const folders = getAllFolders(this.app);
            folders.forEach(f => drop.addOption(f, f));
            drop.setValue(this.plugin.settings.transcriptFolder || folders[0] || "");
            drop.onChange(async (value) => {
                this.plugin.settings.transcriptFolder = value;
                await this.plugin.saveSettings();
            });
        });
        // NPC Folder
        new obsidian_1.Setting(containerEl)
            .setName("NPC Folder")
            .setDesc("Select folder for generated NPCs")
            .addDropdown(drop => {
            const folders = getAllFolders(this.app);
            folders.forEach(f => drop.addOption(f, f));
            drop.setValue(this.plugin.settings.npcFolder || folders[0] || "");
            drop.onChange(async (value) => {
                this.plugin.settings.npcFolder = value;
                await this.plugin.saveSettings();
            });
        });
        // Player Folder
        new obsidian_1.Setting(containerEl)
            .setName("Player Folder")
            .setDesc("Select folder for player notes")
            .addDropdown(drop => {
            const folders = getAllFolders(this.app);
            folders.forEach(f => drop.addOption(f, f));
            drop.setValue(this.plugin.settings.playerFolder || folders[0] || "");
            drop.onChange(async (value) => {
                this.plugin.settings.playerFolder = value;
                await this.plugin.saveSettings();
            });
        });
        // Location Folder
        new obsidian_1.Setting(containerEl)
            .setName("Location Folder")
            .setDesc("Select folder for generated Locations")
            .addDropdown(drop => {
            const folders = getAllFolders(this.app);
            folders.forEach(f => drop.addOption(f, f));
            drop.setValue(this.plugin.settings.locationFolder || folders[0] || "");
            drop.onChange(async (value) => {
                this.plugin.settings.locationFolder = value;
                await this.plugin.saveSettings();
            });
        });
        // Item Folder
        new obsidian_1.Setting(containerEl)
            .setName("Item Folder")
            .setDesc("Select folder for generated Items")
            .addDropdown(drop => {
            const folders = getAllFolders(this.app);
            folders.forEach(f => drop.addOption(f, f));
            drop.setValue(this.plugin.settings.itemFolder || folders[0] || "");
            drop.onChange(async (value) => {
                this.plugin.settings.itemFolder = value;
                await this.plugin.saveSettings();
            });
        });
        //Key Set
        new obsidian_1.Setting(containerEl)
            .setName("OpenAI API Key")
            .setDesc("Enter your OpenAI API key")
            .addText(text => text
            .setPlaceholder("sk-...")
            .setValue(this.plugin.settings.apiKey)
            .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
        }));
        //GPT model
        new obsidian_1.Setting(containerEl)
            .setName("Answer Model")
            .setDesc("Model for chat responses")
            .addText(text => text
            .setValue(this.plugin.settings.answerModel)
            .onChange(async (value) => {
            this.plugin.settings.answerModel = value.trim();
            await this.plugin.saveSettings();
        }));
        //Embedding Model
        new obsidian_1.Setting(containerEl)
            .setName("Embedding Model")
            .setDesc("Model for embeddings")
            .addText(text => text
            .setValue(this.plugin.settings.embedModel)
            .onChange(async (value) => {
            this.plugin.settings.embedModel = value.trim();
            await this.plugin.saveSettings();
        }));
    }
}
