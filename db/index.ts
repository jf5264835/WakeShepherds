import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

function createDatabase(client: Client) {
  return drizzle(client, { schema });
}

type Database = ReturnType<typeof createDatabase>;
type DatabaseGlobals = typeof globalThis & {
  __shepherdingClient?: Client;
  __shepherdingDb?: Database;
};

function databaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required.");
  return url;
}

export function getDb() {
  const globals = globalThis as DatabaseGlobals;
  if (globals.__shepherdingDb) return globals.__shepherdingDb;

  const url = databaseUrl();
  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN?.trim() || undefined,
  });
  const db = createDatabase(client);

  globals.__shepherdingClient = client;
  globals.__shepherdingDb = db;
  return db;
}
