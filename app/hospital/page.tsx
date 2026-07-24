"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  email: string;
  notificationEmail: string;
  name: string;
  canManageUsers: boolean;
  canAccessHospital: boolean;
  canManageHospital: boolean;
};

type HospitalRecord = {
  id: string;
  personName: string;
  age: string;
  hospitalName: string;
  hospitalAddress: string;
  roomNumber: string;
  situation: string;
  incidentDate: string;
  expectedDischargeDate: string;
  dischargedAt: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  relationship: string;
  visitGuidance: string;
  notes: string;
  lastContact: string;
  nextAction: string;
  followUpDate: string;
  status: string;
  assignedUserId: string;
  assignedTo: string;
};

type Resource = {
  id: string;
  title: string;
  resourceType: string;
  summary: string;
  url: string;
  publishedBy: string;
};

type HospitalMilestone = {
  id: string;
  hospitalCareId: string;
  kind: string;
  label: string;
  dueDate: string;
  status: string;
  completedAt: string;
};

type TeamRequest = {
  id: string;
  personName: string;
  senderName: string;
  kind: string;
  message: string;
  urgency: string;
  createdAt: string;
};

type Tab = "care" | "resources" | "team";

const emptyCare: Omit<HospitalRecord, "id"> = {
  personName: "",
  age: "",
  hospitalName: "",
  hospitalAddress: "",
  roomNumber: "",
  situation: "",
  incidentDate: "",
  expectedDischargeDate: "",
  dischargedAt: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  relationship: "",
  visitGuidance: "",
  notes: "",
  lastContact: "",
  nextAction: "",
  followUpDate: "",
  status: "Open",
  assignedUserId: "",
  assignedTo: "",
};

