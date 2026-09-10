import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, Trash2, Search, Coins, Lock, Users, MessageSquare,
  Rss, Ban, KeyRound, RotateCcw
} from 'lucide-react';
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc, setDoc, getDoc,
  increment, serverTimestamp, query, limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL, PERMISSIONS } from '../lib/schema';
import { useSession } from '../lib/session';
import { PageHead, Empty, Loader, Modal, Field, ErrorNote, Tabs, Toast, UserLink } from '../components/ui';
import Avatar from '../components/Avatar';

// A second step before the panel opens. This is a screen lock, not security —
// the real gate is the Owner role, enforced by Firestore rules on the server.
const PANEL_PIN = '244240';
const PIN_KEY = 'astral-owner-unlocked';

export default function OwnerPage() {
  const { isOwner } = useSession();
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem(PIN_KEY) === '1'; } catch { return false; }
  });
  const [tab, setTab] = useState('deletions');

  if (!isOwner) {
    return <Empty icon={Lock} title="Owners only" body="This panel is limited to the Owner account." />;
  }

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="stack">
      <PageHead
        eyebrow="Astral Memes"
        title="Owner panel"
        actions={
          <button
            className="btn btn-sm"
            onClick={() => {
              try { sessionStorage.removeItem(PIN_KEY); } catch { /* ignore */ }
              setUnlocked(false);
            }}
          >
            <Lock size={13} /> Lock
          </button>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'deletions', label: 'Deleted content' },
          { value: 'people', label: 'People' },
          { value: 'groups', label: 'Groups' }
        ]}
      />

      {tab === 'deletions' && <Deletions />}
      {tab === 'people' && <People />}
      {tab === 'groups' && <Groups />}
    </div>
  );
}

