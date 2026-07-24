import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditEvents, careCategories } from "../../../db/schema";
import { currentUser } from "../../../lib/auth";

const DEFAULTS = ["Pre-marital counseling", "Marital counseling", "Grief", "Pregnancy", "Discipleship"];

async function ensureDefaults() {
  const db = getDb();
  for (const name of DEFAULTS) {
    await db.insert(careCategories).values({ id: `category-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name, createdBy: "System" }).onConflictDoNothing();
  }
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  await ensureDefaults();
  const categories = await getDb().select().from(careCategories).where(eq(careCategories.active, true)).orderBy(asc(careCategories.name));
  if (user.canViewAll || user.canManageUsers) return Response.json({ categories });
  let allowed: string[] = []; try { allowed = JSON.parse(user.allowedCategories) as string[]; } catch { allowed = []; }
  return Response.json({ categories: categories.filter((category) => allowed.includes(category.name)) });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user?.canManageUsers) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  const payload = await request.json() as { name?: string };
  const name = (payload.name ?? "").trim();
  if (!name) return Response.json({ error: "A category name is required." }, { status: 400 });
  await ensureDefaults();
  try {
    const [category] = await getDb().insert(careCategories).values({ id: `category-${crypto.randomUUID()}`, name, createdBy: user.name }).returning();
    await getDb().insert(auditEvents).values({ id: `audit-${crypto.randomUUID()}`, userId: user.id, actorName: user.name, action: "created care category", details: name });
    return Response.json({ category }, { status: 201 });
  } catch { return Response.json({ error: "That category already exists." }, { status: 409 }); }
}
