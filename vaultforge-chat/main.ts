/* ===== Local minimal types while Shared/types.ts is pending ===== */
export interface VaultForgeCoreTools {
  askVault: (q: string, k?: number) => Promise<string>;
  embedMany: (texts: string[]) => Promise<number[][]>;
  chat: (messages: any[]) => Promise<string>;
}
export interface VaultForgeCorePlugin {
  tools: VaultForgeCoreTools;
}
/* ================================================================ */
/* ======================= Imports ======================= */
import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  MarkdownView,
  Notice,
} from "obsidian";
import { VaultForgeCoreAPI } from "./type"; // ✅ type-safe Core API

/* ======================= Interfaces & Defaults ======================= */
interface VaultForgeChatSettings {
  chatFolder: string;
  autoRespondOnSave: boolean;
  respondOnEnter: boolean;
  maxContextLines: number;
  useVaultContext: boolean;
  vaultMode: "full" | "concise";
}

const DEFAULT_SETTINGS: VaultForgeChatSettings = {
  chatFolder: "Chats",
  autoRespondOnSave: true,
  respondOnEnter: false, // default off
  maxContextLines: 50,
  useVaultContext: true,
  vaultMode: "concise",
};

/* ======================= Main Plugin Class ======================= */
export default class VaultForgeChatPlugin extends Plugin {
  statusEl: HTMLElement | null = null;
  core: VaultForgeCoreAPI | null = null;
  settings!: VaultForgeChatSettings;

  /* ---------- Lifecycle ---------- */
  async onload() {
    console.log("Loading VaultForge-Chat...");
    await this.loadSettings();

    this.core = (this.app as any).plugins.getPlugin("vaultforge-core") as VaultForgeCoreAPI | null;
    if (!this.core) {
      new Notice("⚠️ GPT-Core not loaded. VaultForge-Chat disabled.");
      return;
    }

    /* ---------- Events ---------- */
    // Respond on save (Ctrl+S) — use vault "modify" (fires on save)
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (file instanceof TFile && this.settings.autoRespondOnSave) {
          await this.handleNoteUpdate(file, "modify");
        }
      })
    );

    // Respond on Enter (if enabled)
    this.registerDomEvent(document, "keydown", async (evt) => {
      if (
        this.settings.respondOnEnter &&
        evt.key === "Enter" &&
        evt.shiftKey === false // allow Shift+Enter for newline
      ) {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.file && view.file.path.startsWith(this.settings.chatFolder)) {
          await this.handleNoteUpdate(view.file, "enter");
        }
      }
    });

    /* ---------- Commands ---------- */
    this.addCommand({
      id: "vaultforge-chat-respond",
      name: "GPT Respond (current chat note)",
      callback: () => this.respondActiveNote(),
    });

    /* ---------- Settings ---------- */
    this.addSettingTab(new GPTChatSettingTab(this.app, this));
    console.log("✅ VaultForge-Chat loaded and linked to GPT-Core");
    this.statusEl = this.addStatusBarItem();
    this.statusEl.setText("VF-Chat: idle");
  }

  onunload() {
    console.log("Unloading VaultForge-Chat...");
  }

  private setStatus(msg: string) {
    try { this.statusEl?.setText(msg); } catch (_) {}
  }

  /* ---------- Core Methods ---------- */
  async handleNoteUpdate(file: TFile, source: "modify" | "enter" = "modify") {
    if (!file.path.startsWith(this.settings.chatFolder)) return;
    if (!file.path.endsWith(".md")) return;

    let content = await this.app.vault.read(file);
    let lines = content.split("\n");

    // ✅ only keep last N lines and remove empty ones
    lines = lines.slice(-this.settings.maxContextLines).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return;

    let lastLine = lines[lines.length - 1];

    // Auto-format user input if plain text — but skip if last speaker was GPT (avoid mislabeling multi-line replies)
    let lastMarker = "";
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (l.startsWith("**You:**")) { lastMarker = "You"; break; }
      if (l.startsWith("**GPT:**")) { lastMarker = "GPT"; break; }
    }
    if (!lastLine.startsWith("**You:**") && !lastLine.startsWith("**GPT:**")) {
      if (lastMarker === "GPT" && source === "modify") return;
      lastLine = `**You:** ${lastLine}`;
      lines[lines.length - 1] = lastLine;
      content = content.trimEnd() + "\n" + lastLine; // append properly
      await this.app.vault.modify(file, content);
      if (source === "modify") return; // Wait for next modify event to reply (prevents double responses)
    }

    // Prevent duplicate GPT replies by checking last "You" line
    if (!lastLine.startsWith("**You:**")) return;

    const userMessage = lastLine.replace("**You:**", "").trim();

    /* ----- Context Collection ----- */
    const chatMessages: { role: "user" | "assistant"; content: string }[] =
      lines.map((line) => {
        if (line.startsWith("**You:**"))
          return { role: "user" as const, content: line.replace("**You:**", "").trim() };
        if (line.startsWith("**GPT:**"))
          return { role: "assistant" as const, content: line.replace("**GPT:**", "").trim() };
        return { role: "user" as const, content: line }; // fallback
      });

    // Query vault context
    let vaultContext = "";
    if (this.settings.useVaultContext && this.core) {
      try {
        this.setStatus("VF-Chat: looking for context…");
        console.log("=== [VaultForge-Chat] Vault context lookup START ===");
       if (this.settings.vaultMode === "full" && this.core.askVault) {
  vaultContext = await this.core.askVault(userMessage);
} else if (this.settings.vaultMode === "concise" && this.core.askVaultConcise) {
  vaultContext = await this.core.askVaultConcise(userMessage);
}
        console.log(
          "[VaultForge-Chat] Vault context retrieved:",
          vaultContext.length > 300 ? vaultContext.slice(0, 300) + "..." : vaultContext
        );
        console.log("=== [VaultForge-Chat] Vault context lookup END ===");
        this.setStatus("VF-Chat: context ready");
      } catch (err) {
        this.setStatus("VF-Chat: context error");
        console.error("AskVault error:", err);
      }
    }

    /* ----- Message Assembly ----- */
    const cache = this.app.metadataCache.getFileCache(file);
    const perNotePrompt = (cache?.frontmatter?.vfChatPrompt || cache?.frontmatter?.chatPrompt || "") as string;

    const messages: { role: "user" | "assistant" | "system"; content: string }[] = [
      ...(perNotePrompt ? [{ role: "system" as const, content: perNotePrompt }] : []),
      ...(vaultContext
        ? [{ role: "system" as const, content: `Relevant vault info:\n${vaultContext}` }]
        : []),
      ...chatMessages,
    ];

    /* ----- GPT Call ----- */
    new Notice("VaultForge-Chat: sending…");
    let response = "";
    try {
      this.setStatus("VF-Chat: waiting for reply…");
      new Notice("VaultForge-Chat: waiting for reply…");
      response = await this.core!.chat(messages);
    } catch (err: any) {
      console.error("[VaultForge-Chat] Chat error:", err);
      new Notice("VaultForge-Chat: chat error. See console.");
      return;
    }

    /* ----- Append GPT Reply ----- */
    await this.app.vault.modify(file, content + `\n**GPT:** ${response}\n`);
    this.setStatus("VF-Chat: reply received.");
    new Notice("VaultForge-Chat: reply received.");
  }

  async respondActiveNote() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("No active chat note.");
      return;
    }
    const file = view.file;
    if (file) {
      await this.handleNoteUpdate(file, "enter");
    }
  }

  /* ---------- Settings Persistence ---------- */
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

