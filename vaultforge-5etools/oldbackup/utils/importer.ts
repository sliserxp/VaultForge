import * as fs from "fs";
import * as path from "path";
import { normalizeAny } from "./normalize";
import { openDatabase, saveDatabase } from "./db";
import type { Database } from "sql.js";

/**
 * Build a new SQLite database from 5etools JSON files (using sql.js).
 * @param dataDir Directory with 5etools JSON files
 * @param outFile Output database file (e.g. 5etools.db)
 * @param pluginDir Plugin directory (so db.ts can find sql-wasm.wasm)
 */
export async function buildDatabase(dataDir: string, outFile: string, pluginDir: string) {
  if (fs.existsSync(outFile)) fs.rmSync(outFile);

  const db: Database = await openDatabase(outFile, pluginDir);

  // Create schema
  db.run(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      source TEXT,
      description TEXT,
      requirements TEXT,
      rarity TEXT NOT NULL DEFAULT 'Common',
      level INTEGER,
      weight REAL,
      strength INTEGER NOT NULL,
      value INTEGER NOT NULL,
      raw TEXT
    );
  `);

  const files = [
    "spells.json",
    "items.json",
    "feats.json",
    "bestiary.json",
    "classFeatures.json"
  ];

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) continue;

    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const entries = Array.isArray(raw) ? raw : Object.values(raw).flat();

    for (const e of entries) {
      const n = normalizeAny(e);
      if (!n) continue;

      db.run(
        `INSERT INTO entries 
          (name, type, source, description, requirements, rarity, level, weight, strength, value, raw)
         VALUES ($name, $type, $source, $description, $requirements, $rarity, $level, $weight, $strength, $value, $raw);`,
        {
          $name: n.name,
          $type: n.type,
          $source: n.source ?? "Unknown",
          $description: n.description ?? "",
          $requirements: n.requirements ?? null,
          $rarity: n.rarity,
          $level: n.level ?? null,
          $weight: n.weight ?? null,
          $strength: n.strength,
          $value: n.value,
          $raw: JSON.stringify(e),
        }
      );
    }
  }

  await saveDatabase(db, outFile);
  console.log(`[VaultForge-5eTools] Built database at ${outFile}`);
}

