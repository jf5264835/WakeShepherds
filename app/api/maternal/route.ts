import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditEvents, careTeamRequests, maternalCare, maternalMilestones, users } from "../../../db/schema";
import { currentUser } from "../../../lib/auth";

type MaternalPayload = Partial<typeof maternalCare.$inferInsert>;
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
function allowed(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) { if (user.canViewAll) return true; try { return (JSON.parse(user.allowedCategories) as string[]).includes("Pregnancy"); } catch { return false; } }
function addDays(value: string, days: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function milestone(id: string, kind: string, label: string, dueDate: string, status = "Open", completedAt = "") {
  return { id: `maternal-${id}-${kind}`, maternalCareId: id, kind, label, dueDate, status, completedAt };
}
function desiredMilestones(record: typeof maternalCare.$inferSelect) {
  const result: ReturnType<typeof milestone>[] = [];
  if (record.stage === "trying") result.push(milestone(record.id, "prayer-monthly", "Prayer and care check-in", addDays(record.createdAt.slice(0, 10), 30)));
  if (record.dueDate && !record.babyBornDate) {
    result.push(milestone(record.id, "pregnancy-20", "20-week care check-in", addDays(record.dueDate, -140)));
    result.push(milestone(record.id, "pregnancy-28", "28-week care check-in", addDays(record.dueDate, -84)));
    result.push(milestone(record.id, "pregnancy-33", "33-week care check-in", addDays(record.dueDate, -49)));
    result.push(milestone(record.id, "meal-train-form", "Send Meal Train intake form", addDays(record.dueDate, -49)));
    result.push(milestone(record.id, "birth-confirmation", "Confirm baby's arrival and birth date", record.dueDate));
  }
  if (record.babyBornDate) {
    result.push(milestone(record.id, "birth-recorded", "Baby's arrival recorded", record.babyBornDate, "Complete", record.babyBornDate));
    result.push(milestone(record.id, "postpartum-3w", "3-week postpartum pastoral check-in", addDays(record.babyBornDate, 21)));
    result.push(milestone(record.id, "postpartum-6w", "6-week postpartum pastoral check-in", addDays(record.babyBornDate, 42)));
    result.push(milestone(record.id, "postpartum-12w", "12-week postpartum pastoral check-in", addDays(record.babyBornDate, 84)));
    result.push(milestone(record.id, "postpartum-4m", "4-month wellbeing check-in", addDays(record.babyBornDate, 122)));
    result.push(milestone(record.id, "postpartum-6m", "6-month wellbeing check-in", addDays(record.babyBornDate, 183)));
    result.push(milestone(record.id, "postpartum-9m", "9-month family check-in", addDays(record.babyBornDate, 274)));
    result.push(milestone(record.id, "meal-train-start", "Confirm when mom wants Meal Train to begin", addDays(record.babyBornDate, 3)));
    result.push(milestone(record.id, "dedication", "Offer child dedication", addDays(record.babyBornDate, 90)));
    result.push(milestone(record.id, "first-birthday", "Celebrate first birthday and check in with mom", addDays(record.babyBornDate, 365)));
  }
  return result;
}
async function syncMilestones(record: typeof maternalCare.$inferSelect) {
  const db = getDb();
  const desired = desiredMilestones(record);
  for (const item of desired) {
    await db.insert(maternalMilestones).values(item).onConflictDoUpdate({ target: maternalMilestones.id, set: { label: item.label, dueDate: item.dueDate } });
    if (item.status === "Complete") {
      await db.update(maternalMilestones).set({ status: "Complete", completedAt: item.completedAt }).where(eq(maternalMilestones.id, item.id));
    }
  }
  const desiredKinds = new Set(desired.map((item) => item.kind));
  const existing = await db.select().from(maternalMilestones).where(eq(maternalMilestones.maternalCareId, record.id));
  for (const item of existing) {
    if (item.status === "Open" && !desiredKinds.has(item.kind)) {
      await db.delete(maternalMilestones).where(eq(maternalMilestones.id, item.id));
    }
  }
}
async function resolveAssignee(id: string) {
  if (!id) return { id: "", name: "" };
  const [user] = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  if (!user?.active) throw new Error("Assigned volunteer was not found or is inactive.");
  if (!allowed(user)) throw new Error("Give this volunteer Pregnancy category access before assigning maternal care.");
  return { id: user.id, name: user.name };
}
async function audit(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>, action: string, name: string, details = "") { await getDb().insert(auditEvents).values({ id: `audit-${crypto.randomUUID()}`, userId: user.id, actorName: user.name, action, carePerson: name, details }); }

export async function GET(request: Request) {
  const user = await currentUser(request); if (!user || !allowed(user)) return Response.json({ error: "Pregnancy care access required." }, { status: 403 });
  const records = user.canViewAll ? await getDb().select().from(maternalCare).where(eq(maternalCare.archivedAt, "")).orderBy(asc(maternalCare.dueDate)) : await getDb().select().from(maternalCare).where(and(eq(maternalCare.archivedAt, ""), eq(maternalCare.assignedUserId, user.id))).orderBy(asc(maternalCare.dueDate));
  for (const record of records) await syncMilestones(record);
  const ids = records.map((record) => record.id);
  const milestones = ids.length ? await getDb().select().from(maternalMilestones).where(inArray(maternalMilestones.maternalCareId, ids)).orderBy(asc(maternalMilestones.dueDate)) : [];
  const supportRequests = user.canAssignCare
    ? await getDb().select().from(careTeamRequests).where(and(eq(careTeamRequests.source, "moms"), eq(careTeamRequests.status, "Open"))).orderBy(asc(careTeamRequests.createdAt))
    : [];
  return Response.json({ records, milestones, supportRequests });
}
export async function POST(request: Request) {
  const user = await currentUser(request); if (!user?.canAssignCare || !allowed(user)) return Response.json({ error: "Pregnancy care assignment permission required." }, { status: 403 });
  const p = await request.json() as MaternalPayload; const momName = clean(p.momName); if (!momName) return Response.json({ error: "Mom's name is required." }, { status: 400 });
  let assignee: Awaited<ReturnType<typeof resolveAssignee>>;
  try { assignee = await resolveAssignee(clean(p.assignedUserId)); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Assigned volunteer is invalid." }, { status: 400 }); }
  const now = new Date().toISOString(); const id = `mom-${crypto.randomUUID()}`;
  const [record] = await getDb().insert(maternalCare).values({ id, momName, email: clean(p.email), stage: clean(p.stage) || "trying", dueDate: clean(p.dueDate), babyBornDate: clean(p.babyBornDate), babyName: clean(p.babyName), mealTrainFormUrl: clean(p.mealTrainFormUrl), notes: clean(p.notes), assignedUserId: assignee.id, assignedTo: assignee.name, createdAt: now, updatedAt: now }).returning();
  await syncMilestones(record); await audit(user, "created maternal care plan", momName, record.stage); return Response.json({ record }, { status: 201 });
}
export async function PUT(request: Request) {
  const user = await currentUser(request); if (!user?.canAssignCare || !allowed(user)) return Response.json({ error: "Pregnancy care assignment permission required." }, { status: 403 });
  const p = await request.json() as MaternalPayload; const id = clean(p.id); const [existing] = await getDb().select().from(maternalCare).where(eq(maternalCare.id, id)).limit(1); if (!existing) return Response.json({ error: "Maternal care plan not found." }, { status: 404 });
  let assignee: Awaited<ReturnType<typeof resolveAssignee>>;
  try { assignee = await resolveAssignee(clean(p.assignedUserId)); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Assigned volunteer is invalid." }, { status: 400 }); }
  const babyBornDate = clean(p.babyBornDate); const stage = babyBornDate ? "postpartum" : clean(p.stage) || existing.stage;
  const [record] = await getDb().update(maternalCare).set({ momName: clean(p.momName) || existing.momName, email: clean(p.email), stage, dueDate: clean(p.dueDate), babyBornDate, babyName: clean(p.babyName), mealTrainFormUrl: clean(p.mealTrainFormUrl), notes: clean(p.notes), assignedUserId: assignee.id, assignedTo: assignee.name, updatedAt: new Date().toISOString() }).where(eq(maternalCare.id, id)).returning();
  await syncMilestones(record); await audit(user, "updated maternal care plan", record.momName, record.stage); return Response.json({ record });
}
export async function PATCH(request: Request) {
  const user = await currentUser(request); if (!user || !allowed(user)) return Response.json({ error: "Pregnancy care access required." }, { status: 403 });
  const p = await request.json() as { milestoneId?: string; complete?: boolean }; const [item] = await getDb().select().from(maternalMilestones).where(eq(maternalMilestones.id, p.milestoneId ?? "")).limit(1); if (!item) return Response.json({ error: "Milestone not found." }, { status: 404 });
  const [record] = await getDb().select().from(maternalCare).where(eq(maternalCare.id, item.maternalCareId)).limit(1); if (!record || (!user.canViewAll && record.assignedUserId !== user.id)) return Response.json({ error: "Milestone not found." }, { status: 404 });
  await getDb().update(maternalMilestones).set({ status: p.complete ? "Complete" : "Open", completedAt: p.complete ? new Date().toISOString() : "" }).where(eq(maternalMilestones.id, item.id));
  if (p.complete && item.kind === "prayer-monthly" && record.stage === "trying") {
    const nextDueDate = addDays(item.dueDate, 30);
    await getDb().insert(maternalMilestones).values({
      id: `maternal-${record.id}-prayer-monthly-${nextDueDate}`,
      maternalCareId: record.id,
      kind: "prayer-monthly",
      label: "Prayer and care check-in",
      dueDate: nextDueDate,
    }).onConflictDoNothing();
  }
  await audit(user, p.complete ? "completed maternal milestone" : "reopened maternal milestone", record.momName, item.label);
  return Response.json({ updated: true });
}
