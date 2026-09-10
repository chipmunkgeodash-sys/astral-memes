import { useEffect, useMemo, useState } from 'react';
import { Trophy, Crown, Plus, RefreshCw, Medal } from 'lucide-react';
import {
  collection, onSnapshot, query, where, orderBy, addDoc, setDoc, doc,
  serverTimestamp, increment, updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL, LIMITS } from '../lib/schema';
import { useSession } from '../lib/session';
import { PageHead, Empty, Loader, Modal, Field, ErrorNote, Tabs, UserLink } from '../components/ui';
import Avatar from '../components/Avatar';

export default function ChallengesPage() {
  const { accountId, profile, isOwner } = useSession();
  const [challenges, setChallenges] = useState(null);
  const [entries, setEntries] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [composer, setComposer] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => onSnapshot(
    query(collection(db, COL.challenges), orderBy('createdAt', 'desc')),
    (snap) => setChallenges(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { setError(err.message); setChallenges([]); }
  ), []);

  const selected = useMemo(() => {
    if (!challenges?.length) return null;
    return challenges.find((c) => c.id === selectedId)
      || challenges.find((c) => c.forever)
      || challenges[0];
  }, [challenges, selectedId]);

  useEffect(() => {
    if (!selected) { setEntries([]); return undefined; }
    return onSnapshot(
      query(collection(db, COL.challengeEntries), where('challengeId', '==', selected.id)),
      (snap) => setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setEntries([])
    );
  }, [selected?.id]);

  const ranked = useMemo(
    () => [...entries].sort((a, b) => (b.points || 0) - (a.points || 0)),
    [entries]
  );
  const mine = ranked.find((e) => e.uid === accountId);
  const ended = isEnded(selected);
  const winner = ended ? ranked[0] : null;

  const join = async () => {
    if (!selected || !accountId) return;
    setBusy('join'); setError('');
    try {
      await setDoc(doc(db, COL.challengeEntries, `${selected.id}_${accountId}`), {
        challengeId: selected.id,
        uid: accountId,
        displayName: profile?.displayName || 'Astral member',
        points: selected.forever ? LIMITS.foreverRefillPoints : 0,
        joinedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  };

  const refill = async () => {
    if (!mine) return;
    setBusy('refill'); setError('');
    try {
      await updateDoc(doc(db, COL.challengeEntries, mine.id), {
        points: increment(LIMITS.foreverRefillPoints)
      });
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  };

  if (challenges === null) return <Loader label="Loading challenges…" />;

  return (
    <div className="stack">
      <PageHead
        eyebrow="Always open + weekly"
        title="Challenges"
        actions={isOwner && (
          <button className="btn btn-primary" onClick={() => setComposer(true)}>
            <Plus size={15} /> New challenge
          </button>
        )}
      />

      <ErrorNote>{error}</ErrorNote>

      {!challenges.length ? (
        <Empty
          icon={Trophy}
          title="No challenge yet."
          body={isOwner ? 'Create one when you’re ready to start the week.' : 'An Owner will publish the next weekly challenge.'}
        />
      ) : (
        <>
          <Tabs
            value={selected?.id}
            onChange={setSelectedId}
            options={challenges.map((c) => ({ value: c.id, label: c.title || 'Challenge' }))}
          />

          {selected && (
            <>
              <div className="card">
                <div className="spread">
                  <div>
                    <h2>{selected.title}</h2>
                    <p className="muted" style={{ marginTop: 4 }}>{selected.description}</p>
                  </div>
                  <span className={`chip ${statusClass(selected)}`}>
                    <span className="dot" /> {statusLabel(selected)}
                  </span>
                </div>
                <p className="faint" style={{ marginTop: 10 }}>
                  {selected.forever ? 'Always open · Never ends' : formatRange(selected)}
                </p>
              </div>

              {winner && (
                <div className="card" style={{ borderColor: 'var(--accent)' }}>
                  <div className="row">
                    <span className="tile-icon"><Crown size={18} /></span>
                    <div>
                      <span className="eyebrow">Final results</span>
                      <h2>{winner.displayName || 'Astral member'} wins</h2>
                      <p className="muted">
                        {(winner.points || 0).toLocaleString()} points
                        {ranked.length > 1 ? ` · beat ${ranked.length - 1} other${ranked.length > 2 ? 's' : ''}` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {ended && !winner && (
                <Empty icon={Trophy} title="This challenge has ended." body="Nobody scored, so there’s no winner." />
              )}

              {!ended && !mine && (
                <div className="card spread">
                  <span className="muted">
                    {selected.forever ? 'Join the Forever Challenge to claim a spot.' : 'Join the challenge to take part.'}
                  </span>
                  <button className="btn btn-primary" onClick={join} disabled={busy === 'join'}>
                    {busy === 'join' ? 'Joining…' : 'Join challenge'}
                  </button>
                </div>
              )}

              {!ended && mine && selected.forever && (mine.points || 0) === 0 && (
                <div className="card spread">
                  <span className="muted">
                    The Forever Challenge never locks you out. Take a free 100-point refill.
                  </span>
                  <button className="btn btn-primary" onClick={refill} disabled={busy === 'refill'}>
                    <RefreshCw size={15} /> {busy === 'refill' ? 'Refilling…' : 'Refill'}
                  </button>
                </div>
              )}

              <section>
                <h2 style={{ marginBottom: 12 }}>{ended ? 'Final standings' : 'Leaderboard'}</h2>
                {!ranked.length ? (
                  <Empty icon={Medal} title="Nobody has scored yet." body="Be the first on the board." />
                ) : (
                  <div className="list">
                    {ranked.map((e, i) => (
                      <div key={e.id} className={e.uid === accountId ? 'row-item is-me' : 'row-item'}>
                        <span className={i === 0 ? 'rank rank-1' : 'rank'}>{i + 1}</span>
                        <Avatar profile={{ id: e.uid, displayName: e.displayName }} size={30} />
                        <UserLink to={e.uid} className="grow truncate">{e.displayName || 'Astral member'}</UserLink>
                        {i === 0 && ended && <Crown size={15} style={{ color: 'var(--accent)' }} />}
                        <span className="chip">{(e.points || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}

      {composer && <ChallengeComposer onClose={() => setComposer(false)} />}
    </div>
  );
}

function ChallengeComposer({ onClose }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState(7);
  const [forever, setForever] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    if (!title.trim() || !description.trim()) { setError('Add a title and description.'); return; }
    if (!forever && (days < 1 || days > LIMITS.weeklyChallengeMaxDays)) {
      setError('A weekly challenge can last up to 8 days.'); return;
    }
    setBusy(true); setError('');
    try {
      const startsAt = new Date();
      await addDoc(collection(db, COL.challenges), {
        title: title.trim(),
        description: description.trim(),
        forever,
        startsAt,
        endsAt: forever ? null : new Date(startsAt.getTime() + days * 86400000),
        createdAt: serverTimestamp()
      });
      onClose();
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal
      title="New challenge"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={publish} disabled={busy}>
            {busy ? 'Publishing…' : 'Publish'}
          </button>
        </>
      }
    >
      <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Description" hint="Tell everyone what this challenge is about.">
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <label className="row">
        <input type="checkbox" checked={forever} onChange={(e) => setForever(e.target.checked)} />
        <span>Forever Challenge — always open, never ends</span>
      </label>
      {!forever && (
        <Field label="Length in days" hint="Up to 8.">
          <input type="number" min={1} max={LIMITS.weeklyChallengeMaxDays} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </Field>
      )}
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}

function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function isEnded(c) {
  if (!c || c.forever) return false;
  const end = toDate(c.endsAt);
  return !!end && end.getTime() < Date.now();
}
function statusLabel(c) {
  if (c.forever) return 'Forever';
  const start = toDate(c.startsAt);
  if (start && start.getTime() > Date.now()) return 'Upcoming';
  return isEnded(c) ? 'Ended' : 'Live';
}
function statusClass(c) {
  const l = statusLabel(c);
  if (l === 'Ended') return 'chip-ended';
  if (l === 'Live') return 'chip-live';
  return 'chip-accent';
}
function formatRange(c) {
  const s = toDate(c.startsAt);
  const e = toDate(c.endsAt);
  const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (s && e) return `${fmt(s)} – ${fmt(e)}`;
  if (e) return `Ends ${fmt(e)}`;
  return 'Open';
}
