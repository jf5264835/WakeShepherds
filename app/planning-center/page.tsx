"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type User = { canManageUsers: boolean };
type Person = {
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
type Workflow = { id: string; name: string; readyCards: number };
type WorkflowCard = {
  id: string;
  workflowId: string;
  workflowName: string;
  step: string;
  assignee: string;
  overdue: boolean;
  snoozedUntil: string;
};

const emptyPerson = { firstName: "", lastName: "", email: "", phone: "" };

export default function PlanningCenterPage() {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [personWorkflows, setPersonWorkflows] = useState<WorkflowCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newPerson, setNewPerson] = useState(emptyPerson);
  const [duplicates, setDuplicates] = useState<Person[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => void (async () => {
      const session = await fetch("/api/session", { cache: "no-store" });
      const sessionResult = await session.json() as { user?: User };
      if (!sessionResult.user?.canManageUsers) {
        window.location.href = "/";
        return;
      }
      const response = await fetch("/api/planning-center/workflows", { cache: "no-store" });
      const result = await response.json() as { workflows?: Workflow[]; error?: string };
      if (!response.ok) setError(result.error ?? "Planning Center workflows could not be loaded.");
      else setWorkflows(result.workflows ?? []);
      setLoading(false);
    })(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function search(event?: FormEvent) {
    event?.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setError("");
    setNotice("");
    const response = await fetch(`/api/planning-center/people?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
    const result = await response.json() as { people?: Person[]; error?: string };
    if (!response.ok) setError(result.error ?? "Planning Center lookup failed.");
    else setPeople(result.people ?? []);
    setSearching(false);
  }

  async function choosePerson(person: Person) {
    setSelectedPerson(person);
    setSelectedWorkflowId("");
    setPersonWorkflows([]);
    setError("");
    const response = await fetch(`/api/planning-center/people?id=${encodeURIComponent(person.id)}`, { cache: "no-store" });
    const result = await response.json() as { workflows?: WorkflowCard[]; error?: string };
    if (!response.ok) setError(result.error ?? "Current workflows could not be loaded.");
    else setPersonWorkflows(result.workflows ?? []);
  }

  async function enroll() {
    if (!selectedPerson || !selectedWorkflowId) return;
    setError("");
    setNotice("");
    const response = await fetch("/api/planning-center/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personId: selectedPerson.id,
        workflowId: selectedWorkflowId,
        confirmed: true,
      }),
    });
    const result = await response.json() as { error?: string; workflow?: Workflow };
    if (!response.ok) {
      setError(result.error ?? "Workflow enrollment failed.");
      setReviewing(false);
      return;
    }
    setNotice(`${selectedPerson.name} was added to ${result.workflow?.name ?? "the selected workflow"}.`);
    setReviewing(false);
    await choosePerson(selectedPerson);
  }

  async function createPerson(forceCreate = false) {
    setError("");
    setNotice("");
    const response = await fetch("/api/planning-center/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newPerson, confirmed: true, forceCreate }),
    });
    const result = await response.json() as { error?: string; person?: Person; duplicates?: Person[] };
    if (response.status === 409) {
      setDuplicates(result.duplicates ?? []);
      return;
    }
    if (!response.ok || !result.person) {
      setError(result.error ?? "Planning Center person could not be created.");
      return;
    }
    setNotice(`${result.person.name} was created in Planning Center.`);
    setCreateOpen(false);
    setDuplicates([]);
    setNewPerson(emptyPerson);
    setQuery(result.person.email || result.person.name);
    setPeople([result.person]);
    await choosePerson(result.person);
  }

  const selectedWorkflow = workflows.find((workflow) => workflow.id === selectedWorkflowId);

  if (loading) {
    return <main className="pco-shell"><div className="empty-state">Connecting to Planning Center…</div></main>;
  }

  return (
    <main className="pco-shell">
      <header className="pco-header">
        <div>
          <p className="section-label">Wake Church · Secure integration</p>
          <h1>Planning Center People</h1>
          <p>Find the right person, review current care workflows, and make confirmed changes with an audit trail.</p>
        </div>
        <div className="pco-header-actions">
          <Link className="text-button" href="/">← Care dashboard</Link>
          <Link className="text-button" href="/admin">Connection settings</Link>
          <button className="primary-button" onClick={() => { setDuplicates([]); setCreateOpen(true); }}>＋ New person</button>
        </div>
      </header>

      <section className="pco-search-panel">
        <form onSubmit={search}>
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email, or phone"
            aria-label="Search Planning Center People"
          />
          <button className="secondary-button" type="submit" disabled={searching || query.trim().length < 2}>
            {searching ? "Searching…" : "Search People"}
          </button>
        </form>
        <p>Directory fields only. Medical notes, giving, and background-check information are not retrieved.</p>
      </section>

      {error && <div className="error-banner pco-banner">{error}</div>}
      {notice && <div className="notice-banner pco-banner">{notice}</div>}

      <section className="pco-workspace">
        <article className="pco-results">
          <div className="pco-section-heading">
            <div><p className="section-label">Matches</p><h2>People</h2></div>
            <span>{people.length} found</span>
          </div>
          <div className="pco-person-list">
            {people.map((person) => (
              <button
                key={person.id}
                className={selectedPerson?.id === person.id ? "pco-person active" : "pco-person"}
                onClick={() => void choosePerson(person)}
              >
                <span>{person.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                <div>
                  <strong>{person.name}</strong>
                  <small>{person.email || person.phone || "No contact information"}</small>
                  <small>{[person.household, person.campus].filter(Boolean).join(" · ") || "Household and campus not listed"}</small>
                </div>
                <b>›</b>
              </button>
            ))}
            {!people.length && <div className="empty-state"><div><h3>Search Planning Center</h3><p>Use enough detail to distinguish the person before making a change.</p></div></div>}
          </div>
        </article>

        <article className="pco-profile">
          {selectedPerson ? (
            <>
              <div className="pco-profile-heading">
                <div>
                  <p className="section-label">Selected person</p>
                  <h2>{selectedPerson.name}</h2>
                  <p>Planning Center ID {selectedPerson.id}</p>
                </div>
                <span className="verified-pill">Identity selected</span>
              </div>
              <div className="pco-facts">
                <span><b>Email</b>{selectedPerson.email || "Not listed"}</span>
                <span><b>Phone</b>{selectedPerson.phone || "Not listed"}</span>
                <span><b>Household</b>{selectedPerson.household || "Not listed"}</span>
                <span><b>Campus</b>{selectedPerson.campus || "Not listed"}</span>
              </div>
              <section className="pco-current-workflows">
                <h3>Current workflows</h3>
                {personWorkflows.length ? personWorkflows.map((card) => (
                  <div key={card.id}>
                    <div><strong>{card.workflowName || "Workflow"}</strong><span>{card.step || "Current step"}{card.assignee ? ` · ${card.assignee}` : ""}</span></div>
                    {card.overdue && <b>Overdue</b>}
                  </div>
                )) : <p>No active workflow cards found.</p>}
              </section>
              <section className="pco-enroll">
                <label>
                  <span>Add to a new workflow</span>
                  <select value={selectedWorkflowId} onChange={(event) => setSelectedWorkflowId(event.target.value)}>
                    <option value="">Choose a workflow</option>
                    {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
                  </select>
                </label>
                <button className="primary-button" disabled={!selectedWorkflowId} onClick={() => setReviewing(true)}>Review change</button>
              </section>
            </>
          ) : (
            <div className="empty-state"><div><h3>Select a person</h3><p>Their directory information and active workflow cards will appear here.</p></div></div>
          )}
        </article>
      </section>

      {reviewing && selectedPerson && selectedWorkflow && (
        <div className="modal-backdrop" onMouseDown={() => setReviewing(false)}>
          <section className="confirm-card" onMouseDown={(event) => event.stopPropagation()}>
            <p className="section-label">Confirm Planning Center change</p>
            <h2>Add {selectedPerson.name}?</h2>
            <div className="confirm-mapping"><span>Person</span><strong>{selectedPerson.name}</strong><span>Workflow</span><strong>{selectedWorkflow.name}</strong></div>
            <p>This creates a new workflow card and may notify the first-step assignee.</p>
            <div className="form-actions"><button className="text-button" onClick={() => setReviewing(false)}>Cancel</button><button className="primary-button" onClick={() => void enroll()}>Confirm and add</button></div>
          </section>
        </div>
      )}

      {createOpen && (
        <div className="modal-backdrop" onMouseDown={() => setCreateOpen(false)}>
          <section className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><p className="section-label">Planning Center People</p><h2>Create a person</h2></div><button className="close-button" onClick={() => setCreateOpen(false)}>×</button></div>
            <form onSubmit={(event) => { event.preventDefault(); void createPerson(false); }}>
              <div className="form-grid">
                <label className="field"><span>First name</span><input required value={newPerson.firstName} onChange={(event) => setNewPerson({ ...newPerson, firstName: event.target.value })} /></label>
                <label className="field"><span>Last name</span><input required value={newPerson.lastName} onChange={(event) => setNewPerson({ ...newPerson, lastName: event.target.value })} /></label>
                <label className="field"><span>Email</span><input type="email" value={newPerson.email} onChange={(event) => setNewPerson({ ...newPerson, email: event.target.value })} /></label>
                <label className="field"><span>Phone</span><input value={newPerson.phone} onChange={(event) => setNewPerson({ ...newPerson, phone: event.target.value })} /></label>
              </div>
              {duplicates.length > 0 && <div className="duplicate-warning"><strong>Possible matches found</strong><p>Review these people before creating a separate record.</p>{duplicates.map((person) => <button type="button" key={person.id} onClick={() => { setCreateOpen(false); setPeople(duplicates); void choosePerson(person); }}>{person.name} · {person.email || person.phone || person.id}</button>)}<button type="button" className="text-button" onClick={() => void createPerson(true)}>None of these—create separately</button></div>}
              <div className="form-actions"><button type="button" className="text-button" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primary-button" type="submit">Check and create</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
