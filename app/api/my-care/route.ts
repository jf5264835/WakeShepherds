import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  auditEvents,
  careItems,
  discipleshipRelationships,
  hospitalCare,
  hospitalResources,
  maternalCare,
  maternalMilestones,
  users,
  youthCare,
} from "../../../db/schema";
import { currentUser, safeUser } from "../../../lib/auth";
import { sendDashboardEmail } from "../../../lib/google-email";
import { appOrigin } from "../../../lib/runtime-env";

type Source = "care" | "moms" | "youth" | "hospital" | "discipleship";
type User = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const dateOnly = (value: unknown) => {
  const candidate = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : "";
};
const allowedCategories = (user: User) => {
  try { return new Set(JSON.parse(user.allowedCategories) as string[]); } catch { return new Set<string>(); }
};
const canUseYouth = (user: User) => user.canManageUsers || user.canAccessYouth || user.canManageYouth;
const canUseHospital = (user: User) => user.canManageUsers || user.canAccessHospital || user.canManageHospital;
const canUseDiscipleship = (user: User) => user.canManageUsers || user.canAccessDiscipleship || user.canManageDiscipleship;
const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const appendNote = (existing: string, note: string, contactDate: string) => {
  if (!note) return existing;
  const entry = `${contactDate} — ${note}`;
  return existing ? `${existing}\n${entry}` : entry;
};

async function audit(user: User, action: string, person: string, source: Source) {
  await getDb().insert(auditEvents).values({
    id: `audit-${crypto.randomUUID()}`,
    userId: user.id,
    actorName: user.name,
    action,
    carePerson: person,
    details: `My Assignments · ${source}`,
  });
}

