import { useEffect, useState } from 'react';
import { Vote, Plus, Trash2 } from 'lucide-react';
import {
  collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL, LIMITS } from '../lib/schema';
import { useSession } from '../lib/session';
import { PageHead, Empty, Loader, Modal, Field, ErrorNote } from '../components/ui';

export default function PollsPage() {
  const { accountId, isOwner } = useSession();
  const [polls, setPolls] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => onSnapshot(
    query(collection(db, COL.polls), orderBy('createdAt', 'desc')),
    (snap) => setPolls(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { setError(err.message); setPolls([]); }
  ), []);

  const castVote = async (poll, index) => {
    if (poll.closed) return;
    try {
      await updateDoc(doc(db, COL.polls, poll.id), { [`votes.${accountId}`]: index });
    } catch (err) { setError(err.message); }
  };

  if (polls === null) return <Loader label="Loading polls…" />;

  return (
    <div className="stack content-narrow">
      <PageHead
        eyebrow="Community vote"
        title="Polls"
        actions={isOwner && <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={15} /> New poll</button>}
      />

      <ErrorNote>{error}</ErrorNote>

      {!polls.length ? (
        <Empty
          icon={Vote}
          title="No polls yet."
          body={isOwner ? 'Ask your community something.' : 'An Owner can publish a poll here.'}
        />
      ) : (
        <div className="list">
          {polls.map((p) => {
            const votes = p.votes || {};
            const total = Object.keys(votes).length;
            const mine = votes[accountId];
            const revealed = p.closed || mine !== undefined;
            return (
              <article key={p.id} className="card">
                <div className="spread" style={{ marginBottom: 10 }}>
                  <span className={p.closed ? 'chip chip-ended' : 'chip chip-live'}>
                    <span className="dot" /> {p.closed ? 'Closed' : 'Open'}
                  </span>
                  <span className="faint">{total} {total === 1 ? 'vote' : 'votes'}</span>
                </div>

                <h2 style={{ marginBottom: 12 }}>{p.question}</h2>

                <div className="list" style={{ gap: 8 }}>
                  {(p.options || []).map((opt, i) => {
                    const count = Object.values(votes).filter((v) => v === i).length;
                    const pct = total ? Math.round((count / total) * 100) : 0;
                    return (
                      <button
                        key={i}
                        className="poll-option"
                        aria-pressed={mine === i}
                        onClick={() => castVote(p, i)}
                        disabled={p.closed}
                        style={{ '--fill': revealed ? `${pct}%` : '0%' }}
                      >
                        <span>{opt}</span>
                        {revealed && <span className="faint">{pct}% · {count}</span>}
                      </button>
                    );
                  })}
                </div>

                {mine === undefined && !p.closed && (
                  <p className="faint" style={{ marginTop: 10 }}>Choose one option to vote.</p>
                )}

                {isOwner && (
                  <div className="row" style={{ marginTop: 14 }}>
                    <button className="btn btn-sm" onClick={() => updateDoc(doc(db, COL.polls, p.id), { closed: !p.closed })}>
                      {p.closed ? 'Reopen' : 'Close'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteDoc(doc(db, COL.polls, p.id))}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
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
      title="New poll"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={publish} disabled={busy}>{busy ? 'Publishing…' : 'Publish'}</button>
        </>
      }
    >
      <Field label="Question" hint={`${question.length}/${LIMITS.pollQuestionMax}`}>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={LIMITS.pollQuestionMax} />
      </Field>

      <div className="list" style={{ gap: 8 }}>
        {options.map((o, i) => (
          <div key={i} className="row">
            <input
              className="input"
              value={o}
              placeholder={`Choice ${i + 1}`}
              onChange={(e) => setOptions(options.map((v, j) => (j === i ? e.target.value : v)))}
            />
            {options.length > LIMITS.pollChoicesMin && (
              <button className="btn btn-ghost btn-icon" onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label="Remove choice">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>

      {options.length < LIMITS.pollChoicesMax && (
        <button className="btn btn-ghost btn-sm" onClick={() => setOptions([...options, ''])}>
          <Plus size={14} /> Add choice
        </button>
      )}

      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}
