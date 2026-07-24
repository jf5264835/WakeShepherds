"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  email: string;
  notificationEmail: string;
  name: string;
  canManageUsers: boolean;
  canAccessDiscipleship: boolean;
  canManageDiscipleship: boolean;
};

type Relationship = {
  id: string;
  ministry: "Wake Men" | "Wake Women";
  discipleName: string;
  disciplePhone: string;
  discipleEmail: string;
  discipleMakerUserId: string;
  discipleMakerName: string;
  startedAt: string;
  lastContact: string;
  nextMeetupDate: string;
  growthNeeded: string[];
  growthSeen: string[];
  notes: string;
  meetupCount: number;
  coachContactedAt: string;
  status: string;
};

type Tab = "Wake Men" | "Wake Women" | "coaching" | "team";

const growthCategories = [
  "Scripture & theology",
  "Prayer",
  "Community",
  "Marriage & family",
  "Purity & integrity",
  "Evangelism & mission",
  "Emotional health",
  "Leadership & service",
  "Stewardship",
  "Work & calling",
];

const emptyRelationship: Omit<Relationship, "id" | "meetupCount" | "coachContactedAt"> = {
  ministry: "Wake Men",
  discipleName: "",
  disciplePhone: "",
  discipleEmail: "",
  discipleMakerUserId: "",
  discipleMakerName: "",
  startedAt: "",
  lastContact: "",
  nextMeetupDate: "",
  growthNeeded: [],
  growthSeen: [],
  notes: "",
  status: "Active",
};