function PinGate({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (pin !== PANEL_PIN) { setError('Wrong code.'); setPin(''); return; }
    try { sessionStorage.setItem(PIN_KEY, '1'); } catch { /* ignore */ }
    onUnlock();
  };

  return (
    <div className="stack content-narrow">
      <PageHead eyebrow="Astral Memes" title="Owner panel" />
      <form className="card" onSubmit={submit}>
        <div className="row" style={{ marginBottom: 14 }}>
          <span className="tile-icon"><ShieldCheck size={18} /></span>
          <div>
            <strong>Enter your code</strong>
            <p className="faint">Keeps the panel shut if you leave the tab open.</p>
          </div>
        </div>
        <Field label="Code">
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" type="submit"><KeyRound size={15} /> Unlock</button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------- deletions */

function Deletions() {
  const [rows, setRows] = useState(null);
  const [term, setTerm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => onSnapshot(
    query(collection(db, COL.deletionLog), limit(500)),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => ms(b.deletedAt) - ms(a.deletedAt));
      setRows(list);
    },
    (err) => { setError(err.message); setRows([]); }
  ), []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const t = term.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      String(r.text || '').toLowerCase().includes(t)
      || String(r.authorName || '').toLowerCase().includes(t)
      || String(r.deletedByName || '').toLowerCase().includes(t)
    );
  }, [rows, term]);

  if (rows === null) return <Loader label="Loading deletions…" />;

  return (
    <>
      <label className="search">
        <Search size={15} />
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search deleted content…" />
      </label>

      <ErrorNote>{error}</ErrorNote>

      {!filtered.length ? (
        <Empty
          icon={Trash2}
          title="Nothing deleted yet."
          body="Anything a member removes shows up here, with what it said."
        />
      ) : (
        <div className="list">
          {filtered.map((r) => (
            <article key={r.id} className="card">
              <div className="spread" style={{ marginBottom: 8 }}>
                <span className="row">
                  <span className="chip">
                    {r.kind === 'post' ? <Rss size={12} /> : <MessageSquare size={12} />} {r.kind}
                  </span>
                  {r.groupId && <span className="chip">group</span>}
                  {r.thread === 'the-lounge' && <span className="chip">lounge</span>}
                  {r.selfDelete
                    ? <span className="chip">deleted their own</span>
                    : <span className="chip chip-accent">removed by a moderator</span>}
                </span>
                <span className="faint">{when(r.deletedAt)}</span>
              </div>

              <blockquote className="deleted-text">{r.text || <em className="faint">(no text)</em>}</blockquote>
              {r.imageUrl && <p className="faint truncate">image: {r.imageUrl}</p>}

              <div className="wrap" style={{ marginTop: 10 }}>
                <span className="faint">by</span>
                <UserLink to={r.authorUid}>{r.authorName || 'Unknown'}</UserLink>
                {!r.selfDelete && (
                  <>
                    <span className="faint">· removed by</span>
                    <UserLink to={r.deletedBy}>{r.deletedByName || 'Unknown'}</UserLink>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- people */

function People() {
  const { roles, accountId } = useSession();
  const [accounts, setAccounts] = useState(null);
  const [wallets, setWallets] = useState({});
  const [term, setTerm] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => onSnapshot(
    collection(db, COL.accounts),
    (snap) => setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { setError(err.message); setAccounts([]); }
  ), []);

  useEffect(() => onSnapshot(
    collection(db, COL.wallets),
    (snap) => {
      const next = {};
      snap.docs.forEach((d) => { next[d.id] = d.data(); });
      setWallets(next);
    },
    () => setWallets({})
  ), []);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  const filtered = useMemo(() => {
    if (!accounts) return [];
    const t = term.trim().toLowerCase();
    if (!t) return accounts;
    return accounts.filter((a) =>
      String(a.displayName || '').toLowerCase().includes(t)
      || String(a.username || '').toLowerCase().includes(t)
    );
  }, [accounts, term]);

  if (accounts === null) return <Loader label="Loading people…" />;

  return (
    <>
      <label className="search">
        <Search size={15} />
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search members…" />
      </label>

      <ErrorNote>{error}</ErrorNote>

      <div className="list">
        {filtered.map((a) => (
          <div key={a.id} className="row-item" style={{ flexWrap: 'wrap' }}>
            <Avatar profile={a} size={34} />
            <span className="me-text grow">
              <strong className="truncate">{a.displayName || 'Astral member'}</strong>
              <small>{a.username ? `@${a.username}` : a.id.slice(0, 10)}</small>
            </span>
            <span className="chip"><Coins size={12} /> {(wallets[a.id]?.balance ?? 0).toLocaleString()}</span>
            {(a.roleIds || []).includes('owner') && <span className="chip chip-accent">Owner</span>}
            {a.suspended && <span className="chip" style={{ color: 'var(--danger)' }}><Ban size={12} /> suspended</span>}
            <button className="btn btn-sm" onClick={() => setEditing(a)}>Edit</button>
          </div>
        ))}
      </div>

      {editing && (
        <EditPerson
          account={editing}
          roles={roles}
          balance={wallets[editing.id]?.balance ?? 0}
          meId={accountId}
          onClose={() => setEditing(null)}
          onSaved={flash}
        />
      )}

      {toast && <Toast>{toast}</Toast>}
    </>
  );
}

function EditPerson({ account, roles, balance, meId, onClose, onSaved }) {
  const [displayName, setDisplayName] = useState(account.displayName || '');
  const [bio, setBio] = useState(account.bio || '');
  const [picture, setPicture] = useState(account.picture || '');
  const [roleIds, setRoleIds] = useState(account.roleIds || []);
  const [perms, setPerms] = useState(
    Object.fromEntries((account.permissions || []).map((k) => [k, true]))
  );
  const [delta, setDelta] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isSelf = account.id === meId;

  const toggleRole = (id) =>
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));

  const save = async () => {
    setBusy(true); setError('');
    try {
      await updateDoc(doc(db, COL.accounts, account.id), {
        displayName: displayName.trim() || 'Astral member',
        bio: bio.trim(),
        picture: picture.trim() || '',
        roleIds,
        permissions: PERMISSIONS.filter((p) => perms[p.key]).map((p) => p.key)
      });

      const n = Number(delta);
      if (Number.isFinite(n) && n !== 0) {
        const ref = doc(db, COL.wallets, account.id);
        const snap = await getDoc(ref);
        if (snap.exists()) await updateDoc(ref, { balance: increment(n), updatedAt: serverTimestamp() });
        else await setDoc(ref, { balance: Math.max(0, n), lastSettledEntryId: '', lastRedemptionId: '', updatedAt: serverTimestamp() });
      }

      onSaved('Saved');
      onClose();
    } catch (err) { setError(err.message); setBusy(false); }
  };

  const suspend = async () => {
    try {
      await updateDoc(doc(db, COL.accounts, account.id), { suspended: !account.suspended });
      onSaved(account.suspended ? 'Unsuspended' : 'Suspended');
      onClose();
    } catch (err) { setError(err.message); }
  };

  return (
    <Modal
      title={`Edit · ${account.displayName || 'Astral member'}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <Field label="Display name">
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </Field>
      <Field label="Bio">
        <textarea rows={2} value={bio} onChange={(e) => setBio(e.target.value)} />
      </Field>
      <Field label="Picture URL">
        <input value={picture} onChange={(e) => setPicture(e.target.value)} placeholder="https://…" />
      </Field>

      <div>
        <span className="label">Roles</span>
        <div className="wrap" style={{ marginTop: 6 }}>
          {roles.map((r) => (
            <button
              key={r.id}
              className={roleIds.includes(r.id) ? 'chip chip-accent' : 'chip'}
              onClick={() => toggleRole(r.id)}
            >
              <span className="dot" style={{ background: r.color || 'currentColor' }} />
              {r.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="label">Extra permissions</span>
        <div className="stack" style={{ gap: 6, marginTop: 6 }}>
          {PERMISSIONS.map((p) => (
            <label key={p.key} className="row">
              <input
                type="checkbox"
                checked={!!perms[p.key]}
                onChange={(e) => setPerms({ ...perms, [p.key]: e.target.checked })}
              />
              <span>{p.label}</span>
            </label>
          ))}
        </div>
      </div>

      <Field label="Adjust coins" hint={`Current balance: ${balance.toLocaleString()}. Negative removes.`}>
        <input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
      </Field>

      <ErrorNote>{error}</ErrorNote>

      {!isSelf && (
        <button className="btn btn-danger" onClick={suspend}>
          <Ban size={14} /> {account.suspended ? 'Remove suspension' : 'Suspend this account'}
        </button>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------- groups */

function Groups() {
  const [groups, setGroups] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => onSnapshot(
    collection(db, COL.groups),
    (snap) => setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { setError(err.message); setGroups([]); }
  ), []);

  useEffect(() => onSnapshot(
    collection(db, COL.accounts),
    (snap) => setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setAccounts([])
  ), []);

  if (groups === null) return <Loader label="Loading groups…" />;

  return (
    <>
      <ErrorNote>{error}</ErrorNote>
      {!groups.length ? (
        <Empty icon={Users} title="No group chats yet." />
      ) : (
        <div className="list">
          {groups.map((g) => (
            <div key={g.id} className="card">
              <div className="spread">
                <div>
                  <strong>{g.name}</strong>
                  <p className="faint">{g.description || 'No description.'}</p>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => deleteDoc(doc(db, COL.groups, g.id)).catch((e) => setError(e.message))}
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
              <div className="wrap" style={{ marginTop: 10 }}>
                <span className="chip"><Users size={12} /> {(g.members || []).length}</span>
                {!!(g.requests || []).length && (
                  <span className="chip chip-accent">{(g.requests || []).length} waiting</span>
                )}
                <span className="faint">created by {nameOf(accounts, g.createdBy)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function nameOf(accounts, uid) {
  return accounts.find((a) => a.id === uid)?.displayName || 'Unknown';
}

function ms(ts) {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
}

function when(ts) {
  const t = ms(ts);
  if (!t) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
