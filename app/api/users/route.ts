import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditEvents, sessions, users } from "../../../db/schema";
import { currentUser, hashPassword, safeUser } from "../../../lib/auth";

async function admin(request: Request) { const user = await currentUser(request); return user?.canManageUsers ? user : null; }
export async function GET(request: Request) {
  const actor = await currentUser(request); if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
  const rows = await getDb().select().from(users).where(eq(users.active, true)).orderBy(asc(users.name));
  return Response.json({ users: rows.map(safeUser) });
}
export async function POST(request: Request) {
  const actor = await admin(request); if (!actor) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  const p = await request.json() as { email?: string; name?: string; password?: string; role?: string };
  const email = (p.email ?? "").trim().toLowerCase(), name = (p.name ?? "").trim(), password = p.password ?? "";
  if (!email || !name || password.length < 12) return Response.json({ error: "Name, email, and a temporary password of at least 12 characters are required." }, { status: 400 });
  const salt = crypto.randomUUID(); const isAdmin = p.role === "global_admin";
  try {
    const [user] = await getDb().insert(users).values({
      id: `user-${crypto.randomUUID()}`,
      email,
      notificationEmail: email,
      name,
      role: isAdmin ? "global_admin" : "volunteer",
      passwordSalt: salt,
      passwordHash: await hashPassword(password, salt),
      active: true,
      canViewAll: isAdmin,
      canManageCare: true,
      canAssignCare: isAdmin,
      canManageUsers: isAdmin,
      canAccessYouth: isAdmin,
      canManageYouth: isAdmin,
      canAccessHospital: isAdmin,
      canManageHospital: isAdmin,
      canAccessDiscipleship: isAdmin,
      canManageDiscipleship: isAdmin,
    }).returning();
    await getDb().insert(auditEvents).values({ id: `audit-${crypto.randomUUID()}`, userId: actor.id, actorName: actor.name, action: "created account", details: `${name} (${email})` });
    return Response.json({ user: safeUser(user) }, { status: 201 });
  } catch { return Response.json({ error: "That login email already exists." }, { status: 409 }); }
}
export async function PUT(request: Request) {
  const actor = await admin(request); if (!actor) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  const p = await request.json() as { id?: string; active?: boolean; canViewAll?: boolean; canManageCare?: boolean; canAssignCare?: boolean; canManageUsers?: boolean; canAccessYouth?: boolean; canManageYouth?: boolean; canAccessHospital?: boolean; canManageHospital?: boolean; canAccessDiscipleship?: boolean; canManageDiscipleship?: boolean; allowedCategories?: string[]; password?: string };
  const id = p.id ?? ""; if (!id || id === actor.id && p.active === false) return Response.json({ error: "You cannot disable your own account." }, { status: 400 });
  const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date().toISOString() };
  for (const key of ["active", "canViewAll", "canManageCare", "canAssignCare", "canManageUsers", "canAccessYouth", "canManageYouth", "canAccessHospital", "canManageHospital", "canAccessDiscipleship", "canManageDiscipleship"] as const) if (typeof p[key] === "boolean") updates[key] = p[key];
  if (Array.isArray(p.allowedCategories)) updates.allowedCategories = JSON.stringify(p.allowedCategories.filter((value) => typeof value === "string"));
  if (p.password) { if (p.password.length < 12) return Response.json({ error: "Passwords must be at least 12 characters." }, { status: 400 }); const salt = crypto.randomUUID(); updates.passwordSalt = salt; updates.passwordHash = await hashPassword(p.password, salt); await getDb().delete(sessions).where(eq(sessions.userId, id)); }
  const [user] = await getDb().update(users).set(updates).where(eq(users.id, id)).returning();
  if (!user) return Response.json({ error: "Account not found." }, { status: 404 });
  await getDb().insert(auditEvents).values({ id: `audit-${crypto.randomUUID()}`, userId: actor.id, actorName: actor.name, action: "updated account", details: user.email });
  return Response.json({ user: safeUser(user) });
}
