import { currentUser } from "../../../../lib/auth";
import { auditEvents } from "../../../../db/schema";
import { getDb } from "../../../../db";
import {
  createPlanningCenterPerson,
  getPlanningCenterPerson,
  getPlanningCenterPersonWorkflows,
  searchPlanningCenterPeople,
} from "../../../../lib/planning-center";

async function requireAdmin(request: Request) {
  const user = await currentUser(request);
  return user?.canManageUsers ? user : null;
}

export async function GET(request: Request) {
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  const url = new URL(request.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  try {
    if (id) {
      const [person, workflows] = await Promise.all([
        getPlanningCenterPerson(id),
        getPlanningCenterPersonWorkflows(id),
      ]);
      return Response.json({ person, workflows });
    }
    const query = (url.searchParams.get("q") ?? "").trim();
    if (query.length < 2) return Response.json({ people: [] });
    return Response.json({ people: await searchPlanningCenterPeople(query) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Planning Center lookup failed." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  const payload = await request.json() as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    confirmed?: boolean;
    forceCreate?: boolean;
  };
  const firstName = (payload.firstName ?? "").trim();
  const lastName = (payload.lastName ?? "").trim();
  const email = (payload.email ?? "").trim().toLowerCase();
  const phone = (payload.phone ?? "").trim();
  if (!firstName || !lastName) return Response.json({ error: "First and last name are required." }, { status: 400 });
  if (!payload.confirmed) return Response.json({ error: "Confirm the new Planning Center person before creating it." }, { status: 400 });

  try {
    const duplicateQuery = email || phone || `${firstName} ${lastName}`;
    const duplicates = await searchPlanningCenterPeople(duplicateQuery);
    if (duplicates.length && !payload.forceCreate) {
      return Response.json({
        error: "Possible matching Planning Center people were found.",
        duplicates,
      }, { status: 409 });
    }
    const person = await createPlanningCenterPerson({ firstName, lastName, email, phone });
    await getDb().insert(auditEvents).values({
      id: `audit-${crypto.randomUUID()}`,
      userId: user.id,
      actorName: user.name,
      action: "created Planning Center person",
      carePerson: person.name,
      details: `Planning Center ID ${person.id}`,
    });
    return Response.json({ person }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Planning Center person could not be created." }, { status: 502 });
  }
}
