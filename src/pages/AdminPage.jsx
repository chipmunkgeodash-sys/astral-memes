import { useEffect, useMemo, useState } from 'react';
import { Coins, Shield, Search, Plus, Megaphone, Check, Trash2 } from 'lucide-react';
import {
  collection, onSnapshot, doc, setDoc, updateDoc, addDoc, deleteDoc,
  getDoc, increment, serverTimestamp, orderBy, query
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL, PERMISSIONS, OWNER_ROLE_ID } from '../lib/schema';
import { useSession } from '../lib/session';
import { PageHead, SectionHead, Empty, Loader, Modal, Field, ErrorNote, Tabs } from '../components/ui';
import Avatar from '../components/Avatar';

export default function AdminPage() {
  const { isOwner, can } = useSession();
  const [tab, setTab] = useState('members');

  if (!isOwner && !can('accessAdmin')) {
    return <Empty icon={Shield} title="Owner access only" body="Only an Owner can manage roles and permissions." />;
  }

  return (
    <div className="stack">
      <PageHead eyebrow="Community management" title="Admin" />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'members', label: 'Members' },
          { value: 'roles', label: 'Roles' },
          { value: 'announcements', label: 'Announcements' }
        ]}
      />
      {tab === 'members' && <Members />}
      {tab === 'roles' && <Roles />}
      {tab === 'announcements' && <Announcements />}
    </div>
  );
}

/* ---------------------------------------------------------------- members */

