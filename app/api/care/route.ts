import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditEvents, careItems, users } from "../../../db/schema";
import { currentUser } from "../../../lib/auth";
import { sendCareAssignmentEmail } from "../../../lib/google-email";
import { appOrigin } from "../../../lib/runtime-env";

type CarePayload = Partial<typeof careItems.$inferInsert>;
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
function fields(payload: CarePayload) {
  return { name: clean(payload.name), category: clean(payload.category), lane: clean(payload.lane) || "Follow-up promised", need: clean(payload.need), lastContact: clean(payload.lastContact), nextAction: clean(payload.nextAction), followUpDate: clean(payload.followUpDate), priority: clean(payload.priority) || "Normal", status: clean(payload.status) || "Open", notes: clean(payload.notes), assignedTo: clean(payload.assignedTo), assignedEmail: clean(payload.assignedEmail), assignedUserId: clean(payload.assignedUserId) };
}
function denied(message = "Sign in required.") { return Response.json({ error: message }, { status: 401 }); }
function allowedCategories(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) {
  try { return JSON.parse(user.allowedCategories) as string[]; } catch { return []; }
}
async function audit(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>, action: string, item: { id: string; name: string }, details = "") {
  await getDb().insert(auditEvents).values({ id: `audit-${crypto.randomUUID()}`, userId: user.id, actorName: user.name, action, careItemId: item.id, carePerson: item.name, details });
}
async function resolveAssignee(itemFields: ReturnType<typeof fields>) {
  if (!itemFields.assignedUserId) { itemFields.assignedTo = ""; itemFields.assignedEmail = ""; return; }
  const [assignee] = await getDb().select().from(users).where(eq(users.id, itemFields.assignedUserId)).limit(1);
  if (!assignee?.active) throw new Error("Assigned volunteer account was not found or is inactive.");
  itemFields.assignedTo = assignee.name; itemFields.assignedEmail = assignee.notificationEmail || assignee.email;
}
async function notifyAssignment(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>, item: typeof careItems.$inferSelect, origin: string) {
  if (!item.assignedEmail) return { sent: false, skipped: true };
  try {
    const categoryUrl = new URL("/my", origin);
    categoryUrl.searchParams.set("assignment", item.id);
    await sendCareAssignmentEmail({ recipient: item.assignedEmail, volunteerName: item.assignedTo, person: item.name, category: item.category, lane: item.lane, nextAction: item.nextAction, followUpDate: item.followUpDate, categoryUrl: categoryUrl.toString() });
    await audit(user, "sent assignment email", item, `To ${item.assignedEmail}`); return { sent: true };
  } catch (error) {
    await audit(user, "assignment email failed", item, `To ${item.assignedEmail}`); return { sent: false, error: error instanceof Error ? error.message : "Email notification failed." };
  }
}

export async function GET(request: Request) {
  const user = await currentUser(request); if (!user) return denied();
  const query = getDb().select().from(careItems);
  const rows = user.canViewAll
    ? await query.where(eq(careItems.archivedAt, "")).orderBy(desc(careItems.updatedAt))
    : await query.where(and(eq(careItems.assignedUserId, user.id), eq(careItems.archivedAt, ""), inArray(careItems.category, allowedCategories(user)))).orderBy(desc(careItems.updatedAt));
  return Response.json({ items: rows });
}
export async function POST(request: Request) {
  const user = await currentUser(request); if (!user || !user.canManageCare) return denied("You do not have permission to add care tasks.");
  const itemFields = fields(await request.json()); if (!itemFields.name) return Response.json({ error: "A person is required." }, { status: 400 });
  if (!user.canViewAll && !allowedCategories(user).includes(itemFields.category)) return denied("You do not have access to that care category.");
  if (!user.canAssignCare) { itemFields.assignedUserId = user.id; itemFields.assignedTo = user.name; itemFields.assignedEmail = user.email; }
  else { try { await resolveAssignee(itemFields); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Assigned volunteer is invalid." }, { status: 400 }); } }
  const now = new Date().toISOString(); const id = `care-${crypto.randomUUID()}`;
  const [item] = await getDb().insert(careItems).values({ id, ...itemFields, createdAt: now, updatedAt: now }).returning();
  await audit(user, "created care task", item); const notification = await notifyAssignment(user, item, appOrigin(request)); return Response.json({ item, notification }, { status: 201 });
}
export async function PUT(request: Request) {
  const user = await currentUser(request); if (!user || !user.canManageCare) return denied("You do not have permission to update care tasks.");
  const payload = await request.json() as CarePayload; const id = clean(payload.id); const itemFields = fields(payload);
  const [existing] = await getDb().select().from(careItems).where(eq(careItems.id, id)).limit(1);
  if (!existing || (!user.canViewAll && existing.assignedUserId !== user.id)) return Response.json({ error: "Care task not found." }, { status: 404 });
  if (!user.canViewAll && !allowedCategories(user).includes(existing.category)) return denied("You do not have access to that care category.");
  if (!user.canAssignCare) { itemFields.assignedUserId = existing.assignedUserId; itemFields.assignedTo = existing.assignedTo; itemFields.assignedEmail = existing.assignedEmail; }
  else { try { await resolveAssignee(itemFields); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Assigned volunteer is invalid." }, { status: 400 }); } }
  const [item] = await getDb().update(careItems).set({ ...itemFields, updatedAt: new Date().toISOString() }).where(eq(careItems.id, id)).returning();
  await audit(user, "updated care task", item);
  const notification = item.assignedUserId && item.assignedUserId !== existing.assignedUserId ? await notifyAssignment(user, item, appOrigin(request)) : { sent: false, skipped: true };
  return Response.json({ item, notification });
}
export async function PATCH(request: Request) {
  const user = await currentUser(request); if (!user) return denied();
  const payload = await request.json() as { id?: string; lastContact?: string; followUpDate?: string; notes?: string; status?: string };
  const id = clean(payload.id);
  const [existing] = await getDb().select().from(careItems).where(eq(careItems.id, id)).limit(1);
  if (!existing || existing.assignedUserId !== user.id || existing.archivedAt) return Response.json({ error: "Care task not found." }, { status: 404 });
  if (!user.canViewAll && !allowedCategories(user).includes(existing.category)) return Response.json({ error: "Care task not found." }, { status: 404 });
  const updates: Partial<typeof careItems.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (typeof payload.lastContact === "string") updates.lastContact = clean(payload.lastContact);
  if (typeof payload.followUpDate === "string") updates.followUpDate = clean(payload.followUpDate);
  if (typeof payload.notes === "string") updates.notes = clean(payload.notes);
  if (typeof payload.status === "string" && ["Open", "Scheduled", "Waiting", "Complete"].includes(payload.status)) updates.status = payload.status;
  const [item] = await getDb().update(careItems).set(updates).where(eq(careItems.id, id)).returning();
  await audit(user, "updated assigned care follow-up", item);
  return Response.json({ item });
}
export async function DELETE(request: Request) {
  const user = await currentUser(request); if (!user || !user.canAssignCare) return denied("Only an administrator can remove care tasks.");
  const { id } = await request.json() as { id?: string }; const [item] = await getDb().select().from(careItems).where(eq(careItems.id, clean(id))).limit(1);
  if (!item) return Response.json({ error: "Care task not found." }, { status: 404 });
  await getDb().update(careItems).set({ archivedAt: new Date().toISOString(), archivedBy: user.name, updatedAt: new Date().toISOString() }).where(eq(careItems.id, item.id));
  await audit(user, "archived care task", item, "Recoverable from Global Admin");
  return Response.json({ archived: true });
}
