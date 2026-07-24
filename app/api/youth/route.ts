import { and, asc, eq, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditEvents, users, youthCare } from "../../../db/schema";
import { currentUser, safeUser } from "../../../lib/auth";

type YouthPayload = Partial<typeof youthCare.$inferInsert>;

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const canAccess = (user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) => user.canManageUsers || user.canAccessYouth || user.canManageYouth;
const canManage = (user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) => user.canManageUsers || user.canManageYouth;

function fields(payload: YouthPayload) {
  const personType = clean(payload.personType) === "staff" ? "staff" : "student";
  return {
    personType,
    name: clean(payload.name),
    subjectUserId: clean(payload.subjectUserId),
    school: personType === "student" ? clean(payload.school) : "",
    birthday: personType === "student" ? clean(payload.birthday) : "",
    category: clean(payload.category) || "Discipleship",
    need: clean(payload.need),
    lastContact: clean(payload.lastContact),
    nextAction: clean(payload.nextAction),
    followUpDate: clean(payload.followUpDate),
    status: clean(payload.status) || "Open",
    notes: clean(payload.notes),
    assignedUserId: clean(payload.assignedUserId),
    assignedTo: clean(payload.assignedTo),
  };
}

async function resolvePeople(item: ReturnType<typeof fields>) {
  if (item.assignedUserId) {
    const [assignee] = await getDb().select().from(users).where(eq(users.id, item.assignedUserId)).limit(1);
    if (!assignee?.active || (!assignee.canAccessYouth && !assignee.canManageYouth)) {
      throw new Error("Give this person Wake Youth access before assigning youth care.");
    }
    item.assignedTo = assignee.name;
  } else {
    item.assignedTo = "";
  }

  if (item.personType === "staff" && item.subjectUserId) {
    const [subject] = await getDb().select().from(users).where(eq(users.id, item.subjectUserId)).limit(1);
    if (!subject?.active || (!subject.canAccessYouth && !subject.canManageYouth)) {
      throw new Error("The youth staff person was not found or does not have Wake Youth access.");
    }
    if (subject.id === item.assignedUserId) throw new Error("Choose another youth staff person to provide this care.");
    item.name = subject.name;
  }

  if (!item.name) throw new Error(item.personType === "student" ? "A student name is required." : "A youth staff name is required.");
}

async function audit(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>, action: string, item: { id: string; name: string }, details = "") {
  await getDb().insert(auditEvents).values({
    id: `audit-${crypto.randomUUID()}`,
    userId: user.id,
    actorName: user.name,
    action,
    careItemId: item.id,
    carePerson: item.name,
    details,
  });
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user || !canAccess(user)) return Response.json({ error: "Wake Youth access required." }, { status: 403 });
  const records = canManage(user)
    ? await getDb().select().from(youthCare).where(eq(youthCare.archivedAt, "")).orderBy(asc(youthCare.name))
    : await getDb().select().from(youthCare).where(and(eq(youthCare.archivedAt, ""), eq(youthCare.assignedUserId, user.id))).orderBy(asc(youthCare.name));
  const teamRows = await getDb().select().from(users).where(eq(users.active, true)).orderBy(asc(users.name));
  const team = teamRows.filter((member) => member.canAccessYouth || member.canManageYouth).map(safeUser);
  const availableUsers = canManage(user)
    ? teamRows.filter((member) => !member.canAccessYouth && !member.canManageYouth).map(safeUser)
    : [];
  return Response.json({ records, team, availableUsers });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user || !canManage(user)) return Response.json({ error: "Wake Youth management permission required." }, { status: 403 });
  const itemFields = fields(await request.json());
  try { await resolvePeople(itemFields); } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Youth care assignment is invalid." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const [record] = await getDb().insert(youthCare).values({
    id: `youth-${crypto.randomUUID()}`,
    ...itemFields,
    createdAt: now,
    updatedAt: now,
  }).returning();
  await audit(user, record.personType === "student" ? "created youth student care" : "created youth staff care", record, record.category);
  return Response.json({ record }, { status: 201 });
}

