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
  default: () => VoiceActor
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  apiKey: "",
  defaultVoice: "alloy"
};
var VoiceActor = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.lastTranscriptOffsets = {};
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new VoiceActorSettingTab(this.app, this));
    const statusBar = this.addStatusBarItem();
    statusBar.setText("\u{1F3AD} Act");
    statusBar.setAttr("title", "Act Transcript");
    statusBar.addEventListener("click", async () => {
      const file = this.app.workspace.getActiveFile();
      if (file) {
        statusBar.setText("\u{1F50A} Acting...");
        const content = await this.app.vault.read(file);
        await this.speakTranscript(content, file);
        statusBar.setText("\u{1F3AD} Act");
      } else {
        new import_obsidian.Notice("No active note to act.");
      }
    });
    this.addCommand({
      id: "voiceactor-act-note",
      name: "\u{1F3AD} Act Transcript",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const content = await this.app.vault.read(file);
          await this.speakTranscript(content, file);
        } else {
          new import_obsidian.Notice("No active note.");
        }
      }
    });
    this.addCommand({
      id: "voiceactor-reset-transcript",
      name: "\u{1F504} Reset Transcript Act Position",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new import_obsidian.Notice("No active note to reset.");
          return;
        }
        this.lastTranscriptOffsets[file.path] = 0;
        new import_obsidian.Notice(`VoiceActor: Reset act position for ${file.basename}`);
      }
    });
  }
  /**
   * Parse transcript and queue NPC lines.
   */
  async speakTranscript(text, file) {
    if (!this.settings.apiKey) {
      new import_obsidian.Notice("VoiceActor: Missing OpenAI API key.");
      return;
    }
    const lastOffset = this.lastTranscriptOffsets[file.path] ?? 0;
    const newText = text.slice(lastOffset);
    if (!newText.trim()) {
      console.log("VoiceActor: No new transcript entries.");
      return;
    }
    const regex = /(?:\[\[([^\]]+)\]\]|(?:\*\*\[([^\]]+)\]:\*\*))\s*:?\s*([\s\S]+?)(?=(\n\[\[|\n\*\*\[|$))/g;
    let match;
    const queue = [];
    console.log("VoiceActor: Checking transcript for new lines\u2026");
    while ((match = regex.exec(newText)) !== null) {
      const speaker = (match[1] || match[2]).trim();
      const dialogue = match[3].trim();
      console.log(`\u{1F50E} Found line \u2192 Speaker: "${speaker}", Dialogue: "${dialogue.slice(0, 80)}..."`);
      const linkedFile = this.app.metadataCache.getFirstLinkpathDest(speaker, "");
      if (!linkedFile) {
        console.warn(`\u274C Could not resolve note for [${speaker}]`);
        continue;
      }
      console.log(`\u{1F4C4} Resolved file for ${speaker}: ${linkedFile.path}`);
      const metadata = this.app.metadataCache.getFileCache(linkedFile);
      const fm = {};
      if (metadata?.frontmatter) {
        for (const key in metadata.frontmatter) {
          fm[key.toLowerCase()] = metadata.frontmatter[key];
        }
      }
      console.log(`\u{1F4D1} Normalized frontmatter for ${speaker}:`, fm);
      if (fm["type"] !== "npc") {
        console.warn(`\u274C Skipping ${speaker} (type is "${fm["type"] || "undefined"}")`);
        continue;
      }
      const voice = fm["voice"] || this.settings.defaultVoice;
      const style = fm["style"] || "neutral";
      console.log(`\u2705 Queued ${speaker} (${voice}, style: ${style}) \u2192 ${dialogue.slice(0, 80)}...`);
      queue.push({ speaker, dialogue, voice, style });
    }
    this.lastTranscriptOffsets[file.path] = text.length;
    if (queue.length === 0) {
      console.log("VoiceActor: No valid NPC lines found in new transcript.");
      return;
    }
    console.log(`VoiceActor: Acting ${queue.length} queued NPC lines sequentially\u2026`);
    for (const line of queue) {
      console.log(`\u{1F3AD} Acting \u2192 ${line.speaker} (${line.voice}, style: ${line.style}): ${line.dialogue}`);
      await this.speak(line.dialogue, void 0, line.voice, line.style);
    }
  }
  /**
   * Send line to OpenAI TTS
   */
  async speak(text, file, voice, style) {
    if (!this.settings.apiKey)
      return;
    voice = voice ?? this.settings.defaultVoice;
    style = style ?? "neutral";
    const payload = {
      model: "gpt-4o-mini-tts",
      voice,
      input: `Render this line with the following voice profile:
- Voice preset: ${voice}
- Speaking style: ${style}
Line: ${text}`
    };
    console.log("VoiceActor \u2192 Sending TTS payload:", payload);
    try {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error("VoiceActor TTS Error Response:", errText);
        new import_obsidian.Notice("VoiceActor: TTS request failed.");
        return;
      }
      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      await new Promise((resolve, reject) => {
        const audio = new Audio(url);
        audio.onended = () => resolve();
        audio.onerror = (e) => reject(e);
        audio.play();
      });
    } catch (err) {
      console.error("VoiceActor Error:", err);
      new import_obsidian.Notice("VoiceActor: Could not connect to OpenAI.");
    }
  }
  onunload() {
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var VoiceActorSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "\u{1F3AD} Voice Actor Settings" });
    new import_obsidian.Setting(containerEl).setName("OpenAI API Key").setDesc("Enter your OpenAI API Key").addText(
      (text) => text.setPlaceholder("sk-...").setValue(this.plugin.settings.apiKey).onChange(async (value) => {
        this.plugin.settings.apiKey = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Default Voice").setDesc("Voice to use if not specified in NPC YAML").addText(
      (text) => text.setValue(this.plugin.settings.defaultVoice).onChange(async (value) => {
        this.plugin.settings.defaultVoice = value;
        await this.plugin.saveSettings();
      })
    );
  }
};
