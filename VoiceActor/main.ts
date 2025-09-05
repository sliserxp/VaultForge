import { App, Plugin, PluginSettingTab, Setting, TFile, Notice } from "obsidian";

interface VoiceActorSettings {
  apiKey: string;
  defaultVoice: string;
}

const DEFAULT_SETTINGS: VoiceActorSettings = {
  apiKey: "",
  defaultVoice: "alloy",
};

export default class VoiceActor extends Plugin {
  settings: VoiceActorSettings;
  lastTranscriptOffsets: Record<string, number> = {};

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new VoiceActorSettingTab(this.app, this));

    const statusBar = this.addStatusBarItem();
      statusBar.setText("🎭 Act");
      statusBar.setAttr("title", "Act Transcript");
      statusBar.addEventListener("click", async () => {
      const file = this.app.workspace.getActiveFile();
      if (file) {
        statusBar.setText("🔊 Acting...");
        const content = await this.app.vault.read(file);
        await this.speakTranscript(content, file);
        statusBar.setText("🎭 Act");
      } else {
        new Notice("No active note to act.");
      }
    });

    this.addCommand({
      id: "voiceactor-act-note",
      name: "🎭 Act Transcript",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const content = await this.app.vault.read(file);
          await this.speakTranscript(content, file);
        } else {
          new Notice("No active note.");
        }
      },
    });

    this.addCommand({
      id: "voiceactor-reset-transcript",
      name: "🔄 Reset Transcript Act Position",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice("No active note to reset.");
          return;
        }
        this.lastTranscriptOffsets[file.path] = 0;
        new Notice(`VoiceActor: Reset act position for ${file.basename}`);
      },
    });
  }

  /**
   * Parse transcript and queue NPC lines.
   */
  async speakTranscript(text: string, file: TFile) {
    if (!this.settings.apiKey) {
      new Notice("VoiceActor: Missing OpenAI API key.");
      return;
    }

    const lastOffset = this.lastTranscriptOffsets[file.path] ?? 0;
    const newText = text.slice(lastOffset);
    if (!newText.trim()) {
      console.log("VoiceActor: No new transcript entries.");
      return;
    }

    // Match both [[Name]]: Dialogue and **[Name]:** Dialogue
    const regex = /(?:\[\[([^\]]+)\]\]|(?:\*\*\[([^\]]+)\]:\*\*))\s*:?\s*([\s\S]+?)(?=(\n\[\[|\n\*\*\[|$))/g;

    let match;
    const queue: { speaker: string; dialogue: string; voice: string; style: string }[] = [];

    console.log("VoiceActor: Checking transcript for new lines…");

    while ((match = regex.exec(newText)) !== null) {
      const speaker = (match[1] || match[2]).trim();
      const dialogue = match[3].trim();

      console.log(`🔎 Found line → Speaker: "${speaker}", Dialogue: "${dialogue.slice(0,80)}..."`);

      // Resolve linked file
      const linkedFile = this.app.metadataCache.getFirstLinkpathDest(speaker, "");
      if (!linkedFile) {
        console.warn(`❌ Could not resolve note for [${speaker}]`);
        continue;
      }
      console.log(`📄 Resolved file for ${speaker}: ${linkedFile.path}`);

      const metadata = this.app.metadataCache.getFileCache(linkedFile);

      // Normalize frontmatter keys
      const fm: Record<string, any> = {};
      if (metadata?.frontmatter) {
        for (const key in metadata.frontmatter) {
          fm[key.toLowerCase()] = metadata.frontmatter[key];
        }
      }

      console.log(`📑 Normalized frontmatter for ${speaker}:`, fm);

      if (fm["type"] !== "npc") {
        console.warn(`❌ Skipping ${speaker} (type is "${fm["type"] || "undefined"}")`);
        continue;
      }

      const voice = fm["voice"] || this.settings.defaultVoice;
      const style = fm["style"] || "neutral";

      console.log(`✅ Queued ${speaker} (${voice}, style: ${style}) → ${dialogue.slice(0,80)}...`);
      queue.push({ speaker, dialogue, voice, style });
    }

    this.lastTranscriptOffsets[file.path] = text.length;

    if (queue.length === 0) {
      console.log("VoiceActor: No valid NPC lines found in new transcript.");
      return;
    }

    console.log(`VoiceActor: Acting ${queue.length} queued NPC lines sequentially…`);

    for (const line of queue) {
      console.log(`🎭 Acting → ${line.speaker} (${line.voice}, style: ${line.style}): ${line.dialogue}`);
      await this.speak(line.dialogue, undefined, line.voice, line.style);
    }
  }

  /**
   * Send line to OpenAI TTS
   */
  async speak(text: string, file?: TFile, voice?: string, style?: string) {
    if (!this.settings.apiKey) return;

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

    console.log("VoiceActor → Sending TTS payload:", payload);

    try {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("VoiceActor TTS Error Response:", errText);
        new Notice("VoiceActor: TTS request failed.");
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        audio.onended = () => resolve();
        audio.onerror = (e) => reject(e);
        audio.play();
      });

    } catch (err) {
      console.error("VoiceActor Error:", err);
      new Notice("VoiceActor: Could not connect to OpenAI.");
    }
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class VoiceActorSettingTab extends PluginSettingTab {
  plugin: VoiceActor;

  constructor(app: App, plugin: VoiceActor) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "🎭 Voice Actor Settings" });

    new Setting(containerEl)
      .setName("OpenAI API Key")
      .setDesc("Enter your OpenAI API Key")
      .addText((text) =>
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default Voice")
      .setDesc("Voice to use if not specified in NPC YAML")
      .addText((text) =>
        text.setValue(this.plugin.settings.defaultVoice).onChange(async (value) => {
          this.plugin.settings.defaultVoice = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
