import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { sessions, users } from "../db/schema";
import { getRuntimeEnv } from "./runtime-env";

export const ACCESS_COOKIE = "shepherding_session";
export type CurrentUser = typeof users.$inferSelect;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomHex(size = 24) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function hashPassword(password: string, salt: string) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100000 }, material, 256);
  return bytesToHex(new Uint8Array(bits));
}

function cookieValue(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const pair of header.split(";")) {
    const [key, ...parts] = pair.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return "";
}

export async function ensureBootstrapAdmin(email: string, password: string) {
  const db = getDb();
  const existing = await db.select().from(users).limit(1);
  if (existing.length) return;
  const configured = getRuntimeEnv().BOOTSTRAP_ADMIN_PASSWORD;
  if (email !== "global-admin" || !configured || password !== configured) return;
  const salt = randomHex(16);
  await db.insert(users).values({
    id: `user-${crypto.randomUUID()}`,
    email: "global-admin",
    notificationEmail: "kai@wakechurch.com",
    name: "Global Admin",
    role: "global_admin",
    passwordSalt: salt,
    passwordHash: await hashPassword(password, salt),
    active: true,
    canViewAll: true,
    canManageCare: true,
    canAssignCare: true,
    canManageUsers: true,
    canAccessYouth: true,
    canManageYouth: true,
    canAccessHospital: true,
    canManageHospital: true,
    canAccessDiscipleship: true,
    canManageDiscipleship: true,
  });
}

export async function authenticate(email: string, password: string) {
  await ensureBootstrapAdmin(email, password);
  const [user] = await getDb().select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!user?.active) return null;
  return (await hashPassword(password, user.passwordSalt)) === user.passwordHash ? user : null;
}

export async function currentUser(request: Request) {
  const token = cookieValue(request, ACCESS_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const [row] = await getDb().select({ user: users }).from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date().toISOString()), eq(users.active, true))).limit(1);
  return row?.user ?? null;
}

export async function createSessionCookie(request: Request, userId: string) {
  const token = randomHex(32);
  const expires = new Date(Date.now() + 7 * 86400000);
  await getDb().insert(sessions).values({ id: `session-${crypto.randomUUID()}`, userId, tokenHash: await sha256(token), expiresAt: expires.toISOString() });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ACCESS_COOKIE}=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=604800`;
}

export async function deleteSession(request: Request) {
  const token = cookieValue(request, ACCESS_COOKIE);
  if (token) await getDb().delete(sessions).where(eq(sessions.tokenHash, await sha256(token)));
}

export function clearAccessCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ACCESS_COOKIE}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`;
}

export function safeUser(user: CurrentUser) {
  let allowedCategories: string[] = [];
  try { allowedCategories = JSON.parse(user.allowedCategories) as string[]; } catch { allowedCategories = []; }
  return {
    id: user.id,
    email: user.email,
    notificationEmail: user.notificationEmail || user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    canViewAll: user.canViewAll,
    canManageCare: user.canManageCare,
    canAssignCare: user.canAssignCare,
    canManageUsers: user.canManageUsers,
    canAccessYouth: user.canAccessYouth,
    canManageYouth: user.canManageYouth,
    canAccessHospital: user.canAccessHospital,
    canManageHospital: user.canManageHospital,
    canAccessDiscipleship: user.canAccessDiscipleship,
    canManageDiscipleship: user.canManageDiscipleship,
    allowedCategories,
  };
}
