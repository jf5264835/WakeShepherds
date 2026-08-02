"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import DashboardNavigation from "../components/DashboardNavigation";

type CareLane =
  | "Immediate care"
  | "Follow-up promised"
  | "Ongoing shepherding"
  | "Quietly drifting"
  | "Encouragement"
  | "Waiting on others";

type Priority = "Urgent" | "High" | "Normal" | "Low";
type Status = "Open" | "Scheduled" | "Waiting" | "Complete";

type CareItem = {
  id: string;
  name: string;
  category: string;
  lane: CareLane;
  need: string;
  lastContact: string;
  nextAction: string;
  followUpDate: string;
  priority: Priority;
  status: Status;
  notes: string;
  assignedTo: string;
  assignedEmail: string;
  assignedUserId: string;
};
type User = { id: string; email: string; notificationEmail: string; name: string; role: string; active: boolean; canViewAll: boolean; canManageCare: boolean; canAssignCare: boolean; canManageUsers: boolean; canAccessYouth: boolean; canManageYouth: boolean; canAccessHospital: boolean; canManageHospital: boolean; canAccessDiscipleship: boolean; canManageDiscipleship: boolean; allowedCategories: string[] };
type Category = { id: string; name: string };
type TeamRequest = {
  id: string;
  source: "care" | "moms" | "youth" | "hospital" | "discipleship";
  personName: string;
  senderName: string;
  kind: string;
  message: string;
  urgency: string;
  createdAt: string;
};
type MinistryOverview = {
  attention: {
    hospitalCovered: number;
    hospitalActive: number;
    hospitalCoveragePercent: number;
    approachingBirths: number;
    postpartumOverdue: number;
    urgentEscalations: number;
  };
  escalations: TeamRequest[];
  care: { total: number; open: number; urgent: number };
  moms: { total: number; trying: number; pregnant: number; postpartum: number };
  youth: { students: number; staffCare: number; birthdaysSoon: number };
  hospital: { active: number; due: number };
  discipleship: { active: number; coachingAlerts: number };
};

type Filter = "All" | "Due today" | "Overdue" | "Waiting";

const LANES: CareLane[] = [
  "Immediate care",
  "Follow-up promised",
  "Ongoing shepherding",
  "Quietly drifting",
  "Encouragement",
  "Waiting on others",
];

const laneDescriptions: Record<CareLane, string> = {
  "Immediate care": "Crisis, grief, hospitalization, conflict, or safety concern",
  "Follow-up promised": "A check-in you explicitly promised",
  "Ongoing shepherding": "Illness, marriage strain, discouragement, or transition",
  "Quietly drifting": "Absence, withdrawal, or unanswered contact",
  Encouragement: "Faithfulness, growth, unseen service, or good news",
  "Waiting on others": "Care involving another pastor, elder, leader, or counselor",
};

