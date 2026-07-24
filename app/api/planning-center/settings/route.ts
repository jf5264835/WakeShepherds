import { currentUser } from "../../../../lib/auth";
import {
  decryptPlanningSecret,
  getPlanningCenterSettings,
  savePlanningCenterCredentials,
} from "../../../../lib/planning-center";
import { appOrigin } from "../../../../lib/runtime-env";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user?.canManageUsers) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  const settings = await getPlanningCenterSettings();
  return Response.json({
    configured: Boolean(settings),
    connected: Boolean(settings?.encryptedRefreshToken),
    connectorReady: Boolean(settings?.connectorTokenHash),
    clientId: settings?.clientId ?? "",
    connectedPersonName: settings?.connectedPersonName ?? "",
    organizationName: settings?.organizationName ?? "",
    callbackUrl: `${appOrigin(request)}/api/planning-center/callback`,
  });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user?.canManageUsers) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  const payload = await request.json() as { clientId?: string; clientSecret?: string };
  const clientId = (payload.clientId ?? "").trim();
  const clientSecret = (payload.clientSecret ?? "").trim();
  const existing = await getPlanningCenterSettings();
  if (!clientId || (!clientSecret && !existing)) {
    return Response.json({ error: "Planning Center Client ID and Client Secret are required." }, { status: 400 });
  }
  const secret = clientSecret || await decryptPlanningSecret(existing!.encryptedClientSecret, existing!.clientSecretIv);
  await savePlanningCenterCredentials(clientId, secret);
  return Response.json({ configured: true });
}
