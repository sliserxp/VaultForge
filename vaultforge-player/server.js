"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const obsidian_1 = require("obsidian");
function startServer(plugin, port = 3000) {
    const app = (0, express_1.default)();
    // === Serve frontend build ===
    const frontendPath = path_1.default.join(plugin.manifest.dir, "frontend", "dist");
    app.use("/", express_1.default.static(frontendPath));
    // === Example: Player sheet ===
    app.get("/api/player/:id", async (req, res) => {
        const playerId = req.params.id;
        const file = plugin.app.vault.getAbstractFileByPath(`Players/${playerId}.md`);
        if (file instanceof obsidian_1.TFile) {
            const content = await plugin.app.vault.read(file);
            const fm = content.match(/---([\s\S]*?)---/);
            if (fm) {
                res.json((0, obsidian_1.parseYaml)(fm[1]));
                return;
            }
        }
        res.status(404).send({ error: "Player not found" });
    });
    // === Example: Shop items ===
    app.get("/api/shop", async (_req, res) => {
        const file = plugin.app.vault.getAbstractFileByPath("Shop/stock.md");
        if (file instanceof obsidian_1.TFile) {
            const content = await plugin.app.vault.read(file);
            const fm = content.match(/---([\s\S]*?)---/);
            res.json(fm ? (0, obsidian_1.parseYaml)(fm[1]) : {});
            return;
        }
        res.json({ items: [] });
    });
    app.listen(port, "0.0.0.0", () => {
        console.log(`[VaultForge-Player] Dashboard → http://VaultForge:${port}`);
    });
}