export async function PUT(request: Request) {
  const user = await currentUser(request);
  if (!user || !canManage(user)) return Response.json({ error: "Wake Youth management permission required." }, { status: 403 });
  const payload = await request.json() as YouthPayload;
  const id = clean(payload.id);
  const [existing] = await getDb().select().from(youthCare).where(eq(youthCare.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Youth care record not found." }, { status: 404 });
  const itemFields = fields(payload);
  try { await resolvePeople(itemFields); } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Youth care assignment is invalid." }, { status: 400 });
  }
  const [record] = await getDb().update(youthCare).set({
    ...itemFields,
    birthdayAcknowledgedYear: itemFields.birthday === existing.birthday ? existing.birthdayAcknowledgedYear : 0,
    updatedAt: new Date().toISOString(),
  }).where(eq(youthCare.id, id)).returning();
  await audit(user, record.personType === "student" ? "updated youth student care" : "updated youth staff care", record, record.category);
  return Response.json({ record });
}

export async function PATCH(request: Request) {
  const user = await currentUser(request);
  if (!user || !canAccess(user)) return Response.json({ error: "Wake Youth access required." }, { status: 403 });
  const payload = await request.json() as { id?: string; birthdayAcknowledged?: boolean; status?: string; teamUserId?: string; youthAccess?: boolean };

  if (payload.teamUserId && typeof payload.youthAccess === "boolean") {
    if (!canManage(user)) return Response.json({ error: "Wake Youth management permission required." }, { status: 403 });
    const [target] = await getDb().select().from(users).where(eq(users.id, clean(payload.teamUserId))).limit(1);
    if (!target?.active) return Response.json({ error: "That active user account could not be found." }, { status: 404 });
    if (!payload.youthAccess && target.canManageYouth) {
      return Response.json({ error: "A Global Admin must remove Youth management permission before this person can leave the Youth team." }, { status: 400 });
    }
    if (!payload.youthAccess) {
      const [activeAssignment] = await getDb().select({ id: youthCare.id }).from(youthCare).where(and(
        eq(youthCare.archivedAt, ""),
        or(eq(youthCare.assignedUserId, target.id), eq(youthCare.subjectUserId, target.id)),
      )).limit(1);
      if (activeAssignment) {
        return Response.json({ error: "Reassign or archive this person’s active Youth care first, then remove their Youth access." }, { status: 400 });
      }
    }
    await getDb().update(users).set({
      canAccessYouth: payload.youthAccess,
      updatedAt: new Date().toISOString(),
    }).where(eq(users.id, target.id));
    await audit(user, payload.youthAccess ? "granted Wake Youth access" : "removed Wake Youth access", target, target.email);
    return Response.json({ updated: true });
  }

  const [record] = await getDb().select().from(youthCare).where(eq(youthCare.id, clean(payload.id))).limit(1);
  if (!record || (!canManage(user) && record.assignedUserId !== user.id)) return Response.json({ error: "Youth care record not found." }, { status: 404 });
  const updates: Partial<typeof youthCare.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (typeof payload.birthdayAcknowledged === "boolean") updates.birthdayAcknowledgedYear = payload.birthdayAcknowledged ? new Date().getUTCFullYear() : 0;
  if (typeof payload.status === "string" && ["Open", "Waiting", "Complete"].includes(payload.status)) updates.status = payload.status;
  const [updated] = await getDb().update(youthCare).set(updates).where(eq(youthCare.id, record.id)).returning();
  await audit(user, payload.birthdayAcknowledged ? "completed youth birthday touchpoint" : "updated youth care status", updated);
  return Response.json({ record: updated });
}

export async function DELETE(request: Request) {
  const user = await currentUser(request);
  if (!user || !canManage(user)) return Response.json({ error: "Wake Youth management permission required." }, { status: 403 });
  const payload = await request.json() as { id?: string };
  const [record] = await getDb().select().from(youthCare).where(eq(youthCare.id, clean(payload.id))).limit(1);
  if (!record) return Response.json({ error: "Youth care record not found." }, { status: 404 });
  await getDb().update(youthCare).set({ archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(youthCare.id, record.id));
  await audit(user, "archived youth care record", record, record.personType);
  return Response.json({ archived: true });
}
