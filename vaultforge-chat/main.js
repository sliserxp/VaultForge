"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VaultForgeChatPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  chatFolder: "Chats",
  autoRespondOnSave: true,
  respondOnEnter: false,
  // default off
  maxContextLines: 50,
  useVaultContext: true,
  vaultMode: "concise"
};
var VaultForgeChatPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.core = null;
  }
  /* ---------- Lifecycle ---------- */
  async onload() {
    console.log("Loading VaultForge-Chat...");
    await this.loadSettings();
    this.core = this.app.plugins.getPlugin("vaultforge-core");
    if (!this.core) {
      new import_obsidian.Notice("\u26A0\uFE0F GPT-Core not loaded. VaultForge-Chat disabled.");
      return;
    }
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (file instanceof import_obsidian.TFile && this.settings.autoRespondOnSave) {
          await this.handleNoteUpdate(file);
        }
      })
    );
    this.registerDomEvent(document, "keydown", async (evt) => {
      if (this.settings.respondOnEnter && evt.key === "Enter" && evt.shiftKey === false) {
        const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (view && view.file && view.file.path.startsWith(this.settings.chatFolder)) {
          await this.handleNoteUpdate(view.file);
        }
      }
    });
    this.addCommand({
      id: "vaultforge-chat-respond",
      name: "GPT Respond (current chat note)",
      callback: () => this.respondActiveNote()
    });
    this.addSettingTab(new GPTChatSettingTab(this.app, this));
    console.log("\u2705 VaultForge-Chat loaded and linked to GPT-Core");
  }
  onunload() {
    console.log("Unloading VaultForge-Chat...");
  }
  /* ---------- Core Methods ---------- */
  async handleNoteUpdate(file) {
    if (!file.path.startsWith(this.settings.chatFolder)) return;
    if (!file.path.endsWith(".md")) return;
    let content = await this.app.vault.read(file);
    let lines = content.split("\n");
    lines = lines.slice(-this.settings.maxContextLines).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return;
    let lastLine = lines[lines.length - 1];
    if (!lastLine.startsWith("**You:**") && !lastLine.startsWith("**GPT:**")) {
      lastLine = `**You:** ${lastLine}`;
      lines[lines.length - 1] = lastLine;
      content = content.trimEnd() + "\n" + lastLine;
      await this.app.vault.modify(file, content);
    }
    if (!lastLine.startsWith("**You:**")) return;
    const userMessage = lastLine.replace("**You:**", "").trim();
    const chatMessages = lines.map((line) => {
      if (line.startsWith("**You:**"))
        return { role: "user", content: line.replace("**You:**", "").trim() };
      if (line.startsWith("**GPT:**"))
        return { role: "assistant", content: line.replace("**GPT:**", "").trim() };
      return { role: "user", content: line };
    });
    let vaultContext = "";
    if (this.settings.useVaultContext && this.core) {
      try {
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
      } catch (err) {
        console.error("AskVault error:", err);
      }
    }
    const messages = [
      ...vaultContext ? [{ role: "system", content: `Relevant vault info:
${vaultContext}` }] : [],
      ...chatMessages
    ];
    const response = await this.core.chat(messages);
    await this.app.vault.modify(file, content + `
**GPT:** ${response}
`);
  }
  async respondActiveNote() {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!view) {
      new import_obsidian.Notice("No active chat note.");
      return;
    }
    const file = view.file;
    if (file) {
      await this.handleNoteUpdate(file);
    }
  }
  /* ---------- Settings Persistence ---------- */
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var GPTChatSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "VaultForge-Chat Settings" });
    new import_obsidian.Setting(containerEl).setName("Chat folder").setDesc("Folder where chat notes are stored").addText(
      (text) => text.setPlaceholder("Chats").setValue(this.plugin.settings.chatFolder).onChange(async (value) => {
        this.plugin.settings.chatFolder = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Auto respond on save").setDesc("Automatically respond when you save a chat note").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoRespondOnSave).onChange(async (value) => {
        this.plugin.settings.autoRespondOnSave = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Respond on Enter").setDesc("Trigger GPT response when pressing Enter in a chat note").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.respondOnEnter).onChange(async (value) => {
        this.plugin.settings.respondOnEnter = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Max context lines").setDesc("How many lines to include as conversation context").addText(
      (text) => text.setPlaceholder("50").setValue(this.plugin.settings.maxContextLines.toString()).onChange(async (value) => {
        this.plugin.settings.maxContextLines = parseInt(value) || 50;
        await this.plugin.saveSettings();
      })
    );
    const input = containerEl.querySelector("input[type=text]");
    if (input) input.type = "number";
    new import_obsidian.Setting(containerEl).setName("Use Vault Context").setDesc("Include AskVault results in GPT responses").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.useVaultContext).onChange(async (value) => {
        this.plugin.settings.useVaultContext = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Vault Query Mode").setDesc("Choose whether GPT uses full AskVault or concise AskVaultConcise results").addDropdown(
      (dropdown) => dropdown.addOption("concise", "Concise (AskVaultConcise)").addOption("full", "Full (AskVault)").setValue(this.plugin.settings.vaultMode).onChange(async (value) => {
        this.plugin.settings.vaultMode = value;
        await this.plugin.saveSettings();
      })
    );
  }
};
