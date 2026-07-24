import { currentUser } from "../../../../lib/auth";
import {
  decryptPlanningSecret,
  getPlanningCenterSettings,
  savePlanningCenterConnection,
} from "../../../../lib/planning-center";
import { appOrigin, secureCookieAttribute } from "../../../../lib/runtime-env";

function cookieValue(request: Request, name: string) {
  for (const pair of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...parts] = pair.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return "";
}

function back(request: Request, result: string) {
  return Response.redirect(new URL(`/admin?planning=${encodeURIComponent(result)}`, appOrigin(request)));
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user?.canManageUsers) return back(request, "unauthorized");
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const expectedState = cookieValue(request, "planning_oauth_state");
  const verifier = cookieValue(request, "planning_oauth_verifier");
  if (!code || !state || !verifier || state !== expectedState) return back(request, "state_error");
  const settings = await getPlanningCenterSettings();
  if (!settings) return back(request, "configure");

  const tokenResponse = await fetch("https://api.planningcenteronline.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: settings.clientId,
      client_secret: await decryptPlanningSecret(settings.encryptedClientSecret, settings.clientSecretIv),
      redirect_uri: `${appOrigin(request)}/api/planning-center/callback`,
    }),
  });
  const token = await tokenResponse.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !token.access_token || !token.refresh_token) {
    const codeValue = (token.error ?? "token_error").replace(/[^a-z0-9_-]/gi, "_").slice(0, 60);
    console.error("[planning-center-oauth] token exchange failed", {
      error: codeValue,
      status: tokenResponse.status,
      description: token.error_description?.slice(0, 180),
    });
    return back(request, codeValue);
  }

  const profileResponse = await fetch("https://api.planningcenteronline.com/oauth/userinfo", {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token.access_token}`,
      "User-Agent": "Wake Church Shepherding Dashboard (kai@wakechurch.com)",
    },
  });
  const profile = await profileResponse.json() as {
    sub?: string;
    name?: string;
    organization_id?: string | number;
    organization_name?: string;
  };
  if (!profileResponse.ok || !profile.sub) return back(request, "profile_error");
  await savePlanningCenterConnection({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresIn: token.expires_in ?? 7200,
    personId: profile.sub,
    personName: profile.name ?? "Planning Center user",
    organizationId: String(profile.organization_id ?? ""),
    organizationName: profile.organization_name ?? "Planning Center",
  });

  const headers = new Headers({ Location: new URL("/admin?planning=connected", appOrigin(request)).toString() });
  headers.append("Set-Cookie", `planning_oauth_state=; HttpOnly${secureCookieAttribute()}; SameSite=Lax; Path=/; Max-Age=0`);
  headers.append("Set-Cookie", `planning_oauth_verifier=; HttpOnly${secureCookieAttribute()}; SameSite=Lax; Path=/; Max-Age=0`);
  return new Response(null, { status: 302, headers });
}
