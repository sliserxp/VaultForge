import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  TFile
} from "obsidian";
import GPTCorePlugin from ".../Plugins/GPT-Core/main";
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export default class GPTChatPlugin extends Plugin {
  private history: ChatMessage[] = [];

  async onload() {
    this.addCommand({
      id: "start-chat",
      name: "GPT: Start Rolling Chat",
      callback: async () => {
        this.history = [];
        new Notice("Started new GPT rolling chat.");
      }
    });

    this.addCommand({
      id: "chat-message",
      name: "GPT: Send Chat Message",
      callback: async () => {
        const userInput = await this.prompt("Enter your message:");
        if (!userInput) return;

        this.history.push({ role: "user", content: userInput });

        // Grab Vault context from GPT-Core
        const core = this.app.plugins.getPlugin("gpt-core") as GPTCorePlugin;
        const vaultContext = await core?.askVault?.(userInput);

        const response = await core?.chat?.([
          { role: "system", content: "You are an assistant inside Obsidian. Use Vault context if useful." },
          { role: "user", content: `Context:\n${vaultContext}\n\nChat:\n${userInput}` },
          ...this.history
        ]);

        if (response) {
          this.history.push({ role: "assistant", content: response });
          new Notice("GPT replied. Use 'save-chat' to persist.");
        }
      }
    });

    this.addCommand({
      id: "save-chat",
      name: "GPT: Save Chat to Note",
      callback: async () => {
        const file = await this.app.vault.create(
          `Chat-${Date.now()}.md`,
          this.renderHistory()
        );
        new Notice(`Chat saved to ${file.path}`);
      }
    });

    this.addCommand({
      id: "load-chat",
      name: "GPT: Load Chat from Note",
      callback: async () => {
        const files = this.app.vault.getMarkdownFiles();
        const latest = files.filter(f => f.path.startsWith("Chat-")).sort((a, b) => b.stat.mtime - a.stat.mtime)[0];
        if (!latest) {
          new Notice("No previous chat notes found.");
          return;
        }
        const text = await this.app.vault.read(latest);
        this.history = this.parseHistory(text);
        new Notice(`Chat loaded from ${latest.path}`);
      }
    });
  }

  onunload() {
    this.history = [];
  }

  private prompt(message: string): Promise<string | null> {
    return new Promise(resolve => {
      const input = window.prompt(message);
      resolve(input || null);
    });
  }

  private renderHistory(): string {
    return this.history.map(m => `**${m.role}**: ${m.content}`).join("\n\n");
  }

  private parseHistory(md: string): ChatMessage[] {
    const lines = md.split("\n").filter(l => l.trim());
    return lines.map(line => {
      const match = line.match(/^\*\*(.*?)\*\*: (.*)$/);
      if (match) {
        return { role: match[1].toLowerCase() as any, content: match[2] };
      }
      return { role: "user", content: line };
    });
  }
}

