import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditEvents, careTeamRequests, hospitalCare, hospitalMilestones, hospitalResources, users } from "../../../db/schema";
import { currentUser, safeUser } from "../../../lib/auth";
import { sendDashboardEmail } from "../../../lib/google-email";
import { appOrigin } from "../../../lib/runtime-env";

type HospitalPayload = Partial<typeof hospitalCare.$inferInsert>;
type ResourcePayload = Partial<typeof hospitalResources.$inferInsert>;

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const canAccess = (user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) =>
  user.canManageUsers || user.canAccessHospital || user.canManageHospital;
const canManage = (user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) =>
  user.canManageUsers || user.canManageHospital;
function validResourceUrl(value: string) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}
function addDays(value: string, days: number) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function careFields(payload: HospitalPayload) {
  return {
    personName: clean(payload.personName),
    age: clean(payload.age),
    hospitalName: clean(payload.hospitalName),
    hospitalAddress: clean(payload.hospitalAddress),
    roomNumber: clean(payload.roomNumber),
    situation: clean(payload.situation),
    incidentDate: clean(payload.incidentDate),
    expectedDischargeDate: clean(payload.expectedDischargeDate),
    dischargedAt: clean(payload.dischargedAt),
    contactName: clean(payload.contactName),
    contactPhone: clean(payload.contactPhone),
    contactEmail: clean(payload.contactEmail),
    relationship: clean(payload.relationship),
    visitGuidance: clean(payload.visitGuidance),
    notes: clean(payload.notes),
    lastContact: clean(payload.lastContact),
    nextAction: clean(payload.nextAction),
    followUpDate: clean(payload.followUpDate),
    status: clean(payload.status) || "Open",
    assignedUserId: clean(payload.assignedUserId),
    assignedTo: clean(payload.assignedTo),
  };
}

function desiredHospitalMilestones(record: typeof hospitalCare.$inferSelect) {
  const admissionDate = record.incidentDate || record.createdAt.slice(0, 10);
  const createdDate = record.createdAt.slice(0, 10);
  const steps = [
    {
      kind: "admission",
      label: "Admission recorded",
      dueDate: admissionDate,
      complete: true,
      completedAt: admissionDate,
    },
    {
      kind: "care-owner",
      label: "Care owner assigned",
      dueDate: createdDate,
      complete: Boolean(record.assignedUserId),
      completedAt: record.assignedUserId ? record.updatedAt : "",
    },
    {
      kind: "initial-contact",
      label: "Initial contact or hospital visit",
      dueDate: admissionDate,
      complete: Boolean(record.lastContact),
      completedAt: record.lastContact,
    },
  ];
  if (record.followUpDate) {
    steps.push({
      kind: `hospital-follow-up-${record.followUpDate}`,
      label: "Hospital follow-up",
      dueDate: record.followUpDate,
      complete: false,
      completedAt: "",
    });
  }
  if (record.expectedDischargeDate || record.dischargedAt) {
    steps.push({
      kind: "discharge-planning",
      label: "Confirm discharge plan and next care owner",
      dueDate: record.expectedDischargeDate || record.dischargedAt,
      complete: Boolean(record.dischargedAt),
      completedAt: record.dischargedAt,
    });
    steps.push({
      kind: "discharge",
      label: "Discharge confirmed",
      dueDate: record.dischargedAt || record.expectedDischargeDate,
      complete: Boolean(record.dischargedAt),
      completedAt: record.dischargedAt,
    });
  }
  if (record.dischargedAt) {
    steps.push({
      kind: "post-discharge-48h",
      label: "48-hour post-discharge check-in",
      dueDate: addDays(record.dischargedAt, 2),
      complete: false,
      completedAt: "",
    });
    steps.push({
      kind: "post-discharge-7d",
      label: "One-week recovery and practical-needs check-in",
      dueDate: addDays(record.dischargedAt, 7),
      complete: false,
      completedAt: "",
    });
  }
  return steps.map((step) => ({
    id: `hospital-milestone-${record.id}-${step.kind}`,
    hospitalCareId: record.id,
    kind: step.kind,
    label: step.label,
    dueDate: step.dueDate,
    status: step.complete ? "Complete" : "Open",
    completedAt: step.completedAt,
  }));
}

