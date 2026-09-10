import { useEffect, useState } from 'react';
import { Store, Plus, Coins, Trash2 } from 'lucide-react';
import {
  collection, onSnapshot, query, orderBy, addDoc, deleteDoc, doc,
  updateDoc, increment, serverTimestamp, where
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL, LIMITS } from '../lib/schema';
import { useSession } from '../lib/session';
import { PageHead, SectionHead, Empty, Loader, Modal, Field, ErrorNote } from '../components/ui';

export default function StorePage() {
  const { user, profile, balance, isOwner } = useSession();
  const [items, setItems] = useState(null);
  const [history, setHistory] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => onSnapshot(
    query(collection(db, COL.storeItems), orderBy('createdAt', 'desc')),
    (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { setError(err.message); setItems([]); }
  ), []);

  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(
      query(collection(db, COL.redemptions), where('uid', '==', user.uid)),
      (snap) => setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setHistory([])
    );
  }, [user?.uid]);

  const redeem = async (item) => {
    if (balance < item.cost) { setError('You need more Astral Coins for this reward.'); return; }
    setBusy(item.id); setError('');
    try {
      const entry = await addDoc(collection(db, COL.redemptions), {
        type: 'reward',
        uid: user.uid,
        displayName: profile?.displayName || null,
        itemId: item.id,
        itemTitle: item.title,
        amount: -item.cost,
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, COL.wallets, user.uid), {
        balance: increment(-item.cost),
        lastRedemptionId: entry.id,
        updatedAt: serverTimestamp()
      });
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  };

  if (items === null) return <Loader label="Loading the Store…" />;

  return (
    <div className="stack">
      <PageHead
        eyebrow="Spend what you earn"
        title="Store"
        actions={
          <>
            <span className="chip chip-accent"><Coins size={13} /> {balance.toLocaleString()}</span>
            {isOwner && <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={15} /> Add reward</button>}
          </>
        }
      />

      <ErrorNote>{error}</ErrorNote>

      {!items.length ? (
        <Empty
          icon={Store}
          title="The Store is waiting."
          body={isOwner ? 'Add the first cosmetic or community reward.' : 'An Owner will add rewards you can redeem.'}
        />
      ) : (
        <div className="grid">
          {items.map((it) => {
            const afford = balance >= (it.cost || 0);
            return (
              <article key={it.id} className="tile" style={{ cursor: 'default' }}>
                <span className="tile-icon"><Store size={18} /></span>
                <strong>{it.title}</strong>
                <span>{it.description}</span>
                <div className="spread" style={{ width: '100%', marginTop: 8 }}>
                  <span className="chip"><Coins size={13} /> {(it.cost || 0).toLocaleString()}</span>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => redeem(it)}
                    disabled={busy === it.id || !afford}
                    title={afford ? undefined : 'Not enough coins'}
                  >
                    {busy === it.id ? 'Redeeming…' : 'Redeem'}
                  </button>
                </div>
                {isOwner && (
                  <button className="btn btn-danger btn-sm" onClick={() => deleteDoc(doc(db, COL.storeItems, it.id))}>
                    <Trash2 size={13} /> Remove
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {!!history.length && (
        <section>
          <SectionHead title="Your history" />
          <div className="list">
            {history.map((h) => (
              <div key={h.id} className="row-item">
                <span className="grow truncate">
                  {h.type === 'ownerGrant' ? (h.note || 'Owner grant') : (h.itemTitle || 'Reward')}
                </span>
                <span className={h.amount > 0 ? 'chip chip-live' : 'chip'}>
                  {h.amount > 0 ? `+${h.amount.toLocaleString()}` : h.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {open && <RewardComposer onClose={() => setOpen(false)} />}
    </div>
  );
}

function RewardComposer({ onClose }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState(500);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!title.trim() || !description.trim()) { setError('Add a reward title and description.'); return; }
    const c = Number(cost);
    if (!Number.isFinite(c) || c < LIMITS.rewardCostMin || c > LIMITS.rewardCostMax) {
      setError('Choose a coin cost from 1 to 100,000.'); return;
    }
    setBusy(true); setError('');
    try {
      await addDoc(collection(db, COL.storeItems), {
        title: title.trim(), description: description.trim(), cost: c, createdAt: serverTimestamp()
      });
      onClose();
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal
      title="New reward"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={add} disabled={busy}>{busy ? 'Adding…' : 'Add to Store'}</button>
        </>
      }
    >
      <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Description"><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="Coin cost" hint="1 to 100,000.">
        <input type="number" min={LIMITS.rewardCostMin} max={LIMITS.rewardCostMax} value={cost} onChange={(e) => setCost(e.target.value)} />
      </Field>
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}
