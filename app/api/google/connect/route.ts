import { currentUser } from "../../../../lib/auth";
import { getGoogleSettings } from "../../../../lib/google-email";
import { appOrigin, secureCookieAttribute } from "../../../../lib/runtime-env";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user?.canManageUsers) return Response.json({ error: "Global Admin permission required." }, { status: 403 });
  const settings = await getGoogleSettings();
  if (!settings) return Response.redirect(new URL("/admin?google=configure", request.url));
  const state = crypto.randomUUID();
  const redirectUri = `${appOrigin(request)}/api/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: settings.clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email https://www.googleapis.com/auth/gmail.send", access_type: "offline", prompt: "select_account consent", state, include_granted_scopes: "true" }).toString();
  return new Response(null, { status: 302, headers: { Location: url.toString(), "Set-Cookie": `google_oauth_state=${state}; HttpOnly${secureCookieAttribute()}; SameSite=Lax; Path=/; Max-Age=600` } });
}
