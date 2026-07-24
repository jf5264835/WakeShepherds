import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { careItems, careTeamRequests, discipleshipRelationships, hospitalCare, maternalCare, maternalMilestones, youthCare } from "../../../db/schema";
import { currentUser } from "../../../lib/auth";

function daysUntilBirthday(birthday: string, today: Date) {
  if (!birthday) return null;
  const parts = birthday.split("-").map(Number);
  if (parts.length !== 3 || !parts[1] || !parts[2]) return null;
  let next = new Date(Date.UTC(today.getUTCFullYear(), parts[1] - 1, parts[2]));
  const todayKey = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (next.getTime() < todayKey) next = new Date(Date.UTC(today.getUTCFullYear() + 1, parts[1] - 1, parts[2]));
  return Math.round((next.getTime() - todayKey) / 86400000);
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user?.canManageUsers) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  const [care, moms, maternalSteps, youth, hospital, discipleship, teamRequests] = await Promise.all([
    getDb().select().from(careItems).where(eq(careItems.archivedAt, "")),
    getDb().select().from(maternalCare).where(eq(maternalCare.archivedAt, "")),
    getDb().select().from(maternalMilestones).where(eq(maternalMilestones.status, "Open")),
    getDb().select().from(youthCare).where(eq(youthCare.archivedAt, "")),
    getDb().select().from(hospitalCare).where(eq(hospitalCare.archivedAt, "")),
    getDb().select().from(discipleshipRelationships).where(eq(discipleshipRelationships.archivedAt, "")),
    getDb().select().from(careTeamRequests).where(and(eq(careTeamRequests.status, "Open"))),
  ]);
  const students = youth.filter((record) => record.personType === "student");
  const staff = youth.filter((record) => record.personType === "staff");
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const birthCutoff = new Date(`${todayKey}T12:00:00Z`);
  birthCutoff.setUTCDate(birthCutoff.getUTCDate() + 30);
  const birthCutoffKey = birthCutoff.toISOString().slice(0, 10);
  const activeHospital = hospital.filter((record) => record.status !== "Complete");
  const coveredHospital = activeHospital.filter((record) => Boolean(record.assignedUserId));
  const urgentRequests = teamRequests.filter((request) => request.urgency === "urgent");
  const escalations = [...teamRequests]
    .sort((a, b) => {
      if (a.urgency !== b.urgency) return a.urgency === "urgent" ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    })
    .slice(0, 8);
  return Response.json({
    attention: {
      hospitalCovered: coveredHospital.length,
      hospitalActive: activeHospital.length,
      hospitalCoveragePercent: activeHospital.length ? Math.round((coveredHospital.length / activeHospital.length) * 100) : 100,
      approachingBirths: moms.filter((record) =>
        record.stage === "pregnant"
        && Boolean(record.dueDate)
        && record.dueDate >= todayKey
        && record.dueDate <= birthCutoffKey).length,
      postpartumOverdue: maternalSteps.filter((step) =>
        step.kind.startsWith("postpartum-")
        && Boolean(step.dueDate)
        && step.dueDate < todayKey).length,
      urgentEscalations: urgentRequests.length,
    },
    escalations,
    care: {
      total: care.length,
      open: care.filter((record) => record.status !== "Complete").length,
      urgent: care.filter((record) => record.status !== "Complete" && record.priority === "Urgent").length,
    },
    moms: {
      total: moms.length,
      trying: moms.filter((record) => record.stage === "trying").length,
      pregnant: moms.filter((record) => record.stage === "pregnant").length,
      postpartum: moms.filter((record) => record.stage === "postpartum").length,
    },
    youth: {
      students: students.length,
      staffCare: staff.filter((record) => record.status !== "Complete").length,
      birthdaysSoon: students.filter((record) => {
        const days = daysUntilBirthday(record.birthday, today);
        return days !== null && days <= 14 && record.birthdayAcknowledgedYear !== today.getUTCFullYear();
      }).length,
    },
    hospital: {
      active: activeHospital.length,
      due: hospital.filter((record) => record.status !== "Complete" && Boolean(record.followUpDate) && record.followUpDate <= todayKey).length,
    },
    discipleship: {
      active: discipleship.filter((record) => record.status === "Active").length,
      coachingAlerts: discipleship.filter((record) => record.status === "Active" && record.meetupCount >= 3 && !record.coachContactedAt).length,
    },
  });
}
