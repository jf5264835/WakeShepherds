import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  auditEvents,
  careItems,
  careTeamRequests,
  discipleshipRelationships,
  hospitalCare,
  maternalCare,
  maternalMilestones,
  users,
  youthCare,
} from "../../../db/schema";
import { currentUser } from "../../../lib/auth";
import { sendDashboardEmail } from "../../../lib/google-email";
import { appOrigin } from "../../../lib/runtime-env";

type Source = "care" | "moms" | "youth" | "hospital" | "discipleship";
type User = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const validSources = new Set<Source>(["care", "moms", "youth", "hospital", "discipleship"]);

function allowedCategories(user: typeof users.$inferSelect) {
  try { return new Set(JSON.parse(user.allowedCategories) as string[]); } catch { return new Set<string>(); }
}

function canLead(user: User, source: Source) {
  if (user.canManageUsers) return true;
  if (source === "hospital") return user.canManageHospital;
  if (source === "youth") return user.canManageYouth;
  if (source === "discipleship") return user.canManageDiscipleship;
  if (source === "moms") return user.canAssignCare && (user.canViewAll || allowedCategories(user).has("Pregnancy"));
  return user.canAssignCare;
}

async function resolveOwnedAssignment(user: User, source: Source, assignmentId: string) {
  const db = getDb();
  if (source === "care") {
    const [record] = await db.select().from(careItems).where(and(
      eq(careItems.id, assignmentId),
      eq(careItems.assignedUserId, user.id),
      eq(careItems.archivedAt, ""),
    )).limit(1);
    return record ? { personName: record.name, detailUrl: `/?category=${encodeURIComponent(record.category)}` } : null;
  }
  if (source === "youth") {
    const [record] = await db.select().from(youthCare).where(and(
      eq(youthCare.id, assignmentId),
      eq(youthCare.assignedUserId, user.id),
      eq(youthCare.archivedAt, ""),
    )).limit(1);
    return record ? { personName: record.name, detailUrl: "/youth" } : null;
  }
  if (source === "hospital") {
    const [record] = await db.select().from(hospitalCare).where(and(
      eq(hospitalCare.id, assignmentId),
      eq(hospitalCare.assignedUserId, user.id),
      eq(hospitalCare.archivedAt, ""),
    )).limit(1);
    return record ? { personName: record.personName, detailUrl: "/hospital#team-inbox" } : null;
  }
  if (source === "discipleship") {
    const [record] = await db.select().from(discipleshipRelationships).where(and(
      eq(discipleshipRelationships.id, assignmentId),
      eq(discipleshipRelationships.discipleMakerUserId, user.id),
      eq(discipleshipRelationships.archivedAt, ""),
    )).limit(1);
    return record ? { personName: record.discipleName, detailUrl: "/discipleship" } : null;
  }
  const [milestone] = await db.select().from(maternalMilestones).where(eq(maternalMilestones.id, assignmentId)).limit(1);
  if (!milestone) return null;
  const [record] = await db.select().from(maternalCare).where(and(
    eq(maternalCare.id, milestone.maternalCareId),
    eq(maternalCare.assignedUserId, user.id),
    eq(maternalCare.archivedAt, ""),
  )).limit(1);
  return record ? { personName: record.momName, detailUrl: "/moms#team-inbox" } : null;
}

async function teamLeads(source: Source) {
  const all = await getDb().select().from(users).where(eq(users.active, true)).orderBy(asc(users.name));
  return all.filter((user) => canLead(user, source));
}

