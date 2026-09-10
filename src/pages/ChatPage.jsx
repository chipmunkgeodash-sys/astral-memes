import { useEffect, useMemo, useState } from 'react';
import {
  Hash, Users, Plus, Lock, Check, X, Trash2, UserPlus, Crown
} from 'lucide-react';
import {
  collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, arrayUnion, arrayRemove
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL, LOUNGE_THREAD, groupThread } from '../lib/schema';
import { useSession } from '../lib/session';
import { PageHead, Empty, Modal, Field, ErrorNote, Toast } from '../components/ui';
import Thread from '../components/Thread';
import Avatar from '../components/Avatar';

export default function ChatPage() {
  const { accountId, profile, isOwner } = useSession();
  const [groups, setGroups] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [active, setActive] = useState(LOUNGE_THREAD);
  const [composer, setComposer] = useState(false);
  const [manage, setManage] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

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

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  // Owners belong to every group, and the member list says so.
  const isMember = (g) => isOwner || (g.members || []).includes(accountId);
  const mine = useMemo(() => (groups || []).filter(isMember), [groups, accountId, isOwner]);
  const others = useMemo(() => (groups || []).filter((g) => !isMember(g)), [groups, accountId, isOwner]);

  const activeGroup = useMemo(
    () => (groups || []).find((g) => groupThread(g.id) === active),
    [groups, active]
  );

  const requestJoin = async (g) => {
    try {
      await updateDoc(doc(db, COL.groups, g.id), { requests: arrayUnion(accountId) });
      flash('Request sent');
    } catch (err) { setError(err.message); }
  };

  const approve = async (g, uid) => {
    try {
      await updateDoc(doc(db, COL.groups, g.id), {
        members: arrayUnion(uid), requests: arrayRemove(uid)
      });
    } catch (err) { setError(err.message); }
  };

  const decline = async (g, uid) => {
    try {
      await updateDoc(doc(db, COL.groups, g.id), { requests: arrayRemove(uid) });
    } catch (err) { setError(err.message); }
  };

  const removeMember = async (g, uid) => {
    try {
      await updateDoc(doc(db, COL.groups, g.id), { members: arrayRemove(uid) });
    } catch (err) { setError(err.message); }
  };

  const destroy = async (g) => {
    try {
      await deleteDoc(doc(db, COL.groups, g.id));
      if (groupThread(g.id) === active) setActive(LOUNGE_THREAD);
      setManage(null);
      flash('Group deleted');
    } catch (err) { setError(err.message); }
  };

  const nameOf = (uid) =>
    accounts.find((a) => a.id === uid)?.displayName || 'Astral member';

  return (
    <div className="stack">
      <PageHead
        eyebrow="Everyone, all at once"
        title="Chat"
        actions={
          <button className="btn btn-primary" onClick={() => setComposer(true)}>
            <Plus size={15} /> New group
          </button>
        }
      />

      <ErrorNote>{error}</ErrorNote>

      <div className="dm">
        <aside className="dm-side">
          <div className="dm-list">
            <button
              className="dm-person"
              aria-current={active === LOUNGE_THREAD}
              onClick={() => setActive(LOUNGE_THREAD)}
            >
              <span className="avatar dm-hash" style={{ width: 34, height: 34 }}><Hash size={16} /></span>
              <span className="me-text">
                <strong>the-lounge</strong>
                <small>Everyone</small>
              </span>
            </button>

            <span className="dm-heading">Your groups</span>
            {!mine.length ? (
              <p className="faint" style={{ padding: '6px 10px' }}>None yet.</p>
            ) : mine.map((g) => {
              const pending = (g.requests || []).length;
              const canManage = isOwner || g.createdBy === accountId;
              return (
                <button
                  key={g.id}
                  className="dm-person"
                  aria-current={active === groupThread(g.id)}
                  onClick={() => setActive(groupThread(g.id))}
                >
                  <span className="avatar dm-group" style={{ width: 34, height: 34 }}><Users size={15} /></span>
                  <span className="me-text grow">
                    <strong className="truncate">{g.name}</strong>
                    <small>{(g.members || []).length} member{(g.members || []).length === 1 ? '' : 's'}</small>
                  </span>
                  {canManage && pending > 0 && <span className="chip chip-accent">{pending}</span>}
                </button>
              );
            })}

            {!!others.length && (
              <>
                <span className="dm-heading">Other groups</span>
                {others.map((g) => {
                  const asked = (g.requests || []).includes(accountId);
                  return (
                    <div key={g.id} className="dm-person dm-locked">
                      <span className="avatar dm-group" style={{ width: 34, height: 34 }}><Lock size={14} /></span>
                      <span className="me-text grow">
                        <strong className="truncate">{g.name}</strong>
                        <small>{(g.members || []).length} members</small>
                      </span>
                      <button
                        className="btn btn-sm"
                        onClick={() => requestJoin(g)}
                        disabled={asked}
                      >
                        {asked ? 'Asked' : <><UserPlus size={13} /> Join</>}
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </aside>

        {active === LOUNGE_THREAD ? (
          <Thread
            thread={LOUNGE_THREAD}
            placeholder="Message the lounge"
            emptyTitle="Nobody has said anything yet."
            emptyBody="Be the first — everyone can see this room."
            header={
              <>
                <span className="avatar dm-hash" style={{ width: 32, height: 32 }}><Hash size={16} /></span>
                <div className="me-text grow">
                  <strong>the-lounge</strong>
                  <small>The whole community</small>
                </div>
                <span className="chip"><Users size={13} /> {accounts.length}</span>
              </>
            }
          />
        ) : activeGroup ? (
          <Thread
            thread={groupThread(activeGroup.id)}
            groupId={activeGroup.id}
            placeholder={`Message ${activeGroup.name}`}
            emptyTitle="No messages yet."
            emptyBody="Say something to the group."
            header={
              <>
                <span className="avatar dm-group" style={{ width: 32, height: 32 }}><Users size={15} /></span>
                <div className="me-text grow">
                  <strong>{activeGroup.name}</strong>
                  <small>{(activeGroup.members || []).length} members · Owner is always in</small>
                </div>
                <button className="btn btn-sm" onClick={() => setManage(activeGroup)}>Manage</button>
              </>
            }
          />
        ) : (
          <div className="dm-main dm-blank">
            <Empty icon={Users} title="Pick a room" body="The lounge, or one of your groups." />
          </div>
        )}
      </div>

      {composer && (
        <GroupComposer
          accountId={accountId}
          displayName={profile?.displayName}
          onClose={() => setComposer(false)}
          onCreated={(id) => { setActive(groupThread(id)); flash('Group created'); }}
        />
      )}

      {manage && (
        <Modal title={`Manage · ${manage.name}`} onClose={() => setManage(null)}>
          <p className="muted">{manage.description || 'No description.'}</p>

          <div>
            <span className="label">Members</span>
            <div className="list" style={{ gap: 6, marginTop: 6 }}>
              <div className="row-item">
                <span className="avatar dm-hash" style={{ width: 26, height: 26 }}><Crown size={12} /></span>
                <span className="grow">Owner</span>
                <span className="chip">always in</span>
              </div>
              {(manage.members || []).map((uid) => (
                <div key={uid} className="row-item">
                  <Avatar profile={accounts.find((a) => a.id === uid)} size={26} />
                  <span className="grow truncate">{nameOf(uid)}</span>
                  {(isOwner || manage.createdBy === accountId) && uid !== manage.createdBy && (
                    <button className="btn btn-danger btn-sm" onClick={() => removeMember(manage, uid)}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {(isOwner || manage.createdBy === accountId) && (
            <div>
              <span className="label">Join requests</span>
              {!(manage.requests || []).length ? (
                <p className="faint" style={{ marginTop: 6 }}>Nobody is waiting.</p>
              ) : (
                <div className="list" style={{ gap: 6, marginTop: 6 }}>
                  {(manage.requests || []).map((uid) => (
                    <div key={uid} className="row-item">
                      <Avatar profile={accounts.find((a) => a.id === uid)} size={26} />
                      <span className="grow truncate">{nameOf(uid)}</span>
                      <button className="btn btn-sm" onClick={() => approve(manage, uid)}><Check size={13} /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => decline(manage, uid)}><X size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(isOwner || manage.createdBy === accountId) && (
            <button className="btn btn-danger" onClick={() => destroy(manage)}>
              <Trash2 size={14} /> Delete this group
            </button>
          )}
        </Modal>
      )}

      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

function GroupComposer({ accountId, displayName, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!name.trim()) { setError('Give the group a name.'); return; }
    setBusy(true); setError('');
    try {
      const ref = await addDoc(collection(db, COL.groups), {
        name: name.trim(),
        description: description.trim(),
        createdBy: accountId,
        createdByName: displayName || null,
        members: [accountId],
        requests: [],
        createdAt: serverTimestamp()
      });
      onCreated(ref.id);
      onClose();
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal
      title="New group chat"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={create} disabled={busy}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></Field>
      <Field label="Description" hint="Shown to people deciding whether to join.">
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={160} />
      </Field>
      <p className="hint">
        Anyone can ask to join. You approve requests, and Owners can see and moderate group chats.
      </p>
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}