async function notifyThirdMeetup(record: typeof discipleshipRelationships.$inferSelect, origin: string) {
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
      // The persistent coach alert remains available when email is unavailable.
    }
  }
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const db = getDb();
  const categoryAccess = allowedCategories(user);

  const careRows = (await db.select().from(careItems).where(and(
    eq(careItems.assignedUserId, user.id),
    eq(careItems.archivedAt, ""),
    ne(careItems.status, "Complete"),
  )).orderBy(asc(careItems.followUpDate))).filter((record) => user.canViewAll || categoryAccess.has(record.category));

  const youthRows = canUseYouth(user)
    ? await db.select().from(youthCare).where(and(
      eq(youthCare.assignedUserId, user.id),
      eq(youthCare.archivedAt, ""),
      ne(youthCare.status, "Complete"),
    )).orderBy(asc(youthCare.followUpDate))
    : [];

  const hospitalRows = canUseHospital(user)
    ? await db.select().from(hospitalCare).where(and(
      eq(hospitalCare.assignedUserId, user.id),
      eq(hospitalCare.archivedAt, ""),
      ne(hospitalCare.status, "Complete"),
    )).orderBy(asc(hospitalCare.followUpDate))
    : [];

  const discipleshipRows = canUseDiscipleship(user)
    ? await db.select().from(discipleshipRelationships).where(and(
      eq(discipleshipRelationships.discipleMakerUserId, user.id),
      eq(discipleshipRelationships.archivedAt, ""),
      eq(discipleshipRelationships.status, "Active"),
    )).orderBy(asc(discipleshipRelationships.nextMeetupDate))
    : [];

  const canUseMoms = user.canViewAll || categoryAccess.has("Pregnancy");
  const momRows = canUseMoms
    ? await db.select().from(maternalCare).where(and(
      eq(maternalCare.assignedUserId, user.id),
      eq(maternalCare.archivedAt, ""),
    )).orderBy(asc(maternalCare.dueDate))
    : [];
  const momIds = momRows.map((record) => record.id);
  const openMilestones = momIds.length
    ? await db.select().from(maternalMilestones).where(and(
      inArray(maternalMilestones.maternalCareId, momIds),
      eq(maternalMilestones.status, "Open"),
    )).orderBy(asc(maternalMilestones.dueDate))
    : [];
  const nextMilestoneByMom = new Map<string, typeof maternalMilestones.$inferSelect>();
  for (const milestone of openMilestones) {
    if (!nextMilestoneByMom.has(milestone.maternalCareId)) nextMilestoneByMom.set(milestone.maternalCareId, milestone);
  }

  const assignments = [
    ...careRows.map((record) => ({
      source: "care" as const,
      id: record.id,
      personName: record.name,
      ministry: "Shepherding Care",
      category: record.category,
      task: record.nextAction || record.lane,
      summary: record.need,
      dueDate: record.followUpDate,
      lastContact: record.lastContact,
      priority: record.priority,
      status: record.status,
      phone: "",
      email: "",
      location: "",
      room: "",
      detailUrl: `/?category=${encodeURIComponent(record.category)}`,
      meetupCount: 0,
    })),
    ...youthRows.map((record) => ({
      source: "youth" as const,
      id: record.id,
      personName: record.name,
      ministry: record.personType === "staff" ? "Wake Youth Staff Care" : "Wake Youth",
      category: record.category,
      task: record.nextAction || "Make an intentional touchpoint",
      summary: record.need || (record.school ? `Student at ${record.school}` : ""),
      dueDate: record.followUpDate,
      lastContact: record.lastContact,
      priority: "Normal",
      status: record.status,
      phone: "",
      email: "",
      location: record.school,
      room: "",
      detailUrl: record.personType === "staff" ? "/youth?section=staff" : "/youth",
      meetupCount: 0,
    })),
    ...hospitalRows.map((record) => ({
      source: "hospital" as const,
      id: record.id,
      personName: record.personName,
      ministry: "Hospital Team",
      category: "Hospital visit",
      task: record.nextAction || `Visit or contact ${record.personName}`,
      summary: record.situation,
      dueDate: record.followUpDate,
      lastContact: record.lastContact,
      priority: "High",
      status: record.status,
      phone: record.contactPhone,
      email: record.contactEmail,
      location: record.hospitalAddress,
      room: record.roomNumber,
      detailUrl: "/hospital",
      meetupCount: 0,
    })),
    ...discipleshipRows.map((record) => ({
      source: "discipleship" as const,
      id: record.id,
      personName: record.discipleName,
      ministry: record.ministry,
      category: "Discipleship",
      task: record.nextMeetupDate ? "Prepare for the next meetup" : "Schedule the next meetup",
      summary: record.meetupCount ? `${record.meetupCount} meetup${record.meetupCount === 1 ? "" : "s"} completed` : "Begin the discipleship relationship",
      dueDate: record.nextMeetupDate,
      lastContact: record.lastContact,
      priority: "Normal",
      status: record.status,
      phone: record.disciplePhone,
      email: record.discipleEmail,
      location: "",
      room: "",
      detailUrl: "/discipleship",
      meetupCount: record.meetupCount,
    })),
    ...momRows.flatMap((record) => {
      const milestone = nextMilestoneByMom.get(record.id);
      if (!milestone) return [];
      return [{
        source: "moms" as const,
        id: milestone.id,
        personName: record.momName,
        ministry: "Pregnancy Care",
        category: record.stage === "trying" ? "Prayer & fertility care" : record.stage === "postpartum" ? "Postpartum care" : "Pregnancy",
        task: milestone.label,
        summary: record.babyName ? `Caring for ${record.momName} and ${record.babyName}` : "",
        dueDate: milestone.dueDate,
        lastContact: "",
        priority: "Normal",
        status: milestone.status,
        phone: "",
        email: record.email,
        location: "",
        room: "",
        detailUrl: "/moms",
        meetupCount: 0,
      }];
    }),
  ].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return a.personName.localeCompare(b.personName);
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  const resources = canUseHospital(user)
    ? await db.select().from(hospitalResources).where(eq(hospitalResources.archivedAt, "")).orderBy(asc(hospitalResources.title))
    : [];

  return Response.json({
    user: safeUser(user),
    assignments,
    resources,
    ministries: {
      care: true,
      moms: canUseMoms,
      youth: canUseYouth(user),
      hospital: canUseHospital(user),
      discipleship: canUseDiscipleship(user),
    },
  });
}