async function syncHospitalMilestones(record: typeof hospitalCare.$inferSelect) {
  const db = getDb();
  const desired = desiredHospitalMilestones(record);
  for (const item of desired) {
    await db.insert(hospitalMilestones).values(item).onConflictDoUpdate({
      target: hospitalMilestones.id,
      set: { label: item.label, dueDate: item.dueDate },
    });
    if (item.status === "Complete") {
      await db.update(hospitalMilestones).set({
        status: "Complete",
        completedAt: item.completedAt,
      }).where(eq(hospitalMilestones.id, item.id));
    }
  }
  const desiredKinds = new Set(desired.map((item) => item.kind));
  const existing = await db.select().from(hospitalMilestones).where(eq(hospitalMilestones.hospitalCareId, record.id));
  for (const item of existing) {
    if (item.status === "Open" && !desiredKinds.has(item.kind)) {
      await db.delete(hospitalMilestones).where(eq(hospitalMilestones.id, item.id));
    }
  }
}

async function resolveAssignee(item: ReturnType<typeof careFields>) {
  if (!item.assignedUserId) {
    item.assignedTo = "";
    return null;
  }
  const [assignee] = await getDb().select().from(users).where(eq(users.id, item.assignedUserId)).limit(1);
  if (!assignee?.active || (!assignee.canAccessHospital && !assignee.canManageHospital)) {
    throw new Error("Give this person Hospital Team access before assigning hospital care.");
  }
  item.assignedTo = assignee.name;
  return assignee;
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

async function notifyAssignee(assignee: typeof users.$inferSelect | null, item: ReturnType<typeof careFields> & { id?: string }, origin: string) {
  if (!assignee) return;
  try {
    await sendDashboardEmail({
      recipient: assignee.notificationEmail || assignee.email,
      subject: `Hospital care assignment: ${item.personName}`,
      body: [
        `Hi ${assignee.name},`,
        "",
        `You have been assigned hospital care for ${item.personName}.`,
        `Hospital: ${item.hospitalName}`,
        `Room: ${item.roomNumber || "Not entered"}`,
        `Next step: ${item.nextAction || "Please coordinate the next faithful step."}`,
        "",
        `Open your assigned hospital care: ${origin}/my${item.id ? `?assignment=${encodeURIComponent(item.id)}` : ""}`,
        "",
        "Please keep sensitive medical details out of email.",
      ].join("\r\n"),
    });
  } catch {
    // The in-dashboard assignment remains authoritative when email is unavailable.
  }
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user || !canAccess(user)) return Response.json({ error: "Hospital Team access required." }, { status: 403 });
  const records = canManage(user)
    ? await getDb().select().from(hospitalCare).where(eq(hospitalCare.archivedAt, "")).orderBy(asc(hospitalCare.followUpDate))
    : await getDb().select().from(hospitalCare).where(and(eq(hospitalCare.archivedAt, ""), eq(hospitalCare.assignedUserId, user.id))).orderBy(asc(hospitalCare.followUpDate));
  const resources = await getDb().select().from(hospitalResources).where(eq(hospitalResources.archivedAt, "")).orderBy(asc(hospitalResources.title));
  const allUsers = canManage(user)
    ? await getDb().select().from(users).where(eq(users.active, true)).orderBy(asc(users.name))
    : [];
  const team = allUsers.filter((member) => member.canAccessHospital || member.canManageHospital).map(safeUser);
  const availableUsers = allUsers.filter((member) => !member.canAccessHospital && !member.canManageHospital).map(safeUser);
  for (const record of records) await syncHospitalMilestones(record);
  const recordIds = records.map((record) => record.id);
  const milestones = recordIds.length
    ? await getDb().select().from(hospitalMilestones).where(inArray(hospitalMilestones.hospitalCareId, recordIds)).orderBy(asc(hospitalMilestones.dueDate))
    : [];
  const supportRequests = canManage(user)
    ? await getDb().select().from(careTeamRequests).where(and(eq(careTeamRequests.source, "hospital"), eq(careTeamRequests.status, "Open"))).orderBy(asc(careTeamRequests.createdAt))
    : [];
  return Response.json({ records, resources, team, availableUsers, milestones, supportRequests });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user || !canManage(user)) return Response.json({ error: "Hospital Team management permission required." }, { status: 403 });
  const payload = await request.json() as HospitalPayload & ResourcePayload & { entity?: string };
  const now = new Date().toISOString();
  if (payload.entity === "resource") {
    const title = clean(payload.title), url = clean(payload.url);
    if (!title || !url) return Response.json({ error: "Resource title and link are required." }, { status: 400 });
    if (!validResourceUrl(url)) return Response.json({ error: "Resource links must begin with http:// or https://." }, { status: 400 });
    const [resource] = await getDb().insert(hospitalResources).values({
      id: `hospital-resource-${crypto.randomUUID()}`,
      title,
      resourceType: clean(payload.resourceType) || "Article",
      summary: clean(payload.summary),
      url,
      publishedBy: user.name,
      createdAt: now,
      updatedAt: now,
    }).returning();
    await audit(user, "published Hospital Team resource", title, resource.resourceType);
    return Response.json({ resource }, { status: 201 });
  }
  const item = careFields(payload);
  if (!item.personName || !item.hospitalName || !item.hospitalAddress) {
    return Response.json({ error: "Person, hospital, and hospital address are required." }, { status: 400 });
  }
  let assignee: typeof users.$inferSelect | null;
  try { assignee = await resolveAssignee(item); } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Hospital assignment is invalid." }, { status: 400 });
  }
  const [record] = await getDb().insert(hospitalCare).values({
    id: `hospital-${crypto.randomUUID()}`,
    ...item,
    createdAt: now,
    updatedAt: now,
  }).returning();
  await syncHospitalMilestones(record);
  await audit(user, "created hospital care", record.personName, record.hospitalName);
  await notifyAssignee(assignee, record, appOrigin(request));
  return Response.json({ record }, { status: 201 });
}

