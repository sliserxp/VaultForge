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
  parseYaml,
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
  npcRegistry: Record<string, { id:string; voice:string; style?:string; persona?:string; tts?: { rate?: string; pitch?: string; prePauseMs?: number; postPauseMs?: number; phonemes?: string } }> = {};

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
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data || {});
    this.npcRegistry = (data && (data as any).npcs) || {};
  }

  async saveSettings() {
    await this.saveData({ ...this.settings, npcs: this.npcRegistry });
  }

  async saveNpcRegistry() {
    await this.saveData({ ...this.settings, npcs: this.npcRegistry });
  }

  getNpcFiles(): string[] {
    const files = this.app.vault.getMarkdownFiles();
    const list = files
      .filter(f => {
        const top = f.path.split('/')[0].toLowerCase();
        return top === 'npcs' || top === 'npc' || f.path.toLowerCase().includes('/npcs/');
      })
      .map(f => f.basename);
    return list;
  }

  findNpcFileByBasename(basename: string) {
    const files = this.app.vault.getMarkdownFiles();
    return files.find(f => f.basename === basename) || null;
  }

  getNpcProfile(id: string) {
    return this.npcRegistry[id] || { id, voice: this.settings.defaultVoice, style: '', persona: '' };
  }

  setNpcProfile(id: string, profile: { voice: string; style?: string; persona?: string }) {
    this.npcRegistry[id] = { id, voice: profile.voice, style: profile.style || '', persona: profile.persona || '' };
    return this.saveNpcRegistry();
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
  if (!this.client) {
    new Notice("VaultForge-Talk: TTS unavailable (no API key).");
    return;
  }
  try {
    const profile = this.getNpcProfile(npcName);
    const voice = profile?.voice || this.settings.defaultVoice || "alloy";
    console.log(`[VaultForge-Talk] Playing TTS for ${npcName} with voice: ${voice}`);

    // Build SSML from profile tts settings if available
    const tts = profile.tts || {};
    let ssml = text;
    if (tts) {
      const pre = tts.prePauseMs ? `<break time="${tts.prePauseMs}ms"/>` : "";
      const post = tts.postPauseMs ? `<break time="${tts.postPauseMs}ms"/>` : "";
      const prosody = ` rate=\"${tts.rate || '1.0'}\" pitch=\"${tts.pitch || '0%'}\"`;
      ssml = `<speak>${pre}<prosody ${prosody}>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</prosody>${post}</speak>`;
    }

    const response = await this.client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: ssml,
      format: "mp3",
    });

    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play();
  } catch (err) {
    console.error(err);
    const msg = String((err as any)?.message || "");
    if ((err as any)?.status === 401 || /Incorrect API key/i.test(msg)) {
      new Notice("VaultForge-Talk: Invalid OpenAI API key (401). Update key in Core or Talk settings.");
    } else {
      new Notice("TTS failed.");
    }
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

    const profile = this.getNpcProfile(npcName);
    const personaBlock = profile.persona ? `Persona: ${profile.persona}\n` : "";
    const styleBlock = profile.style ? `Style: ${profile.style}\n` : "";

    const systemPrompt = `You are ${npcName}. Stay in character at all times.\n${personaBlock}${styleBlock}Here is what you know about yourself and the world:\n${context}`;

    let npcReply = "";
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: playerLine },
    ];
    const corePlugin = (this.app as any).plugins.getPlugin("vaultforge-core");
    const api = corePlugin?.getAPI ? corePlugin.getAPI() : null;

    if (api && typeof api.chat === "function") {
      npcReply = await api.chat(messages, "gpt-4o-mini");
    } else if (this.client) {
      const completion = await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
      });
      npcReply = completion.choices[0].message.content ?? "";
    } else {
      new Notice("VaultForge-Talk: No API available. Set API key in Core or Talk settings.");
      return "…";
    }

    await this.saveTranscript(npcName, playerLine, npcReply);

    if (this.settings.autoplay) {
      await this.playTTS(npcName, npcReply);
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

/* ---------- NPC Edit Modal ---------- */
class NPCEditModal extends Modal {
  plugin: VaultForgeTalk;
  npcId: string;
  constructor(app: App, plugin: VaultForgeTalk, npcId: string) {
    super(app);
    this.plugin = plugin;
    this.npcId = npcId;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: `Edit NPC: ${this.npcId}` });
    const profile = this.plugin.getNpcProfile(this.npcId);

    // Voice
    const voiceSetting = contentEl.createEl('div', { attr: { style: 'margin-bottom:8px;' } });
    voiceSetting.createEl('label', { text: 'Voice:' });
    const voiceDropdown = voiceSetting.createEl('select');
    ['alloy','echo','fable','onyx','nova','shimmer','coral','verse','ballad','ash','sage','marin','cedar'].forEach(v => {
      const opt = document.createElement('option'); opt.value = v; opt.text = v; if (profile.voice === v) opt.selected = true; voiceDropdown.appendChild(opt);
    });

    // Style
    contentEl.createEl('div', { attr: { style: 'margin-top:8px;' } }).createEl('label', { text: 'Style (short):' });
    const styleInput = contentEl.createEl('textarea'); styleInput.value = profile.style || '';
    styleInput.rows = 2;

    // Persona
    contentEl.createEl('div', { attr: { style: 'margin-top:8px;' } }).createEl('label', { text: 'Persona (longer):' });
    const personaInput = contentEl.createEl('textarea'); personaInput.value = profile.persona || '';
    personaInput.rows = 4;

    // TTS settings
    contentEl.createEl('div', { attr: { style: 'margin-top:8px;' } }).createEl('h4', { text: 'TTS Settings' });
    const ttsRow = contentEl.createEl('div', { attr: { style: 'display:flex; gap:8px; align-items:center;' } });
    // rate
    const rateLabel = ttsRow.createEl('label', { text: 'Rate:' });
    const rateInput = ttsRow.createEl('input'); rateInput.type = 'text'; rateInput.value = profile.tts?.rate || '1.0'; rateInput.style.width = '80px';
    // pitch
    const pitchLabel = ttsRow.createEl('label', { text: 'Pitch:' });
    const pitchInput = ttsRow.createEl('input'); pitchInput.type = 'text'; pitchInput.value = profile.tts?.pitch || '0%'; pitchInput.style.width = '80px';
    // pre/post pause
    const preLabel = ttsRow.createEl('label', { text: 'PrePause(ms):' });
    const preInput = ttsRow.createEl('input'); preInput.type = 'number'; preInput.value = (profile.tts?.prePauseMs || 0).toString(); preInput.style.width = '80px';
    const postLabel = ttsRow.createEl('label', { text: 'PostPause(ms):' });
    const postInput = ttsRow.createEl('input'); postInput.type = 'number'; postInput.value = (profile.tts?.postPauseMs || 0).toString(); postInput.style.width = '80px';

    // phonemes / overrides
    contentEl.createEl('div', { attr: { style: 'margin-top:8px;' } }).createEl('label', { text: 'Phoneme overrides / notes:' });
    const phonemesInput = contentEl.createEl('textarea'); phonemesInput.value = profile.tts?.phonemes || ''; phonemesInput.rows = 2;

    const btnBar = contentEl.createEl('div', { attr: { style: 'display:flex; gap:8px; margin-top:8px;' } });
    const loadBtn = btnBar.createEl('button', { text: 'Load from Note' });
    loadBtn.addEventListener('click', async () => {
      const file = this.plugin.findNpcFileByBasename(this.npcId);
      if (!file) { new Notice('NPC note not found'); return; }
      const content = await this.plugin.app.vault.read(file);
      const fm = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fm) { new Notice('No frontmatter in note'); return; }
      try {
        const data = parseYaml(fm[1]);
        const npc = data?.npc || data;
        if (!npc) { new Notice('No npc block in frontmatter'); return; }
        if (npc.voice) voiceDropdown.value = npc.voice;
        if (npc.style) styleInput.value = npc.style;
        if (npc.persona) personaInput.value = npc.persona;
        if (npc.tts) { rateInput.value = npc.tts.rate || rateInput.value; pitchInput.value = npc.tts.pitch || pitchInput.value; preInput.value = (npc.tts.prePauseMs || preInput.value) + ''; postInput.value = (npc.tts.postPauseMs || postInput.value) + ''; phonemesInput.value = npc.tts.phonemes || phonemesInput.value; }
        new Notice('Loaded from note');
      } catch (e) {
        new Notice('Failed to parse frontmatter');
      }
    });

    const saveBtn = btnBar.createEl('button', { text: 'Save' });
    saveBtn.addEventListener('click', async () => {
      await this.plugin.setNpcProfile(this.npcId, { voice: voiceDropdown.value, style: styleInput.value, persona: personaInput.value });
      // also save tts settings
      const tts = { rate: rateInput.value, pitch: pitchInput.value, prePauseMs: parseInt(preInput.value) || 0, postPauseMs: parseInt(postInput.value) || 0, phonemes: phonemesInput.value };
      this.plugin.npcRegistry[this.npcId].tts = tts;
      await this.plugin.saveNpcRegistry();
      new Notice('NPC profile saved');
      this.close();
    });
    const cancelBtn = btnBar.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());
  }
  onClose() { this.contentEl.empty(); }
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
            echo: "Echo",
            fable: "Fable",
            onyx: "Onyx",
            nova: "Nova",
            shimmer: "Shimmer",
            coral: "Coral",
            verse: "Verse",
            ballad: "Ballad",
            ash: "Ash",
            sage: "Sage",
            marin: "Marin",
            cedar: "Cedar",
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

    /* ----- NPC Registry Editor (inline) ----- */
    containerEl.createEl('h3', { text: 'NPC Registry' });

    // Selector
    const plugin = this.plugin;
    const files = plugin.getNpcFiles();
    const opts: Record<string,string> = { '': '-- Select NPC --' };
    files.forEach(f => opts[f] = f);

    const selectorSetting = new Setting(containerEl)
      .setName('Select NPC')
      .setDesc('Choose NPC note (basename) to edit runtime profile')
      .addDropdown((dropdown) => {
        dropdown.addOptions(opts).setValue('');
        dropdown.onChange((value) => {
          renderEditor(value);
        });
      });

    const editorContainer = containerEl.createEl('div', { attr: { style: 'margin-top:8px; padding:8px; border:1px solid var(--background-modifier-border); border-radius:4px;' } });

    function clearEditor() {
      editorContainer.empty();
      editorContainer.createEl('div', { text: 'Select an NPC to edit its profile.' });
    }

    clearEditor();

    function renderEditor(npcId: string) {
      editorContainer.empty();
      if (!npcId) { clearEditor(); return; }
      const profile = (plugin.getNpcProfile(npcId) as any) || { id: npcId, voice: plugin.settings.defaultVoice, style: '', persona: '', tts: {} };

      // Voice
      const voiceRow = editorContainer.createEl('div', { attr: { style: 'margin-bottom:6px; display:flex; gap:8px; align-items:center;' } });
      voiceRow.createEl('label', { text: 'Voice:' });
      const voiceSelect = voiceRow.createEl('select');
      ['alloy','echo','fable','onyx','nova','shimmer','coral','verse','ballad','ash','sage','marin','cedar'].forEach(v => { const opt = document.createElement('option'); opt.value = v; opt.text = v; if (profile.voice === v) opt.selected = true; voiceSelect.appendChild(opt); });

      // Style
      editorContainer.createEl('div', { attr: { style: 'margin-top:6px;' } }).createEl('label', { text: 'Style (short):' });
      const styleField = editorContainer.createEl('textarea'); styleField.rows = 2; styleField.value = profile.style || '';

      // Persona
      editorContainer.createEl('div', { attr: { style: 'margin-top:6px;' } }).createEl('label', { text: 'Persona (longer):' });
      const personaField = editorContainer.createEl('textarea'); personaField.rows = 4; personaField.value = profile.persona || '';

      // TTS
      editorContainer.createEl('div', { attr: { style: 'margin-top:6px;' } }).createEl('h4', { text: 'TTS Settings' });
      const ttsRow = editorContainer.createEl('div', { attr: { style: 'display:flex; gap:8px; align-items:center;' } });
      ttsRow.createEl('label', { text: 'Rate:' }); const rateInput = ttsRow.createEl('input'); rateInput.type = 'text'; rateInput.value = profile.tts?.rate || '1.0'; rateInput.style.width = '80px';
      ttsRow.createEl('label', { text: 'Pitch:' }); const pitchInput = ttsRow.createEl('input'); pitchInput.type = 'text'; pitchInput.value = profile.tts?.pitch || '0%'; pitchInput.style.width = '80px';
      ttsRow.createEl('label', { text: 'Pre(ms):' }); const preInput = ttsRow.createEl('input'); preInput.type = 'number'; preInput.value = (profile.tts?.prePauseMs || 0).toString(); preInput.style.width = '80px';
      ttsRow.createEl('label', { text: 'Post(ms):' }); const postInput = ttsRow.createEl('input'); postInput.type = 'number'; postInput.value = (profile.tts?.postPauseMs || 0).toString(); postInput.style.width = '80px';

      editorContainer.createEl('div', { attr: { style: 'margin-top:6px;' } }).createEl('label', { text: 'Phonemes / notes:' });
      const phonemeField = editorContainer.createEl('textarea'); phonemeField.rows = 2; phonemeField.value = profile.tts?.phonemes || '';

      // Buttons
      const btns = editorContainer.createEl('div', { attr: { style: 'display:flex; gap:8px; margin-top:8px;' } });
      const saveBtn = btns.createEl('button', { text: 'Save' });
      const previewBtn = btns.createEl('button', { text: 'Preview' });

      saveBtn.addEventListener('click', async () => {
        const newProfile = { voice: voiceSelect.value, style: styleField.value, persona: personaField.value };
        await plugin.setNpcProfile(npcId, newProfile);
        plugin.npcRegistry[npcId].tts = { rate: rateInput.value, pitch: pitchInput.value, prePauseMs: parseInt(preInput.value) || 0, postPauseMs: parseInt(postInput.value) || 0, phonemes: phonemeField.value };
        await plugin.saveNpcRegistry();
        new Notice('NPC profile saved');
      });

      previewBtn.addEventListener('click', async () => {
        // construct temp profile for preview without saving
        const temp = { id: npcId, voice: voiceSelect.value, style: styleField.value, persona: personaField.value, tts: { rate: rateInput.value, pitch: pitchInput.value, prePauseMs: parseInt(preInput.value) || 0, postPauseMs: parseInt(postInput.value) || 0, phonemes: phonemeField.value } } as any;
        const original = plugin.npcRegistry[npcId];
        plugin.npcRegistry[npcId] = temp;
        await plugin.playTTS(npcId, 'Vault Forge, can be EXPRESSIVE!');
        // restore original after short delay to avoid race
        setTimeout(() => { if (original) plugin.npcRegistry[npcId] = original; else delete plugin.npcRegistry[npcId]; }, 2000);
      });

    }

  }
}

