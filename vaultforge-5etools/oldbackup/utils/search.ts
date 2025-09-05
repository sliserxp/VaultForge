import { openDatabase } from "./db";
import type { Database } from "sql.js";

export interface DbEntry {
  id: number;
  name: string;
  type: string;
  source?: string;
  description?: string;
  requirements?: string;
  rarity?: string;
  level?: number;
  weight?: number;
  strength: number;
  value?: number;
  raw: string;
}

/**
 * Helper to convert sql.js results into plain objects.
 */
function rowsFromResult(result: any): any[] {
  if (!result || result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map((row: any[]) => {
    const obj: Record<string, any> = {};
    row.forEach((val, i) => {
      obj[columns[i]] = val;
    });
    return obj;
  });
}

/**
 * Search the 5eTools DB for a query string.
 * @param dbPath Path to the SQLite DB file
 * @param pluginDir Plugin directory (for wasm loading)
 * @param query The search string
 * @param limit Max results
 */
export async function searchDb(
  dbPath: string,
  pluginDir: string,
  query: string,
  limit = 10
): Promise<DbEntry[]> {
  const db: Database = await openDatabase(dbPath, pluginDir);
  const result = db.exec(
    `SELECT * FROM entries
     WHERE name LIKE $query OR description LIKE $query
     LIMIT $limit`,
    { $query: `%${query}%`, $limit: limit }
  );
  return rowsFromResult(result) as DbEntry[];
}

/**
 * Get a single entry by exact name.
 * @param dbPath Path to the SQLite DB file
 * @param pluginDir Plugin directory (for wasm loading)
 * @param name The entry name
 */
export async function getByName(
  dbPath: string,
  pluginDir: string,
  name: string
): Promise<DbEntry | null> {
  const db: Database = await openDatabase(dbPath, pluginDir);
  const result = db.exec(
    `SELECT * FROM entries
     WHERE name = $name
     LIMIT 1`,
    { $name: name }
  );
  const rows = rowsFromResult(result);
  return rows.length ? (rows[0] as DbEntry) : null;
}

