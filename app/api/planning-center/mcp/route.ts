import { getDb } from "../../../../db";
import { auditEvents } from "../../../../db/schema";
import {
  actOnPlanningCenterWorkflowCard,
  addPersonToPlanningCenterWorkflow,
  addPlanningCenterWorkflowNote,
  createPlanningCenterPerson,
  getPlanningCenterPerson,
  getPlanningCenterPersonWorkflows,
  listPlanningCenterWorkflows,
  searchPlanningCenterPeople,
  verifyPlanningCenterConnectorToken,
} from "../../../../lib/planning-center";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
};

const tools = [
  {
    name: "search_people",
    description: "Search Wake Church Planning Center People by name, email, or phone. Returns limited pastoral-directory fields only.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Name, email, or phone number." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_person",
    description: "Get one Planning Center person and their active workflow cards. Does not return medical, giving, or background-check data.",
    inputSchema: {
      type: "object",
      properties: { person_id: { type: "string" } },
      required: ["person_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_workflows",
    description: "List active Planning Center People workflows available to the connected Wake Church integration account.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Optional workflow-name filter." } },
      additionalProperties: false,
    },
  },
  {
    name: "create_person",
    description: "Create a Planning Center person after checking for duplicates. This is a write action: show the exact fields and obtain explicit user confirmation before setting confirmed=true.",
    inputSchema: {
      type: "object",
      properties: {
        first_name: { type: "string" },
        last_name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        confirmed: { type: "boolean" },
        create_despite_duplicates: { type: "boolean" },
      },
      required: ["first_name", "last_name", "confirmed"],
      additionalProperties: false,
    },
  },
  {
    name: "add_person_to_workflow",
    description: "Add an existing Planning Center person to an active workflow. This is a write action: show the exact person and workflow and obtain explicit user confirmation before setting confirmed=true.",
    inputSchema: {
      type: "object",
      properties: {
        person_id: { type: "string" },
        workflow_id: { type: "string" },
        confirmed: { type: "boolean" },
      },
      required: ["person_id", "workflow_id", "confirmed"],
      additionalProperties: false,
    },
  },
  {
    name: "add_workflow_note",
    description: "Add a note to a person's Planning Center workflow card. This is a write action and requires exact user confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        person_id: { type: "string" },
        card_id: { type: "string" },
        note: { type: "string" },
        confirmed: { type: "boolean" },
      },
      required: ["person_id", "card_id", "note", "confirmed"],
      additionalProperties: false,
    },
  },
  {
    name: "advance_workflow_card",
    description: "Complete the current step and advance a Planning Center workflow card. This is a write action and requires exact user confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        person_id: { type: "string" },
        card_id: { type: "string" },
        confirmed: { type: "boolean" },
      },
      required: ["person_id", "card_id", "confirmed"],
      additionalProperties: false,
    },
  },
  {
    name: "snooze_workflow_card",
    description: "Snooze a Planning Center workflow card for a specified number of days. This is a write action and requires exact user confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        person_id: { type: "string" },
        card_id: { type: "string" },
        duration_days: { type: "integer", minimum: 1, maximum: 365 },
        confirmed: { type: "boolean" },
      },
      required: ["person_id", "card_id", "duration_days", "confirmed"],
      additionalProperties: false,
    },
  },
  {
    name: "remove_workflow_card",
    description: "Remove a person from a Planning Center workflow. This is a destructive write action and requires exact user confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        person_id: { type: "string" },
        card_id: { type: "string" },
        confirmed: { type: "boolean" },
      },
      required: ["person_id", "card_id", "confirmed"],
      additionalProperties: false,
    },
  },
];

function stringArg(args: Record<string, unknown>, name: string) {
  return typeof args[name] === "string" ? args[name].trim() : "";
}

function confirmed(args: Record<string, unknown>) {
  if (args.confirmed !== true) throw new Error("Explicit confirmation is required before this Planning Center change.");
}

