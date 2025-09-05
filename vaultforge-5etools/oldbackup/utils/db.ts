import initSqlJs, { Database } from "sql.js";
import * as fs from "fs";
import * as path from "path";

let SQL: any = null;

export async function getSqlJs(pluginDir: string): Promise<any> {
  if (!SQL) {
    const wasmPath = path.join(pluginDir, "sql-wasm.wasm");

    // Load the wasm manually from disk
    const wasmBinary = fs.readFileSync(wasmPath);

    SQL = await initSqlJs({
      wasmBinary, // ✅ bypasses fetch()
    });
  }
  return SQL;
}

export async function openDatabase(dbPath: string, pluginDir: string): Promise<Database> {
  const SQL = await getSqlJs(pluginDir);
  let db: Database;

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(new Uint8Array(fileBuffer));
  } else {
    db = new SQL.Database();
  }

  return db;
}

export async function saveDatabase(db: Database, dbPath: string) {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

export function closeDatabase(db: Database) {
  db.close();
}

