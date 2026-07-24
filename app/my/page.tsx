"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Source = "care" | "moms" | "youth" | "hospital" | "discipleship";
type Tab = "today" | "assigned" | "ministries";
type User = { id: string; name: string; email: string; role: string };
type Assignment = {
  source: Source;
  id: string;
  personName: string;
  ministry: string;
  category: string;
  task: string;
  summary: string;
  dueDate: string;
  lastContact: string;
  priority: string;
  status: string;
  phone: string;
  email: string;
  location: string;
  room: string;
  detailUrl: string;
  meetupCount: number;
};
type Resource = { id: string; title: string; resourceType: string; summary: string; url: string };
type MinistryAccess = Record<Source, boolean>;
type UpdateDraft = {
  contactDate: string;
  note: string;
  followUpNeeded: boolean;
  followUpDate: string;
  markComplete: boolean;
  countMeetup: boolean;
};

const sourceLabels: Record<Source, string> = {
  care: "Shepherding",
  moms: "Pregnancy",
  youth: "Wake Youth",
  hospital: "Hospital",
  discipleship: "Discipleship",
};
const sourceMarks: Record<Source, string> = {
  care: "SC",
  moms: "M",
  youth: "WY",
  hospital: "H",
  discipleship: "D",
};
const sourceLinks: Record<Source, string> = {
  care: "/",
  moms: "/moms",
  youth: "/youth",
  hospital: "/hospital",
  discipleship: "/discipleship",
};

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function blankUpdate(): UpdateDraft {
  return { contactDate: todayKey(), note: "", followUpNeeded: false, followUpDate: "", markComplete: false, countMeetup: false };
}
function displayDate(value: string) {
  if (!value) return "No date set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}
function dueTone(value: string) {
  const today = todayKey();
  if (!value) return "";
  if (value < today) return "overdue";
  if (value === today) return "today";
  return "";
}

export default function MyCarePage() {
  const [access, setAccess] = useState<"checking" | "locked" | "unlocked">("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [ministries, setMinistries] = useState<MinistryAccess>({ care: true, moms: false, youth: false, hospital: false, discipleship: false });
  const [tab, setTab] = useState<Tab>("assigned");
  const [sourceFilter, setSourceFilter] = useState<Source | "all">("all");
  const [activeId, setActiveId] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("assignment") ?? "");
  const [draft, setDraft] = useState<UpdateDraft>(blankUpdate);
  const [saving, setSaving] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [supportAssignment, setSupportAssignment] = useState<Assignment | null>(null);
  const [supportKind, setSupportKind] = useState<"message" | "reassignment">("message");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportUrgent, setSupportUrgent] = useState(false);
  const [sendingSupport, setSendingSupport] = useState(false);

  async function loadAssignments() {
    const response = await fetch("/api/my-care", { cache: "no-store" });
    const result = await response.json() as {
      error?: string;
      user?: User;
      assignments?: Assignment[];
      resources?: Resource[];
      ministries?: MinistryAccess;
    };
    if (response.status === 401) {
      setAccess("locked");
      return;
    }
    if (!response.ok) throw new Error(result.error || "Your assignments could not be loaded.");
    setUser(result.user ?? null);
    setAssignments(result.assignments ?? []);
    setResources(result.resources ?? []);
    if (result.ministries) setMinistries(result.ministries);
    setAccess("unlocked");
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAssignments().catch((error) => {
        setPageError(error instanceof Error ? error.message : "Your assignments could not be loaded.");
        setAccess("locked");
      });
      if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (access !== "unlocked" || !activeId) return;
    if (assignments.some((assignment) => assignment.id === activeId)) {
      window.requestAnimationFrame(() => document.getElementById(`assignment-${activeId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
  }, [access, activeId, assignments]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setLoginError(result.error || "Email or password is not correct.");
      return;
    }
    setPassword("");
    await loadAssignments();
  }

  async function signOut() {
    await fetch("/api/session", { method: "DELETE" });
    setAssignments([]);
    setUser(null);
    setAccess("locked");
  }

  function openUpdate(assignment: Assignment) {
    setActiveId((current) => current === assignment.id ? "" : assignment.id);
    setDraft({
      ...blankUpdate(),
      contactDate: assignment.lastContact || todayKey(),
      followUpDate: assignment.dueDate,
      markComplete: assignment.source === "moms",
    });
    setNotice("");
  }

  async function saveUpdate(event: FormEvent<HTMLFormElement>, assignment: Assignment) {
    event.preventDefault();
    setSaving(true);
    setPageError("");
    const response = await fetch("/api/my-care", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: assignment.source, id: assignment.id, ...draft }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setPageError(result.error || "That update could not be saved.");
      setSaving(false);
      return;
    }
    await loadAssignments();
    setActiveId("");
    setDraft(blankUpdate());
    setNotice(`Update saved for ${assignment.personName}.`);
    setSaving(false);
  }

  function openSupport(assignment: Assignment, kind: "message" | "reassignment") {
    setSupportAssignment(assignment);
    setSupportKind(kind);
    setSupportMessage("");
    setSupportUrgent(false);
    setPageError("");
  }

  async function sendSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supportAssignment) return;
    setSendingSupport(true);
    setPageError("");
    const response = await fetch("/api/team-support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: supportAssignment.source,
        assignmentId: supportAssignment.id,
        kind: supportKind,
        message: supportMessage,
        urgent: supportUrgent,
      }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setPageError(result.error || "Your team lead could not be contacted.");
      setSendingSupport(false);
      return;
    }
    setSupportAssignment(null);
    setSupportMessage("");
    setSupportUrgent(false);
    setNotice(
      supportKind === "reassignment"
        ? `Reassignment requested for ${supportAssignment.personName}. It remains assigned to you until a lead completes the handoff.`
        : `Your team lead was notified about ${supportAssignment.personName}.`,
    );
    setSendingSupport(false);
  }

  const today = todayKey();
  const visibleAssignments = useMemo(() => assignments.filter((assignment) => {
    if (sourceFilter !== "all" && assignment.source !== sourceFilter) return false;
    if (tab === "today") return assignment.priority === "Urgent" || assignment.dueDate === today || Boolean(assignment.dueDate && assignment.dueDate < today);
    return true;
  }), [assignments, sourceFilter, tab, today]);
  const activeSources = useMemo(() => (Object.keys(sourceLabels) as Source[]).filter((source) => assignments.some((assignment) => assignment.source === source)), [assignments]);
  const dueCount = assignments.filter((assignment) => assignment.dueDate === today).length;
  const overdueCount = assignments.filter((assignment) => assignment.dueDate && assignment.dueDate < today).length;
  const firstName = user?.name.split(/\s+/)[0] || "friend";

  if (access !== "unlocked") {
    return (
      <main className="my-login-shell">
        <section className="my-login-card">
          <div className="my-app-icon" aria-hidden="true">W</div>
          <p className="my-eyebrow">Wake Church · Shepherding</p>
          <h1>{access === "checking" ? "Opening your care list…" : "Your care assignments"}</h1>
          <p>Sign in to see only the people and ministry care assigned to you.</p>
          {access === "locked" && (
            <form onSubmit={signIn}>
              <label>Email or username<input required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              {loginError && <div className="my-form-error" role="alert">{loginError}</div>}
              <button type="submit">Sign in</button>
            </form>
          )}
          <small>Care information is private. Use only your own account.</small>
        </section>
      </main>
    );
  }

  return (
    <main className="my-app-shell">
      <header className="my-topbar">
        <a className="my-wordmark" href="/my" aria-label="Wake Church My Care home"><span>W</span><b>my care</b></a>
        <div className="my-top-actions">
          <button className="my-icon-button" onClick={() => setInstallOpen((value) => !value)} aria-label="Install app help">＋</button>
          <button className="my-avatar" onClick={signOut} title="Sign out">{user?.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</button>
        </div>
      </header>

      {installOpen && (
        <aside className="my-install-card">
          <button onClick={() => setInstallOpen(false)} aria-label="Close">×</button>
          <strong>Put My Care on your phone</strong>
          <p><b>iPhone:</b> tap Share, then Add to Home Screen. <b>Android:</b> open the browser menu, then tap Install app or Add to Home screen.</p>
        </aside>
      )}

      <div className="my-app-content">
        <section className="my-greeting">
          <p className="my-eyebrow">People before tasks</p>
          <h1>Hi, {firstName}.</h1>
          <p>{assignments.length ? "Here are the people entrusted to your care." : "You are all caught up right now."}</p>
          <div className="my-summary-row">
            <span><b>{assignments.length}</b> assigned</span>
            <span className={dueCount ? "attention" : ""}><b>{dueCount}</b> due today</span>
            <span className={overdueCount ? "danger" : ""}><b>{overdueCount}</b> overdue</span>
          </div>
        </section>

        {notice && <div className="my-success" role="status">{notice}</div>}
        {pageError && <div className="my-error" role="alert">{pageError}</div>}

        {tab !== "ministries" ? (
          <>
            <section className="my-feed-heading">
              <div><p className="my-eyebrow">{tab === "today" ? "Needs attention" : "Private volunteer view"}</p><h2>{tab === "today" ? "Today" : "My assigned"}</h2></div>
              <span>sorted by urgency & date</span>
            </section>
            {activeSources.length > 1 && (
              <div className="my-filter-strip" aria-label="Filter assignments">
                <button className={sourceFilter === "all" ? "active" : ""} onClick={() => setSourceFilter("all")}>All</button>
                {activeSources.map((source) => <button key={source} className={sourceFilter === source ? "active" : ""} onClick={() => setSourceFilter(source)}>{sourceLabels[source]}</button>)}
              </div>
            )}
            <section className="my-assignment-list">
              {visibleAssignments.length === 0 ? (
                <div className="my-empty"><span>✓</span><h3>Nothing needs attention here.</h3><p>New assignments will appear automatically.</p></div>
              ) : visibleAssignments.map((assignment) => {
                const tone = dueTone(assignment.dueDate);
                const isOpen = activeId === assignment.id;
                return (
                  <article className={`my-assignment-card source-${assignment.source} ${isOpen ? "open" : ""}`} id={`assignment-${assignment.id}`} key={`${assignment.source}-${assignment.id}`}>
                    <div className="my-card-topline">
                      <span className="my-source-mark">{sourceMarks[assignment.source]}</span>
                      <div><span>{assignment.ministry}</span><small>{assignment.category}</small></div>
                      {(assignment.priority === "Urgent" || assignment.priority === "High") && <b className="my-urgent">{assignment.priority === "Urgent" ? "urgent" : "priority"}</b>}
                    </div>
                    <h3>{assignment.personName}</h3>
                    <p className="my-task">{assignment.task}</p>
                    {assignment.summary && <p className="my-summary">{assignment.summary}</p>}
                    <div className="my-meta-row">
                      {assignment.dueDate && <span className={tone}>◷ {tone === "overdue" ? "Overdue · " : tone === "today" ? "Today · " : ""}{displayDate(assignment.dueDate)}</span>}
                      {assignment.lastContact && <span>Last contact {displayDate(assignment.lastContact)}</span>}
                      {assignment.room && <span>Room {assignment.room}</span>}
                    </div>
                    {assignment.location && <p className="my-location">⌖ {assignment.location}</p>}
                    <div className="my-card-actions">
                      {assignment.phone && <a href={`tel:${assignment.phone}`}>Call</a>}
                      {assignment.email && <a href={`mailto:${assignment.email}`}>Email</a>}
                      {assignment.location && assignment.source === "hospital" && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(assignment.location)}`} target="_blank" rel="noreferrer">Directions</a>}
                      <button className="my-support-button" onClick={() => openSupport(assignment, "message")}>Message lead</button>
                      <button className="my-support-button" onClick={() => openSupport(assignment, "reassignment")}>Request reassignment</button>
                      <button className="my-log-button" onClick={() => openUpdate(assignment)}>{isOpen ? "Close" : assignment.source === "hospital" ? "Log visit" : "Log contact"}</button>
                    </div>
                    {isOpen && (
                      <form className="my-quick-update" onSubmit={(event) => saveUpdate(event, assignment)}>
                        <label>When<input type="date" required value={draft.contactDate} onChange={(event) => setDraft({ ...draft, contactDate: event.target.value })} /></label>
                        <label>What happened<textarea rows={3} maxLength={500} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Short, dignifying note—no sensitive details" /></label>
                        <label className="my-check"><input type="checkbox" checked={draft.followUpNeeded} onChange={(event) => setDraft({ ...draft, followUpNeeded: event.target.checked })} /> Follow-up needed</label>
                        {draft.followUpNeeded && <label>Follow-up date<input type="date" required value={draft.followUpDate} onChange={(event) => setDraft({ ...draft, followUpDate: event.target.value })} /></label>}
                        {assignment.source === "discipleship" && <label className="my-check"><input type="checkbox" checked={draft.countMeetup} onChange={(event) => setDraft({ ...draft, countMeetup: event.target.checked })} /> Count this as a completed meetup</label>}
                        {assignment.source === "moms" ? (
                          <label className="my-check"><input type="checkbox" checked={draft.markComplete} onChange={(event) => setDraft({ ...draft, markComplete: event.target.checked })} /> Mark this care touchpoint complete</label>
                        ) : (
                          <label className="my-check"><input type="checkbox" checked={draft.markComplete} onChange={(event) => setDraft({ ...draft, markComplete: event.target.checked })} /> Assignment complete</label>
                        )}
                        <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save update"}</button>
                      </form>
                    )}
                  </article>
                );
              })}
            </section>
          </>
        ) : (
          <section className="my-ministries">
            <div className="my-feed-heading">
              <div><p className="my-eyebrow">Your access</p><h2>Ministries</h2></div>
              <span>only what you can see</span>
            </div>
            <div className="my-ministry-grid">
              {(Object.keys(ministries) as Source[]).filter((source) => ministries[source]).map((source) => (
                <a href={sourceLinks[source]} key={source} className={`source-${source}`}>
                  <span className="my-source-mark">{sourceMarks[source]}</span>
                  <div><strong>{sourceLabels[source]}</strong><small>{assignments.filter((assignment) => assignment.source === source).length} active assignment{assignments.filter((assignment) => assignment.source === source).length === 1 ? "" : "s"}</small></div>
                  <b>›</b>
                </a>
              ))}
            </div>
            {resources.length > 0 && (
              <div className="my-resources">
                <p className="my-eyebrow">Hospital Team</p>
                <h2>Resources</h2>
                {resources.map((resource) => <a href={resource.url} target="_blank" rel="noreferrer" key={resource.id}><span>{resource.resourceType}</span><strong>{resource.title}</strong><small>{resource.summary || "Open resource"}</small></a>)}
              </div>
            )}
            <div className="my-privacy-reminder"><b>Keep care notes light.</b><p>Record enough to follow through. Do not include diagnoses, counseling details, confessions, or private family information.</p></div>
          </section>
        )}
      </div>

      {supportAssignment && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSupportAssignment(null)}>
          <section className={`modal my-support-modal source-${supportAssignment.source}`} role="dialog" aria-modal="true" aria-labelledby="team-support-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="my-eyebrow">{supportKind === "reassignment" ? "Care handoff" : "Team support"}</p>
                <h2 id="team-support-title">{supportKind === "reassignment" ? "Request reassignment" : "Message your team lead"}</h2>
                <p>{supportAssignment.personName} · {supportAssignment.ministry}</p>
              </div>
              <button className="close-button" onClick={() => setSupportAssignment(null)} aria-label="Close">×</button>
            </div>
            <form onSubmit={sendSupport}>
              <label className="field">
                <span>{supportKind === "reassignment" ? "Why is a handoff needed?" : "How can your lead help?"}</span>
                <textarea
                  required
                  rows={5}
                  maxLength={1000}
                  value={supportMessage}
                  onChange={(event) => setSupportMessage(event.target.value)}
                  placeholder={supportKind === "reassignment" ? "Share the practical reason and any timing concern." : "Write a short question or update."}
                />
              </label>
              <label className="my-support-urgent">
                <input type="checkbox" checked={supportUrgent} onChange={(event) => setSupportUrgent(event.target.checked)} />
                <span><strong>Needs attention today</strong><small>Use for time-sensitive pastoral care, not emergencies.</small></span>
              </label>
              <p className="form-note">Keep diagnoses, counseling details, confessions, and private family information out of this message. Call emergency services for an immediate safety emergency.</p>
              <div className="form-actions">
                <button type="button" className="text-button" onClick={() => setSupportAssignment(null)}>Cancel</button>
                <button className="primary-button" type="submit" disabled={sendingSupport}>{sendingSupport ? "Sending…" : supportKind === "reassignment" ? "Send request" : "Send message"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      <nav className="my-bottom-nav" aria-label="My Care navigation">
        <button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}><span>◷</span>Today{dueCount + overdueCount > 0 && <b>{dueCount + overdueCount}</b>}</button>
        <button className={tab === "assigned" ? "active" : ""} onClick={() => setTab("assigned")}><span>✓</span>Assigned<b>{assignments.length}</b></button>
        <button className={tab === "ministries" ? "active" : ""} onClick={() => setTab("ministries")}><span>◇</span>Ministries</button>
      </nav>
    </main>
  );
}
