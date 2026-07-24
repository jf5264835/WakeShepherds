import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditEvents } from "../../../db/schema";
import { currentUser } from "../../../lib/auth";
export async function GET(request: Request) {
  const user = await currentUser(request); if (!user?.canManageUsers) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  return Response.json({ events: await getDb().select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(100) });
}
