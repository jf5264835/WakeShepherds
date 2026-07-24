"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  name: string;
  notificationEmail: string;
  allowedCategories: string[];
  canViewAll: boolean;
  canAssignCare: boolean;
};

type Mom = {
  id: string;
  momName: string;
  email: string;
  stage: string;
  dueDate: string;
  babyBornDate: string;
  babyName: string;
  mealTrainFormUrl: string;
  notes: string;
  assignedUserId: string;
  assignedTo: string;
};

type Milestone = {
  id: string;
  maternalCareId: string;
  kind: string;
  label: string;
  dueDate: string;
  status: string;
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

const emptyMom: Omit<Mom, "id"> = {
  momName: "",
  email: "",
  stage: "trying",
  dueDate: "",
  babyBornDate: "",
  babyName: "",
  mealTrainFormUrl: "",
  notes: "",
  assignedUserId: "",
  assignedTo: "",
};

function prettyDate(value: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function mealTrainEmail(record: Mom) {
  const subject = encodeURIComponent("Meal Train information");
  const body = encodeURIComponent(
    `Hi ${record.momName},\n\nWe would love to care for you with meals. When you are ready, please fill out this short form:\n${record.mealTrainFormUrl}\n\nWith care,\nWake Church`,
  );
  return `mailto:${record.email}?subject=${subject}&body=${body}`;
}

const timelinePhases = ["Prayer & care", "Pregnancy", "Birth", "Postpartum", "Ongoing family care"];

function milestonePhase(kind: string) {
  if (kind === "prayer-monthly") return "Prayer & care";
  if (kind === "birth-recorded" || kind === "birth-confirmation") return "Birth";
  if (kind.startsWith("pregnancy-") || kind === "meal-train-form") return "Pregnancy";
  if (kind.startsWith("postpartum-") || kind === "meal-train-start") return "Postpartum";
  return "Ongoing family care";
}

export default function MomsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [records, setRecords] = useState<Mom[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [volunteers, setVolunteers] = useState<User[]>([]);
  const [supportRequests, setSupportRequests] = useState<TeamRequest[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(() => typeof window === "undefined"
    ? "all"
    : new URLSearchParams(window.location.search).get("filter") ?? "all");
  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<Mom, "id">>(emptyMom);

  async function load() {
    const response = await fetch("/api/maternal", { cache: "no-store" });
    const result = await response.json() as {
      records?: Mom[];
      milestones?: Milestone[];
      supportRequests?: TeamRequest[];
      error?: string;
    };
    if (!response.ok) {
      setError(result.error ?? "Maternal care could not be loaded.");
      return;
    }
    setRecords(result.records ?? []);
    setMilestones(result.milestones ?? []);
    setSupportRequests(result.supportRequests ?? []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void (async () => {
      const session = await fetch("/api/session", { cache: "no-store" });
      const data = await session.json() as { user?: User };
      if (!data.user) {
        window.location.href = "/";
        return;
      }
      setUser(data.user);
      if (data.user.canAssignCare) {
        const response = await fetch("/api/users", { cache: "no-store" });
        setVolunteers(((await response.json()) as { users?: User[] }).users ?? []);
      }
      await load();
      setLoading(false);
    })(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const dueSoonCutoff = useMemo(() => {
    const cutoff = new Date(`${today}T12:00:00`);
    cutoff.setDate(cutoff.getDate() + 14);
    return cutoff.toISOString().slice(0, 10);
  }, [today]);
  const visible = records.filter((record) => filter === "all" || record.stage === filter);
  const dueSoon = milestones.filter((item) =>
    item.status !== "Complete"
    && item.dueDate <= dueSoonCutoff);
  const milestoneMap = useMemo(
    () => new Map(records.map((record) => [
      record.id,
      milestones.filter((item) => item.maternalCareId === record.id),
    ])),
    [records, milestones],
  );

  function addMom() {
    setEditingId(null);
    setDraft(emptyMom);
    setModal(true);
  }

  function editMom(record: Mom) {
    const { id, ...rest } = record;
    setEditingId(id);
    setDraft(rest);
    setModal(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/maternal", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { id: editingId, ...draft } : draft),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Care plan could not be saved.");
      return;
    }
    setModal(false);
    await load();
  }

  async function toggle(item: Milestone) {
    const response = await fetch("/api/maternal", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ milestoneId: item.id, complete: item.status !== "Complete" }),
    });
    if (!response.ok) {
      const result = await response.json() as { error?: string };
      setError(result.error ?? "Milestone could not be updated.");
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
    await load();
  }

  if (loading) {
    return <main className="moms-shell"><div className="empty-state">Loading maternal care…</div></main>;
  }

  return (
    <main className="moms-shell">
      <header className="moms-header">
        <div>
          <p className="section-label">Wake Church · Shepherding</p>
          <h1>Pregnant Moms Care</h1>
          <p>Prayer, pregnancy, postpartum, meals, and milestones—without letting a mom fall through the cracks.</p>
        </div>
        <div className="moms-actions">
          <Link className="text-button" href="/">← Main dashboard</Link>
          {user?.canAssignCare && <button className="primary-button" onClick={addMom}>＋ Add mom</button>}
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="moms-metrics">
        <article><span>Trying & praying</span><strong>{records.filter((record) => record.stage === "trying").length}</strong></article>
        <article><span>Pregnant</span><strong>{records.filter((record) => record.stage === "pregnant").length}</strong></article>
        <article><span>Postpartum</span><strong>{records.filter((record) => record.stage === "postpartum").length}</strong></article>
        <article><span>Due or upcoming</span><strong>{dueSoon.length}</strong></article>
      </section>

      {user?.canAssignCare && supportRequests.length > 0 && (
        <section className="team-inbox-panel moms-team-inbox" id="team-inbox">
          <div><p className="section-label">Pregnancy Team inbox</p><h2>Volunteer messages needing a response</h2></div>
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

      <nav className="moms-tabs" aria-label="Maternal care sections">
        {[
          ["all", "All moms"],
          ["trying", "Trying & praying"],
          ["pregnant", "Pregnant"],
          ["postpartum", "Postpartum"],
        ].map(([value, label]) => (
          <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </nav>

      <section className="mom-cards">
        {visible.map((record) => (
          <article className="mom-card" key={record.id}>
            <div className="mom-card-head">
              <div>
                <span className={`stage-badge ${record.stage}`}>
                  {record.stage === "trying" ? "Trying & praying" : record.stage}
                </span>
                <h2>{record.momName}</h2>
                <p>{record.assignedTo ? `Care lead: ${record.assignedTo}` : "Care lead unassigned"}</p>
              </div>
              {user?.canAssignCare && <button className="text-button" onClick={() => editMom(record)}>Edit</button>}
            </div>

            <div className="mom-facts">
              <span><b>Due</b>{prettyDate(record.dueDate)}</span>
              <span><b>Baby born</b>{prettyDate(record.babyBornDate)}</span>
              <span><b>Baby</b>{record.babyName || "Not entered"}</span>
            </div>

            {record.notes && <p className="mom-notes">{record.notes}</p>}

            <div className="pregnancy-timeline">
              <div className="pregnancy-timeline-heading">
                <div><span>Complete care pathway</span><strong>Pregnancy to postpartum</strong></div>
                <b>{(milestoneMap.get(record.id) ?? []).filter((item) => item.status === "Complete").length}/{(milestoneMap.get(record.id) ?? []).length}</b>
              </div>
              {timelinePhases.map((phase) => {
                const phaseItems = (milestoneMap.get(record.id) ?? []).filter((item) => milestonePhase(item.kind) === phase);
                if (!phaseItems.length) return null;
                return (
                  <section className="timeline-phase" key={phase}>
                    <h3>{phase}</h3>
                    <div className="milestone-list">
                      {phaseItems.map((item) => {
                        const systemStep = item.kind === "birth-recorded";
                        return (
                          <div
                            className={item.status === "Complete" ? "milestone complete" : item.dueDate < today ? "milestone overdue" : "milestone"}
                            key={item.id}
                          >
                            {systemStep
                              ? <span className="milestone-system-dot" aria-hidden="true">✓</span>
                              : <button onClick={() => void toggle(item)} aria-label={`${item.status === "Complete" ? "Reopen" : "Complete"} ${item.label}`}>{item.status === "Complete" ? "✓" : "○"}</button>}
                            <div><strong>{item.label}</strong><span>{prettyDate(item.dueDate)}</span></div>
                            {item.kind === "meal-train-form" && record.mealTrainFormUrl && record.email && (
                              <a href={mealTrainEmail(record)}>Email form</a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </article>
        ))}
        {!visible.length && <div className="empty-state">No moms in this section yet.</div>}
      </section>

      <aside className="care-guidance">
        <strong>Pastoral care, not medical care.</strong>
        Check-ins are prompts to listen, pray, coordinate practical support, and encourage appropriate professional care.
        Urgent physical or mental-health concerns should go to licensed clinicians or emergency services.
      </aside>

      {modal && (
        <div className="modal-backdrop" onMouseDown={() => setModal(false)}>
          <section className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="section-label">Maternal care plan</p>
                <h2>{editingId ? "Update mom" : "Add mom"}</h2>
              </div>
              <button className="close-button" onClick={() => setModal(false)}>×</button>
            </div>
            <form onSubmit={save}>
              <div className="form-grid">
                <Field label="Mom's name" wide>
                  <input required value={draft.momName} onChange={(event) => setDraft({ ...draft, momName: event.target.value })} />
                </Field>
                <Field label="Mom's email">
                  <input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
                </Field>
                <Field label="Care stage">
                  <select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value })}>
                    <option value="trying">Trying & praying</option>
                    <option value="pregnant">Pregnant</option>
                    <option value="postpartum">Postpartum</option>
                  </select>
                </Field>
                <Field label="Due date">
                  <input
                    type="date"
                    value={draft.dueDate}
                    onChange={(event) => setDraft({ ...draft, dueDate: event.target.value, stage: event.target.value ? "pregnant" : draft.stage })}
                  />
                </Field>
                <Field label="Baby born date">
                  <input
                    type="date"
                    value={draft.babyBornDate}
                    onChange={(event) => setDraft({ ...draft, babyBornDate: event.target.value, stage: event.target.value ? "postpartum" : draft.stage })}
                  />
                </Field>
                <Field label="Baby's name">
                  <input value={draft.babyName} onChange={(event) => setDraft({ ...draft, babyName: event.target.value })} />
                </Field>
                <Field label="Assigned care lead">
                  <select value={draft.assignedUserId} onChange={(event) => setDraft({ ...draft, assignedUserId: event.target.value })}>
                    <option value="">Unassigned</option>
                    {volunteers
                      .filter((volunteer) => volunteer.canViewAll || volunteer.allowedCategories.includes("Pregnancy"))
                      .map((volunteer) => <option key={volunteer.id} value={volunteer.id}>{volunteer.name}</option>)}
                  </select>
                </Field>
                <Field label="Meal Train intake form" wide>
                  <input
                    type="url"
                    value={draft.mealTrainFormUrl}
                    onChange={(event) => setDraft({ ...draft, mealTrainFormUrl: event.target.value })}
                    placeholder="https://…"
                  />
                </Field>
                <Field label="Light pastoral notes" wide>
                  <textarea
                    rows={3}
                    value={draft.notes}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                    placeholder="Keep medical and counseling details elsewhere."
                  />
                </Field>
              </div>
              <div className="form-actions">
                <button type="button" className="text-button" onClick={() => setModal(false)}>Cancel</button>
                <button className="primary-button" type="submit">Save care plan</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return <label className={wide ? "field wide" : "field"}><span>{label}</span>{children}</label>;
}
