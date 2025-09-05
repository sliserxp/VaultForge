import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";
import { buildDatabase } from "../importer";  // ✅ importer.ts is in plugin root

/**
 * Update 5eTools database from a remote ZIP (GitHub release, etc.)
 * @param pluginDir Directory of the plugin (this.manifest.dir)
 * @param outFile Path to output SQLite DB file
 */
export async function update5eDatabase(pluginDir: string, outFile: string) {
  const tmpZip = path.join(pluginDir, "5etools.zip");

  // TODO: Replace this with a real download (GitHub release URL)
  // For now, assume zip already exists locally
  if (!fs.existsSync(tmpZip)) {
    throw new Error(`Missing ${tmpZip}, download step not implemented`);
  }

  // Extract into a temp folder
  const tmpDir = path.join(pluginDir, "data");
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir);

  const zip = new AdmZip(tmpZip);
  zip.extractAllTo(tmpDir, true);

  // Build DB from extracted JSON files
  await buildDatabase(tmpDir, outFile, pluginDir);

  console.log(`[VaultForge-5eTools] Updated database at ${outFile}`);
}

