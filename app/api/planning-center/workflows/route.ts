import { currentUser } from "../../../../lib/auth";
import { listPlanningCenterWorkflows } from "../../../../lib/planning-center";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user?.canManageUsers) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return Response.json({ workflows: await listPlanningCenterWorkflows(query) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Planning Center workflows could not be loaded." }, { status: 502 });
  }
}
