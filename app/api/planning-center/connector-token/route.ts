import { currentUser } from "../../../../lib/auth";
import {
  generatePlanningCenterConnectorToken,
  getPlanningCenterSettings,
} from "../../../../lib/planning-center";

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user?.canManageUsers) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  const settings = await getPlanningCenterSettings();
  if (!settings?.encryptedRefreshToken) return Response.json({ error: "Connect Planning Center before creating a connector key." }, { status: 409 });
  return Response.json({
    token: await generatePlanningCenterConnectorToken(),
    warning: "This key is shown once. Store it only in the private Planning Center plugin setup.",
  });
}
