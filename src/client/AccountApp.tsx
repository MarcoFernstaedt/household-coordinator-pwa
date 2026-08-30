import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AccountApi, ApiError, type Workspace } from './api.js';
import type { BrowserStorage } from './demo.js';
import { OfflineQueue, type QueuedOperation } from './offlineQueue.js';

const ACCOUNT_QUEUE_KEY = 'household-coordinator:account-queue:v1';

function formValue(fields: FormData, name: string): string {
  const value = fields.get(name);
  return typeof value === 'string' ? value : '';
}

export function AccountApp({ onBack, storage }: { onBack: () => void; storage: BrowserStorage }) {
  const api = useMemo(() => new AccountApi(), []);
  const syncButtonRef = useRef<HTMLButtonElement>(null);
  const groceryHeadingRef = useRef<HTMLHeadingElement>(null);
  const guestHeadingRef = useRef<HTMLHeadingElement>(null);
  const queue = useMemo(
    () =>
      new OfflineQueue({
        get: () => storage.getItem(ACCOUNT_QUEUE_KEY),
        set: (value) => storage.setItem(ACCOUNT_QUEUE_KEY, value),
      }),
    [storage],
  );
  const [mode, setMode] = useState<'setup' | 'login'>('setup');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState<QueuedOperation[]>(() => queue.snapshot());
  const [guest, setGuest] = useState<{
    id: string;
    token: string;
    purpose: string;
    expiresAt: string;
    revoked: boolean;
  } | null>(null);
  const [memberMessage, setMemberMessage] = useState('');
  const [connection, setConnection] = useState<'online' | 'offline'>('online');
  const [message, setMessage] = useState('Enter your account details.');
  const activeQueued = workspace
    ? queued.filter(
        (item) => item.realmId === workspace.household.id && item.userId === workspace.user.id,
      )
    : [];

  useEffect(() => {
    document.getElementById(workspace ? 'workspace-heading' : 'auth-heading')?.focus();
  }, [mode, workspace]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage('Connecting securely…');
    const fields = new FormData(event.currentTarget);
    try {
      const next =
        mode === 'setup'
          ? await api.setup({
              householdName: formValue(fields, 'householdName'),
              displayName: formValue(fields, 'displayName'),
              email: formValue(fields, 'email'),
              password: formValue(fields, 'password'),
            })
          : await api.login({
              email: formValue(fields, 'email'),
              password: formValue(fields, 'password'),
            });
      setWorkspace(next);
      setMessage('Account workspace loaded.');
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Connection failed. Your input is preserved.',
      );
    } finally {
      setBusy(false);
    }
  };

  const addChore = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspace) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setMessage('Adding chore…');
    try {
      const chore = await api.write<Workspace['chores'][number]>(
        '/api/chores',
        'POST',
        {
          title: formValue(fields, 'title'),
          dueAt: new Date(formValue(fields, 'dueAt')).toISOString(),
          ...(formValue(fields, 'assignedTo')
            ? { assignedTo: formValue(fields, 'assignedTo') }
            : {}),
        },
        crypto.randomUUID(),
      );
      setWorkspace({ ...workspace, chores: [...workspace.chores, chore] });
      form.reset();
      setMessage('Chore added.');
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Chore was not added. Your input is preserved.',
      );
    }
  };

  const toggleChore = async (chore: Workspace['chores'][number]) => {
    if (!workspace) return;
    try {
      const result = await api.write<{
        completedAt: string | null;
        version: number;
      }>(
        `/api/chores/${chore.id}`,
        'PATCH',
        { action: chore.completedAt ? 'reopen' : 'complete', expectedVersion: chore.version },
        crypto.randomUUID(),
      );
      setWorkspace({
        ...workspace,
        chores: workspace.chores.map((item) =>
          item.id === chore.id
            ? { ...item, completedAt: result.completedAt, version: result.version }
            : item,
        ),
      });
      setMessage(result.completedAt ? 'Chore completed.' : 'Chore reopened.');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Chore change is still pending.');
    }
  };

  const addGrocery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspace) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = {
      name: formValue(fields, 'name'),
      quantity: formValue(fields, 'quantity'),
      note: formValue(fields, 'note'),
    };
    const key = crypto.randomUUID();
    setMessage('Adding grocery item…');
    try {
      const item = await api.write<Workspace['groceries'][number]>(
        '/api/groceries',
        'POST',
        body,
        key,
      );
      setWorkspace({ ...workspace, groceries: [...workspace.groceries, item] });
      setConnection('online');
      form.reset();
      setMessage('Grocery item added.');
    } catch (error) {
      if (!(error instanceof ApiError)) {
        queue.enqueue({
          realmId: workspace.household.id,
          userId: workspace.user.id,
          auth: { kind: 'account' },
          method: 'POST',
          path: '/api/groceries',
          body,
          idempotencyKey: key,
        });
        setQueued(queue.snapshot());
        setConnection('offline');
        form.reset();
        setMessage('Offline. Grocery item is Pending and has not been reported as saved.');
      } else {
        setMessage(error.message);
      }
    }
  };

  const toggleGrocery = async (item: Workspace['groceries'][number]) => {
    if (!workspace) return;
    try {
      const result = await api.write<{ checked: boolean; version: number }>(
        `/api/groceries/${item.id}`,
        'PATCH',
        { checked: !item.checked, expectedVersion: item.version },
        crypto.randomUUID(),
      );
      setWorkspace({
        ...workspace,
        groceries: workspace.groceries.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, checked: result.checked, version: result.version }
            : candidate,
        ),
      });
      setMessage(result.checked ? 'Grocery item checked.' : 'Grocery item unchecked.');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Grocery change was not saved.');
    }
  };

  const clearCompletedGroceries = async () => {
    if (!workspace) return;
    try {
      await api.write<{ cleared: number }>(
        '/api/groceries/completed',
        'DELETE',
        undefined,
        crypto.randomUUID(),
      );
      setWorkspace({
        ...workspace,
        groceries: workspace.groceries.filter((item) => !item.checked),
      });
      setMessage('Completed groceries cleared.');
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Completed groceries were not cleared.',
      );
    }
  };

  const addPet = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspace) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    try {
      const pet = await api.write<{ id: string; name: string; species: string }>(
        '/api/pets',
        'POST',
        {
          name: formValue(fields, 'name'),
          species: formValue(fields, 'species'),
        },
        crypto.randomUUID(),
      );
      setWorkspace({ ...workspace, pets: [...workspace.pets, { ...pet, routines: [] }] });
      form.reset();
      setMessage('Pet profile added.');
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : 'Pet profile was not added. Input is preserved.',
      );
    }
  };

  const addRoutine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspace) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const petId = formValue(fields, 'petId');
    try {
      const routine = await api.write<Workspace['pets'][number]['routines'][number]>(
        `/api/pets/${petId}/routines`,
        'POST',
        {
          kind: formValue(fields, 'kind') || 'feeding',
          label: formValue(fields, 'label'),
          schedule: formValue(fields, 'schedule'),
        },
        crypto.randomUUID(),
      );
      setWorkspace({
        ...workspace,
        pets: workspace.pets.map((pet) =>
          pet.id === petId ? { ...pet, routines: [...pet.routines, routine] } : pet,
        ),
      });
      form.reset();
      setMessage('Routine added. Routine records are not medical advice.');
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Routine was not added. Input is preserved.',
      );
    }
  };

  const completeRoutine = async (
    event: FormEvent<HTMLFormElement>,
    petId: string,
    routine: Workspace['pets'][number]['routines'][number],
  ) => {
    event.preventDefault();
    if (!workspace) return;
    const fields = new FormData(event.currentTarget);
    try {
      const result = await api.write<{
        completedAt: string;
        handoff: string;
        version: number;
      }>(
        `/api/pet-routines/${routine.id}/completions`,
        'POST',
        {
          expectedVersion: routine.version,
          handoff: formValue(fields, 'handoff'),
        },
        crypto.randomUUID(),
      );
      setWorkspace({
        ...workspace,
        pets: workspace.pets.map((pet) =>
          pet.id === petId
            ? {
                ...pet,
                routines: pet.routines.map((candidate) =>
                  candidate.id === routine.id
                    ? {
                        ...candidate,
                        lastCompletedAt: result.completedAt,
                        handoff: result.handoff,
                        version: result.version,
                      }
                    : candidate,
                ),
              }
            : pet,
        ),
      });
      setMessage('Pet-care routine completed with handoff preserved.');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Routine completion was not saved.');
    }
  };

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    try {
      const member = await api.write<{
        id: string;
        displayName: string;
        role: 'member';
      }>('/api/members', 'POST', {
        displayName: formValue(fields, 'displayName'),
        email: formValue(fields, 'email'),
        password: formValue(fields, 'password'),
      });
      if (workspace) setWorkspace({ ...workspace, members: [...workspace.members, member] });
      form.reset();
      setMemberMessage(`Member ${member.displayName} created.`);
      setMessage(`Member ${member.displayName} created.`);
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : 'Member was not created. Input is preserved.',
      );
    }
  };

  const signOut = async () => {
    try {
      await api.logout();
      setWorkspace(null);
      setGuest(null);
      setMode('login');
      setMessage('Signed out.');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Sign out failed. Try again.');
    }
  };

  const createGuest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setMessage('Creating scoped guest…');
    try {
      const created = await api.write<{
        id: string;
        token: string;
        purpose: string;
        expiresAt: string;
      }>('/api/guests', 'POST', {
        purpose: formValue(fields, 'purpose'),
        actions: ['groceries:read'],
        expiresAt: new Date(formValue(fields, 'expiresAt')).toISOString(),
      });
      setGuest({ ...created, revoked: false });
      form.reset();
      setMessage('Guest created. Copy the credential now; it is shown once.');
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : 'Guest was not created. Your input is preserved.',
      );
    }
  };

  const revokeGuest = async () => {
    if (!guest) return;
    await api.write(`/api/guests/${guest.id}`, 'DELETE');
    setGuest({ ...guest, revoked: true, token: '' });
    setMessage('Guest revoked. Further access and sync are blocked.');
    setTimeout(() => guestHeadingRef.current?.focus(), 0);
  };

  const retryQueued = (operation: QueuedOperation) => {
    if (!queue.retryConflict(operation.id)) return;
    setQueued(queue.snapshot());
    setMessage('Conflict updated to the server version and is Pending your next sync.');
    setTimeout(() => syncButtonRef.current?.focus(), 0);
  };

  const discardQueued = (operation: QueuedOperation) => {
    queue.discard(operation.id);
    setQueued(queue.snapshot());
    setMessage('Local queued change discarded. Server data was not changed.');
    setTimeout(() => groceryHeadingRef.current?.focus(), 0);
  };

  const syncQueued = async () => {
    if (!workspace) return;
    setMessage('Syncing pending changes…');
    await queue.flush(
      async (operation) => {
        try {
          const result = await api.write<Record<string, unknown>>(
            operation.path,
            operation.method,
            operation.body,
            operation.idempotencyKey,
          );
          return { status: 200, body: result };
        } catch (error) {
          if (error instanceof ApiError) return { status: error.status, body: error.payload };
          throw error;
        }
      },
      workspace.household.id,
      workspace.user.id,
      new Date(),
    );
    const snapshot = queue.snapshot();
    const remainingActive = snapshot.filter(
      (item) => item.realmId === workspace.household.id && item.userId === workspace.user.id,
    );
    setQueued(snapshot);
    setConnection(remainingActive.some((item) => item.status === 'pending') ? 'offline' : 'online');
    if (remainingActive.length === 0) {
      setWorkspace(await api.workspace());
      setMessage('Pending changes synced.');
    } else if (remainingActive.some((item) => item.status === 'conflict')) {
      setMessage('A conflict needs your choice. Local input is preserved.');
    } else {
      setMessage('Still offline. Pending changes remain queued.');
    }
  };

  if (workspace) {
    return (
      <div className="app-shell account-shell">
        <a className="skip-link" href="#account-main">
          Skip to account workspace
        </a>
        <header className="topbar">
          <div>
            <p className="eyebrow">Private self-hosted account</p>
            <h1>Household Coordinator</h1>
          </div>
          <div className="topbar-actions">
            <button className="secondary" type="button" onClick={() => void signOut()}>
              Sign out
            </button>
            <button className="secondary" type="button" onClick={onBack}>
              Return to synthetic demo
            </button>
          </div>
        </header>
        <main id="account-main" tabIndex={-1}>
          <section className="hero compact-hero" aria-labelledby="workspace-heading">
            <div>
              <p className="eyebrow">Authenticated realm</p>
              <h2 id="workspace-heading" tabIndex={-1}>
                {workspace.household.name} workspace
              </h2>
              <p>
                Signed in as {workspace.user.displayName} ({workspace.user.role})
              </p>
            </div>
          </section>
          <div className="status-strip" aria-label="Account connection status">
            <span>
              <strong>Connection:</strong> {connection}
            </span>
            <span>
              <strong>Queued changes:</strong> {activeQueued.length}
            </span>
            <span>
              <strong>Conflicts:</strong>{' '}
              {activeQueued.filter((item) => item.status === 'conflict').length}
            </span>
          </div>
          {activeQueued.length > 0 && (
            <div className="queue-actions">
              <button
                ref={syncButtonRef}
                className="secondary"
                type="button"
                onClick={() => void syncQueued()}
              >
                Sync pending changes
              </button>
              <p>Only a confirmed server response removes a queued change.</p>
            </div>
          )}
          <div className="dashboard-grid">
            <section className="panel" aria-labelledby="account-chores-heading">
              <h2 id="account-chores-heading">Chores</h2>
              {workspace.chores.length ? (
                <ul className="task-list">
                  {workspace.chores.map((chore) => (
                    <li key={chore.id} className={chore.completedAt ? 'is-complete' : ''}>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={chore.title}
                          checked={Boolean(chore.completedAt)}
                          onChange={() => void toggleChore(chore)}
                        />
                        <span>
                          <strong>{chore.title}</strong>
                          <small>
                            {chore.completedAt
                              ? 'Completed'
                              : new Date(chore.dueAt).toLocaleString()}
                          </small>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No chores yet. Add the first shared task.</p>
              )}
              <form className="inline-form" onSubmit={(event) => void addChore(event)}>
                <label>
                  Chore title
                  <input name="title" required maxLength={120} />
                </label>
                <label>
                  Due date and time
                  <input name="dueAt" type="datetime-local" required />
                </label>
                <label>
                  Assign to household member
                  <select name="assignedTo" defaultValue="">
                    <option value="">Unassigned</option>
                    {workspace.members.map((member) => (
                      <option value={member.id} key={member.id}>
                        {member.displayName} ({member.role})
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary" type="submit">
                  Add chore
                </button>
              </form>
            </section>
            <section className="panel" aria-labelledby="account-groceries-heading">
              <h2 id="account-groceries-heading" ref={groceryHeadingRef} tabIndex={-1}>
                Groceries
              </h2>
              {workspace.groceries.length ? (
                <ul className="task-list">
                  {workspace.groceries.map((item) => (
                    <li key={item.id} className={item.checked ? 'is-complete' : ''}>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={item.name}
                          checked={item.checked}
                          onChange={() => void toggleGrocery(item)}
                        />
                        <span>
                          <strong>{item.name}</strong>
                          <small>
                            {item.quantity}
                            {item.note ? ` · ${item.note}` : ''}
                          </small>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No grocery items yet. Add what the household needs.</p>
              )}
              {activeQueued
                .filter((operation) => operation.path === '/api/groceries')
                .map((operation) => {
                  const candidate = (operation.body as { name?: unknown }).name;
                  const label = typeof candidate === 'string' ? candidate : 'Grocery change';
                  return (
                    <div className={`queue-state ${operation.status}`} key={operation.id}>
                      <p>
                        {operation.status === 'pending' ? 'Pending' : operation.status}: {label}
                      </p>
                      {operation.status === 'conflict' && operation.conflictVersion && (
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => retryQueued(operation)}
                        >
                          Retry local change using server version {operation.conflictVersion}
                        </button>
                      )}
                      {(operation.status === 'conflict' || operation.status === 'blocked') && (
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => discardQueued(operation)}
                        >
                          Discard local change for {label}
                        </button>
                      )}
                    </div>
                  );
                })}
              {workspace.groceries.some((item) => item.checked) && (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void clearCompletedGroceries()}
                >
                  Clear completed groceries
                </button>
              )}
              <form className="inline-form" onSubmit={(event) => void addGrocery(event)}>
                <label>
                  Grocery item
                  <input name="name" required maxLength={100} />
                </label>
                <label>
                  Quantity
                  <input name="quantity" required maxLength={40} />
                </label>
                <label>
                  Note
                  <input name="note" maxLength={160} />
                </label>
                <button className="primary" type="submit">
                  Add grocery item
                </button>
              </form>
            </section>
            <section className="panel" aria-labelledby="account-pets-heading">
              <h2 id="account-pets-heading">Pet care</h2>
              {workspace.pets.length ? (
                <ul className="care-list">
                  {workspace.pets.map((pet) => (
                    <li key={pet.id}>
                      <strong>{pet.name}</strong> ({pet.species})
                      {pet.routines.length > 0 && (
                        <ul>
                          {pet.routines.map((routine) => (
                            <li key={routine.id}>
                              <strong>
                                {routine.label} · {routine.schedule}
                              </strong>
                              {routine.lastCompletedAt && (
                                <p>
                                  Last completed:{' '}
                                  {new Date(routine.lastCompletedAt).toLocaleString()}
                                </p>
                              )}
                              {routine.handoff && <p>Handoff: {routine.handoff}</p>}
                              <form
                                className="inline-form"
                                onSubmit={(event) => void completeRoutine(event, pet.id, routine)}
                              >
                                <label>
                                  Handoff note for {routine.label}
                                  <input name="handoff" maxLength={240} />
                                </label>
                                <button className="secondary" type="submit">
                                  Complete {routine.label}
                                </button>
                              </form>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No pet-care profiles yet.</p>
              )}
              <form className="inline-form" onSubmit={(event) => void addPet(event)}>
                <label>
                  Pet name
                  <input name="name" required maxLength={80} />
                </label>
                <label>
                  Species
                  <input name="species" required maxLength={40} />
                </label>
                <button className="primary" type="submit">
                  Add pet profile
                </button>
              </form>
              {workspace.pets.length > 0 && (
                <form className="inline-form" onSubmit={(event) => void addRoutine(event)}>
                  <label>
                    Pet profile
                    <select name="petId" required defaultValue={workspace.pets[0]?.id}>
                      {workspace.pets.map((pet) => (
                        <option value={pet.id} key={pet.id}>
                          {pet.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Routine type
                    <select name="kind" defaultValue="walk">
                      <option value="feeding">Feeding</option>
                      <option value="walk">Walk</option>
                      <option value="medication-note">Medication note record</option>
                    </select>
                  </label>
                  <label>
                    Routine label
                    <input name="label" required maxLength={120} />
                  </label>
                  <label>
                    Schedule
                    <input name="schedule" required maxLength={80} />
                  </label>
                  <button className="primary" type="submit">
                    Add routine
                  </button>
                  <p className="recovery-note">Routine record only — not medical advice.</p>
                </form>
              )}
            </section>
            {workspace.user.role === 'owner' && (
              <section className="panel" aria-labelledby="account-members-heading">
                <h2 id="account-members-heading">Household members</h2>
                <p>Owners can create a separate member account in this household only.</p>
                <form className="inline-form" onSubmit={(event) => void addMember(event)}>
                  <label>
                    Member name
                    <input name="displayName" required maxLength={80} />
                  </label>
                  <label>
                    Member email
                    <input name="email" type="email" required maxLength={254} />
                  </label>
                  <label>
                    Temporary member password
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={14}
                      maxLength={128}
                    />
                  </label>
                  <button className="primary" type="submit">
                    Add household member
                  </button>
                </form>
                {memberMessage && <p>{memberMessage}</p>}
              </section>
            )}
          </div>
          {workspace.user.role === 'owner' && (
            <section className="guest-card" aria-labelledby="account-guest-heading">
              <div>
                <p className="eyebrow">Scoped guest access</p>
                <h2 id="account-guest-heading" ref={guestHeadingRef} tabIndex={-1}>
                  Temporary grocery viewer
                </h2>
                <form className="inline-form" onSubmit={(event) => void createGuest(event)}>
                  <label>
                    Guest purpose
                    <input name="purpose" required maxLength={120} />
                  </label>
                  <label>
                    Guest expiry
                    <input name="expiresAt" type="datetime-local" required />
                  </label>
                  <button className="primary" type="submit">
                    Create grocery viewing guest
                  </button>
                </form>
              </div>
              <div className="guest-example">
                {guest ? (
                  guest.revoked ? (
                    <strong>Guest revoked. Further access and sync are blocked.</strong>
                  ) : (
                    <>
                      <strong>{guest.purpose}</strong>
                      <span>Scope: view groceries only</span>
                      <span>Expires: {new Date(guest.expiresAt).toLocaleString()}</span>
                      <code>{guest.token}</code>
                      <button
                        className="secondary inverse"
                        type="button"
                        onClick={() => void revokeGuest()}
                      >
                        Revoke guest now
                      </button>
                    </>
                  )
                ) : (
                  <span>No active guest credential in this browser session.</span>
                )}
              </div>
            </section>
          )}
        </main>
        <p className="sr-only" aria-live="polite">
          {message}
        </p>
      </div>
    );
  }

  return (
    <div className="app-shell account-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Private self-hosted account</p>
          <h1>Household Coordinator</h1>
        </div>
        <button className="secondary" type="button" onClick={onBack}>
          Return to synthetic demo
        </button>
      </header>
      <main id="account-main" tabIndex={-1}>
        <section className="auth-card" aria-labelledby="auth-heading">
          <p className="eyebrow">{mode === 'setup' ? 'First owner' : 'Existing account'}</p>
          <h2 id="auth-heading" tabIndex={-1}>
            {mode === 'setup' ? 'Create a household' : 'Sign in'}
          </h2>
          <form onSubmit={(event) => void submit(event)}>
            {mode === 'setup' && (
              <>
                <label>
                  Household name
                  <input name="householdName" required maxLength={80} autoComplete="organization" />
                </label>
                <label>
                  Your name
                  <input name="displayName" required maxLength={80} autoComplete="name" />
                </label>
              </>
            )}
            <label>
              Email address
              <input name="email" type="email" required maxLength={254} autoComplete="email" />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={14}
                maxLength={128}
                autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
              />
            </label>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Connecting…' : mode === 'setup' ? 'Create household' : 'Sign in'}
            </button>
          </form>
          <button
            className="text-button"
            type="button"
            onClick={() => setMode((current) => (current === 'setup' ? 'login' : 'setup'))}
          >
            {mode === 'setup' ? 'I already have an account' : 'Set up the first owner'}
          </button>
          <p className="form-message" role="status">
            {message}
          </p>
        </section>
      </main>
    </div>
  );
}
