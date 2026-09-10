import { useEffect, useState } from 'react';
import { Store, Plus, Coins, Trash2, PiggyBank } from 'lucide-react';
import {
  collection, onSnapshot, query, orderBy, addDoc, deleteDoc, doc,
  updateDoc, increment, serverTimestamp, getDoc, setDoc, where
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL, LIMITS } from '../lib/schema';
import { useSession } from '../lib/session';
import { SectionTitle, Empty, Loader, Modal, Field, ErrorNote } from '../components/ui';

export default function StorePage() {
  const { user, profile, wallet, isOwner } = useSession();
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

  const banked = wallet?.banked ?? 0;
  const coins = wallet?.coins ?? 0;

  const bank = async () => {
    if (coins <= 0) return;
    setBusy('bank'); setError('');
    try {
      await updateDoc(doc(db, COL.wallets, user.uid), {
        coins: increment(-coins),
        banked: increment(coins)
      });
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  };

  const redeem = async (item) => {
    if (banked < item.cost) { setError('You need more Astral Coins for this reward.'); return; }
    setBusy(item.id); setError('');
    try {
      await updateDoc(doc(db, COL.wallets, user.uid), { banked: increment(-item.cost) });
      await addDoc(collection(db, COL.redemptions), {
        type: 'reward',
        uid: user.uid,
        displayName: profile?.displayName || null,
        itemId: item.id,
        itemTitle: item.title,
        amount: -item.cost,
        createdAt: serverTimestamp()
      });
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  };

  if (items === null) return <Loader label="Loading the Store…" />;

  return (
    <div className="store-grid">
      <SectionTitle
        eyebrow="SPEND WHAT YOU EARN"
        title="Rewards Store"
        actions={isOwner && <button className="primary" onClick={() => setOpen(true)}><Plus size={16} /> Add reward</button>}
      />
      <p className="owner-note">Redeem banked Astral Coins for Owner-created in-app rewards.</p>

      <div className="coin-summary community-card">
        <span className="wallet-pill"><Coins size={15} /> {coins.toLocaleString()} weekly coins</span>
        <span className="wallet-pill"><PiggyBank size={15} /> {banked.toLocaleString()} store balance</span>
        <button className="secondary" onClick={bank} disabled={coins <= 0 || busy === 'bank'}>
          {busy === 'bank' ? 'Banking your weekly coins…' : 'Bank now'}
        </button>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {!items.length ? (
        <Empty
          icon={Store}
          title="The Store is waiting."
          body={isOwner ? 'Add the first cosmetic or community reward.' : 'An Owner will add rewards you can redeem with banked coins.'}
        />
      ) : (
        <div className="preset-grid">
          {items.map((it) => (
            <article key={it.id} className="reward-card preset-card">
              <span className="reward-icon"><Store size={18} /></span>
              <strong>{it.title}</strong>
              <p>{it.description}</p>
              <span className="wallet-pill"><Coins size={14} /> {(it.cost || 0).toLocaleString()}</span>
              <button
                className="primary"
                onClick={() => redeem(it)}
                disabled={busy === it.id || banked < (it.cost || 0)}
              >
                {busy === it.id ? 'Redeeming…' : 'Redeem'}
              </button>
              {isOwner && (
                <button className="text-button danger" onClick={() => deleteDoc(doc(db, COL.storeItems, it.id))}>
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </article>
          ))}
        </div>
      )}

      {!!history.length && (
        <section className="redemption-history">
          <SectionTitle title="Your history" />
          {history.map((h) => (
            <div key={h.id} className="count-line">
              <span>{h.type === 'ownerGrant' ? 'Owner grant' : h.itemTitle || 'Reward'}</span>
              <strong>{h.amount > 0 ? `+${h.amount}` : h.amount}</strong>
            </div>
          ))}
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
      title="New store reward"
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={add} disabled={busy}>{busy ? 'Adding…' : 'Add to Store'}</button>
        </>
      }
    >
      <div className="store-composer form-grid">
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Description"><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Coin cost" hint="1 to 100,000.">
          <input type="number" min={LIMITS.rewardCostMin} max={LIMITS.rewardCostMax} value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
