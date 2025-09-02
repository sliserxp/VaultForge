/* ========================
   VaultForge-Talk Plugin
   ======================== */
import {
  App,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  Modal,
  WorkspaceLeaf,
  requestUrl,
} from "obsidian";
import OpenAI from "openai";

/* ---------- Settings ---------- */
interface VaultForgeTalkSettings {
  apiKey: string;
  defaultVoice: string;
  autoplay: boolean;
  transcriptMode: "npc" | "transcript" | "both" | "none";
}

const DEFAULT_SETTINGS: VaultForgeTalkSettings = {
  apiKey: "",
  defaultVoice: "alloy",
  autoplay: false,
  transcriptMode: "transcript",
};

/* ---------- Plugin ---------- */
export default class VaultForgeTalk extends Plugin {
  settings!: VaultForgeTalkSettings;
  client!: OpenAI;

  async onload() {
    console.log("VaultForge-Talk loaded");
    await this.loadSettings();

  // 🔗 Get API key from VaultForge-Core if available
  const core = (this.app as any).plugins.getPlugin("vaultforge-core");
  const apiKey = core?.settings?.apiKey || this.settings.apiKey;

  if (!apiKey) {
    new Notice("VaultForge-Talk: No API key found in Core or Talk settings.");
  } else {
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    console.log("[VaultForge-Talk] Using API key from", core ? "Core" : "Talk settings");
};

    /* ---- Command: NPC Respond ---- */
    this.addCommand({
      id: "npc-respond",
      name: "NPC Respond",
      callback: async () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
          new Notice("No file open.");
          return;
        }
        const npcName = activeFile.basename;
        const playerLine = await this.getInput("What do you say?");
        if (!playerLine) return;

        const npcReply = await this.generateNpcResponse(npcName, playerLine);

        // Show in notice for quick use
        new Notice(`${npcName}: ${npcReply}`);
      },
    });    

    /* ---- Register Chatbox View ---- */
    this.registerView(
      VaultForgeTalkView.VIEW_TYPE,
      (leaf) => new VaultForgeTalkView(leaf, this)
    );

    this.addRibbonIcon("message-square", "Open VaultForge-Talk", () => {
      this.activateView();
    });

    /* ---- Settings Tab ---- */
    this.addSettingTab(new VaultForgeTalkSettingTab(this.app, this));
  }

  onunload() {
    console.log("VaultForge-Talk unloaded");
    this.app.workspace.detachLeavesOfType(VaultForgeTalkView.VIEW_TYPE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    this.app.workspace.detachLeavesOfType(VaultForgeTalkView.VIEW_TYPE);
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({
      type: VaultForgeTalkView.VIEW_TYPE,
      active: true,
    });
    this.app.workspace.revealLeaf(leaf);
  }

  async playTTS(npcName: string, text: string) {
  try {
    const voice = this.settings.defaultVoice || "alloy";
    console.log(`[VaultForge-Talk] Playing TTS for ${npcName} with voice: ${voice}`);

    const response = await this.client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
    });

    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play();
  } catch (err) {
    console.error(err);
    new Notice("TTS failed.");
  }
}

  async generateNpcResponse(npcName: string, playerLine: string): Promise<string> {
  try {
    const core = (this.app as any).plugins.getPlugin("vaultforge-core");

    let context = "";
    if (core && typeof core.askVault === "function") {
      context = await core.askVault(npcName);
      console.log(`[VaultForge-Talk] AskVault context for ${npcName}:`, context);
    } else {
      console.warn("[VaultForge-Talk] Could not find askVault on Core");
    }

    const systemPrompt = `You are ${npcName}. Stay in character at all times.
      Here is what you know about yourself and the world:\n${context}`;

    const completion = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: playerLine },
      ],
    });

    const npcReply = completion.choices[0].message.content ?? "";

    await this.saveTranscript(npcName, playerLine, npcReply);

    if (this.settings.autoplay) {
      await this.playTTS(npcName, npcReply);  // make sure playTTS is a method of the class
    }

    return npcReply;
  } catch (err) {
    console.error(err);
    new Notice("Error generating NPC response.");
    return "…";
  }
}

async saveTranscript(npcName: string, playerLine: string, npcReply: string) {
  const vault = this.app.vault;
  const transcriptLine = `Player: ${playerLine}\n${npcName}: ${npcReply}\n\n`;

  if (this.settings.transcriptMode === "none") return;

  if (this.settings.transcriptMode === "transcript" || this.settings.transcriptMode === "both") {
    const path = `Transcripts/${npcName}.md`;
    let file = vault.getAbstractFileByPath(path);
    if (!file) {
      file = await vault.create(path, `# Transcript: ${npcName}\n\n`);
    }
    await vault.append(file as any, transcriptLine);
  }

  if (this.settings.transcriptMode === "npc" || this.settings.transcriptMode === "both") {
    const path = `NPCs/${npcName}.md`;
    const file = vault.getAbstractFileByPath(path);
    if (file) {
      await vault.append(file as any, `\n## Dialogue Log\n${transcriptLine}`);
    }
  }
}

  async getInput(prompt: string): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = new PromptModal(this.app, prompt, resolve);
      modal.open();
    });
  }
}

/* ---------- View (Chatbox) ---------- */
class VaultForgeTalkView extends MarkdownView {
  static VIEW_TYPE = "vaultforge-talk-view";
  plugin: VaultForgeTalk;

  constructor(leaf: WorkspaceLeaf, plugin: VaultForgeTalk) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VaultForgeTalkView.VIEW_TYPE;
  }

  getDisplayText() {
    return "VaultForge-Talk";
  }
}

/* ---------- Prompt Modal ---------- */
class PromptModal extends Modal {
  prompt: string;
  onSubmit: (input: string | null) => void;

  constructor(app: App, prompt: string, onSubmit: (input: string | null) => void) {
    super(app);
    this.prompt = prompt;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.prompt });
    const input = contentEl.createEl("input", { type: "text" });
    input.focus();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.onSubmit(input.value);
        this.close();
      }
    });
  }

  onClose() {
    this.onSubmit(null);
  }
}

/* ---------- Settings Tab ---------- */
class VaultForgeTalkSettingTab extends PluginSettingTab {
  plugin: VaultForgeTalk;

  constructor(app: App, plugin: VaultForgeTalk) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "VaultForge-Talk Settings" });

    new Setting(containerEl)
      .setName("OpenAI API Key")
      .setDesc("Enter your OpenAI API key")
      .addText((text) =>
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default Voice")
      .setDesc("Fallback voice if NPC YAML is missing one")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            alloy: "Alloy",
            verse: "Verse",
            lumen: "Lumen",
            echo: "Echo",
            flow: "Flow",
          })
          .setValue(this.plugin.settings.defaultVoice)
          .onChange(async (value) => {
            this.plugin.settings.defaultVoice = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Autoplay NPC Voice")
      .setDesc("Automatically play NPC voice lines")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoplay)
          .onChange(async (value) => {
            this.plugin.settings.autoplay = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Transcript Saving")
      .setDesc("Where to save dialogue transcripts")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            npc: "NPC Note",
            transcript: "Dedicated Transcript Note",
            both: "Both",
            none: "None",
          })
          .setValue(this.plugin.settings.transcriptMode)
          .onChange(async (value: string) => {
            this.plugin.settings.transcriptMode = value as "npc" | "transcript" | "both" | "none";
            await this.plugin.saveSettings();
          })
      );
  }
}

