import { useEffect, useMemo, useRef, useState } from 'react';
import { AccountApp } from './AccountApp.js';
import { createDemoStore, type BrowserStorage, type DemoState } from './demo.js';
import './styles.css';

function DemoApp({
  storage,
  onEnterAccount,
}: {
  storage: BrowserStorage;
  onEnterAccount: () => void;
}) {
  const store = useMemo(() => createDemoStore(storage), [storage]);
  const [state, setState] = useState<DemoState>(() => store.snapshot());
  const [announcement, setAnnouncement] = useState(
    'Demo ready. No account or network connection is used.',
  );

  const completeChore = (id: string) => {
    store.completeChore(id);
    setState(store.snapshot());
    setAnnouncement('Chore marked complete in this browser-only demo.');
  };

  const reset = () => {
    store.reset();
    setState(store.snapshot());
    setAnnouncement('Synthetic demo data reset.');
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to household overview
      </a>
      <header className="topbar">
        <div>
          <p className="eyebrow">Sunbeam House</p>
          <h1>Household Coordinator</h1>
        </div>
        <div className="topbar-actions">
          <span className="demo-badge">Synthetic demo — browser only</span>
          <button className="secondary" type="button" onClick={onEnterAccount}>
            Use an account
          </button>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="hero" aria-labelledby="today-heading">
          <div>
            <p className="eyebrow">Today</p>
            <h2 id="today-heading">A calmer shared home</h2>
            <p>
              Coordinate everyday chores, shopping, and routine pet care without exposing private
              household data.
            </p>
          </div>
          <button className="secondary" type="button" onClick={reset}>
            Reset demo data
          </button>
        </section>

        <div className="status-strip" aria-label="Connection and privacy status">
          <span>
            <strong>Demo:</strong> isolated
          </span>
          <span>
            <strong>Network:</strong> no API writes
          </span>
          <span>
            <strong>Offline:</strong> ready after first load
          </span>
        </div>

        <div className="dashboard-grid">
          <section className="panel" aria-labelledby="chores-heading">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Shared work</p>
                <h2 id="chores-heading">Chores</h2>
              </div>
              <span>{state.chores.filter((item) => !item.completed).length} open</span>
            </div>
            <ul className="task-list">
              {state.chores.map((chore) => (
                <li key={chore.id} className={chore.completed ? 'is-complete' : ''}>
                  <label>
                    <input
                      type="checkbox"
                      aria-label={chore.title}
                      checked={chore.completed}
                      onChange={() => completeChore(chore.id)}
                    />
                    <span>
                      <strong>{chore.title}</strong>
                      <small>
                        {chore.due}
                        {chore.completed ? ' · Completed' : ' · Assigned to you'}
                      </small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel" aria-labelledby="groceries-heading">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Shared list</p>
                <h2 id="groceries-heading">Groceries</h2>
              </div>
              <span>{state.groceries.filter((item) => !item.checked).length} needed</span>
            </div>
            <ul className="simple-list">
              {state.groceries.map((item) => (
                <li key={item.id}>
                  <span className={item.checked ? 'strike' : ''}>{item.name}</span>
                  <span>
                    {item.quantity}
                    {item.checked ? ' · packed' : ''}
                  </span>
                </li>
              ))}
            </ul>
            <p className="recovery-note">
              Offline edits show <strong>Pending</strong> until synced. Conflicts require your
              choice; they are never silently overwritten.
            </p>
          </section>

          <section className="panel pet-panel" aria-labelledby="pet-heading">
            <div className="pet-identity" aria-hidden="true">
              P
            </div>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Routine care</p>
                <h2 id="pet-heading">{state.pet.name}</h2>
              </div>
              <span>{state.pet.species}</span>
            </div>
            <ul className="simple-list">
              {state.care.map((item) => (
                <li key={item.id}>
                  <span>{item.label}</span>
                  <span>{item.completed ? 'Complete' : 'Ready'}</span>
                </li>
              ))}
            </ul>
            <p className="recovery-note">
              Care notes are routine handoff records only — not medical advice.
            </p>
          </section>

          <section className="panel boundary-panel" aria-labelledby="ha-heading">
            <p className="eyebrow">Integration boundary</p>
            <h2 id="ha-heading">Home Assistant handoff</h2>
            <p>
              Not connected in this MVP. A future adapter may emit a narrow, user-approved
              completion event. Home Assistant remains the only smart-home authority.
            </p>
            <span className="locked">No device control · no entity copy · no token</span>
          </section>
        </div>

        <section className="guest-card" aria-labelledby="guest-heading">
          <div>
            <p className="eyebrow">Purpose-scoped sharing</p>
            <h2 id="guest-heading">Guest access expires by design</h2>
            <p>
              Owners can grant only named actions, such as viewing a grocery list. Revocation and
              expiry stop sync immediately.
            </p>
          </div>
          <div className="guest-example">
            <strong>Shopping helper</strong>
            <span>View groceries only</span>
            <span>Example expires in 45 minutes</span>
          </div>
        </section>
      </main>
      <footer>
        <p>
          Fictional data only. No analytics, advertising, live integrations, or public household
          realm.
        </p>
      </footer>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

export function App({ storage = window.localStorage }: { storage?: BrowserStorage }) {
  const [surface, setSurface] = useState<'demo' | 'account'>('demo');
  const switched = useRef(false);
  useEffect(() => {
    if (switched.current && surface === 'demo') document.getElementById('main')?.focus();
    switched.current = true;
  }, [surface]);
  return surface === 'demo' ? (
    <DemoApp storage={storage} onEnterAccount={() => setSurface('account')} />
  ) : (
    <AccountApp storage={storage} onBack={() => setSurface('demo')} />
  );
}