function Members() {
  const { isOwner, roles } = useSession();
  const [accounts, setAccounts] = useState(null);
  const [wallets, setWallets] = useState({});
  const [term, setTerm] = useState('');
  const [granting, setGranting] = useState(null);
  const [error, setError] = useState('');

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

  const filtered = useMemo(() => {
    if (!accounts) return [];
    const t = term.trim().toLowerCase();
    if (!t) return accounts;
    return accounts.filter((a) =>
      String(a.displayName || '').toLowerCase().includes(t) ||
      String(a.username || '').toLowerCase().includes(t)
    );
  }, [accounts, term]);

  const toggleRole = async (account, roleId) => {
    const next = new Set(account.roleIds || []);
    if (next.has(roleId)) next.delete(roleId); else next.add(roleId);
    try {
      await updateDoc(doc(db, COL.accounts, account.id), { roleIds: [...next] });
    } catch (err) { setError(err.message); }
  };

  if (accounts === null) return <Loader label="Loading members…" />;

  return (
    <>
      <label className="search">
        <Search size={15} />
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search members…" />
      </label>

      <ErrorNote>{error}</ErrorNote>

      {!filtered.length ? (
        <Empty icon={Shield} title="No members found." body="New members appear here when they create an account." />
      ) : (
        <div className="list">
          {filtered.map((a) => (
            <div key={a.id} className="row-item" style={{ flexWrap: 'wrap' }}>
              <Avatar profile={a} size={34} />
              <span className="me-text grow">
                <strong className="truncate">{a.displayName || 'Astral member'}</strong>
                <small>{a.username ? `@${a.username}` : a.id.slice(0, 8)}</small>
              </span>

              <span className="chip"><Coins size={13} /> {(wallets[a.id]?.balance ?? 0).toLocaleString()}</span>

              {isOwner && (
                <div className="wrap">
                  {roles.map((r) => {
                    const on = (a.roleIds || []).includes(r.id);
                    return (
                      <button
                        key={r.id}
                        className={on ? 'chip chip-accent' : 'chip'}
                        onClick={() => toggleRole(a, r.id)}
                        title={`Toggle ${r.name}`}
                      >
                        {on ? <Check size={11} /> : <span className="dot" style={{ background: r.color || 'currentColor' }} />}
                        {r.name}
                      </button>
                    );
                  })}
                  <button className="btn btn-sm" onClick={() => setGranting(a)}>
                    <Coins size={13} /> Coins
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {granting && (
        <GrantCoins
          account={granting}
          current={wallets[granting.id]?.balance ?? 0}
          onClose={() => setGranting(null)}
        />
      )}
    </>
  );
}

// Owner-only: adjust any member's balance up or down, with an audit row.
function GrantCoins({ account, current, onClose }) {
  const { user } = useSession();
  const [amount, setAmount] = useState(100);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const apply = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n === 0) { setError('Enter an amount other than zero.'); return; }
    if (current + n < 0) { setError(`That would go below zero — they have ${current.toLocaleString()}.`); return; }

    setBusy(true); setError('');
    try {
      const ref = doc(db, COL.wallets, account.id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, { balance: increment(n), updatedAt: serverTimestamp() });
      } else {
        await setDoc(ref, {
          balance: Math.max(0, n), lastSettledEntryId: '', lastRedemptionId: '', updatedAt: serverTimestamp()
        });
      }
      await addDoc(collection(db, COL.redemptions), {
        type: 'ownerGrant',
        uid: account.id,
        displayName: account.displayName || null,
        amount: n,
        note: note.trim() || null,
        grantedBy: user?.uid || null,
        createdAt: serverTimestamp()
      });
      onClose();
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal
      title={`Coins — ${account.displayName || 'Astral member'}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={apply} disabled={busy}>{busy ? 'Applying…' : 'Apply'}</button>
        </>
      }
    >
      <p className="muted">
        Balance: <strong>{current.toLocaleString()}</strong> → <strong>{(current + (Number(amount) || 0)).toLocaleString()}</strong>
      </p>
      <Field label="Amount" hint="Use a negative number to remove coins.">
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <div className="wrap">
        {[100, 500, 1000, 5000].map((v) => (
          <button key={v} className="chip" onClick={() => setAmount(v)}>+{v.toLocaleString()}</button>
        ))}
      </div>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why?" />
      </Field>
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}

/* ------------------------------------------------------------------ roles */

function Roles() {
  const { isOwner, roles } = useSession();
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  if (!isOwner) {
    return <Empty icon={Shield} title="Owner controls" body="Only an Owner can manage roles and permissions." />;
  }

  const save = async (role) => {
    if (!role.name.trim()) { setError('Give the role a name.'); return; }
    const clash = roles.find((r) => r.name.toLowerCase() === role.name.trim().toLowerCase() && r.id !== role.id);
    if (clash) { setError('A role with that name already exists.'); return; }
    try {
      const payload = {
        name: role.name.trim(),
        color: role.color || '#b9cce0',
        permissions: PERMISSIONS.filter((p) => role.perms[p.key]).map((p) => p.key)
      };
      if (role.id) await updateDoc(doc(db, COL.roles, role.id), payload);
      else await addDoc(collection(db, COL.roles), { ...payload, createdAt: serverTimestamp() });
      setEditing(null); setError('');
    } catch (err) { setError(err.message); }
  };

  const startEdit = (r) => setEditing({
    ...r,
    perms: Object.fromEntries((r.permissions || []).map((k) => [k, true]))
  });

  return (
    <>
      <SectionHead
        title="Roles"
        actions={
          <button className="btn btn-primary" onClick={() => setEditing({ name: '', color: '#b9cce0', perms: {} })}>
            <Plus size={15} /> Create role
          </button>
        }
      />
      <p className="muted" style={{ marginBottom: 14 }}>
        Everyone can see what each role includes. Owners control assignments.
      </p>
      <ErrorNote>{error}</ErrorNote>

      <div className="list">
        {roles.map((r) => (
          <div key={r.id} className="row-item" style={{ flexWrap: 'wrap' }}>
            <span className="dot" style={{ background: r.color || 'currentColor' }} />
            <strong className="grow">{r.name}</strong>
            <div className="wrap">
              {(r.permissions || []).length
                ? PERMISSIONS.filter((p) => (r.permissions || []).includes(p.key)).map((p) => (
                    <span key={p.key} className="chip">{p.label}</span>
                  ))
                : <span className="faint">No extra permissions</span>}
            </div>
            <button className="btn btn-sm" onClick={() => startEdit(r)}>Edit</button>
            {r.id !== OWNER_ROLE_ID && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => deleteDoc(doc(db, COL.roles, r.id)).catch((e) => setError(e.message))}
                aria-label={`Delete ${r.name}`}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <Modal
          title={editing.id ? 'Edit role' : 'Create role'}
          onClose={() => { setEditing(null); setError(''); }}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => save(editing)}>Save</button>
            </>
          }
        >
          <Field label="Name">
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </Field>
          <Field label="Colour">
            <input
              type="color"
              value={editing.color || '#b9cce0'}
              onChange={(e) => setEditing({ ...editing, color: e.target.value })}
              style={{ height: 38, padding: 4 }}
            />
          </Field>
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">Permissions</span>
            {PERMISSIONS.map((p) => (
              <label key={p.key} className="row">
                <input
                  type="checkbox"
                  checked={!!editing.perms[p.key]}
                  onChange={(e) => setEditing({ ...editing, perms: { ...editing.perms, [p.key]: e.target.checked } })}
                />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
          <p className="hint">The Owner role always has full access.</p>
          <ErrorNote>{error}</ErrorNote>
        </Modal>
      )}
    </>
  );
}

/* ---------------------------------------------------------- announcements */

function Announcements() {
  const { isOwner, can } = useSession();
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  const allowed = isOwner || can('manageAnnouncements');

  useEffect(() => onSnapshot(
    query(collection(db, COL.announcements), orderBy('createdAt', 'desc')),
    (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => setItems([])
  ), []);

  const publish = async () => {
    if (!title.trim() || !body.trim()) { setError('Add a title and announcement text.'); return; }
    try {
      await addDoc(collection(db, COL.announcements), {
        title: title.trim(), body: body.trim(), createdAt: serverTimestamp()
      });
      setTitle(''); setBody(''); setOpen(false); setError('');
    } catch (err) { setError(err.message); }
  };

  if (items === null) return <Loader label="Loading announcements…" />;

  return (
    <>
      <SectionHead
        title="Announcements"
        actions={allowed && (
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <Megaphone size={15} /> New
          </button>
        )}
      />

      {!items.length ? (
        <Empty icon={Megaphone} title="No announcements yet." />
      ) : (
        <div className="list">
          {items.map((a) => (
            <article key={a.id} className="card">
              <div className="spread">
                <strong>{a.title}</strong>
                {allowed && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => deleteDoc(doc(db, COL.announcements, a.id))}
                    aria-label="Delete announcement"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <p className="muted" style={{ marginTop: 6 }}>{a.body}</p>
            </article>
          ))}
        </div>
      )}

      {open && (
        <Modal
          title="New announcement"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={publish}>Publish</button>
            </>
          }
        >
          <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Announcement"><textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <ErrorNote>{error}</ErrorNote>
        </Modal>
      )}
    </>
  );
}