export async function PUT(request: Request) {
  const user = await currentUser(request);
  if (!user || !canManage(user)) return Response.json({ error: "Hospital Team management permission required." }, { status: 403 });
  const payload = await request.json() as HospitalPayload;
  const id = clean(payload.id);
  const [existing] = await getDb().select().from(hospitalCare).where(eq(hospitalCare.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Hospital care record not found." }, { status: 404 });
  const item = careFields(payload);
  if (!item.personName || !item.hospitalName || !item.hospitalAddress) {
    return Response.json({ error: "Person, hospital, and hospital address are required." }, { status: 400 });
  }
  let assignee: typeof users.$inferSelect | null;
  try { assignee = await resolveAssignee(item); } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Hospital assignment is invalid." }, { status: 400 });
  }
  const [record] = await getDb().update(hospitalCare).set({ ...item, updatedAt: new Date().toISOString() }).where(eq(hospitalCare.id, id)).returning();
  await syncHospitalMilestones(record);
  await audit(user, "updated hospital care", record.personName, record.hospitalName);
  if (record.assignedUserId && record.assignedUserId !== existing.assignedUserId) await notifyAssignee(assignee, record, appOrigin(request));
  return Response.json({ record });
}

export async function PATCH(request: Request) {
  const user = await currentUser(request);
  if (!user || !canAccess(user)) return Response.json({ error: "Hospital Team access required." }, { status: 403 });
  const payload = await request.json() as {
    id?: string;
    lastContact?: string;
    nextAction?: string;
    followUpDate?: string;
    status?: string;
    milestoneId?: string;
    complete?: boolean;
    teamUserId?: string;
    hospitalAccess?: boolean;
  };
  if (payload.milestoneId) {
    const [item] = await getDb().select().from(hospitalMilestones).where(eq(hospitalMilestones.id, clean(payload.milestoneId))).limit(1);
    if (!item) return Response.json({ error: "Hospital timeline step not found." }, { status: 404 });
    const [care] = await getDb().select().from(hospitalCare).where(eq(hospitalCare.id, item.hospitalCareId)).limit(1);
    if (!care || (!canManage(user) && care.assignedUserId !== user.id)) {
      return Response.json({ error: "Hospital timeline step not found." }, { status: 404 });
    }
    await getDb().update(hospitalMilestones).set({
      status: payload.complete ? "Complete" : "Open",
      completedAt: payload.complete ? new Date().toISOString() : "",
    }).where(eq(hospitalMilestones.id, item.id));
    await audit(user, payload.complete ? "completed hospital timeline step" : "reopened hospital timeline step", care.personName, item.label);
    return Response.json({ updated: true });
  }
  if (payload.teamUserId && typeof payload.hospitalAccess === "boolean") {
    if (!canManage(user)) return Response.json({ error: "Hospital Team management permission required." }, { status: 403 });
    const [target] = await getDb().select().from(users).where(eq(users.id, clean(payload.teamUserId))).limit(1);
    if (!target?.active) return Response.json({ error: "That active user account could not be found." }, { status: 404 });
    if (!payload.hospitalAccess && target.canManageHospital) {
      return Response.json({ error: "A Global Admin must remove Hospital management permission first." }, { status: 400 });
    }
    if (!payload.hospitalAccess) {
      const [active] = await getDb().select({ id: hospitalCare.id }).from(hospitalCare).where(and(eq(hospitalCare.archivedAt, ""), eq(hospitalCare.assignedUserId, target.id))).limit(1);
      if (active) return Response.json({ error: "Reassign or archive this person’s active hospital care before removing access." }, { status: 400 });
    }
    await getDb().update(users).set({ canAccessHospital: payload.hospitalAccess, updatedAt: new Date().toISOString() }).where(eq(users.id, target.id));
    await audit(user, payload.hospitalAccess ? "granted Hospital Team access" : "removed Hospital Team access", target.name, target.email);
    return Response.json({ updated: true });
  }
  const [record] = await getDb().select().from(hospitalCare).where(eq(hospitalCare.id, clean(payload.id))).limit(1);
  if (!record || (!canManage(user) && record.assignedUserId !== user.id)) return Response.json({ error: "Hospital care record not found." }, { status: 404 });
  const updates: Partial<typeof hospitalCare.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (typeof payload.lastContact === "string") updates.lastContact = clean(payload.lastContact);
  if (typeof payload.nextAction === "string") updates.nextAction = clean(payload.nextAction);
  if (typeof payload.followUpDate === "string") updates.followUpDate = clean(payload.followUpDate);
  if (typeof payload.status === "string" && ["Open", "Waiting", "Discharged", "Complete"].includes(payload.status)) updates.status = payload.status;
  const [updated] = await getDb().update(hospitalCare).set(updates).where(eq(hospitalCare.id, record.id)).returning();
  await syncHospitalMilestones(updated);
  await audit(user, "updated assigned hospital follow-up", updated.personName, updated.status);
  return Response.json({ record: updated });
}

export async function DELETE(request: Request) {
  const user = await currentUser(request);
  if (!user || !canManage(user)) return Response.json({ error: "Hospital Team management permission required." }, { status: 403 });
  const payload = await request.json() as { id?: string; entity?: string };
  const id = clean(payload.id);
  if (payload.entity === "resource") {
    const [resource] = await getDb().select().from(hospitalResources).where(eq(hospitalResources.id, id)).limit(1);
    if (!resource) return Response.json({ error: "Resource not found." }, { status: 404 });
    await getDb().update(hospitalResources).set({ archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(hospitalResources.id, id));
    await audit(user, "archived Hospital Team resource", resource.title, resource.resourceType);
    return Response.json({ archived: true });
  }
  const [record] = await getDb().select().from(hospitalCare).where(eq(hospitalCare.id, id)).limit(1);
  if (!record) return Response.json({ error: "Hospital care record not found." }, { status: 404 });
  await getDb().update(hospitalCare).set({ archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(hospitalCare.id, id));
  await audit(user, "archived hospital care", record.personName, record.hospitalName);
  return Response.json({ archived: true });
}
