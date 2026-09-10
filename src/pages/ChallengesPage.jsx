import { useEffect, useMemo, useState } from 'react';
import { Trophy, Crown, Plus, RefreshCw, Medal } from 'lucide-react';
import {
  collection, onSnapshot, query, where, orderBy, addDoc, setDoc, doc,
  serverTimestamp, increment, updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL, LIMITS } from '../lib/schema';
import { useSession } from '../lib/session';
import { SectionTitle, Empty, Loader, Modal, Field, ErrorNote } from '../components/ui';
import Avatar from '../components/Avatar';

export default function ChallengesPage() {
  const { user, profile, isOwner } = useSession();
  const [challenges, setChallenges] = useState(null);
  const [entries, setEntries] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
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

  // Entries for whichever challenge is on screen.
  useEffect(() => {
    if (!selected) { setEntries([]); return undefined; }
    return onSnapshot(
      query(collection(db, COL.challengeEntries), where('challengeId', '==', selected.id)),
      (snap) => setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setEntries([])
    );
  }, [selected?.id]);

  // Ranked once, used for both the winner banner and the leaderboard.
  const ranked = useMemo(
    () => [...entries].sort((a, b) => (b.points || 0) - (a.points || 0)),
    [entries]
  );
  const mine = ranked.find((e) => e.uid === user?.uid);
  const ended = isEnded(selected);
  const winner = ended ? ranked[0] : null;

  const join = async () => {
    if (!selected || !user) return;
    setBusy('join'); setError('');
    try {
      await setDoc(doc(db, COL.challengeEntries, `${selected.id}_${user.uid}`), {
        challengeId: selected.id,
        uid: user.uid,
        displayName: profile?.displayName || 'Astral member',
        points: selected.forever ? LIMITS.foreverRefillPoints : 0,
        joinedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  };

  const refill = async () => {
    if (!selected || !user || !mine) return;
    setBusy('refill'); setError('');
    try {
      await updateDoc(doc(db, COL.challengeEntries, mine.id), {
        points: increment(LIMITS.foreverRefillPoints)
      });
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  };

  if (challenges === null) return <Loader label="Loading challenges…" />;

  return (
    <div className="challenge-layout">
      <SectionTitle
        eyebrow="ALWAYS OPEN + WEEKLY"
        title="Explore challenges"
        actions={isOwner && (
          <button className="primary" onClick={() => setComposerOpen(true)}>
            <Plus size={16} /> New challenge
          </button>
        )}
      />

      <ErrorNote>{error}</ErrorNote>

      {!challenges.length ? (
        <Empty
          icon={Trophy}
          title="No challenge yet."
          body={isOwner
            ? "Create a challenge when you're ready to start the week."
            : 'An Owner will publish the next weekly challenge.'}
        />
      ) : (
        <>
          <div className="challenge-list">
            {challenges.map((c) => (
              <button
                key={c.id}
                className={selected?.id === c.id ? 'challenge-status selected' : 'challenge-status'}
                onClick={() => setSelectedId(c.id)}
              >
                <strong>{c.title || 'Challenge'}</strong>
                <span className={statusClass(c)}>{statusLabel(c)}</span>
              </button>
            ))}
          </div>

          {selected && (
            <div className="challenge-stage">
              <div className="challenge-meta">
                <h2 className="heading">{selected.title}</h2>
                <p>{selected.description}</p>
                <div className="challenge-dates">
                  {selected.forever
                    ? <span className="forever">Always open · Never ends</span>
                    : <span>{formatRange(selected)}</span>}
                </div>
              </div>

              {winner && (
                <div className="challenge-message forever-leaderboard">
                  <Crown size={24} />
                  <strong>Winner: {winner.displayName || 'Astral member'}</strong>
                  <span>
                    Finished first with {(winner.points || 0).toLocaleString()} points
                    {ranked.length > 1 ? ` out of ${ranked.length} players.` : '.'}
                  </span>
                </div>
              )}

              {ended && !winner && (
                <div className="challenge-message">
                  <Trophy size={24} />
                  <strong>This challenge has ended.</strong>
                  <span>Nobody scored, so there's no winner to show.</span>
                </div>
              )}

              {!ended && !mine && (
                <div className="challenge-message">
                  <Trophy size={24} />
                  <strong>{selected.forever ? 'Join the Forever Challenge first.' : 'Join the challenge first.'}</strong>
                  <button className="primary" onClick={join} disabled={busy === 'join'}>
                    {busy === 'join' ? 'Joining…' : 'Join challenge'}
                  </button>
                </div>
              )}

              {!ended && mine && selected.forever && (mine.points || 0) === 0 && (
                <div className="challenge-message">
                  <RefreshCw size={24} />
                  <strong>Ready for another run?</strong>
                  <span>The Forever Challenge never locks you out. Take a free 100-point refill and keep playing.</span>
                  <button className="primary" onClick={refill} disabled={busy === 'refill'}>
                    {busy === 'refill' ? 'Refilling…' : 'Take the refill'}
                  </button>
                </div>
              )}

              <Leaderboard ranked={ranked} meUid={user?.uid} ended={ended} />
            </div>
          )}
        </>
      )}

      {composerOpen && (
        <ChallengeComposer onClose={() => setComposerOpen(false)} />
      )}
    </div>
  );
}

function Leaderboard({ ranked, meUid, ended }) {
  if (!ranked.length) {
    return (
      <Empty
        icon={Medal}
        title="Join the Forever Challenge to claim the first spot."
        body="Nobody has scored yet."
      />
    );
  }
  return (
    <div className="forever-leaderboard">
      <span className="eyebrow">{ended ? 'FINAL RESULTS' : 'Forever points leaderboard'}</span>
      <ol className="leaderboard-list">
        {ranked.map((e, i) => (
          <li key={e.id} className={e.uid === meUid ? 'member-row you' : 'member-row'}>
            <span className={i === 0 ? 'badge star' : 'badge'}>{i + 1}</span>
            <Avatar profile={{ id: e.uid, displayName: e.displayName }} size={28} />
            <strong>{e.displayName || 'Astral member'}</strong>
            {i === 0 && ended && <Crown size={15} />}
            <span className="count-line">{(e.points || 0).toLocaleString()}</span>
          </li>
        ))}
      </ol>
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
    if (!title.trim() || !description.trim()) {
      setError('Add a title and description.');
      return;
    }
    if (!forever && (days < 1 || days > LIMITS.weeklyChallengeMaxDays)) {
      setError('A weekly challenge can last up to 8 days.');
      return;
    }
    setBusy(true); setError('');
    try {
      const startsAt = new Date();
      const endsAt = forever ? null : new Date(startsAt.getTime() + days * 86400000);
      await addDoc(collection(db, COL.challenges), {
        title: title.trim(),
        description: description.trim(),
        forever,
        startsAt,
        endsAt,
        createdAt: serverTimestamp()
      });
      onClose();
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal
      title="Create the weekly challenge"
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={publish} disabled={busy}>
            {busy ? 'Publishing…' : 'Publish challenge'}
          </button>
        </>
      }
    >
      <div className="challenge-composer form-grid">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description" hint="Tell everyone what this week's challenge is about.">
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <label className="check-row">
          <input type="checkbox" checked={forever} onChange={(e) => setForever(e.target.checked)} />
          <span>Forever Challenge — always open, never ends</span>
        </label>
        {!forever && (
          <Field label="Length in days" hint="Up to 8 days.">
            <input
              type="number" min={1} max={LIMITS.weeklyChallengeMaxDays}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </Field>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
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
  const l = statusLabel(c).toLowerCase();
  return l === 'forever' ? 'forever' : l === 'ended' ? 'ended' : l === 'upcoming' ? 'upcoming' : 'live';
}

function formatRange(c) {
  const s = toDate(c.startsAt);
  const e = toDate(c.endsAt);
  const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (s && e) return `${fmt(s)} – ${fmt(e)}`;
  if (e) return `Ends ${fmt(e)}`;
  return 'Open';
}
