import { currentUser } from "../../../../lib/auth";
import { decryptSecret, getGoogleSettings, saveGoogleConnection } from "../../../../lib/google-email";
import { appOrigin, secureCookieAttribute } from "../../../../lib/runtime-env";

function cookieValue(request: Request, name: string) {
  for (const pair of (request.headers.get("cookie") ?? "").split(";")) { const [key, ...parts] = pair.trim().split("="); if (key === name) return decodeURIComponent(parts.join("=")); }
  return "";
}
function back(request: Request, result: string) { return Response.redirect(new URL(`/admin?google=${result}`, appOrigin(request))); }

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user?.canManageUsers) return back(request, "unauthorized");
  const url = new URL(request.url), code = url.searchParams.get("code") ?? "", state = url.searchParams.get("state") ?? "";
  if (!code || !state || state !== cookieValue(request, "google_oauth_state")) return back(request, "state_error");
  const settings = await getGoogleSettings(); if (!settings) return back(request, "configure");
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: settings.clientId, client_secret: await decryptSecret(settings.encryptedClientSecret, settings.clientSecretIv), redirect_uri: `${appOrigin(request)}/api/google/callback`, grant_type: "authorization_code" }) });
  const token = await tokenResponse.json() as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
  if (!tokenResponse.ok) {
    const errorCode = (token.error ?? "unknown").replace(/[^a-z0-9_-]/gi, "_").slice(0, 60);
    console.error("[google-oauth] token exchange failed", { error: errorCode, status: tokenResponse.status, description: token.error_description?.slice(0, 180) });
    return back(request, `token_${errorCode}`);
  }
  if (!token.access_token) return back(request, "missing_access_token");
  if (!token.refresh_token) return back(request, "missing_refresh_token");
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
  const profile = await profileResponse.json() as { email?: string };
  if (!profile.email || profile.email.toLowerCase() !== settings.senderEmail.toLowerCase()) return back(request, "wrong_account");
  await saveGoogleConnection(token.refresh_token, profile.email);
  return new Response(null, { status: 302, headers: { Location: new URL("/admin?google=connected", appOrigin(request)).toString(), "Set-Cookie": `google_oauth_state=; HttpOnly${secureCookieAttribute()}; SameSite=Lax; Path=/; Max-Age=0` } });
}
