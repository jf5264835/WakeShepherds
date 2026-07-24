import { currentUser } from "../../../../lib/auth";
import { decryptSecret, getGoogleSettings, saveGoogleCredentials } from "../../../../lib/google-email";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user?.canManageUsers) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  const settings = await getGoogleSettings();
  return Response.json({ configured: Boolean(settings), connected: Boolean(settings?.encryptedRefreshToken), senderEmail: settings?.senderEmail ?? "kai@wakechurch.com", connectedEmail: settings?.connectedEmail ?? "", clientId: settings?.clientId ?? "" });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user?.canManageUsers) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  const payload = await request.json() as { clientId?: string; clientSecret?: string; senderEmail?: string };
  const clientId = (payload.clientId ?? "").trim(), clientSecret = (payload.clientSecret ?? "").trim(), senderEmail = (payload.senderEmail ?? "").trim().toLowerCase();
  const existing = await getGoogleSettings();
  if (!clientId || (!clientSecret && !existing) || !senderEmail) return Response.json({ error: "Client ID, Client Secret, and sender email are required." }, { status: 400 });
  if (!clientId.endsWith(".apps.googleusercontent.com")) return Response.json({ error: "The OAuth Client ID must be copied from Google Cloud and end in .apps.googleusercontent.com." }, { status: 400 });
  const secret = clientSecret || await decryptSecret(existing!.encryptedClientSecret, existing!.clientSecretIv);
  await saveGoogleCredentials(clientId, secret, senderEmail);
  return Response.json({ configured: true, connected: false, senderEmail });
}