function prettyDate(value: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function toggleCategory(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export default function DiscipleshipPage() {
  const [user, setUser] = useState<User | null>(null);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "Wake Men";
    return new URLSearchParams(window.location.search).get("section") === "coaching" ? "coaching" : "Wake Men";
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState(false);
  const [updateModal, setUpdateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<Relationship, "id" | "meetupCount" | "coachContactedAt">>(emptyRelationship);
  const [activeRelationship, setActiveRelationship] = useState<Relationship | null>(null);
  const [updateDraft, setUpdateDraft] = useState({ lastContact: "", nextMeetupDate: "", growthNeeded: [] as string[], growthSeen: [] as string[], notes: "", logMeetup: true });

  const canManage = Boolean(user?.canManageUsers || user?.canManageDiscipleship);

  async function load() {
    const response = await fetch("/api/discipleship", { cache: "no-store" });
    const result = await response.json() as { relationships?: Relationship[]; team?: User[]; availableUsers?: User[]; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Discipleship dashboard could not be loaded.");
    setRelationships(result.relationships ?? []);
    setTeam(result.team ?? []);
    setAvailableUsers(result.availableUsers ?? []);
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
        setError(reason instanceof Error ? reason.message : "Discipleship dashboard could not be loaded.");
      } finally {
        setLoading(false);
      }
    })(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const coachAlerts = relationships.filter((record) => record.status === "Active" && record.meetupCount >= 3 && !record.coachContactedAt);
  const due = relationships.filter((record) =>
    record.status === "Active" && Boolean(record.nextMeetupDate) && record.nextMeetupDate <= new Date().toISOString().slice(0, 10));
  const visible = relationships.filter((record) => record.ministry === tab);
  const loads = useMemo(() => new Map(team.map((member) => [
    member.id,
    relationships.filter((record) => record.discipleMakerUserId === member.id && record.status === "Active").length,
  ])), [relationships, team]);

  function addRelationship(ministry: "Wake Men" | "Wake Women") {
    setEditingId(null);
    setDraft({ ...emptyRelationship, ministry, startedAt: new Date().toISOString().slice(0, 10) });
    setModal(true);
  }

  function editRelationship(record: Relationship) {
    const { id, meetupCount: _meetupCount, coachContactedAt: _coachContactedAt, ...rest } = record;
    void _meetupCount;
    void _coachContactedAt;
    setEditingId(id);
    setDraft(rest);
    setModal(true);
  }

  function openUpdate(record: Relationship) {
    setActiveRelationship(record);
    setUpdateDraft({
      lastContact: record.lastContact || new Date().toISOString().slice(0, 10),
      nextMeetupDate: record.nextMeetupDate,
      growthNeeded: record.growthNeeded,
      growthSeen: record.growthSeen,
      notes: record.notes,
      logMeetup: true,
    });
    setUpdateModal(true);
  }

  async function saveRelationship(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/discipleship", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { id: editingId, ...draft } : draft),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Discipleship assignment could not be saved.");
      return;
    }
    setModal(false);
    setNotice(editingId ? "Discipleship assignment updated." : "Disciple maker assigned.");
    await load();
  }

  async function saveUpdate(event: FormEvent) {
    event.preventDefault();
    if (!activeRelationship) return;
    const response = await fetch("/api/discipleship", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeRelationship.id, ...updateDraft }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Discipleship update could not be saved.");
      return;
    }
    setUpdateModal(false);
    setNotice(updateDraft.logMeetup ? "Meetup logged." : "Discipleship notes updated.");
    await load();
  }

  async function markCoached(record: Relationship) {
    const response = await fetch("/api/discipleship", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: record.id, coachContacted: true }),
    });
    if (!response.ok) {
      setError("Coach check-in could not be completed.");
      return;
    }
    setNotice(`Coach check-in completed for ${record.discipleMakerName}.`);
    await load();
  }

  async function archive(record: Relationship) {
    if (!window.confirm(`Archive the discipleship relationship for ${record.discipleName}?`)) return;
    const response = await fetch("/api/discipleship", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: record.id }),
    });
    if (!response.ok) {
      setError("Discipleship assignment could not be archived.");
      return;
    }
    await load();
  }

  async function updateTeam(teamUserId: string, discipleshipAccess: boolean) {
    const member = [...team, ...availableUsers].find((candidate) => candidate.id === teamUserId);
    if (!discipleshipAccess && !window.confirm(`Remove ${member?.name ?? "this person"} from the Discipleship team?`)) return;
    const response = await fetch("/api/discipleship", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamUserId, discipleshipAccess }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Discipleship access could not be updated.");
      return;
    }
    setSelectedUserId("");
    await load();
  }

  if (loading) return <main className="ministry-shell discipleship-theme"><div className="empty-state">Loading discipleship…</div></main>;

  return (
    <main className="ministry-shell discipleship-theme">
      <header className="ministry-hero">
        <div>
          <p className="section-label">Wake Church · Formation</p>
          <h1>Wake Discipleship</h1>
          <p>Help disciple makers notice growth, name the next step, and keep showing up faithfully.</p>
        </div>
        <div className="ministry-actions">
          <Link className="text-button" href="/">← Main dashboard</Link>
          {canManage && <button className="primary-button" onClick={() => addRelationship(tab === "Wake Women" ? "Wake Women" : "Wake Men")}>＋ New assignment</button>}
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      <section className="ministry-metrics">
        <article><span>Active relationships</span><strong>{relationships.filter((record) => record.status === "Active").length}</strong></article>
        <article><span>Wake Men</span><strong>{relationships.filter((record) => record.ministry === "Wake Men" && record.status === "Active").length}</strong></article>
        <article><span>Wake Women</span><strong>{relationships.filter((record) => record.ministry === "Wake Women" && record.status === "Active").length}</strong></article>
        <article><span>{canManage ? "Coach alerts" : "Meetups due"}</span><strong>{canManage ? coachAlerts.length : due.length}</strong></article>
      </section>

      {canManage && coachAlerts.length > 0 && (
        <section className="coach-alert-panel">
          <div><p className="section-label">Third-meeting follow-up</p><h2>Check in with these disciple makers.</h2></div>
          {coachAlerts.map((record) => (
            <article key={record.id}>
              <div><strong>{record.discipleMakerName}</strong><span>{record.ministry} · discipling {record.discipleName} · {record.meetupCount} meetups</span></div>
              <button className="secondary-button" onClick={() => void markCoached(record)}>Mark coach contact complete</button>
            </article>
          ))}
        </section>
      )}

      <nav className="ministry-tabs" aria-label="Discipleship sections">
        <button className={tab === "Wake Men" ? "active" : ""} onClick={() => setTab("Wake Men")}>Wake Men</button>
        <button className={tab === "Wake Women" ? "active" : ""} onClick={() => setTab("Wake Women")}>Wake Women</button>
        {canManage && <button className={tab === "coaching" ? "active" : ""} onClick={() => setTab("coaching")}>Coach follow-up</button>}
        {canManage && <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>Disciple makers & loads</button>}
      </nav>

      {(tab === "Wake Men" || tab === "Wake Women") && (
        <section className="discipleship-grid">
          {visible.length === 0 && <div className="empty-state ministry-empty"><h3>No {tab} assignments here.</h3><p>{canManage ? "Assign a disciple maker to begin." : "Your assignments will appear here."}</p></div>}
          {visible.map((record) => (
            <article className="discipleship-card" key={record.id}>
              <div className="record-heading">
                <div><span className="lane-chip">{record.ministry}</span><h2>{record.discipleName}</h2><small>Disciple maker: {record.discipleMakerName}</small></div>
                <span className="meetup-count">{record.meetupCount}<small>meetups</small></span>
              </div>
              <div className="discipleship-contact">
                {record.disciplePhone && <a href={`tel:${record.disciplePhone}`}>Call</a>}
                {record.discipleEmail && <a href={`mailto:${record.discipleEmail}`}>Email</a>}
                {!record.disciplePhone && !record.discipleEmail && <span>Contact information not entered</span>}
              </div>
              <dl className="ministry-details">
                <div><dt>Last contact</dt><dd>{prettyDate(record.lastContact)}</dd></div>
                <div><dt>Next meetup</dt><dd>{prettyDate(record.nextMeetupDate)}</dd></div>
              </dl>
              <div className="growth-columns">
                <div><strong>Growth needed</strong>{record.growthNeeded.length ? record.growthNeeded.map((item) => <span key={item}>{item}</span>) : <small>Not recorded</small>}</div>
                <div><strong>Growth seen</strong>{record.growthSeen.length ? record.growthSeen.map((item) => <span key={item}>{item}</span>) : <small>Not recorded</small>}</div>
              </div>
              {record.notes && <p className="discipleship-notes">{record.notes}</p>}
              <div className="ministry-card-actions">
                <button className="primary-button" onClick={() => openUpdate(record)}>Log meetup / update</button>
                {canManage && <button className="text-button" onClick={() => editRelationship(record)}>Edit assignment</button>}
                {canManage && <button className="text-button danger-text" onClick={() => void archive(record)}>Archive</button>}
              </div>
            </article>
          ))}
        </section>
      )}

      {tab === "coaching" && canManage && (
        <section className="coaching-list">
          {relationships.filter((record) => record.meetupCount >= 3).map((record) => (
            <article key={record.id}>
              <div><strong>{record.discipleMakerName}</strong><span>{record.ministry} · {record.discipleName} · {record.meetupCount} meetups</span></div>
              <span className={record.coachContactedAt ? "coach-complete" : "coach-pending"}>{record.coachContactedAt ? `Contacted ${new Date(record.coachContactedAt).toLocaleDateString()}` : "Coach contact needed"}</span>
              {!record.coachContactedAt && <button className="secondary-button" onClick={() => void markCoached(record)}>Mark contacted</button>}
            </article>
          ))}
        </section>
      )}

      {tab === "team" && canManage && (
        <section className="ministry-team-grid">
          <article className="team-manager-card">
            <div><p className="section-label">Disciple maker access</p><h2>Add a disciple maker</h2><p>Disciple makers see only the people specifically assigned to them.</p></div>
            <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} aria-label="Choose a disciple maker">
              <option value="">Choose a user</option>
              {availableUsers.map((member) => <option value={member.id} key={member.id}>{member.name} · {member.notificationEmail || member.email}</option>)}
            </select>
            <button className="primary-button" disabled={!selectedUserId} onClick={() => void updateTeam(selectedUserId, true)}>Add disciple maker</button>
          </article>
          {team.map((member) => (
            <article className="ministry-team-card" key={member.id}>
              <div className="team-avatar">{member.name.slice(0, 1).toUpperCase()}</div>
              <div><strong>{member.name}</strong><span>{member.notificationEmail || member.email}</span>{member.canManageDiscipleship && <small>Discipleship manager</small>}</div>
              <b>{loads.get(member.id) ?? 0}<span>active people</span></b>
              {member.canAccessDiscipleship && !member.canManageDiscipleship && <button className="text-button danger-text" onClick={() => void updateTeam(member.id, false)}>Remove</button>}
            </article>
          ))}
        </section>
      )}

      {modal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(false)}>
          <section className="modal ministry-modal" role="dialog" aria-modal="true" aria-labelledby="discipleship-form-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><p className="section-label">Wake Discipleship</p><h2 id="discipleship-form-title">{editingId ? "Update assignment" : "Create assignment"}</h2></div><button className="close-button" onClick={() => setModal(false)}>×</button></div>
            <form onSubmit={saveRelationship}>
              <div className="form-grid">
                <label className="field"><span>Ministry</span><select value={draft.ministry} onChange={(event) => setDraft({ ...draft, ministry: event.target.value as "Wake Men" | "Wake Women" })}><option>Wake Men</option><option>Wake Women</option></select></label>
                <label className="field"><span>Disciple maker</span><select required value={draft.discipleMakerUserId} onChange={(event) => { const maker = team.find((member) => member.id === event.target.value); setDraft({ ...draft, discipleMakerUserId: event.target.value, discipleMakerName: maker?.name ?? "" }); }}><option value="">Choose a disciple maker</option>{team.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
                <label className="field wide"><span>Person being discipled</span><input required value={draft.discipleName} onChange={(event) => setDraft({ ...draft, discipleName: event.target.value })} /></label>
                <label className="field"><span>Phone</span><input type="tel" value={draft.disciplePhone} onChange={(event) => setDraft({ ...draft, disciplePhone: event.target.value })} /></label>
                <label className="field"><span>Email</span><input type="email" value={draft.discipleEmail} onChange={(event) => setDraft({ ...draft, discipleEmail: event.target.value })} /></label>
                <label className="field"><span>Started</span><input type="date" value={draft.startedAt} onChange={(event) => setDraft({ ...draft, startedAt: event.target.value })} /></label>
                <label className="field"><span>Next meetup</span><input type="date" value={draft.nextMeetupDate} onChange={(event) => setDraft({ ...draft, nextMeetupDate: event.target.value })} /></label>
                <label className="field wide"><span>Light notes</span><textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Only what helps the disciple maker follow through" /></label>
                <label className="field"><span>Status</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>Active</option><option>Paused</option><option>Complete</option></select></label>
              </div>
              <p className="form-note">Keep confessions, counseling details, diagnoses, and highly personal disclosures outside this dashboard.</p>
              <div className="form-actions"><button type="button" className="text-button" onClick={() => setModal(false)}>Cancel</button><button className="primary-button" type="submit">Save assignment</button></div>
            </form>
          </section>
        </div>
      )}

      {updateModal && activeRelationship && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setUpdateModal(false)}>
          <section className="modal quick-modal discipleship-update-modal" role="dialog" aria-modal="true" aria-labelledby="meetup-update-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><p className="section-label">Quick phone update</p><h2 id="meetup-update-title">{activeRelationship.discipleName}</h2></div><button className="close-button" onClick={() => setUpdateModal(false)}>×</button></div>
            <form onSubmit={saveUpdate}>
              <div className="quick-date-grid">
                <label className="field"><span>Last contact / meetup</span><input type="date" value={updateDraft.lastContact} onChange={(event) => setUpdateDraft({ ...updateDraft, lastContact: event.target.value })} /></label>
                <label className="field"><span>Next meetup</span><input type="date" value={updateDraft.nextMeetupDate} onChange={(event) => setUpdateDraft({ ...updateDraft, nextMeetupDate: event.target.value })} /></label>
              </div>
              <fieldset className="growth-picker"><legend>Areas of growth needed</legend>{growthCategories.map((category) => <label key={category}><input type="checkbox" checked={updateDraft.growthNeeded.includes(category)} onChange={() => setUpdateDraft({ ...updateDraft, growthNeeded: toggleCategory(updateDraft.growthNeeded, category) })} /> {category}</label>)}</fieldset>
              <fieldset className="growth-picker seen"><legend>Areas of growth seen</legend>{growthCategories.map((category) => <label key={category}><input type="checkbox" checked={updateDraft.growthSeen.includes(category)} onChange={() => setUpdateDraft({ ...updateDraft, growthSeen: toggleCategory(updateDraft.growthSeen, category) })} /> {category}</label>)}</fieldset>
              <label className="field"><span>Brief note</span><textarea rows={3} value={updateDraft.notes} onChange={(event) => setUpdateDraft({ ...updateDraft, notes: event.target.value })} /></label>
              <label className="meetup-check"><input type="checkbox" checked={updateDraft.logMeetup} onChange={(event) => setUpdateDraft({ ...updateDraft, logMeetup: event.target.checked })} /><span><strong>Count this as a completed meetup</strong><small>After meetup three, Global Admin receives a coach check-in alert.</small></span></label>
              <div className="form-actions"><button type="button" className="text-button" onClick={() => setUpdateModal(false)}>Cancel</button><button className="primary-button" type="submit">Save update</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
