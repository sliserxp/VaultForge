"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
class GPTChatPlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.history = [];
    }
    async onload() {
        this.addCommand({
            id: "start-chat",
            name: "GPT: Start Rolling Chat",
            callback: async () => {
                this.history = [];
                new obsidian_1.Notice("Started new GPT rolling chat.");
            }
        });
        this.addCommand({
            id: "chat-message",
            name: "GPT: Send Chat Message",
            callback: async () => {
                const userInput = await this.prompt("Enter your message:");
                if (!userInput)
                    return;
                this.history.push({ role: "user", content: userInput });
                // Grab Vault context from GPT-Core
                const core = this.app.plugins.getPlugin("gpt-core");
                const vaultContext = await core?.askVault?.(userInput);
                const response = await core?.chat?.([
                    { role: "system", content: "You are an assistant inside Obsidian. Use Vault context if useful." },
                    { role: "user", content: `Context:\n${vaultContext}\n\nChat:\n${userInput}` },
                    ...this.history
                ]);
                if (response) {
                    this.history.push({ role: "assistant", content: response });
                    new obsidian_1.Notice("GPT replied. Use 'save-chat' to persist.");
                }
            }
        });
        this.addCommand({
            id: "save-chat",
            name: "GPT: Save Chat to Note",
            callback: async () => {
                const file = await this.app.vault.create(`Chat-${Date.now()}.md`, this.renderHistory());
                new obsidian_1.Notice(`Chat saved to ${file.path}`);
            }
        });
        this.addCommand({
            id: "load-chat",
            name: "GPT: Load Chat from Note",
            callback: async () => {
                const files = this.app.vault.getMarkdownFiles();
                const latest = files.filter(f => f.path.startsWith("Chat-")).sort((a, b) => b.stat.mtime - a.stat.mtime)[0];
                if (!latest) {
                    new obsidian_1.Notice("No previous chat notes found.");
                    return;
                }
                const text = await this.app.vault.read(latest);
                this.history = this.parseHistory(text);
                new obsidian_1.Notice(`Chat loaded from ${latest.path}`);
            }
        });
    }
    onunload() {
        this.history = [];
    }
    prompt(message) {
        return new Promise(resolve => {
            const input = window.prompt(message);
            resolve(input || null);
        });
    }
    renderHistory() {
        return this.history.map(m => `**${m.role}**: ${m.content}`).join("\n\n");
    }
    parseHistory(md) {
        const lines = md.split("\n").filter(l => l.trim());
        return lines.map(line => {
            const match = line.match(/^\*\*(.*?)\*\*: (.*)$/);
            if (match) {
                return { role: match[1].toLowerCase(), content: match[2] };
            }
            return { role: "user", content: line };
        });
    }
}
exports.default = GPTChatPlugin;
