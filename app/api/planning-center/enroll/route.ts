import { getDb } from "../../../../db";
import { auditEvents } from "../../../../db/schema";
import { currentUser } from "../../../../lib/auth";
import {
  addPersonToPlanningCenterWorkflow,
  getPlanningCenterPerson,
  listPlanningCenterWorkflows,
} from "../../../../lib/planning-center";

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user?.canManageUsers) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  const payload = await request.json() as { personId?: string; workflowId?: string; confirmed?: boolean };
  const personId = (payload.personId ?? "").trim();
  const workflowId = (payload.workflowId ?? "").trim();
  if (!personId || !workflowId) return Response.json({ error: "Choose a person and workflow." }, { status: 400 });
  if (!payload.confirmed) return Response.json({ error: "Confirm the exact person and workflow before enrolling." }, { status: 400 });
  try {
    const [person, workflows] = await Promise.all([
      getPlanningCenterPerson(personId),
      listPlanningCenterWorkflows(),
    ]);
    const workflow = workflows.find((item) => item.id === workflowId);
    if (!workflow) return Response.json({ error: "That workflow is unavailable to the connected Planning Center account." }, { status: 404 });
    const card = await addPersonToPlanningCenterWorkflow(personId, workflowId);
    await getDb().insert(auditEvents).values({
      id: `audit-${crypto.randomUUID()}`,
      userId: user.id,
      actorName: user.name,
      action: "added person to Planning Center workflow",
      carePerson: person.name,
      details: `${workflow.name} · Card ${card.id}`,
    });
    return Response.json({ person, workflow, card });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Workflow enrollment failed." }, { status: 502 });
  }
}