const emptyItem: Omit<CareItem, "id"> = {
  name: "",
  category: "",
  lane: "Follow-up promised",
  need: "",
  lastContact: "",
  nextAction: "",
  followUpDate: "",
  priority: "Normal",
  status: "Open",
  notes: "",
  assignedTo: "",
  assignedEmail: "",
  assignedUserId: "",
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function isOpen(item: CareItem) {
  return item.status !== "Complete";
}

export default function Home() {
  const [items, setItems] = useState<CareItem[]>([]);
  const [access, setAccess] = useState<"checking" | "locked" | "unlocked">("checking");
  const [loadingItems, setLoadingItems] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [volunteers, setVolunteers] = useState<User[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ministryOverview, setMinistryOverview] = useState<MinistryOverview | null>(null);
  const [accessError, setAccessError] = useState("");
  const [pageError, setPageError] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");
  const [categoryFocus, setCategoryFocus] = useState(() => typeof window === "undefined"
    ? ""
    : new URLSearchParams(window.location.search).get("category")?.trim() ?? "");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<CareItem, "id">>(emptyItem);

  const today = localDateKey();

  async function loadMinistryOverview() {
    const response = await fetch("/api/overview", { cache: "no-store" });
    if (response.ok) setMinistryOverview(await response.json() as MinistryOverview);
  }

  async function resolveTeamRequest(id: string) {
    const response = await fetch("/api/team-support", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      setPageError(result.error ?? "This team request could not be resolved.");
      return;
    }
    await loadMinistryOverview();
  }

  useEffect(() => {
    if (access !== "unlocked" || !categoryFocus) return;
    window.requestAnimationFrame(() => {
      document.getElementById("care-queue")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [access, categoryFocus]);

  useEffect(() => {
    void (async () => {
      try {
        const sessionResponse = await fetch("/api/session", { cache: "no-store" });
        const session = (await sessionResponse.json()) as { authorized?: boolean; user?: User };
        if (!session.authorized) {
          setAccess("locked");
          setLoadingItems(false);
          return;
        }
        setAccess("unlocked");
        setUser(session.user ?? null);
        const categoriesResponse = await fetch("/api/categories", { cache: "no-store" });
        const categoriesResult = await categoriesResponse.json() as { categories?: Category[] };
        setCategories(categoriesResult.categories ?? []);
        if (session.user?.canAssignCare) {
          const usersResponse = await fetch("/api/users", { cache: "no-store" });
          const usersResult = await usersResponse.json() as { users?: User[] };
          setVolunteers(usersResult.users ?? []);
        }
        if (session.user?.canManageUsers) await loadMinistryOverview();
        const careResponse = await fetch("/api/care", { cache: "no-store" });
        const care = (await careResponse.json()) as { items?: CareItem[]; error?: string };
        if (!careResponse.ok) throw new Error(care.error || "Care items could not be loaded.");
        setItems(care.items ?? []);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "Care items could not be loaded.");
        setAccess("locked");
      } finally {
        setLoadingItems(false);
      }
    })();
  }, []);

  async function loadItems() {
    setLoadingItems(true);
    try {
      const response = await fetch("/api/care", { cache: "no-store" });
      if (response.status === 401) {
        setAccess("locked");
        return;
      }
      const result = (await response.json()) as { items?: CareItem[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Care items could not be loaded.");
      setItems(result.items ?? []);
      setPageError("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Care items could not be loaded.");
    } finally {
      setLoadingItems(false);
    }
  }

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json().catch(() => ({})) as { authorized?: boolean; user?: User; error?: string };
      if (!response.ok || !result.authorized) {
        setAccessError(result.error || (response.status >= 500 ? "Sign-in is temporarily unavailable. Please try again." : "Email or password is not correct."));
        return;
      }
      setPassword("");
      setUser(result.user ?? null);
      const categoriesResponse = await fetch("/api/categories", { cache: "no-store" });
      const categoriesResult = await categoriesResponse.json() as { categories?: Category[] };
      setCategories(categoriesResult.categories ?? []);
      if (result.user?.canAssignCare) {
        const usersResponse = await fetch("/api/users", { cache: "no-store" });
        const usersResult = await usersResponse.json() as { users?: User[] };
        setVolunteers(usersResult.users ?? []);
      }
      if (result.user?.canManageUsers) await loadMinistryOverview();
      setAccess("unlocked");
      await loadItems();
    } catch {
      setAccessError("Sign-in could not reach the server. Check your connection and try again.");
    }
  }

  async function lockWorkspace() {
    await fetch("/api/session", { method: "DELETE" });
    setItems([]);
    setUser(null);
    setMinistryOverview(null);
    setAccess("locked");
  }

  const metrics = useMemo(() => {
    const open = items.filter(isOpen);
    return {
      open: open.length,
      dueToday: open.filter((item) => item.followUpDate === today).length,
      overdue: open.filter((item) => item.followUpDate && item.followUpDate < today).length,
      waiting: open.filter((item) => item.status === "Waiting").length,
    };
  }, [items, today]);

  const laneCounts = useMemo(
    () => LANES.map((lane) => ({ lane, count: items.filter((item) => isOpen(item) && item.lane === lane).length })),
    [items],
  );

  const maxLaneCount = Math.max(1, ...laneCounts.map(({ count }) => count));

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items
      .filter((item) => !categoryFocus || item.category === categoryFocus)
      .filter((item) => {
        if (filter === "Due today") return isOpen(item) && item.followUpDate === today;
        if (filter === "Overdue") return isOpen(item) && Boolean(item.followUpDate) && item.followUpDate < today;
        if (filter === "Waiting") return isOpen(item) && item.status === "Waiting";
        return true;
      })
      .filter((item) =>
        !query || [item.name, item.category, item.need, item.nextAction, item.notes, item.lane, item.assignedTo, item.assignedEmail].some((value) => value.toLowerCase().includes(query)),
      )
      .sort((a, b) => {
        if (a.status === "Complete" && b.status !== "Complete") return 1;
        if (b.status === "Complete" && a.status !== "Complete") return -1;
        if (!a.followUpDate) return 1;
        if (!b.followUpDate) return -1;
        return a.followUpDate.localeCompare(b.followUpDate);
      });
  }, [categoryFocus, filter, items, search, today]);

  function clearCategoryFocus() {
    const url = new URL(window.location.href);
    url.searchParams.delete("category");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setCategoryFocus("");
  }

  function openNewItem() {
    setEditingId(null);
    setDraft({ ...emptyItem, followUpDate: today });
    setModalOpen(true);
  }

  function openEditItem(item: CareItem) {
    const { id, ...fields } = item;
    setEditingId(id);
    setDraft(fields);
    setModalOpen(true);
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageError("");
    const response = await fetch("/api/care", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { id: editingId, ...draft } : draft),
    });
    const result = (await response.json()) as { item?: CareItem; error?: string; notification?: { sent?: boolean; error?: string } };
    if (!response.ok || !result.item) {
      setPageError(result.error || "This care item could not be saved.");
      return;
    }
    setItems((current) => editingId
      ? current.map((item) => (item.id === editingId ? result.item! : item))
      : [result.item!, ...current]);
    if (result.notification?.error) setPageError(`Care task saved, but the assignment email was not sent: ${result.notification.error}`);
    setModalOpen(false);
  }

  async function deleteItem(item: CareItem) {
    if (window.confirm(`Archive ${item.name}? A Global Admin can restore this care record later.`)) {
      const response = await fetch("/api/care", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      if (!response.ok) {
        setPageError("This care item could not be archived.");
        return;
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    }
  }

  async function toggleComplete(item: CareItem) {
    const updated = { ...item, status: (item.status === "Complete" ? "Open" : "Complete") as Status };
    const response = await fetch("/api/care", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    const result = (await response.json()) as { item?: CareItem };
    if (!response.ok || !result.item) {
      setPageError("This status could not be updated.");
      return;
    }
    setItems((current) => current.map((entry) => entry.id === item.id ? result.item! : entry));
  }

  if (access !== "unlocked") {
    return <AccessGate checking={access === "checking"} email={email} setEmail={setEmail} password={password} setPassword={setPassword} error={accessError} onSubmit={unlock} />;
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-mark" aria-hidden="true">W</div>
          <div>
            <p className="brand-kicker">Wake Church · Shepherding</p>
            <p className="brand-name">Pastoral Care Workspace</p>
          </div>
        </div>
        <DashboardNavigation user={user} />
        <div className="account-actions">
          <button className="privacy-pill" onClick={lockWorkspace} title="Sign out">{user?.name ?? "Account"} · Sign out</button>
        </div>
      </header>

      <div className="content-wrap">
        {pageError && <div className="error-banner" role="alert">{pageError}</div>}
        <section className="hero">
          <div>
            <p className="eyebrow">People before tasks</p>
            <h1>Shepherding Care</h1>
            <p className="hero-copy">Remember people, keep promises, and take the next faithful step.</p>
          </div>
          <button className="primary-button" onClick={openNewItem}>＋ Add care item</button>
        </section>

        {user?.canManageUsers && ministryOverview && (
          <section className="ministry-overview">
            <div className="ministry-overview-heading">
              <div><p className="section-label">Whole-church care</p><h2>People in every season</h2></div>
              <span>Global Admin view</span>
            </div>
            <div className="global-attention-grid" aria-label="Global Admin attention summary">
              <a href="/hospital">
                <span>Hospital coverage</span>
                <strong>{ministryOverview.attention.hospitalCovered}/{ministryOverview.attention.hospitalActive}</strong>
                <small>{ministryOverview.attention.hospitalCoveragePercent}% of active hospital care assigned</small>
              </a>
              <a href="/moms?filter=pregnant">
                <span>Approaching births</span>
                <strong>{ministryOverview.attention.approachingBirths}</strong>
                <small>Due in the next 30 days</small>
              </a>
              <a className={ministryOverview.attention.postpartumOverdue ? "attention-card warning" : "attention-card"} href="/moms?filter=postpartum">
                <span>Postpartum overdue</span>
                <strong>{ministryOverview.attention.postpartumOverdue}</strong>
                <small>Pastoral check-ins needing follow-through</small>
              </a>
              <a className={ministryOverview.attention.urgentEscalations ? "attention-card urgent" : "attention-card"} href="#global-escalations">
                <span>Urgent escalations</span>
                <strong>{ministryOverview.attention.urgentEscalations}</strong>
                <small>Volunteer messages needing attention today</small>
              </a>
            </div>
            <div className="ministry-overview-grid">
              <a href="#care-queue"><span>Shepherding care</span><strong>{ministryOverview.care.open}</strong><small>{ministryOverview.care.urgent} urgent · {ministryOverview.care.total} total</small></a>
              <a href="/moms"><span>Moms care</span><strong>{ministryOverview.moms.total}</strong><small>{ministryOverview.moms.pregnant} pregnant · {ministryOverview.moms.postpartum} postpartum</small></a>
              <a href="/youth"><span>Wake Youth students</span><strong>{ministryOverview.youth.students}</strong><small>{ministryOverview.youth.birthdaysSoon} birthday alerts</small></a>
              <a href="/youth?section=staff"><span>Youth staff care</span><strong>{ministryOverview.youth.staffCare}</strong><small>Active staff shepherding</small></a>
              <a href="/hospital"><span>Hospital care</span><strong>{ministryOverview.hospital.active}</strong><small>{ministryOverview.hospital.due} follow-ups due</small></a>
              <a href="/discipleship"><span>Discipleship</span><strong>{ministryOverview.discipleship.active}</strong><small>{ministryOverview.discipleship.coachingAlerts} coach alerts</small></a>
            </div>
            {ministryOverview.escalations.length > 0 && (
              <div className="global-escalation-list" id="global-escalations">
                <div>
                  <p className="section-label">Team-lead inbox</p>
                  <h3>Open volunteer messages</h3>
                </div>
                {ministryOverview.escalations.map((request) => (
                  <article className={request.urgency === "urgent" ? "urgent" : ""} key={request.id}>
                    <div>
                      <span>{request.kind === "reassignment" ? "Reassignment request" : "Message"} · {request.source}</span>
                      <strong>{request.personName}</strong>
                      <small>From {request.senderName} · {new Date(request.createdAt).toLocaleString()}</small>
                    </div>
                    <p>{request.message}</p>
                    <button className="text-button" onClick={() => void resolveTeamRequest(request.id)}>Mark resolved</button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="metrics-grid" aria-label="Care summary">
          <MetricCard label="Open care" value={metrics.open} tone="blue" />
          <MetricCard label="Due today" value={metrics.dueToday} tone="gold" />
          <MetricCard label="Overdue" value={metrics.overdue} tone="red" />
          <MetricCard label="Waiting" value={metrics.waiting} tone="green" />
        </section>

        <section className="overview-grid">
          <article className="panel care-load-panel">
            <div className="panel-heading">
              <div>
                <p className="section-label">Care load</p>
                <h2>By shepherding lane</h2>
              </div>
              <span className="small-badge">Open items</span>
            </div>
            <div className="lane-list">
              {laneCounts.map(({ lane, count }) => (
                <div className="lane-row" key={lane}>
                  <div className="lane-copy">
                    <span>{lane}</span>
                    <small>{laneDescriptions[lane]}</small>
                  </div>
                  <div className="lane-meter" aria-label={`${lane}: ${count}`}>
                    <span style={{ width: count ? `${Math.max(12, (count / maxLaneCount) * 100)}%` : "0%" }} />
                  </div>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="panel rhythm-panel">
            <p className="section-label sage">A faithful weekly rhythm</p>
            <h2>Move care forward gently.</h2>
            <div className="rhythm-list">
              <RhythmItem day="Today" text="Respond to immediate care and overdue promises." />
              <RhythmItem day="This week" text="Schedule ongoing care and reach toward those drifting." />
              <RhythmItem day="Friday" text="Review waiting items and confirm who owns the next step." />
            </div>
            <div className="privacy-note">
              <span aria-hidden="true">◎</span>
              <p><strong>Keep notes light.</strong> Record enough to follow through, not sensitive case details.</p>
            </div>
          </article>
        </section>

        <section className="queue-panel" id="care-queue">
          <div className="queue-heading">
            <div>
              <p className="section-label">Care & follow-up queue</p>
              <h2>Every name gets a next step.</h2>
            </div>
            <div className="queue-actions">
              <label className="search-box">
                <span aria-hidden="true">⌕</span>
                <span className="sr-only">Search care items</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people or notes" />
              </label>
              <button className="secondary-button" onClick={openNewItem}>＋ Add person</button>
            </div>
          </div>

          <div className="filter-row" role="group" aria-label="Filter care items">
            {categoryFocus && (
              <button className="filter-button active" onClick={clearCategoryFocus} title="Show all permitted categories">
                Category: {categoryFocus} ×
              </button>
            )}
            {(["All", "Due today", "Overdue", "Waiting"] as Filter[]).map((option) => (
              <button key={option} className={filter === option ? "filter-button active" : "filter-button"} onClick={() => setFilter(option)}>
                {option}
              </button>
            ))}
            <span className="result-count">{visibleItems.length} {visibleItems.length === 1 ? "person" : "people"}</span>
          </div>

          {loadingItems ? (
            <div className="empty-state">Loading your care workspace…</div>
          ) : visibleItems.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true">✓</div>
              <h3>No care items here.</h3>
              <p>Clear the filter or add the next person you want to remember.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Category</th>
                    <th>Care lane</th>
                    <th>Next faithful step</th>
                    <th>Assigned to</th>
                    <th>Follow-up</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => {
                    const overdue = isOpen(item) && Boolean(item.followUpDate) && item.followUpDate < today;
                    const dueToday = isOpen(item) && item.followUpDate === today;
                    return (
                      <tr key={item.id} className={item.status === "Complete" ? "complete-row" : ""}>
                        <td>
                          <button className="person-button" onClick={() => openEditItem(item)}>{item.name}</button>
                          <span className="need-preview">{item.need || "No care note yet"}</span>
                        </td>
                        <td>{item.category ? <span className="lane-chip">{item.category}</span> : <span className="muted-text">Uncategorized</span>}</td>
                        <td><span className="lane-chip">{item.lane}</span></td>
                        <td>{item.nextAction || <span className="muted-text">Add a next action</span>}</td>
                        <td>
                          {item.assignedTo || item.assignedEmail ? (
                            <div className="assignee-cell">
                              <strong>{item.assignedTo || item.assignedEmail}</strong>
                              {item.assignedEmail && <span className="email-link">Email notified on assignment</span>}
                            </div>
                          ) : <span className="muted-text">Unassigned</span>}
                        </td>
                        <td>
                          <span className={overdue ? "date-chip overdue" : dueToday ? "date-chip due" : "date-chip"}>
                            {displayDate(item.followUpDate)}
                          </span>
                        </td>
                        <td><span className={`priority-chip ${item.priority.toLowerCase()}`}>{item.priority}</span></td>
                        <td><span className={`status-chip ${item.status.toLowerCase()}`}>{item.status}</span></td>
                        <td>
                          <div className="row-actions">
                            <button title={item.status === "Complete" ? "Reopen" : "Mark complete"} onClick={() => toggleComplete(item)}>
                              {item.status === "Complete" ? "↺" : "✓"}
                            </button>
                            <button title="Edit" onClick={() => openEditItem(item)}>✎</button>
                            {user?.canAssignCare && <button className="delete-button" title="Archive (recoverable)" onClick={() => deleteItem(item)}>×</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer>
          <span>Changes are attributed to the signed-in account.</span>
          <span>Pastoral care is personal. Keep identifying details to a minimum. · Commit {process.env.NEXT_PUBLIC_COMMIT_ID}</span>
        </footer>
      </div>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModalOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="care-form-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="section-label">Shepherding care</p>
                <h2 id="care-form-title">{editingId ? "Update care item" : "Add someone to remember"}</h2>
              </div>
              <button className="close-button" onClick={() => setModalOpen(false)} aria-label="Close">×</button>
            </div>
            <form onSubmit={saveItem}>
              <div className="form-grid">
                <Field label="Person" wide>
                  <input required autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Name" />
                </Field>
                <Field label="Care category">
                  <select required value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                    <option value="">Choose a category</option>
                    {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                  </select>
                </Field>
                <Field label="Care lane">
                  <select value={draft.lane} onChange={(event) => setDraft({ ...draft, lane: event.target.value as CareLane })}>
                    {LANES.map((lane) => <option key={lane}>{lane}</option>)}
                  </select>
                </Field>
                <Field label="Priority">
                  <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}>
                    {(["Urgent", "High", "Normal", "Low"] as Priority[]).map((priority) => <option key={priority}>{priority}</option>)}
                  </select>
                </Field>
                <Field label="Care need" wide>
                  <textarea value={draft.need} onChange={(event) => setDraft({ ...draft, need: event.target.value })} placeholder="A brief, dignifying description" rows={3} />
                </Field>
                <Field label="Last contact">
                  <input type="date" value={draft.lastContact} onChange={(event) => setDraft({ ...draft, lastContact: event.target.value })} />
                </Field>
                <Field label="Follow-up date">
                  <input type="date" value={draft.followUpDate} onChange={(event) => setDraft({ ...draft, followUpDate: event.target.value })} />
                </Field>
                <Field label="Next faithful step" wide>
                  <input value={draft.nextAction} onChange={(event) => setDraft({ ...draft, nextAction: event.target.value })} placeholder="Call, text, visit, schedule, or pray" />
                </Field>
                <Field label="Status">
                  <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Status })}>
                    {(["Open", "Scheduled", "Waiting", "Complete"] as Status[]).map((status) => <option key={status}>{status}</option>)}
                  </select>
                </Field>
                <Field label="Light notes">
                  <input value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Only what you need to follow through" />
                </Field>
                <Field label="Assigned volunteer" wide>
                  {user?.canAssignCare ? <select value={draft.assignedUserId} onChange={(event) => {
                    const selected = volunteers.find((entry) => entry.id === event.target.value);
                    setDraft({ ...draft, assignedUserId: event.target.value, assignedTo: selected?.name ?? "", assignedEmail: selected?.notificationEmail ?? selected?.email ?? "" });
                  }}><option value="">Unassigned</option>{volunteers.filter((entry) => entry.active !== false).map((entry) => <option value={entry.id} key={entry.id}>{entry.name} · {entry.notificationEmail || entry.email}</option>)}</select> : <input value={draft.assignedTo} readOnly />}
                </Field>
              </div>
              <div className="form-note">Keep sensitive counseling, medical, or family details out of this dashboard.</div>
              <div className="form-actions">
                <button type="button" className="text-button" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="primary-button">{editingId ? "Save changes" : "Add care item"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function AccessGate({
  checking,
  email,
  setEmail,
  password,
  setPassword,
  error,
  onSubmit,
}: {
  checking: boolean;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="access-shell">
      <section className="access-card">
        <div className="access-mark" aria-hidden="true">W</div>
        <p className="section-label">Wake Church · Shepherding</p>
        <h1>Pastoral Care Workspace</h1>
        <p className="access-copy">A shared place to remember people, keep promises, and take the next faithful step.</p>
        {checking ? (
          <div className="access-loading">Checking access…</div>
        ) : (
          <form onSubmit={onSubmit}>
            <label className="access-field">
              <span>Email or username</span>
              <input autoFocus required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="username" />
            </label>
            <label className="access-field">
              <span>Password</span>
              <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" />
            </label>
            {error && <p className="access-error" role="alert">{error}</p>}
            <button className="primary-button" type="submit">Sign in</button>
          </form>
        )}
        <p className="access-note">Use only enough detail to coordinate care. Keep counseling, medical, and family information elsewhere.</p>
      </section>
    </main>
  );
}

function RhythmItem({ day, text }: { day: string; text: string }) {
  return (
    <div className="rhythm-item">
      <span>{day}</span>
      <p>{text}</p>
    </div>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "field wide" : "field"}><span>{label}</span>{children}</label>;
}
