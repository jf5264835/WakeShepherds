import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditEvents, discipleshipRelationships, users } from "../../../db/schema";
import { currentUser, safeUser } from "../../../lib/auth";
import { sendDashboardEmail } from "../../../lib/google-email";
import { appOrigin } from "../../../lib/runtime-env";

type RelationshipPayload = Partial<typeof discipleshipRelationships.$inferInsert> & {
  growthNeeded?: string[] | string;
  growthSeen?: string[] | string;
};

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const canAccess = (user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) =>
  user.canManageUsers || user.canAccessDiscipleship || user.canManageDiscipleship;
const canManage = (user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) =>
  user.canManageUsers || user.canManageDiscipleship;

function list(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function fields(payload: RelationshipPayload) {
  return {
    ministry: ["Wake Men", "Wake Women"].includes(clean(payload.ministry)) ? clean(payload.ministry) : "Wake Men",
    discipleName: clean(payload.discipleName),
    disciplePhone: clean(payload.disciplePhone),
    discipleEmail: clean(payload.discipleEmail),
    discipleMakerUserId: clean(payload.discipleMakerUserId),
    discipleMakerName: clean(payload.discipleMakerName),
    startedAt: clean(payload.startedAt),
    lastContact: clean(payload.lastContact),
    nextMeetupDate: clean(payload.nextMeetupDate),
    growthNeeded: JSON.stringify(list(payload.growthNeeded)),
    growthSeen: JSON.stringify(list(payload.growthSeen)),
    notes: clean(payload.notes),
    status: clean(payload.status) || "Active",
  };
}

function serialize(record: typeof discipleshipRelationships.$inferSelect) {
  return { ...record, growthNeeded: list(record.growthNeeded), growthSeen: list(record.growthSeen) };
}

async function resolveMaker(item: ReturnType<typeof fields>) {
  const [maker] = await getDb().select().from(users).where(eq(users.id, item.discipleMakerUserId)).limit(1);
  if (!maker?.active || (!maker.canAccessDiscipleship && !maker.canManageDiscipleship)) {
    throw new Error("Give this person Discipleship access before assigning someone to them.");
  }
  item.discipleMakerName = maker.name;
  return maker;
}

async function audit(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>, action: string, person: string, details = "") {
  await getDb().insert(auditEvents).values({
    id: `audit-${crypto.randomUUID()}`,
    userId: user.id,
    actorName: user.name,
    action,
    carePerson: person,
    details,
  });
}

async function notifyMaker(maker: typeof users.$inferSelect, item: ReturnType<typeof fields> & { id?: string }, origin: string) {
  try {
    await sendDashboardEmail({
      recipient: maker.notificationEmail || maker.email,
      subject: `Discipleship assignment: ${item.discipleName}`,
      body: [
        `Hi ${maker.name},`,
        "",
        `You have been assigned to disciple ${item.discipleName} through ${item.ministry}.`,
        `Next meetup: ${item.nextMeetupDate || "Not scheduled"}`,
        "",
        `Open your private assignments: ${origin}/my${item.id ? `?assignment=${encodeURIComponent(item.id)}` : ""}`,
        "",
        "You will only see the people assigned to you.",
      ].join("\r\n"),
    });
  } catch {
    // The in-dashboard assignment remains authoritative when email is unavailable.
  }
}

async function notifyCoach(record: typeof discipleshipRelationships.$inferSelect, origin: string) {
  const admins = await getDb().select().from(users).where(and(eq(users.active, true), eq(users.canManageUsers, true)));
  for (const admin of admins) {
    try {
      await sendDashboardEmail({
        recipient: admin.notificationEmail || admin.email,
        subject: `Discipleship coach check-in: ${record.discipleMakerName}`,
        body: [
          `A disciple maker has completed the third meetup in ${record.ministry}.`,
          "",
          `Disciple maker: ${record.discipleMakerName}`,
          `Person being discipled: ${record.discipleName}`,
          "",
          "Please contact the disciple maker for a coaching check-in, then mark the alert complete:",
          `${origin}/discipleship?section=coaching`,
        ].join("\r\n"),
      });
    } catch {
      // The persistent in-dashboard coaching alert remains visible.
    }
  }
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user || !canAccess(user)) return Response.json({ error: "Discipleship access required." }, { status: 403 });
  const rows = canManage(user)
    ? await getDb().select().from(discipleshipRelationships).where(eq(discipleshipRelationships.archivedAt, "")).orderBy(asc(discipleshipRelationships.discipleName))
    : await getDb().select().from(discipleshipRelationships).where(and(eq(discipleshipRelationships.archivedAt, ""), eq(discipleshipRelationships.discipleMakerUserId, user.id))).orderBy(asc(discipleshipRelationships.discipleName));
  const allUsers = canManage(user)
    ? await getDb().select().from(users).where(eq(users.active, true)).orderBy(asc(users.name))
    : [];
  const team = allUsers.filter((member) => member.canAccessDiscipleship || member.canManageDiscipleship).map(safeUser);
  const availableUsers = allUsers.filter((member) => !member.canAccessDiscipleship && !member.canManageDiscipleship).map(safeUser);
  return Response.json({ relationships: rows.map(serialize), team, availableUsers });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user || !canManage(user)) return Response.json({ error: "Discipleship management permission required." }, { status: 403 });
  const item = fields(await request.json() as RelationshipPayload);
  if (!item.discipleName || !item.discipleMakerUserId) return Response.json({ error: "Disciple name and disciple maker are required." }, { status: 400 });
  let maker: typeof users.$inferSelect;
  try { maker = await resolveMaker(item); } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Disciple maker is invalid." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const [record] = await getDb().insert(discipleshipRelationships).values({
    id: `discipleship-${crypto.randomUUID()}`,
    ...item,
    meetupCount: 0,
    coachContactedAt: "",
    createdAt: now,
    updatedAt: now,
  }).returning();
  await audit(user, "created discipleship assignment", record.discipleName, `${record.ministry} · ${record.discipleMakerName}`);
  await notifyMaker(maker, record, appOrigin(request));
  return Response.json({ relationship: serialize(record) }, { status: 201 });
}

