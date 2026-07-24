import { createClient } from "@libsql/client";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

if (databaseUrl.startsWith("file:")) {
  const filePath = databaseUrl.slice("file:".length);
  if (filePath && filePath !== ":memory:") {
    mkdirSync(dirname(resolve(process.cwd(), filePath)), { recursive: true });
  }
}

const client = createClient({
  url: databaseUrl,
  authToken: process.env.DATABASE_AUTH_TOKEN?.trim() || undefined,
});

await client.execute(`
  CREATE TABLE IF NOT EXISTS portable_migrations (
    filename TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  )
`);

const migrationDirectory = resolve(process.cwd(), "drizzle");
const migrationFiles = readdirSync(migrationDirectory)
  .filter((filename) => /^\d+_.+\.sql$/.test(filename))
  .sort();

const appliedResult = await client.execute("SELECT filename FROM portable_migrations");
const applied = new Set(appliedResult.rows.map((row) => String(row.filename)));

for (const filename of migrationFiles) {
  if (applied.has(filename)) continue;
  const source = readFileSync(resolve(migrationDirectory, filename), "utf8");
  const statements = source
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  await client.batch([
    ...statements.map((sql) => ({ sql, args: [] })),
    {
      sql: "INSERT INTO portable_migrations (filename) VALUES (?)",
      args: [filename],
    },
  ], "write");
  console.log(`Applied ${filename}`);
}

console.log("Database is ready.");
client.close();