function prettyDate(value: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function mapEmbed(address: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
}

function directions(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export default function HospitalPage() {
  const [user, setUser] = useState<User | null>(null);
  const [records, setRecords] = useState<HospitalRecord[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [milestones, setMilestones] = useState<HospitalMilestone[]>([]);
  const [supportRequests, setSupportRequests] = useState<TeamRequest[]>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [tab, setTab] = useState<Tab>("care");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [careModal, setCareModal] = useState(false);
  const [quickModal, setQuickModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<HospitalRecord, "id">>(emptyCare);
  const [quickRecord, setQuickRecord] = useState<HospitalRecord | null>(null);
  const [quick, setQuick] = useState({ lastContact: "", nextAction: "", followUpDate: "", status: "Open" });
  const [resourceDraft, setResourceDraft] = useState({ title: "", resourceType: "Article", summary: "", url: "" });

  const canManage = Boolean(user?.canManageUsers || user?.canManageHospital);

  async function load() {
    const response = await fetch("/api/hospital", { cache: "no-store" });
    const result = await response.json() as {
      records?: HospitalRecord[];
      resources?: Resource[];
      team?: User[];
      availableUsers?: User[];
      milestones?: HospitalMilestone[];
      supportRequests?: TeamRequest[];
      error?: string;
    };
    if (!response.ok) throw new Error(result.error ?? "Hospital Team could not be loaded.");
    setRecords(result.records ?? []);
    setResources(result.resources ?? []);
    setTeam(result.team ?? []);
    setAvailableUsers(result.availableUsers ?? []);
    setMilestones(result.milestones ?? []);
    setSupportRequests(result.supportRequests ?? []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void (async () => {
      try {
        const response = await fetch("/api/session", { cache: "no-store" });
        const result = await response.json() as { user?: User };
        if (!result.user) {
          window.location.href = "/";
          return;
        }
        setUser(result.user);
        await load();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Hospital Team could not be loaded.");
      } finally {
        setLoading(false);
      }
    })(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const due = useMemo(() => records.filter((record) =>
    record.status !== "Complete" && Boolean(record.followUpDate) && record.followUpDate <= new Date().toISOString().slice(0, 10)), [records]);
  const loads = useMemo(() => new Map(team.map((member) => [
    member.id,
    records.filter((record) => record.assignedUserId === member.id && record.status !== "Complete").length,
  ])), [records, team]);
  const milestoneMap = useMemo(() => new Map(records.map((record) => [
    record.id,
    milestones.filter((item) => item.hospitalCareId === record.id),
  ])), [milestones, records]);

  function addCare() {
    setEditingId(null);
    setDraft({ ...emptyCare, followUpDate: new Date().toISOString().slice(0, 10) });
    setCareModal(true);
  }

  function editCare(record: HospitalRecord) {
    const { id, ...rest } = record;
    setEditingId(id);
    setDraft(rest);
    setCareModal(true);
  }

  function openQuick(record: HospitalRecord) {
    setQuickRecord(record);
    setQuick({ lastContact: record.lastContact, nextAction: record.nextAction, followUpDate: record.followUpDate, status: record.status });
    setQuickModal(true);
  }

  async function saveCare(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/hospital", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { id: editingId, ...draft } : draft),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Hospital care could not be saved.");
      return;
    }
    setCareModal(false);
    setNotice(editingId ? "Hospital care updated." : "Hospital care assigned.");
    await load();
  }

  async function saveQuick(event: FormEvent) {
    event.preventDefault();
    if (!quickRecord) return;
    const response = await fetch("/api/hospital", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: quickRecord.id, ...quick }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Hospital follow-up could not be updated.");
      return;
    }
    setQuickModal(false);
    setNotice("Hospital follow-up saved.");
    await load();
  }

  async function publishResource(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/hospital", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: "resource", ...resourceDraft }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Resource could not be published.");
      return;
    }
    setResourceDraft({ title: "", resourceType: "Article", summary: "", url: "" });
    setNotice("Hospital Team resource published.");
    await load();
  }

  async function archive(id: string, entity = "care") {
    if (!window.confirm(entity === "resource" ? "Remove this resource?" : "Archive this hospital care record?")) return;
    const response = await fetch("/api/hospital", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, entity }),
    });
    if (!response.ok) {
      setError("This item could not be archived.");
      return;
    }
    await load();
  }

  async function updateTeam(teamUserId: string, hospitalAccess: boolean) {
    const member = [...team, ...availableUsers].find((candidate) => candidate.id === teamUserId);
    if (!hospitalAccess && !window.confirm(`Remove ${member?.name ?? "this person"} from the Hospital Team?`)) return;
    const response = await fetch("/api/hospital", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamUserId, hospitalAccess }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Hospital Team access could not be updated.");
      return;
    }
    setSelectedUserId("");
    await load();
  }

  async function toggleMilestone(item: HospitalMilestone) {
    const response = await fetch("/api/hospital", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ milestoneId: item.id, complete: item.status !== "Complete" }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Hospital timeline step could not be updated.");
      return;
    }
    await load();
  }

  async function resolveRequest(id: string) {
    const response = await fetch("/api/team-support", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Team request could not be resolved.");
      return;
    }
    setNotice("Team request resolved.");
    await load();
  }

  if (loading) return <main className="ministry-shell hospital-theme"><div className="empty-state">Loading Hospital Team…</div></main>;

  return (
    <main className="ministry-shell hospital-theme">
      <header className="ministry-hero">
        <div>
          <p className="section-label">Wake Church · Shepherding</p>
          <h1>Hospital Team</h1>
          <p>Put the right person in the right place with the details needed to arrive prepared and care well.</p>
        </div>
        <div className="ministry-actions">
          <Link className="text-button" href="/">← Main dashboard</Link>
          {canManage && <button className="primary-button" onClick={addCare}>＋ Add hospital care</button>}
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      <section className="ministry-metrics">
        <article><span>People in care</span><strong>{records.length}</strong></article>
        <article><span>Follow-ups due</span><strong>{due.length}</strong></article>
        <article><span>Hospital team</span><strong>{canManage ? team.length : "You"}</strong></article>
        <article><span>Shared resources</span><strong>{resources.length}</strong></article>
      </section>

      {canManage && supportRequests.length > 0 && (
        <section className="team-inbox-panel" id="team-inbox">
          <div><p className="section-label">Team-lead inbox</p><h2>Volunteer messages needing a response</h2></div>
          {supportRequests.map((request) => (
            <article className={request.urgency === "urgent" ? "urgent" : ""} key={request.id}>
              <div>
                <span>{request.kind === "reassignment" ? "Reassignment request" : "Message"}{request.urgency === "urgent" ? " · Urgent" : ""}</span>
                <strong>{request.personName}</strong>
                <small>From {request.senderName} · {new Date(request.createdAt).toLocaleString()}</small>
              </div>
              <p>{request.message}</p>
              <button className="text-button" onClick={() => void resolveRequest(request.id)}>Mark resolved</button>
            </article>
          ))}
        </section>
      )}

      <nav className="ministry-tabs" aria-label="Hospital Team sections">
        <button className={tab === "care" ? "active" : ""} onClick={() => setTab("care")}>Assigned hospital care</button>
        <button className={tab === "resources" ? "active" : ""} onClick={() => setTab("resources")}>Team resources</button>
        {canManage && <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>Team & loads</button>}
      </nav>

      {tab === "care" && (
        <section className="hospital-grid">
          {records.length === 0 && <div className="empty-state ministry-empty"><h3>No hospital care assigned.</h3><p>New assignments will appear here.</p></div>}
          {records.map((record) => (
            <article className={record.status === "Complete" ? "hospital-card complete" : "hospital-card"} key={record.id}>
              <iframe title={`Map to ${record.hospitalName}`} src={mapEmbed(record.hospitalAddress)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              <div className="hospital-card-body">
                <div className="record-heading">
                  <div><span className="lane-chip">{record.hospitalName}</span><h2>{record.personName}{record.age ? ` · ${record.age}` : ""}</h2></div>
                  <span className={`status-chip ${record.status.toLowerCase()}`}>{record.status}</span>
                </div>
                <div className="hospital-location">
                  <div><strong>{record.hospitalAddress}</strong><span>{record.roomNumber ? `Room ${record.roomNumber}` : "Room not entered"}</span></div>
                  <a className="secondary-button" href={directions(record.hospitalAddress)} target="_blank" rel="noreferrer">Directions ↗</a>
                </div>
                <p className="situation-copy">{record.situation || "No situation summary entered."}</p>
                <dl className="ministry-details">
                  <div><dt>Primary contact</dt><dd>{record.contactName || "Not entered"}{record.relationship ? ` · ${record.relationship}` : ""}</dd></div>
                  <div><dt>Contact information</dt><dd>{[record.contactPhone, record.contactEmail].filter(Boolean).join(" · ") || "Not entered"}</dd></div>
                  <div><dt>Incident/date admitted</dt><dd>{prettyDate(record.incidentDate)}</dd></div>
                  <div><dt>Expected discharge</dt><dd>{prettyDate(record.expectedDischargeDate)}</dd></div>
                  <div><dt>Discharged</dt><dd>{prettyDate(record.dischargedAt)}</dd></div>
                  <div><dt>Care owner</dt><dd>{record.assignedTo || "Unassigned"}</dd></div>
                  <div><dt>Next faithful step</dt><dd>{record.nextAction || "Add a next step"}</dd></div>
                  <div><dt>Follow-up</dt><dd>{prettyDate(record.followUpDate)}</dd></div>
                </dl>
                <div className="care-timeline hospital-timeline">
                  <div className="care-timeline-heading"><strong>Admission-to-discharge timeline</strong><span>{(milestoneMap.get(record.id) ?? []).filter((item) => item.status === "Complete").length}/{(milestoneMap.get(record.id) ?? []).length} complete</span></div>
                  <div className="care-timeline-steps">
                    {(milestoneMap.get(record.id) ?? []).map((item) => {
                      const systemStep = item.kind === "admission" || item.kind === "discharge";
                      return (
                        <div className={item.status === "Complete" ? "timeline-step complete" : item.dueDate && item.dueDate < new Date().toISOString().slice(0, 10) ? "timeline-step overdue" : "timeline-step"} key={item.id}>
                          {systemStep
                            ? <span className="timeline-dot" aria-hidden="true">{item.status === "Complete" ? "✓" : "○"}</span>
                            : <button className="timeline-dot" onClick={() => void toggleMilestone(item)} aria-label={`${item.status === "Complete" ? "Reopen" : "Complete"} ${item.label}`}>{item.status === "Complete" ? "✓" : "○"}</button>}
                          <div><strong>{item.label}</strong><span>{prettyDate(item.dueDate)}</span></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {record.visitGuidance && <div className="visit-guidance"><strong>Before the visit</strong><p>{record.visitGuidance}</p></div>}
                <div className="ministry-card-actions">
                  <button className="primary-button secondary" onClick={() => openQuick(record)}>Update follow-up</button>
                  {record.contactPhone && <a className="text-button" href={`tel:${record.contactPhone}`}>Call contact</a>}
                  {canManage && <button className="text-button" onClick={() => editCare(record)}>Edit details</button>}
                  {canManage && <button className="text-button danger-text" onClick={() => void archive(record.id)}>Archive</button>}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {tab === "resources" && (
        <section className="resource-layout">
          {canManage && (
            <form className="resource-publisher" onSubmit={publishResource}>
              <div><p className="section-label">Publish for the team</p><h2>Add a hospital resource</h2></div>
              <label><span>Title</span><input required value={resourceDraft.title} onChange={(event) => setResourceDraft({ ...resourceDraft, title: event.target.value })} /></label>
              <label><span>Type</span><select value={resourceDraft.resourceType} onChange={(event) => setResourceDraft({ ...resourceDraft, resourceType: event.target.value })}><option>Article</option><option>Handbook</option><option>Checklist</option><option>Training</option><option>Form</option></select></label>
              <label className="wide"><span>Helpful summary</span><textarea rows={3} value={resourceDraft.summary} onChange={(event) => setResourceDraft({ ...resourceDraft, summary: event.target.value })} /></label>
              <label className="wide"><span>Link</span><input type="url" required value={resourceDraft.url} onChange={(event) => setResourceDraft({ ...resourceDraft, url: event.target.value })} placeholder="https://" /></label>
              <button className="primary-button" type="submit">Publish resource</button>
            </form>
          )}
          <div className="resource-grid">
            {resources.length === 0 && <div className="empty-state ministry-empty"><h3>No resources published yet.</h3><p>Articles, handbooks, and team guidance will appear here.</p></div>}
            {resources.map((resource) => (
              <article className="resource-card" key={resource.id}>
                <span>{resource.resourceType}</span>
                <h3>{resource.title}</h3>
                <p>{resource.summary || "Open this resource for Hospital Team guidance."}</p>
                <div><a className="secondary-button" href={resource.url} target="_blank" rel="noreferrer">Open resource ↗</a>{canManage && <button className="text-button danger-text" onClick={() => void archive(resource.id, "resource")}>Remove</button>}</div>
                <small>Published by {resource.publishedBy || "Hospital Team"}</small>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "team" && canManage && (
        <section className="ministry-team-grid">
          <article className="team-manager-card">
            <div><p className="section-label">Hospital Team access</p><h2>Add a team member</h2><p>Members see shared resources and only hospital care assigned to them.</p></div>
            <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} aria-label="Choose a user to add to the Hospital Team">
              <option value="">Choose a user</option>
              {availableUsers.map((member) => <option value={member.id} key={member.id}>{member.name} · {member.notificationEmail || member.email}</option>)}
            </select>
            <button className="primary-button" disabled={!selectedUserId} onClick={() => void updateTeam(selectedUserId, true)}>Add to Hospital Team</button>
          </article>
          {team.map((member) => (
            <article className="ministry-team-card" key={member.id}>
              <div className="team-avatar">{member.name.slice(0, 1).toUpperCase()}</div>
              <div><strong>{member.name}</strong><span>{member.notificationEmail || member.email}</span>{member.canManageHospital && <small>Hospital manager</small>}</div>
              <b>{loads.get(member.id) ?? 0}<span>active care</span></b>
              {member.canAccessHospital && !member.canManageHospital && <button className="text-button danger-text" onClick={() => void updateTeam(member.id, false)}>Remove</button>}
            </article>
          ))}
        </section>
      )}

      {careModal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCareModal(false)}>
          <section className="modal ministry-modal" role="dialog" aria-modal="true" aria-labelledby="hospital-form-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><p className="section-label">Hospital Team</p><h2 id="hospital-form-title">{editingId ? "Update hospital care" : "Assign hospital care"}</h2></div><button className="close-button" onClick={() => setCareModal(false)}>×</button></div>
            <form onSubmit={saveCare}>
              <div className="form-grid">
                <label className="field"><span>Person’s name</span><input required value={draft.personName} onChange={(event) => setDraft({ ...draft, personName: event.target.value })} /></label>
                <label className="field"><span>Age</span><input value={draft.age} onChange={(event) => setDraft({ ...draft, age: event.target.value })} placeholder="Optional" /></label>
                <label className="field"><span>Hospital</span><input required value={draft.hospitalName} onChange={(event) => setDraft({ ...draft, hospitalName: event.target.value })} /></label>
                <label className="field"><span>Room number</span><input value={draft.roomNumber} onChange={(event) => setDraft({ ...draft, roomNumber: event.target.value })} /></label>
                <label className="field wide"><span>Hospital address</span><input required value={draft.hospitalAddress} onChange={(event) => setDraft({ ...draft, hospitalAddress: event.target.value })} placeholder="Street, city, state, ZIP" /></label>
                <label className="field wide"><span>High-level situation</span><textarea rows={3} value={draft.situation} onChange={(event) => setDraft({ ...draft, situation: event.target.value })} placeholder="What the visitor needs to understand—avoid detailed medical records" /></label>
                <label className="field"><span>Incident/date admitted</span><input type="date" value={draft.incidentDate} onChange={(event) => setDraft({ ...draft, incidentDate: event.target.value })} /></label>
                <label className="field"><span>Expected discharge</span><input type="date" value={draft.expectedDischargeDate} onChange={(event) => setDraft({ ...draft, expectedDischargeDate: event.target.value })} /></label>
                <label className="field"><span>Actual discharge date</span><input type="date" value={draft.dischargedAt} onChange={(event) => setDraft({ ...draft, dischargedAt: event.target.value, status: event.target.value ? "Discharged" : draft.status })} /></label>
                <label className="field"><span>Care owner</span><select value={draft.assignedUserId} onChange={(event) => { const assignee = team.find((member) => member.id === event.target.value); setDraft({ ...draft, assignedUserId: event.target.value, assignedTo: assignee?.name ?? "" }); }}><option value="">Unassigned</option>{team.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
                <label className="field"><span>Primary contact</span><input value={draft.contactName} onChange={(event) => setDraft({ ...draft, contactName: event.target.value })} /></label>
                <label className="field"><span>Relationship</span><input value={draft.relationship} onChange={(event) => setDraft({ ...draft, relationship: event.target.value })} placeholder="Spouse, parent, friend…" /></label>
                <label className="field"><span>Contact phone</span><input type="tel" value={draft.contactPhone} onChange={(event) => setDraft({ ...draft, contactPhone: event.target.value })} /></label>
                <label className="field"><span>Contact email</span><input type="email" value={draft.contactEmail} onChange={(event) => setDraft({ ...draft, contactEmail: event.target.value })} /></label>
                <label className="field wide"><span>Visit guidance</span><textarea rows={2} value={draft.visitGuidance} onChange={(event) => setDraft({ ...draft, visitGuidance: event.target.value })} placeholder="Best visiting time, family preference, prayer request, access note…" /></label>
                <label className="field wide"><span>Light team notes</span><textarea rows={2} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Brief follow-through notes only—no medical details" /></label>
                <label className="field"><span>Last contact</span><input type="date" value={draft.lastContact} onChange={(event) => setDraft({ ...draft, lastContact: event.target.value })} /></label>
                <label className="field"><span>Follow-up date</span><input type="date" value={draft.followUpDate} onChange={(event) => setDraft({ ...draft, followUpDate: event.target.value })} /></label>
                <label className="field wide"><span>Next faithful step</span><input value={draft.nextAction} onChange={(event) => setDraft({ ...draft, nextAction: event.target.value })} /></label>
                <label className="field"><span>Status</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>Open</option><option>Waiting</option><option>Discharged</option><option>Complete</option></select></label>
              </div>
              <p className="form-note">Store only what the visitor needs to care well. Do not record diagnoses, test results, medications, insurance information, or private counseling details.</p>
              <div className="form-actions"><button type="button" className="text-button" onClick={() => setCareModal(false)}>Cancel</button><button type="submit" className="primary-button">Save hospital care</button></div>
            </form>
          </section>
        </div>
      )}

      {quickModal && quickRecord && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setQuickModal(false)}>
          <section className="modal quick-modal" role="dialog" aria-modal="true" aria-labelledby="hospital-update-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><p className="section-label">Mobile follow-up</p><h2 id="hospital-update-title">Update {quickRecord.personName}</h2></div><button className="close-button" onClick={() => setQuickModal(false)}>×</button></div>
            <form onSubmit={saveQuick}>
              <label className="field"><span>Last contact or visit</span><input type="date" value={quick.lastContact} onChange={(event) => setQuick({ ...quick, lastContact: event.target.value })} /></label>
              <label className="field"><span>Next faithful step</span><textarea rows={3} value={quick.nextAction} onChange={(event) => setQuick({ ...quick, nextAction: event.target.value })} /></label>
              <label className="field"><span>Follow-up date</span><input type="date" value={quick.followUpDate} onChange={(event) => setQuick({ ...quick, followUpDate: event.target.value })} /></label>
              <label className="field"><span>Status</span><select value={quick.status} onChange={(event) => setQuick({ ...quick, status: event.target.value })}><option>Open</option><option>Waiting</option><option>Discharged</option><option>Complete</option></select></label>
              <div className="form-actions"><button type="button" className="text-button" onClick={() => setQuickModal(false)}>Cancel</button><button className="primary-button" type="submit">Save follow-up</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