export async function PUT(request: Request) {
  const user = await currentUser(request);
  if (!user || !canManage(user)) return Response.json({ error: "Discipleship management permission required." }, { status: 403 });
  const payload = await request.json() as RelationshipPayload;
  const id = clean(payload.id);
  const [existing] = await getDb().select().from(discipleshipRelationships).where(eq(discipleshipRelationships.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Discipleship assignment not found." }, { status: 404 });
  const item = fields(payload);
  if (!item.discipleName || !item.discipleMakerUserId) return Response.json({ error: "Disciple name and disciple maker are required." }, { status: 400 });
  let maker: typeof users.$inferSelect;
  try { maker = await resolveMaker(item); } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Disciple maker is invalid." }, { status: 400 });
  }
  const [record] = await getDb().update(discipleshipRelationships).set({ ...item, updatedAt: new Date().toISOString() }).where(eq(discipleshipRelationships.id, id)).returning();
  await audit(user, "updated discipleship assignment", record.discipleName, record.discipleMakerName);
  if (record.discipleMakerUserId !== existing.discipleMakerUserId) await notifyMaker(maker, record, appOrigin(request));
  return Response.json({ relationship: serialize(record) });
}

export async function PATCH(request: Request) {
  const user = await currentUser(request);
  if (!user || !canAccess(user)) return Response.json({ error: "Discipleship access required." }, { status: 403 });
  const payload = await request.json() as {
    id?: string;
    lastContact?: string;
    nextMeetupDate?: string;
    growthNeeded?: string[];
    growthSeen?: string[];
    notes?: string;
    logMeetup?: boolean;
    coachContacted?: boolean;
    teamUserId?: string;
    discipleshipAccess?: boolean;
  };
  if (payload.teamUserId && typeof payload.discipleshipAccess === "boolean") {
    if (!canManage(user)) return Response.json({ error: "Discipleship management permission required." }, { status: 403 });
    const [target] = await getDb().select().from(users).where(eq(users.id, clean(payload.teamUserId))).limit(1);
    if (!target?.active) return Response.json({ error: "That active user account could not be found." }, { status: 404 });
    if (!payload.discipleshipAccess && target.canManageDiscipleship) {
      return Response.json({ error: "A Global Admin must remove Discipleship management permission first." }, { status: 400 });
    }
    if (!payload.discipleshipAccess) {
      const [active] = await getDb().select({ id: discipleshipRelationships.id }).from(discipleshipRelationships).where(and(
        eq(discipleshipRelationships.archivedAt, ""),
        eq(discipleshipRelationships.discipleMakerUserId, target.id),
      )).limit(1);
      if (active) return Response.json({ error: "Reassign or archive this disciple maker’s active relationships before removing access." }, { status: 400 });
    }
    await getDb().update(users).set({ canAccessDiscipleship: payload.discipleshipAccess, updatedAt: new Date().toISOString() }).where(eq(users.id, target.id));
    await audit(user, payload.discipleshipAccess ? "granted Discipleship access" : "removed Discipleship access", target.name, target.email);
    return Response.json({ updated: true });
  }
  const [existing] = await getDb().select().from(discipleshipRelationships).where(eq(discipleshipRelationships.id, clean(payload.id))).limit(1);
  if (!existing || (!canManage(user) && existing.discipleMakerUserId !== user.id)) return Response.json({ error: "Discipleship assignment not found." }, { status: 404 });
  if (typeof payload.coachContacted === "boolean") {
    if (!canManage(user)) return Response.json({ error: "Discipleship management permission required." }, { status: 403 });
    const [updated] = await getDb().update(discipleshipRelationships).set({
      coachContactedAt: payload.coachContacted ? new Date().toISOString() : "",
      updatedAt: new Date().toISOString(),
    }).where(eq(discipleshipRelationships.id, existing.id)).returning();
    await audit(user, payload.coachContacted ? "completed disciple-maker coaching check-in" : "reopened disciple-maker coaching check-in", updated.discipleName, updated.discipleMakerName);
    return Response.json({ relationship: serialize(updated) });
  }
  const meetupCount = existing.meetupCount + (payload.logMeetup ? 1 : 0);
  const updates: Partial<typeof discipleshipRelationships.$inferInsert> = {
    updatedAt: new Date().toISOString(),
    meetupCount,
  };
  if (typeof payload.lastContact === "string") updates.lastContact = clean(payload.lastContact);
  if (typeof payload.nextMeetupDate === "string") updates.nextMeetupDate = clean(payload.nextMeetupDate);
  if (Array.isArray(payload.growthNeeded)) updates.growthNeeded = JSON.stringify(list(payload.growthNeeded));
  if (Array.isArray(payload.growthSeen)) updates.growthSeen = JSON.stringify(list(payload.growthSeen));
  if (typeof payload.notes === "string") updates.notes = clean(payload.notes);
  const [updated] = await getDb().update(discipleshipRelationships).set(updates).where(eq(discipleshipRelationships.id, existing.id)).returning();
  await audit(user, payload.logMeetup ? "logged discipleship meetup" : "updated discipleship follow-up", updated.discipleName, `Meetup ${updated.meetupCount}`);
  if (existing.meetupCount < 3 && updated.meetupCount >= 3 && !updated.coachContactedAt) await notifyCoach(updated, appOrigin(request));
  return Response.json({ relationship: serialize(updated) });
}

export async function DELETE(request: Request) {
  const user = await currentUser(request);
  if (!user || !canManage(user)) return Response.json({ error: "Discipleship management permission required." }, { status: 403 });
  const payload = await request.json() as { id?: string };
  const [record] = await getDb().select().from(discipleshipRelationships).where(eq(discipleshipRelationships.id, clean(payload.id))).limit(1);
  if (!record) return Response.json({ error: "Discipleship assignment not found." }, { status: 404 });
  await getDb().update(discipleshipRelationships).set({ archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(discipleshipRelationships.id, record.id));
  await audit(user, "archived discipleship assignment", record.discipleName, record.discipleMakerName);
  return Response.json({ archived: true });
}
