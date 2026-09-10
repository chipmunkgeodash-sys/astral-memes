import { useEffect, useMemo, useState } from 'react';
import { Coins, Shield, Search, Plus, Megaphone, Check } from 'lucide-react';
import {
  collection, onSnapshot, doc, setDoc, updateDoc, addDoc, deleteDoc,
  getDoc, increment, serverTimestamp, orderBy, query
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL, PERMISSIONS, LIMITS } from '../lib/schema';
import { useSession } from '../lib/session';
import { SectionTitle, Empty, Loader, Modal, Field, ErrorNote } from '../components/ui';
import Avatar from '../components/Avatar';

export default function AdminPage() {
  const { isOwner, can } = useSession();
  const [tab, setTab] = useState('members');

  if (!isOwner && !can('accessAdmin')) {
    return (
      <Empty
        icon={Shield}
        title="OWNER ACCESS"
        body="Only an Owner can manage roles and permissions."
      />
    );
  }

  return (
    <div className="admin-stats">
      <SectionTitle eyebrow="COMMUNITY MANAGEMENT" title="Admin overview" />
      <div className="arcade-tabs tabs">
        {['members', 'roles', 'announcements'].map((t) => (
          <button key={t} className={tab === t ? 'chosen' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
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

  useEffect(() => onSnapshot(collection(db, COL.accounts),
    (snap) => setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { setError(err.message); setAccounts([]); }
  ), []);

  useEffect(() => onSnapshot(collection(db, COL.wallets),
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
      <label className="member-search search-person">
        <Search size={16} />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search members…"
        />
      </label>

      <ErrorNote>{error}</ErrorNote>

      {!filtered.length ? (
        <Empty
          icon={Shield}
          title="No members yet."
          body="New members will appear here when they create an account."
        />
      ) : (
        <div className="role-members">
          {filtered.map((a) => (
            <div key={a.id} className="member-row">
              <Avatar profile={a} size={34} />
              <span className="profile-info">
                <strong>{a.displayName || 'Astral member'}</strong>
                <small>{a.username ? `@${a.username}` : a.id.slice(0, 8)}</small>
              </span>

              <span className="wallet-pill" title="Astral Coins">
                <Coins size={14} /> {(wallets[a.id]?.balance ?? 0).toLocaleString()}
              </span>

              {(a.roleIds || []).includes("owner") && <span className="badge star">Owner</span>}

              {isOwner && (
                <span className="account-role">
                  {roles.map((r) => (
                    <button
                      key={r.id}
                      className={(a.roleIds || []).includes(r.id) ? 'badge selected' : 'badge'}
                      onClick={() => toggleRole(a, r.id)}
                      title={r.name}
                    >
                      {(a.roleIds || []).includes(r.id) && <Check size={11} />} {r.name}
                    </button>
                  ))}
                </span>
              )}

              {isOwner && (
                <button className="secondary" onClick={() => setGranting(a)}>
                  <Coins size={14} /> Add coins
                </button>
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

// Owner-only: adjust any member's coin balance up or down.
function GrantCoins({ account, current, onClose }) {
  const { user } = useSession();
  const [amount, setAmount] = useState(100);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const apply = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n === 0) { setError('Enter an amount other than zero.'); return; }
    if (current + n < 0) { setError(`That would take them below zero. They have ${current.toLocaleString()}.`); return; }

    setBusy(true); setError('');
    try {
      const ref = doc(db, COL.wallets, account.id);
      // The wallet may not exist yet for an older account, so create it if absent.
      const snap = await getDoc(ref);
      if (snap.exists()) await updateDoc(ref, { balance: increment(n), updatedAt: serverTimestamp() });
      else await setDoc(ref, { balance: Math.max(0, n), lastSettledEntryId: '', lastRedemptionId: '', updatedAt: serverTimestamp() });

      // Keep an audit trail of Owner grants.
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
      title={`Add coins — ${account.displayName || 'Astral member'}`}
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={apply} disabled={busy}>
            {busy ? 'Applying…' : 'Apply'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <p className="coin-summary">
          Current balance: <strong>{current.toLocaleString()}</strong> Astral Coins
        </p>
        <Field label="Amount" hint="Negative numbers remove coins.">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <div className="preset-grid">
          {[100, 500, 1000, 5000].map((v) => (
            <button key={v} className="preset-card" onClick={() => setAmount(v)}>+{v.toLocaleString()}</button>
          ))}
        </div>
        <Field label="Note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why?" />
        </Field>
        <p className="virtual-coins-note">
          Astral Coins are virtual and only work inside Astral Memes.
        </p>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ roles */

function Roles() {
  const { isOwner, roles } = useSession();
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  if (!isOwner) {
    return <Empty icon={Shield} title="OWNER CONTROLS" body="Only an Owner can manage roles and permissions." />;
  }

  const save = async (role) => {
    if (!role.name.trim()) { setError('Give the role a name.'); return; }
    const clash = roles.find((r) => r.name.toLowerCase() === role.name.trim().toLowerCase() && r.id !== role.id);
    if (clash) { setError('A role with that name already exists.'); return; }
    try {
      if (role.id) await updateDoc(doc(db, COL.roles, role.id), { name: role.name.trim(), permissions: role.permissions });
      else await addDoc(collection(db, COL.roles), { name: role.name.trim(), permissions: role.permissions, createdAt: serverTimestamp() });
      setEditing(null); setError('');
    } catch (err) { setError(err.message); }
  };

  return (
    <>
      <SectionTitle
        eyebrow="OWNER CONTROLS"
        title="Manage roles"
        actions={<button className="primary" onClick={() => setEditing({ name: '', permissions: {} })}><Plus size={16} /> Create role</button>}
      />
      <p className="owner-note">Everyone can see what each role includes. Owners control assignments and permissions.</p>
      <ErrorNote>{error}</ErrorNote>

      {!roles.length ? (
        <Empty icon={Shield} title="No roles yet." body="Create a role to start assigning access." />
      ) : (
        <div className="role-members">
          {roles.map((r) => (
            <div key={r.id} className="role-row">
              <span className="role-dot" />
              <strong>{r.name}</strong>
              <span className="badges">
                {PERMISSIONS.filter((p) => r.permissions?.[p.key]).map((p) => (
                  <span key={p.key} className="badge">{p.label}</span>
                ))}
              </span>
              <button className="secondary" onClick={() => setEditing({ ...r, permissions: { ...(r.permissions || {}) } })}>Edit role</button>
              <button className="text-button danger" onClick={() => deleteDoc(doc(db, COL.roles, r.id)).catch((e) => setError(e.message))}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing.id ? 'Edit role' : 'Create role'}
          onClose={() => { setEditing(null); setError(''); }}
          footer={
            <>
              <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="primary" onClick={() => save(editing)}>Save role</button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Role name">
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            {PERMISSIONS.map((p) => (
              <label key={p.key} className="check-row">
                <input
                  type="checkbox"
                  checked={!!editing.permissions[p.key]}
                  onChange={(e) => setEditing({
                    ...editing,
                    permissions: { ...editing.permissions, [p.key]: e.target.checked }
                  })}
                />
                <span>{p.label}</span>
              </label>
            ))}
            <p className="permission-hint">The Owner role always has full access.</p>
            <ErrorNote>{error}</ErrorNote>
          </div>
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
      <SectionTitle
        eyebrow="COMMUNITY UPDATE"
        title="Manage announcements"
        actions={allowed && <button className="primary" onClick={() => setOpen(true)}><Megaphone size={16} /> New announcement</button>}
      />
      {!items.length ? (
        <Empty icon={Megaphone} title="No announcements yet." />
      ) : (
        <div className="poll-list">
          {items.map((a) => (
            <article key={a.id} className="announcement community-card">
              <strong>{a.title}</strong>
              <p>{a.body}</p>
              {allowed && (
                <button className="text-button danger" onClick={() => deleteDoc(doc(db, COL.announcements, a.id))}>
                  Delete announcement
                </button>
              )}
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
              <button className="secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button className="primary" onClick={publish}>Publish announcement</button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Announcement"><textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
            <ErrorNote>{error}</ErrorNote>
          </div>
        </Modal>
      )}
    </>
  );
}
