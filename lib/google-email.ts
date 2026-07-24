import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { googleEmailSettings } from "../db/schema";
import { getRuntimeEnv } from "./runtime-env";

const SETTINGS_ID = "primary";

function toBase64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}
function fromBase64(value: string) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}
function base64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function encryptionKey() {
  const secret = getRuntimeEnv().ENCRYPTION_SECRET;
  if (!secret) throw new Error("ENCRYPTION_SECRET is unavailable.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`google-email-v1:${secret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return { encrypted: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}
export async function decryptSecret(encrypted: string, iv: string) {
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await encryptionKey(), fromBase64(encrypted));
  return new TextDecoder().decode(clear);
}
export async function getGoogleSettings() {
  const [settings] = await getDb().select().from(googleEmailSettings).where(eq(googleEmailSettings.id, SETTINGS_ID)).limit(1);
  return settings ?? null;
}
export async function saveGoogleCredentials(clientId: string, clientSecret: string, senderEmail: string) {
  const secret = await encryptSecret(clientSecret);
  await getDb().insert(googleEmailSettings).values({ id: SETTINGS_ID, clientId, encryptedClientSecret: secret.encrypted, clientSecretIv: secret.iv, senderEmail, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: googleEmailSettings.id, set: { clientId, encryptedClientSecret: secret.encrypted, clientSecretIv: secret.iv, senderEmail, encryptedRefreshToken: "", refreshTokenIv: "", connectedEmail: "", updatedAt: new Date().toISOString() } });
}
export async function saveGoogleConnection(refreshToken: string, connectedEmail: string) {
  const token = await encryptSecret(refreshToken);
  await getDb().update(googleEmailSettings).set({ encryptedRefreshToken: token.encrypted, refreshTokenIv: token.iv, connectedEmail, updatedAt: new Date().toISOString() }).where(eq(googleEmailSettings.id, SETTINGS_ID));
}
async function accessToken() {
  const settings = await getGoogleSettings();
  if (!settings?.encryptedRefreshToken) throw new Error("Google email is not connected.");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: settings.clientId, client_secret: await decryptSecret(settings.encryptedClientSecret, settings.clientSecretIv), refresh_token: await decryptSecret(settings.encryptedRefreshToken, settings.refreshTokenIv), grant_type: "refresh_token" }) });
  const result = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error_description || "Google access token could not be refreshed.");
  return { token: result.access_token, settings };
}
export async function sendCareAssignmentEmail(input: { recipient: string; volunteerName: string; person: string; category: string; lane: string; nextAction: string; followUpDate: string; categoryUrl: string }) {
  const { token, settings } = await accessToken();
  const recipient = input.recipient.replace(/[\r\n]+/g, "");
  const subject = `Shepherding care assignment: ${input.person}`.replace(/[\r\n]+/g, " ");
  const body = [`Hi ${input.volunteerName || "there"},`, "", `You have been assigned a shepherding care follow-up for ${input.person}.`, `Category: ${input.category || "Not specified"}`, `Care lane: ${input.lane}`, `Next faithful step: ${input.nextAction || "Please coordinate the next step."}`, `Follow-up date: ${input.followUpDate || "Not set"}`, "", `Open ${input.category || "your assigned"} care in the Shepherding Care Dashboard:`, input.categoryUrl, "", "Sign in with your volunteer account. You will only see care records permitted for your account."].join("\r\n");
  const raw = base64Url([`From: Wake Church Shepherding <${settings.senderEmail}>`, `To: ${recipient}`, `Subject: ${subject}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", body].join("\r\n"));
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw }) });
  if (!response.ok) { const detail = await response.text(); throw new Error(`Gmail send failed (${response.status}): ${detail.slice(0, 180)}`); }
}

export async function sendDashboardEmail(input: { recipient: string; subject: string; body: string }) {
  const { token, settings } = await accessToken();
  const recipient = input.recipient.replace(/[\r\n]+/g, "");
  const subject = input.subject.replace(/[\r\n]+/g, " ");
  const raw = base64Url([
    `From: Wake Church Shepherding <${settings.senderEmail}>`,
    `To: ${recipient}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.body,
  ].join("\r\n"));
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gmail send failed (${response.status}): ${detail.slice(0, 180)}`);
  }
}
