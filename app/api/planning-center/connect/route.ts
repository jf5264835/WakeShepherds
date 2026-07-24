import { currentUser } from "../../../../lib/auth";
import { getPlanningCenterSettings } from "../../../../lib/planning-center";
import { appOrigin, secureCookieAttribute } from "../../../../lib/runtime-env";

function base64Url(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user?.canManageUsers) return Response.redirect(new URL("/admin?planning=unauthorized", appOrigin(request)));
  const settings = await getPlanningCenterSettings();
  if (!settings) return Response.redirect(new URL("/admin?planning=configure", appOrigin(request)));

  const state = crypto.randomUUID();
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const redirectUri = `${appOrigin(request)}/api/planning-center/callback`;
  const url = new URL("https://api.planningcenteronline.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: settings.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "people openid",
    state,
    prompt: "select_account",
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  const cookies = [
    `planning_oauth_state=${encodeURIComponent(state)}; HttpOnly${secureCookieAttribute()}; SameSite=Lax; Path=/; Max-Age=600`,
    `planning_oauth_verifier=${encodeURIComponent(verifier)}; HttpOnly${secureCookieAttribute()}; SameSite=Lax; Path=/; Max-Age=600`,
  ];
  const headers = new Headers({ Location: url.toString() });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}