async function audit(action: string, person: string, details: string) {
  await getDb().insert(auditEvents).values({
    id: `audit-${crypto.randomUUID()}`,
    userId: "planning-center-connector",
    actorName: "ChatGPT Work",
    action,
    carePerson: person,
    details,
  });
}

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "search_people") {
    return { people: await searchPlanningCenterPeople(stringArg(args, "query")) };
  }
  if (name === "get_person") {
    const personId = stringArg(args, "person_id");
    const [person, workflows] = await Promise.all([
      getPlanningCenterPerson(personId),
      getPlanningCenterPersonWorkflows(personId),
    ]);
    return { person, workflows };
  }
  if (name === "list_workflows") {
    return { workflows: await listPlanningCenterWorkflows(stringArg(args, "query")) };
  }
  if (name === "create_person") {
    confirmed(args);
    const firstName = stringArg(args, "first_name");
    const lastName = stringArg(args, "last_name");
    const email = stringArg(args, "email").toLowerCase();
    const phone = stringArg(args, "phone");
    if (!firstName || !lastName) throw new Error("First and last name are required.");
    const duplicates = await searchPlanningCenterPeople(email || phone || `${firstName} ${lastName}`);
    if (duplicates.length && args.create_despite_duplicates !== true) {
      return {
        created: false,
        possibleDuplicates: duplicates,
        nextStep: "Show these possible matches and ask whether the user wants to create a separate person.",
      };
    }
    const person = await createPlanningCenterPerson({ firstName, lastName, email, phone });
    await audit("created Planning Center person", person.name, `Planning Center ID ${person.id}`);
    return { created: true, person };
  }
  if (name === "add_person_to_workflow") {
    confirmed(args);
    const personId = stringArg(args, "person_id");
    const workflowId = stringArg(args, "workflow_id");
    const [person, workflows] = await Promise.all([
      getPlanningCenterPerson(personId),
      listPlanningCenterWorkflows(),
    ]);
    const workflow = workflows.find((item) => item.id === workflowId);
    if (!workflow) throw new Error("The selected workflow is not available.");
    const card = await addPersonToPlanningCenterWorkflow(personId, workflowId);
    await audit("added person to Planning Center workflow", person.name, `${workflow.name} · Card ${card.id}`);
    return { added: true, person, workflow, card };
  }
  if (name === "add_workflow_note") {
    confirmed(args);
    const personId = stringArg(args, "person_id");
    const cardId = stringArg(args, "card_id");
    const note = stringArg(args, "note");
    if (!note) throw new Error("A note is required.");
    const person = await getPlanningCenterPerson(personId);
    await addPlanningCenterWorkflowNote(personId, cardId, note);
    await audit("added Planning Center workflow note", person.name, `Card ${cardId}`);
    return { added: true, person, cardId };
  }
  if (name === "advance_workflow_card" || name === "snooze_workflow_card" || name === "remove_workflow_card") {
    confirmed(args);
    const personId = stringArg(args, "person_id");
    const cardId = stringArg(args, "card_id");
    const person = await getPlanningCenterPerson(personId);
    const action = name === "advance_workflow_card" ? "promote" : name === "snooze_workflow_card" ? "snooze" : "remove";
    const durationDays = typeof args.duration_days === "number" ? Math.max(1, Math.min(365, Math.round(args.duration_days))) : undefined;
    await actOnPlanningCenterWorkflowCard({ personId, cardId, action, durationDays });
    await audit(`${action} Planning Center workflow card`, person.name, `Card ${cardId}${durationDays ? ` · ${durationDays} days` : ""}`);
    return { updated: true, action, person, cardId, durationDays };
  }
  throw new Error(`Unknown Planning Center tool: ${name}`);
}

function jsonRpc(id: JsonRpcRequest["id"], result: unknown) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!await verifyPlanningCenterConnectorToken(token)) {
    return Response.json({ error: "Planning Center connector authentication required." }, { status: 401 });
  }
  let message: JsonRpcRequest;
  try {
    message = await request.json() as JsonRpcRequest;
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  if (message.method === "initialize") {
    return jsonRpc(message.id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "wake-church-planning-center", version: "0.1.0" },
    });
  }
  if (message.method === "notifications/initialized") return new Response(null, { status: 202 });
  if (message.method === "ping") return jsonRpc(message.id, {});
  if (message.method === "tools/list") return jsonRpc(message.id, { tools });
  if (message.method === "tools/call") {
    try {
      const result = await callTool(message.params?.name ?? "", message.params?.arguments ?? {});
      return jsonRpc(message.id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Planning Center tool failed.";
      return jsonRpc(message.id, {
        content: [{ type: "text", text: messageText }],
        isError: true,
      });
    }
  }
  return Response.json({
    jsonrpc: "2.0",
    id: message.id ?? null,
    error: { code: -32601, message: "Method not found" },
  }, { status: 404 });
}

export async function GET() {
  return Response.json({
    name: "Wake Church Planning Center connector",
    protocol: "MCP Streamable HTTP",
    status: "Use an authenticated MCP client.",
  }, { status: 405, headers: { Allow: "POST" } });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