async function audit(user: User, action: string, personName: string, source: Source) {
  await getDb().insert(auditEvents).values({
    id: `audit-${crypto.randomUUID()}`,
    userId: user.id,
    actorName: user.name,
    action,
    carePerson: personName,
    details: `My Assignments · ${source}`,
  });
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const url = new URL(request.url);
  const requestedSource = clean(url.searchParams.get("source")) as Source;
  if (requestedSource && !validSources.has(requestedSource)) {
    return Response.json({ error: "Unknown ministry." }, { status: 400 });
  }
  if (requestedSource && !canLead(user, requestedSource)) {
    return Response.json({ error: "Team-lead permission required." }, { status: 403 });
  }
  const rows = await getDb().select().from(careTeamRequests)
    .where(eq(careTeamRequests.status, "Open"))
    .orderBy(asc(careTeamRequests.createdAt));
  const requests = requestedSource
    ? rows.filter((item) => item.source === requestedSource)
    : rows.filter((item) => validSources.has(item.source as Source) && canLead(user, item.source as Source));
  return Response.json({ requests });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const payload = await request.json() as {
    source?: string;
    assignmentId?: string;
    kind?: string;
    message?: string;
    urgent?: boolean;
  };
  const source = clean(payload.source) as Source;
  const assignmentId = clean(payload.assignmentId);
  const kind = payload.kind === "reassignment" ? "reassignment" : "message";
  const message = clean(payload.message).slice(0, 1000);
  if (!validSources.has(source) || !assignmentId) {
    return Response.json({ error: "Assignment is required." }, { status: 400 });
  }
  if (!message) {
    return Response.json({ error: kind === "reassignment" ? "Tell your team lead why you need a handoff." : "Write a short message for your team lead." }, { status: 400 });
  }
  const assignment = await resolveOwnedAssignment(user, source, assignmentId);
  if (!assignment) return Response.json({ error: "Assignment not found." }, { status: 404 });

  const now = new Date().toISOString();
  const [created] = await getDb().insert(careTeamRequests).values({
    id: `team-request-${crypto.randomUUID()}`,
    source,
    assignmentId,
    personName: assignment.personName,
    senderUserId: user.id,
    senderName: user.name,
    kind,
    message,
    urgency: payload.urgent ? "urgent" : "normal",
    createdAt: now,
    updatedAt: now,
  }).returning();

  const leads = await teamLeads(source);
  let delivered = 0;
  const origin = appOrigin(request);
  for (const lead of leads) {
    if (lead.id === user.id) continue;
    try {
      await sendDashboardEmail({
        recipient: lead.notificationEmail || lead.email,
        subject: `${payload.urgent ? "Urgent · " : ""}${kind === "reassignment" ? "Care reassignment requested" : "Volunteer message"} · ${assignment.personName}`,
        body: [
          `Hi ${lead.name},`,
          "",
          `${user.name} sent a ${kind === "reassignment" ? "request to reassign care" : "message"} regarding ${assignment.personName}.`,
          `Ministry: ${source}`,
          `Priority: ${payload.urgent ? "Needs attention today" : "Normal"}`,
          "",
          message,
          "",
          `Review it in the dashboard: ${origin}${assignment.detailUrl}`,
          "",
          "Please keep sensitive care details inside approved ministry channels.",
        ].join("\r\n"),
      });
      delivered += 1;
    } catch {
      // The persistent team-lead inbox remains authoritative when email is unavailable.
    }
  }
  await audit(user, kind === "reassignment" ? "requested care reassignment" : "messaged team lead", assignment.personName, source);
  return Response.json({ request: created, delivered }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const payload = await request.json() as { id?: string };
  const [existing] = await getDb().select().from(careTeamRequests).where(eq(careTeamRequests.id, clean(payload.id))).limit(1);
  if (!existing) return Response.json({ error: "Team request not found." }, { status: 404 });
  if (!validSources.has(existing.source as Source) || !canLead(user, existing.source as Source)) {
    return Response.json({ error: "Team-lead permission required." }, { status: 403 });
  }
  const now = new Date().toISOString();
  const [updated] = await getDb().update(careTeamRequests).set({
    status: "Resolved",
    resolvedBy: user.name,
    resolvedAt: now,
    updatedAt: now,
  }).where(eq(careTeamRequests.id, existing.id)).returning();
  await audit(user, "resolved team-lead request", existing.personName, existing.source as Source);
  return Response.json({ request: updated });
}