export async function PATCH(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const payload = await request.json() as {
    source?: Source;
    id?: string;
    contactDate?: string;
    note?: string;
    followUpNeeded?: boolean;
    followUpDate?: string;
    markComplete?: boolean;
    countMeetup?: boolean;
  };
  const source = payload.source;
  const id = clean(payload.id);
  const contactDate = dateOnly(payload.contactDate) || new Date().toISOString().slice(0, 10);
  const followUpDate = payload.followUpNeeded ? dateOnly(payload.followUpDate) : "";
  const note = clean(payload.note).slice(0, 500);
  if (!source || !id) return Response.json({ error: "Assignment is required." }, { status: 400 });
  if (payload.followUpNeeded && !followUpDate) return Response.json({ error: "Choose a follow-up date." }, { status: 400 });
  const db = getDb();

  if (source === "care") {
    const [record] = await db.select().from(careItems).where(and(eq(careItems.id, id), eq(careItems.assignedUserId, user.id), eq(careItems.archivedAt, ""))).limit(1);
    if (!record) return Response.json({ error: "Assignment not found." }, { status: 404 });
    if (!user.canViewAll && !allowedCategories(user).has(record.category)) return Response.json({ error: "Assignment not found." }, { status: 404 });
    await db.update(careItems).set({
      lastContact: contactDate,
      notes: appendNote(record.notes, note, contactDate),
      followUpDate: followUpDate || record.followUpDate,
      status: payload.markComplete ? "Complete" : record.status,
      updatedAt: new Date().toISOString(),
    }).where(eq(careItems.id, record.id));
    await audit(user, "logged assigned care contact", record.name, source);
  } else if (source === "youth") {
    if (!canUseYouth(user)) return Response.json({ error: "Wake Youth access required." }, { status: 403 });
    const [record] = await db.select().from(youthCare).where(and(eq(youthCare.id, id), eq(youthCare.assignedUserId, user.id), eq(youthCare.archivedAt, ""))).limit(1);
    if (!record) return Response.json({ error: "Assignment not found." }, { status: 404 });
    await db.update(youthCare).set({
      lastContact: contactDate,
      notes: appendNote(record.notes, note, contactDate),
      followUpDate: followUpDate || record.followUpDate,
      status: payload.markComplete ? "Complete" : record.status,
      updatedAt: new Date().toISOString(),
    }).where(eq(youthCare.id, record.id));
    await audit(user, "logged assigned youth contact", record.name, source);
  } else if (source === "hospital") {
    if (!canUseHospital(user)) return Response.json({ error: "Hospital Team access required." }, { status: 403 });
    const [record] = await db.select().from(hospitalCare).where(and(eq(hospitalCare.id, id), eq(hospitalCare.assignedUserId, user.id), eq(hospitalCare.archivedAt, ""))).limit(1);
    if (!record) return Response.json({ error: "Assignment not found." }, { status: 404 });
    await db.update(hospitalCare).set({
      lastContact: contactDate,
      notes: appendNote(record.notes, note, contactDate),
      followUpDate: followUpDate || record.followUpDate,
      status: payload.markComplete ? "Complete" : record.status,
      updatedAt: new Date().toISOString(),
    }).where(eq(hospitalCare.id, record.id));
    await audit(user, "logged assigned hospital contact", record.personName, source);
  } else if (source === "discipleship") {
    if (!canUseDiscipleship(user)) return Response.json({ error: "Discipleship access required." }, { status: 403 });
    const [record] = await db.select().from(discipleshipRelationships).where(and(
      eq(discipleshipRelationships.id, id),
      eq(discipleshipRelationships.discipleMakerUserId, user.id),
      eq(discipleshipRelationships.archivedAt, ""),
    )).limit(1);
    if (!record) return Response.json({ error: "Assignment not found." }, { status: 404 });
    const meetupCount = record.meetupCount + (payload.countMeetup ? 1 : 0);
    const [updated] = await db.update(discipleshipRelationships).set({
      lastContact: contactDate,
      notes: appendNote(record.notes, note, contactDate),
      nextMeetupDate: followUpDate || record.nextMeetupDate,
      meetupCount,
      updatedAt: new Date().toISOString(),
    }).where(eq(discipleshipRelationships.id, record.id)).returning();
    await audit(user, payload.countMeetup ? "logged discipleship meetup" : "logged discipleship contact", record.discipleName, source);
    if (record.meetupCount < 3 && updated.meetupCount >= 3 && !updated.coachContactedAt) {
      await notifyThirdMeetup(updated, appOrigin(request));
    }
  } else if (source === "moms") {
    const categoryAccess = allowedCategories(user);
    if (!user.canViewAll && !categoryAccess.has("Pregnancy")) return Response.json({ error: "Pregnancy care access required." }, { status: 403 });
    const [milestone] = await db.select().from(maternalMilestones).where(eq(maternalMilestones.id, id)).limit(1);
    if (!milestone) return Response.json({ error: "Assignment not found." }, { status: 404 });
    const [record] = await db.select().from(maternalCare).where(and(
      eq(maternalCare.id, milestone.maternalCareId),
      eq(maternalCare.assignedUserId, user.id),
      eq(maternalCare.archivedAt, ""),
    )).limit(1);
    if (!record) return Response.json({ error: "Assignment not found." }, { status: 404 });
    await db.update(maternalCare).set({
      notes: appendNote(record.notes, note, contactDate),
      updatedAt: new Date().toISOString(),
    }).where(eq(maternalCare.id, record.id));
    if (payload.markComplete) {
      await db.update(maternalMilestones).set({ status: "Complete", completedAt: new Date().toISOString() }).where(eq(maternalMilestones.id, milestone.id));
      if (milestone.kind === "prayer-monthly" && record.stage === "trying") {
        const nextDueDate = addDays(milestone.dueDate, 30);
        await db.insert(maternalMilestones).values({
          id: `maternal-${record.id}-prayer-monthly-${nextDueDate}`,
          maternalCareId: record.id,
          kind: "prayer-monthly",
          label: "Prayer and care check-in",
          dueDate: nextDueDate,
        }).onConflictDoNothing();
      }
    }
    await audit(user, payload.markComplete ? "completed maternal care touchpoint" : "logged maternal care contact", record.momName, source);
  } else {
    return Response.json({ error: "Unknown assignment type." }, { status: 400 });
  }

  return Response.json({ updated: true });
}
