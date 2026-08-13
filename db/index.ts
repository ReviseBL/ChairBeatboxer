import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let schemaReady: Promise<void> | undefined;

export async function getDb() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  schemaReady ??= env.DB.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      nickname TEXT NOT NULL,
      score INTEGER NOT NULL,
      max_combo INTEGER DEFAULT 0 NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `).then(() => undefined);

  try {
    await schemaReady;
  } catch (error) {
    schemaReady = undefined;
    throw error;
  }

  return drizzle(env.DB, { schema });
}
