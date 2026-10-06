import type { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Recorded, versioned migrations: each file in migrations/ is applied at most
// once, in filename order, and the applied name is recorded in
// schema_migrations. Later schema changes are new numbered files, never edits
// to code that silently reshapes an existing table.
const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

export function migrate(db: DatabaseSync, migrationsDir: string = DEFAULT_MIGRATIONS_DIR): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`,
  );

  const applied = new Set(
    db
      .prepare("SELECT id FROM schema_migrations")
      .all()
      .map((row) => (row as { id: string }).id),
  );

  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(`${migrationsDir}/${file}`, "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`migration ${file} failed: ${(err as Error).message}`, { cause: err });
    }
  }
}
