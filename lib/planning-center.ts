import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { planningCenterSettings } from "../db/schema";
import { getRuntimeEnv } from "./runtime-env";

const SETTINGS_ID = "primary";
const API_ROOT = "https://api.planningcenteronline.com";
const API_VERSION = "2025-11-10";

type PcoResource = {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string } | Array<{ id: string; type: string }> | null }>;
};

type PcoResponse = {
  data: PcoResource | PcoResource[];
  included?: PcoResource[];
  errors?: Array<{ title?: string; detail?: string }>;
};

export type PlanningPerson = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  household: string;
  campus: string;
  membership: string;
};

export type PlanningWorkflow = {
  id: string;
  name: string;
  archived: boolean;
  readyCards: number;
};

function toBase64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function fromBase64(value: string) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

function base64Url(bytes: Uint8Array) {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function encryptionKey() {
  const secret = getRuntimeEnv().ENCRYPTION_SECRET;
  if (!secret) throw new Error("ENCRYPTION_SECRET is unavailable.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`planning-center-v1:${secret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptPlanningSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return { encrypted: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

export async function decryptPlanningSecret(encrypted: string, iv: string) {
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    await encryptionKey(),
    fromBase64(encrypted),
  );
  return new TextDecoder().decode(clear);
}

export async function getPlanningCenterSettings() {
  const [settings] = await getDb()
    .select()
    .from(planningCenterSettings)
    .where(eq(planningCenterSettings.id, SETTINGS_ID))
    .limit(1);
  return settings ?? null;
}

export async function savePlanningCenterCredentials(clientId: string, clientSecret: string) {
  const secret = await encryptPlanningSecret(clientSecret);
  await getDb().insert(planningCenterSettings).values({
    id: SETTINGS_ID,
    clientId,
    encryptedClientSecret: secret.encrypted,
    clientSecretIv: secret.iv,
    updatedAt: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: planningCenterSettings.id,
    set: {
      clientId,
      encryptedClientSecret: secret.encrypted,
      clientSecretIv: secret.iv,
      encryptedAccessToken: "",
      accessTokenIv: "",
      encryptedRefreshToken: "",
      refreshTokenIv: "",
      tokenExpiresAt: "",
      connectedPersonId: "",
      connectedPersonName: "",
      organizationId: "",
      organizationName: "",
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function savePlanningCenterConnection(input: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  personId: string;
  personName: string;
  organizationId: string;
  organizationName: string;
}) {
  const access = await encryptPlanningSecret(input.accessToken);
  const refresh = await encryptPlanningSecret(input.refreshToken);
  const tokenExpiresAt = new Date(Date.now() + input.expiresIn * 1000).toISOString();
  await getDb().update(planningCenterSettings).set({
    encryptedAccessToken: access.encrypted,
    accessTokenIv: access.iv,
    encryptedRefreshToken: refresh.encrypted,
    refreshTokenIv: refresh.iv,
    tokenExpiresAt,
    connectedPersonId: input.personId,
    connectedPersonName: input.personName,
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    updatedAt: new Date().toISOString(),
  }).where(eq(planningCenterSettings.id, SETTINGS_ID));
}

async function refreshAccessToken() {
  const settings = await getPlanningCenterSettings();
  if (!settings?.encryptedRefreshToken) throw new Error("Planning Center is not connected.");
  const response = await fetch(`${API_ROOT}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: settings.clientId,
      client_secret: await decryptPlanningSecret(settings.encryptedClientSecret, settings.clientSecretIv),
      refresh_token: await decryptPlanningSecret(settings.encryptedRefreshToken, settings.refreshTokenIv),
      grant_type: "refresh_token",
    }),
  });
  const result = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !result.access_token || !result.refresh_token) {
    throw new Error(result.error_description || "Planning Center access could not be refreshed.");
  }
  await savePlanningCenterConnection({
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresIn: result.expires_in ?? 7200,
    personId: settings.connectedPersonId,
    personName: settings.connectedPersonName,
    organizationId: settings.organizationId,
    organizationName: settings.organizationName,
  });
  return result.access_token;
}

async function accessToken() {
  const settings = await getPlanningCenterSettings();
  if (!settings?.encryptedAccessToken || !settings.tokenExpiresAt) throw new Error("Planning Center is not connected.");
  const expiresAt = new Date(settings.tokenExpiresAt).getTime();
  if (expiresAt > Date.now() + 5 * 60 * 1000) {
    return decryptPlanningSecret(settings.encryptedAccessToken, settings.accessTokenIv);
  }
  return refreshAccessToken();
}

export async function planningCenterRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      "User-Agent": "Wake Church Shepherding Dashboard (kai@wakechurch.com)",
      "X-PCO-API-Version": API_VERSION,
      ...init.headers,
    },
  });
  const result = await response.json() as PcoResponse;
  if (!response.ok) {
    const detail = result.errors?.map((error) => error.detail || error.title).filter(Boolean).join("; ");
    throw new Error(detail || `Planning Center request failed (${response.status}).`);
  }
  return result;
}

function related(resource: PcoResource, type: string, included: PcoResource[]) {
  const relationship = Object.values(resource.relationships ?? {}).find((entry) => {
    if (Array.isArray(entry.data)) return entry.data.some((item) => item.type === type);
    return entry.data?.type === type;
  });
  const ids = Array.isArray(relationship?.data)
    ? relationship.data.filter((item) => item.type === type).map((item) => item.id)
    : relationship?.data?.type === type ? [relationship.data.id] : [];
  return included.filter((item) => item.type === type && ids.includes(item.id));
}

function attr(resource: PcoResource | undefined, name: string) {
  const value = resource?.attributes?.[name];
  return typeof value === "string" ? value : "";
}

function personFromResource(resource: PcoResource, included: PcoResource[]): PlanningPerson {
  const emails = related(resource, "Email", included);
  const phones = related(resource, "PhoneNumber", included);
  const households = related(resource, "Household", included);
  const campuses = related(resource, "Campus", included);
  const primaryEmail = emails.find((item) => item.attributes.primary) ?? emails[0];
  const primaryPhone = phones.find((item) => item.attributes.primary) ?? phones[0];
  return {
    id: resource.id,
    name: attr(resource, "name") || `${attr(resource, "first_name")} ${attr(resource, "last_name")}`.trim(),
    firstName: attr(resource, "first_name"),
    lastName: attr(resource, "last_name"),
    email: attr(primaryEmail, "address"),
    phone: attr(primaryPhone, "formatted_number") || attr(primaryPhone, "number"),
    household: attr(households[0], "name"),
    campus: attr(campuses[0], "name"),
    membership: attr(resource, "membership"),
  };
}

export async function searchPlanningCenterPeople(query: string) {
  const value = query.trim();
  if (value.length < 2) return [];
  const params = new URLSearchParams({
    "where[search_name_or_email_or_phone_number]": value,
    include: "emails,phone_numbers,households,primary_campus",
    per_page: "25",
  });
  const result = await planningCenterRequest(`/people/v2/people?${params}`);
  const included = result.included ?? [];
  return (Array.isArray(result.data) ? result.data : [result.data]).map((resource) => personFromResource(resource, included));
}

export async function getPlanningCenterPerson(personId: string) {
  const params = new URLSearchParams({ include: "emails,phone_numbers,households,primary_campus" });
  const result = await planningCenterRequest(`/people/v2/people/${encodeURIComponent(personId)}?${params}`);
  const resource = Array.isArray(result.data) ? result.data[0] : result.data;
  return personFromResource(resource, result.included ?? []);
}

export async function listPlanningCenterWorkflows(query = "") {
  const params = new URLSearchParams({ per_page: "100", order: "name" });
  const result = await planningCenterRequest(`/people/v2/workflows?${params}`);
  const resources = Array.isArray(result.data) ? result.data : [result.data];
  const workflows: PlanningWorkflow[] = resources.map((resource) => ({
    id: resource.id,
    name: attr(resource, "name"),
    archived: Boolean(resource.attributes.archived_at),
    readyCards: Number(resource.attributes.total_ready_card_count ?? 0),
  })).filter((workflow) => !workflow.archived);
  const normalized = query.trim().toLowerCase();
  return normalized ? workflows.filter((workflow) => workflow.name.toLowerCase().includes(normalized)) : workflows;
}

export async function getPlanningCenterPersonWorkflows(personId: string) {
  const params = new URLSearchParams({ include: "workflow,current_step,assignee", per_page: "100" });
  const result = await planningCenterRequest(`/people/v2/people/${encodeURIComponent(personId)}/workflow_cards?${params}`);
  const included = result.included ?? [];
  const resources = Array.isArray(result.data) ? result.data : [result.data];
  return resources.filter((resource) => !resource.attributes.removed_at).map((resource) => {
    const workflow = related(resource, "Workflow", included)[0];
    const step = related(resource, "WorkflowStep", included)[0];
    const assignee = related(resource, "Person", included)[0];
    return {
      id: resource.id,
      workflowId: workflow?.id ?? "",
      workflowName: attr(workflow, "name"),
      step: attr(step, "name"),
      assignee: attr(assignee, "name"),
      overdue: Boolean(resource.attributes.overdue),
      snoozedUntil: attr(resource, "snooze_until"),
    };
  });
}

function jsonApi(type: string, attributes: Record<string, unknown>) {
  return JSON.stringify({ data: { type, attributes } });
}

export async function createPlanningCenterPerson(input: {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}) {
  const result = await planningCenterRequest("/people/v2/people", {
    method: "POST",
    body: jsonApi("Person", { first_name: input.firstName.trim(), last_name: input.lastName.trim() }),
  });
  const person = Array.isArray(result.data) ? result.data[0] : result.data;
  if (input.email?.trim()) {
    await planningCenterRequest(`/people/v2/people/${person.id}/emails`, {
      method: "POST",
      body: jsonApi("Email", { address: input.email.trim().toLowerCase(), location: "Home", primary: true }),
    });
  }
  if (input.phone?.trim()) {
    await planningCenterRequest(`/people/v2/people/${person.id}/phone_numbers`, {
      method: "POST",
      body: jsonApi("PhoneNumber", { number: input.phone.trim(), location: "Mobile", primary: true }),
    });
  }
  return getPlanningCenterPerson(person.id);
}

export async function addPersonToPlanningCenterWorkflow(personId: string, workflowId: string) {
  const existing = await getPlanningCenterPersonWorkflows(personId);
  if (existing.some((card) => card.workflowId === workflowId)) {
    throw new Error("This person already has an active card in that workflow.");
  }
  const result = await planningCenterRequest(`/people/v2/workflows/${encodeURIComponent(workflowId)}/cards`, {
    method: "POST",
    body: jsonApi("WorkflowCard", { person_id: personId }),
  });
  const card = Array.isArray(result.data) ? result.data[0] : result.data;
  return { id: card.id };
}

export async function addPlanningCenterWorkflowNote(personId: string, cardId: string, note: string) {
  await planningCenterRequest(`/people/v2/people/${encodeURIComponent(personId)}/workflow_cards/${encodeURIComponent(cardId)}/notes`, {
    method: "POST",
    body: jsonApi("WorkflowCardNote", { note: note.trim() }),
  });
}

export async function actOnPlanningCenterWorkflowCard(input: {
  personId: string;
  cardId: string;
  action: "promote" | "snooze" | "remove";
  durationDays?: number;
}) {
  const request: RequestInit = {
    method: "POST",
  };
  if (input.action === "snooze") {
    request.body = JSON.stringify({ data: { type: "WorkflowCard", attributes: { duration: input.durationDays ?? 7 } } });
  }
  await planningCenterRequest(
    `/people/v2/people/${encodeURIComponent(input.personId)}/workflow_cards/${encodeURIComponent(input.cardId)}/${input.action}`,
    request,
  );
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function generatePlanningCenterConnectorToken() {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = `pco_${base64Url(tokenBytes)}`;
  await getDb().update(planningCenterSettings).set({
    connectorTokenHash: await sha256(token),
    updatedAt: new Date().toISOString(),
  }).where(eq(planningCenterSettings.id, SETTINGS_ID));
  return token;
}

export async function verifyPlanningCenterConnectorToken(token: string) {
  const settings = await getPlanningCenterSettings();
  if (!settings?.connectorTokenHash || !token) return false;
  const incoming = await sha256(token);
  if (incoming.length !== settings.connectorTokenHash.length) return false;
  let difference = 0;
  for (let index = 0; index < incoming.length; index += 1) {
    difference |= incoming.charCodeAt(index) ^ settings.connectorTokenHash.charCodeAt(index);
  }
  return difference === 0;
}
