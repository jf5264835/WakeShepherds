"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  email: string;
  notificationEmail: string;
  name: string;
  canManageUsers: boolean;
  canAccessYouth: boolean;
  canManageYouth: boolean;
};

type Category = { id: string; name: string };

type YouthRecord = {
  id: string;
  personType: "student" | "staff";
  name: string;
  subjectUserId: string;
  school: string;
  birthday: string;
  category: string;
  need: string;
  lastContact: string;
  nextAction: string;
  followUpDate: string;
  status: string;
  notes: string;
  assignedUserId: string;
  assignedTo: string;
  birthdayAcknowledgedYear: number;
};

type Tab = "students" | "staff" | "team";

const emptyRecord: Omit<YouthRecord, "id" | "birthdayAcknowledgedYear"> = {
  personType: "student",
  name: "",
  subjectUserId: "",
  school: "",
  birthday: "",
  category: "Discipleship",
  need: "",
  lastContact: "",
  nextAction: "",
  followUpDate: "",
  status: "Open",
  notes: "",
  assignedUserId: "",
  assignedTo: "",
};

function prettyDate(value: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function birthdayLabel(value: string) {
  if (!value) return "Birthday not entered";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function daysUntilBirthday(value: string, today: Date) {
  if (!value) return null;
  const [, month, day] = value.split("-").map(Number);
  if (!month || !day) return null;
  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next.getTime() < todayKey) next = new Date(today.getFullYear() + 1, month - 1, day);
  return Math.round((next.getTime() - todayKey) / 86400000);
}

function birthdayTiming(days: number) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export default function YouthPage() {
  const [user, setUser] = useState<User | null>(null);
  const [records, setRecords] = useState<YouthRecord[]>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [tab, setTab] = useState<Tab>(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("section") === "staff" ? "staff" : "students");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyRecord);
  const [today] = useState(() => new Date());

  const canManage = Boolean(user?.canManageUsers || user?.canManageYouth);

  async function load() {
    const response = await fetch("/api/youth", { cache: "no-store" });
    const result = await response.json() as { records?: YouthRecord[]; team?: User[]; availableUsers?: User[]; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Wake Youth care could not be loaded.");
    setRecords(result.records ?? []);
    setTeam(result.team ?? []);
    setAvailableUsers(result.availableUsers ?? []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void (async () => {
      try {
        const sessionResponse = await fetch("/api/session", { cache: "no-store" });
        const session = await sessionResponse.json() as { user?: User };
        if (!session.user) {
          window.location.href = "/";
          return;
        }
        setUser(session.user);
        const categoriesResponse = await fetch("/api/categories", { cache: "no-store" });
        const categoryResult = await categoriesResponse.json() as { categories?: Category[] };
        setCategories(categoryResult.categories ?? []);
        await load();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Wake Youth care could not be loaded.");
      } finally {
        setLoading(false);
      }
    })(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const categoryOptions = useMemo(() => Array.from(new Set([
    "Discipleship",
    "Grief",
    "Intern",
    ...categories.map((category) => category.name),
  ])).sort(), [categories]);

  const students = records.filter((record) => record.personType === "student");
  const staffCare = records.filter((record) => record.personType === "staff");
  const currentYear = today.getFullYear();
  const birthdayAlerts = students
    .map((record) => ({ record, days: daysUntilBirthday(record.birthday, today) }))
    .filter((item): item is { record: YouthRecord; days: number } =>
      item.days !== null && item.days <= 14 && item.record.birthdayAcknowledgedYear !== currentYear)
    .sort((a, b) => a.days - b.days);
  const dueFollowUps = records.filter((record) =>
    record.status !== "Complete" && Boolean(record.followUpDate) && record.followUpDate <= today.toISOString().slice(0, 10));
  const visible = tab === "students" ? students : tab === "staff" ? staffCare : [];
  const loads = useMemo(() => new Map(team.map((member) => [
    member.id,
    {
      students: records.filter((record) => record.assignedUserId === member.id && record.personType === "student" && record.status !== "Complete").length,
      staff: records.filter((record) => record.assignedUserId === member.id && record.personType === "staff" && record.status !== "Complete").length,
    },
  ])), [records, team]);

  function openNew(personType: "student" | "staff") {
    setEditingId(null);
    setDraft({
      ...emptyRecord,
      personType,
      category: personType === "staff" ? "Discipleship" : "Discipleship",
      followUpDate: today.toISOString().slice(0, 10),
    });
    setModal(true);
  }

  function edit(record: YouthRecord) {
    const { id, birthdayAcknowledgedYear: _birthdayAcknowledgedYear, ...rest } = record;
    void _birthdayAcknowledgedYear;
    setEditingId(id);
    setDraft(rest);
    setModal(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/youth", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { id: editingId, ...draft } : draft),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Youth care could not be saved.");
      return;
    }
    setModal(false);
    await load();
  }

  async function patch(record: YouthRecord, changes: { birthdayAcknowledged?: boolean; status?: string }) {
    const response = await fetch("/api/youth", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: record.id, ...changes }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Youth care could not be updated.");
      return;
    }
    await load();
  }

  async function updateYouthAccess(teamUserId: string, youthAccess: boolean) {
    const member = [...team, ...availableUsers].find((candidate) => candidate.id === teamUserId);
    if (!youthAccess && !window.confirm(`Remove ${member?.name ?? "this person"} from the Wake Youth team?`)) return;
    setError("");
    const response = await fetch("/api/youth", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamUserId, youthAccess }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Wake Youth access could not be updated.");
      return;
    }
    setSelectedUserId("");
    await load();
  }

  async function archive(record: YouthRecord) {
    if (!window.confirm(`Archive the youth care record for ${record.name}?`)) return;
    const response = await fetch("/api/youth", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: record.id }),
    });
    if (!response.ok) {
      setError("Youth care could not be archived.");
      return;
    }
    await load();
  }

  if (loading) return <main className="youth-shell"><div className="empty-state">Loading Wake Youth care…</div></main>;

  return (
    <main className="youth-shell">
      <header className="youth-header">
        <div>
          <p className="section-label">Wake Church · Shepherding</p>
          <h1>Wake Youth Care</h1>
          <p>Know students well, shepherd the youth team intentionally, and keep every promised touchpoint.</p>
        </div>
        <div className="youth-header-actions">
          <Link className="text-button" href="/">← Main dashboard</Link>
          {canManage && <button className="primary-button" onClick={() => openNew("student")}>＋ Add student</button>}
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <section className="youth-metrics" aria-label="Wake Youth care summary">
        <article><span>Students in care</span><strong>{students.length}</strong></article>
        <article><span>Birthday alerts</span><strong>{birthdayAlerts.length}</strong></article>
        <article><span>Touchpoints due</span><strong>{dueFollowUps.length}</strong></article>
        <article><span>Staff being cared for</span><strong>{staffCare.filter((record) => record.status !== "Complete").length}</strong></article>
      </section>

      {birthdayAlerts.length > 0 && (
        <section className="birthday-panel">
          <div className="birthday-heading">
            <div>
              <p className="section-label">Assigned birthday notifications</p>
              <h2>Help a student feel remembered.</h2>
            </div>
            <span>{birthdayAlerts.length} upcoming</span>
          </div>
          <div className="birthday-alerts">
            {birthdayAlerts.map(({ record, days }) => (
              <article key={record.id}>
                <div className="birthday-date"><strong>{birthdayTiming(days)}</strong><span>{birthdayLabel(record.birthday)}</span></div>
                <div><strong>{record.name}</strong><span>{record.school || "School not entered"} · Care owner: {record.assignedTo || "Unassigned"}</span></div>
                <button className="secondary-button" onClick={() => void patch(record, { birthdayAcknowledged: true })}>Mark birthday touchpoint complete</button>
              </article>
            ))}
          </div>
        </section>
      )}

      <nav className="youth-tabs" aria-label="Wake Youth care sections">
        <button className={tab === "students" ? "active" : ""} onClick={() => setTab("students")}>Student care</button>
        <button className={tab === "staff" ? "active" : ""} onClick={() => setTab("staff")}>Youth staff care</button>
        <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>Youth team & loads</button>
      </nav>

      {tab === "team" ? (
        <section className="youth-team-grid">
          {canManage && (
            <article className="youth-team-card team-admin-card">
              <div>
                <strong>Add someone to the Wake Youth team</strong>
                <span>Youth access lets them see only the Youth care assigned to them. Youth managers can assign care and manage this list.</span>
              </div>
              <div className="team-access-controls">
                <select aria-label="Choose a user to add to the Wake Youth team" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                  <option value="">Choose a user</option>
                  {availableUsers.map((member) => <option value={member.id} key={member.id}>{member.name} · {member.notificationEmail || member.email}</option>)}
                </select>
                <button className="secondary-button" disabled={!selectedUserId} onClick={() => void updateYouthAccess(selectedUserId, true)}>Add to Youth</button>
              </div>
            </article>
          )}
          {team.map((member) => {
            const load = loads.get(member.id) ?? { students: 0, staff: 0 };
            return (
              <article className="youth-team-card" key={member.id}>
                <div className="team-avatar" aria-hidden="true">{member.name.slice(0, 1).toUpperCase()}</div>
                <div className="team-copy">
                  <strong>{member.name}</strong>
                  <span>{member.notificationEmail || member.email}</span>
                  {member.canManageYouth && <span className="team-role-badge">Youth manager</span>}
                </div>
                <div className="team-load"><span>Students<strong>{load.students}</strong></span><span>Staff care<strong>{load.staff}</strong></span></div>
                {canManage && member.canAccessYouth && !member.canManageYouth && (
                  <button className="team-remove-button" onClick={() => void updateYouthAccess(member.id, false)}>Remove from Youth</button>
                )}
              </article>
            );
          })}
          {team.length === 0 && (
            <div className="empty-state youth-team-empty"><h3>No one has Youth access yet.</h3><p>A Youth manager can add the first team member above.</p></div>
          )}
          {user?.canManageUsers && (
            <article className="youth-team-card team-admin-card">
              <div><strong>Choose Youth managers</strong><span>Only Global Admin can give someone permission to assign Youth care and manage this team list.</span></div>
              <Link className="secondary-button" href="/admin">Global permissions</Link>
            </article>
          )}
        </section>
      ) : (
        <section className="youth-list-panel">
          <div className="youth-list-heading">
            <div>
              <p className="section-label">{tab === "students" ? "Students" : "Staff shepherding"}</p>
              <h2>{tab === "students" ? "Every student gets a next step." : "Care for the people who care for students."}</h2>
            </div>
            {canManage && <button className="secondary-button" onClick={() => openNew(tab === "students" ? "student" : "staff")}>＋ {tab === "students" ? "Add student" : "Add staff care"}</button>}
          </div>

          {visible.length === 0 ? (
            <div className="empty-state"><h3>No {tab === "students" ? "students" : "staff care assignments"} here yet.</h3><p>Add the first person and assign a care owner.</p></div>
          ) : (
            <div className="youth-record-grid">
              {visible.map((record) => (
                <article className={record.status === "Complete" ? "youth-record-card complete" : "youth-record-card"} key={record.id}>
                  <div className="youth-record-head">
                    <div><span className="lane-chip">{record.category}</span><h3>{record.name}</h3></div>
                    <span className={`status-chip ${record.status.toLowerCase()}`}>{record.status}</span>
                  </div>
                  {record.personType === "student" && <div className="student-facts"><span><b>School</b>{record.school || "Not entered"}</span><span><b>Birthday</b>{birthdayLabel(record.birthday)}</span></div>}
                  <p className="youth-need">{record.need || "No care note yet."}</p>
                  <dl className="youth-details">
                    <div><dt>Care owner</dt><dd>{record.assignedTo || "Unassigned"}</dd></div>
                    <div><dt>Next touchpoint</dt><dd>{record.nextAction || "Add a next step"}</dd></div>
                    <div><dt>Follow-up</dt><dd>{prettyDate(record.followUpDate)}</dd></div>
                    <div><dt>Last contact</dt><dd>{prettyDate(record.lastContact)}</dd></div>
                  </dl>
                  <div className="youth-card-actions">
                    <button className="text-button" onClick={() => void patch(record, { status: record.status === "Complete" ? "Open" : "Complete" })}>{record.status === "Complete" ? "Reopen" : "Mark complete"}</button>
                    {canManage && <button className="text-button" onClick={() => edit(record)}>Edit</button>}
                    {canManage && <button className="text-button danger-text" onClick={() => void archive(record)}>Archive</button>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {modal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="youth-form-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div><p className="section-label">Wake Youth care</p><h2 id="youth-form-title">{editingId ? "Update" : "Add"} {draft.personType === "student" ? "student" : "staff care"}</h2></div>
              <button className="close-button" onClick={() => setModal(false)} aria-label="Close">×</button>
            </div>
            <form onSubmit={save}>
              <div className="form-grid">
                {draft.personType === "staff" ? (
                  <label className="field wide"><span>Youth staff person</span><select value={draft.subjectUserId} onChange={(event) => {
                    const subject = team.find((member) => member.id === event.target.value);
                    setDraft({ ...draft, subjectUserId: event.target.value, name: subject?.name ?? "" });
                  }}><option value="">Enter a name instead</option>{team.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
                ) : null}
                <label className="field wide"><span>{draft.personType === "student" ? "Student name" : "Staff name"}</span><input required value={draft.name} readOnly={draft.personType === "staff" && Boolean(draft.subjectUserId)} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                {draft.personType === "student" && <>
                  <label className="field"><span>School</span><input value={draft.school} onChange={(event) => setDraft({ ...draft, school: event.target.value })} placeholder="School name" /></label>
                  <label className="field"><span>Birthday</span><input type="date" value={draft.birthday} onChange={(event) => setDraft({ ...draft, birthday: event.target.value })} /></label>
                </>}
                <label className="field"><span>Care category</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{categoryOptions.map((category) => <option key={category}>{category}</option>)}</select></label>
                <label className="field"><span>Care owner</span><select value={draft.assignedUserId} onChange={(event) => {
                  const assignee = team.find((member) => member.id === event.target.value);
                  setDraft({ ...draft, assignedUserId: event.target.value, assignedTo: assignee?.name ?? "" });
                }}><option value="">Unassigned</option>{team.filter((member) => member.id !== draft.subjectUserId).map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
                <label className="field wide"><span>Care need</span><textarea rows={3} value={draft.need} onChange={(event) => setDraft({ ...draft, need: event.target.value })} placeholder="A brief, dignifying description" /></label>
                <label className="field"><span>Last contact</span><input type="date" value={draft.lastContact} onChange={(event) => setDraft({ ...draft, lastContact: event.target.value })} /></label>
                <label className="field"><span>Follow-up date</span><input type="date" value={draft.followUpDate} onChange={(event) => setDraft({ ...draft, followUpDate: event.target.value })} /></label>
                <label className="field wide"><span>Next intentional touchpoint</span><input value={draft.nextAction} onChange={(event) => setDraft({ ...draft, nextAction: event.target.value })} placeholder="Text, conversation, prayer, visit, or encouragement" /></label>
                <label className="field"><span>Status</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>Open</option><option>Waiting</option><option>Complete</option></select></label>
                <label className="field"><span>Light notes</span><input value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Only what is needed to follow through" /></label>
              </div>
              <div className="form-note">Keep sensitive counseling, medical, school-discipline, and family details outside this dashboard.</div>
              <div className="form-actions"><button type="button" className="text-button" onClick={() => setModal(false)}>Cancel</button><button type="submit" className="primary-button">Save youth care</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
