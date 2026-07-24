import { desc, eq, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditEvents, careItems } from "../../../../db/schema";
import { currentUser } from "../../../../lib/auth";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user?.canManageUsers) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  const items = await getDb().select().from(careItems).where(ne(careItems.archivedAt, "")).orderBy(desc(careItems.updatedAt));
  return Response.json({ items });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user?.canManageUsers) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  const { id } = await request.json() as { id?: string };
  const [item] = await getDb().select().from(careItems).where(eq(careItems.id, id ?? "")).limit(1);
  if (!item || !item.archivedAt) return Response.json({ error: "Archived care task not found." }, { status: 404 });
  await getDb().update(careItems).set({ archivedAt: "", archivedBy: "", updatedAt: new Date().toISOString() }).where(eq(careItems.id, item.id));
  await getDb().insert(auditEvents).values({ id: `audit-${crypto.randomUUID()}`, userId: user.id, actorName: user.name, action: "restored care task", careItemId: item.id, carePerson: item.name });
  return Response.json({ restored: true });
}
