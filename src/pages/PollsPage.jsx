import { useEffect, useState } from 'react';
import { Vote, Plus, Trash2 } from 'lucide-react';
import {
  collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL, LIMITS } from '../lib/schema';
import { useSession } from '../lib/session';
import { SectionTitle, Empty, Loader, Modal, Field, ErrorNote } from '../components/ui';

export default function PollsPage() {
  const { user, isOwner } = useSession();
  const [polls, setPolls] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => onSnapshot(
    query(collection(db, COL.polls), orderBy('createdAt', 'desc')),
    (snap) => setPolls(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { setError(err.message); setPolls([]); }
  ), []);

  // votes is a map of uid -> option index, so one member gets exactly one vote.
  const castVote = async (poll, index) => {
    if (poll.closed) return;
    try {
      await updateDoc(doc(db, COL.polls, poll.id), { [`votes.${user.uid}`]: index });
    } catch (err) { setError(err.message); }
  };

  if (polls === null) return <Loader label="Loading polls…" />;

  return (
    <div className="poll-list">
      <SectionTitle
        eyebrow="COMMUNITY VOTE"
        title="Polls"
        actions={isOwner && <button className="primary" onClick={() => setOpen(true)}><Plus size={16} /> New poll</button>}
      />
      <p className="owner-note">Owners ask the question. Every signed-in member gets one vote.</p>
      <ErrorNote>{error}</ErrorNote>

      {!polls.length ? (
        <Empty
          icon={Vote}
          title="No polls yet."
          body={isOwner ? 'Create the first question for your community.' : 'An Owner can publish a community poll here.'}
        />
      ) : (
        polls.map((p) => {
          const votes = p.votes || {};
          const total = Object.keys(votes).length;
          const mine = votes[user.uid];
          return (
            <article key={p.id} className="poll-card community-card">
              <span className={p.closed ? 'badge ended' : 'badge open'}>
                {p.closed ? 'FINAL RESULTS' : 'OPEN POLL'}
              </span>
              <h3 className="heading">{p.question}</h3>

              <div className="poll-options">
                {(p.options || []).map((opt, i) => {
                  const count = Object.values(votes).filter((v) => v === i).length;
                  const pct = total ? Math.round((count / total) * 100) : 0;
                  return (
                    <button
                      key={i}
                      className={mine === i ? 'poll-choice chosen' : 'poll-choice'}
                      onClick={() => castVote(p, i)}
                      disabled={p.closed}
                      style={{ '--fill': `${pct}%` }}
                    >
                      <span>{opt}</span>
                      {(p.closed || mine !== undefined) && <small>{pct}% · {count}</small>}
                    </button>
                  );
                })}
              </div>

              <footer className="count-line">
                {total} {total === 1 ? 'vote' : 'votes'}
                {mine === undefined && !p.closed && ' · Choose one option to vote.'}
              </footer>

              {isOwner && (
                <div className="poll-owner-actions">
                  <button className="secondary" onClick={() => updateDoc(doc(db, COL.polls, p.id), { closed: !p.closed })}>
                    {p.closed ? 'Reopen poll' : 'Close poll'}
                  </button>
                  <button className="text-button danger" onClick={() => deleteDoc(doc(db, COL.polls, p.id))}>
                    <Trash2 size={15} /> Delete poll
                  </button>
                </div>
              )}
            </article>
          );
        })
      )}

      {open && <PollComposer onClose={() => setOpen(false)} />}
    </div>
  );
}

function PollComposer({ onClose }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    const clean = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) { setError('Add a question for the poll.'); return; }
    if (question.trim().length > LIMITS.pollQuestionMax) { setError('Keep the question under 180 characters.'); return; }
    if (clean.length < LIMITS.pollChoicesMin || clean.length > LIMITS.pollChoicesMax) {
      setError('Add between 2 and 6 choices.'); return;
    }
    setBusy(true); setError('');
    try {
      await addDoc(collection(db, COL.polls), {
        question: question.trim(), options: clean, votes: {}, closed: false, createdAt: serverTimestamp()
      });
      onClose();
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal
      title="Create poll"
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={publish} disabled={busy}>{busy ? 'Publishing…' : 'Create poll'}</button>
        </>
      }
    >
      <div className="poll-composer form-grid">
        <Field label="Question" hint={`${question.length}/${LIMITS.pollQuestionMax}`}>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={LIMITS.pollQuestionMax} />
        </Field>
        <div className="poll-choice-editor">
          {options.map((o, i) => (
            <span key={i} className="field">
              <input
                value={o}
                placeholder={`Choice ${i + 1}`}
                onChange={(e) => setOptions(options.map((v, j) => (j === i ? e.target.value : v)))}
              />
              {options.length > LIMITS.pollChoicesMin && (
                <button className="icon-btn" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                  <Trash2 size={14} />
                </button>
              )}
            </span>
          ))}
        </div>
        {options.length < LIMITS.pollChoicesMax && (
          <button className="text-button" onClick={() => setOptions([...options, ''])}>
            <Plus size={14} /> Add choice
          </button>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