/* ======================= Settings Tab ======================= */
class GPTChatSettingTab extends PluginSettingTab {
  plugin: VaultForgeChatPlugin;

  constructor(app: App, plugin: VaultForgeChatPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "VaultForge-Chat Settings" });

    /* ----- Chat Folder ----- */
    new Setting(containerEl)
      .setName("Chat folder")
      .setDesc("Folder where chat notes are stored")
      .addText((text) =>
        text
          .setPlaceholder("Chats")
          .setValue(this.plugin.settings.chatFolder)
          .onChange(async (value) => {
            this.plugin.settings.chatFolder = value;
            await this.plugin.saveSettings();
          })
      );

    /* ----- Auto Respond on Save ----- */
    new Setting(containerEl)
      .setName("Auto respond on save")
      .setDesc("Automatically respond when you save a chat note")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoRespondOnSave)
          .onChange(async (value) => {
            this.plugin.settings.autoRespondOnSave = value;
            await this.plugin.saveSettings();
          })
      );

    /* ----- Respond on Enter ----- */
    new Setting(containerEl)
      .setName("Respond on Enter")
      .setDesc("Trigger GPT response when pressing Enter in a chat note")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.respondOnEnter)
          .onChange(async (value) => {
            this.plugin.settings.respondOnEnter = value;
            await this.plugin.saveSettings();
          })
      );

    /* ----- Max Context Lines ----- */
    new Setting(containerEl)
      .setName("Max context lines")
      .setDesc("How many lines to include as conversation context")
      .addText((text) =>
        text
          .setPlaceholder("50")
          .setValue(this.plugin.settings.maxContextLines.toString())
          .onChange(async (value) => {
            this.plugin.settings.maxContextLines = parseInt(value) || 50;
            await this.plugin.saveSettings();
          })
      );
    // force numeric input
    const input = containerEl.querySelector("input[type=text]") as HTMLInputElement;
    if (input) input.type = "number";

    /* ----- Use Vault Context ----- */
    new Setting(containerEl)
      .setName("Use Vault Context")
      .setDesc("Include AskVault results in GPT responses")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useVaultContext)
          .onChange(async (value) => {
            this.plugin.settings.useVaultContext = value;
            await this.plugin.saveSettings();
          })
      );

    /* ----- Vault Query Mode ----- */
    new Setting(containerEl)
      .setName("Vault Query Mode")
      .setDesc("Choose whether GPT uses full AskVault or concise AskVaultConcise results")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("concise", "Concise (AskVaultConcise)")
          .addOption("full", "Full (AskVault)")
          .setValue(this.plugin.settings.vaultMode)
          .onChange(async (value) => {
            this.plugin.settings.vaultMode = value as "full" | "concise";
            await this.plugin.saveSettings();
          })
      );
  }
}

