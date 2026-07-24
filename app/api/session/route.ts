import { authenticate, clearAccessCookie, createSessionCookie, currentUser, deleteSession, safeUser } from "../../../lib/auth";

export async function GET(request: Request) {
  const user = await currentUser(request);
  return Response.json({ authorized: Boolean(user), user: user ? safeUser(user) : null });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as { email?: string; password?: string };
  const user = await authenticate((payload.email ?? "").trim().toLowerCase(), payload.password ?? "");
  if (!user) return Response.json({ error: "Email or password is not correct." }, { status: 401 });
  return Response.json({ authorized: true, user: safeUser(user) }, { headers: { "Set-Cookie": await createSessionCookie(request, user.id) } });
}

export async function DELETE(request: Request) {
  await deleteSession(request);
  return Response.json({ authorized: false }, { headers: { "Set-Cookie": clearAccessCookie() } });
}
