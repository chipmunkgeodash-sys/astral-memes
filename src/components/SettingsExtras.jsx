import { useEffect, useState } from 'react';
import { Download, RotateCcw, Bell, Sparkles, VolumeX, Ban, Type } from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, updateDoc, where, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { SectionHead, Tabs } from './ui';
import { setBlocked, useAccounts } from '../lib/social';
import { KEYS, useLocal } from '../lib/local';
import { FONTS, PRESETS } from '../lib/display';
import { NOTIF_DEFAULTS, EFFECT_DEFAULTS } from './SiteEffects';
import Avatar from './Avatar';

function Switch({ on, onChange, label }) {
  return (
    <button type="button" className={on ? 'switch on' : 'switch'} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function LookCard({ display, updateDisplay }) {
  return (
    <div className="card">
      <SectionHead title="Look and feel" />
      <div className="stack" style={{ gap: 14 }}>
        <div className="field">
          <span>Colour preset</span>
          <div className="preset-grid">
            {PRESETS.map((p) => (
              <button key={p.value} type="button" className={display.preset === p.value ? `preset preset-${p.value} on` : `preset preset-${p.value}`} onClick={() => updateDisplay({ preset: p.value })} aria-pressed={display.preset === p.value}>
                <span className="preset-swatch" />
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="toggle-row">
          <span><strong><Type size={13} /> Font</strong></span>
          <Tabs value={display.font} onChange={(v) => updateDisplay({ font: v })} options={FONTS} />
        </div>
        <div className="toggle-row">
          <span><strong>Readable spacing</strong><span className="muted"> — wider line and letter spacing for easier reading.</span></span>
          <Switch on={display.spacing === 'readable'} onChange={(v) => updateDisplay({ spacing: v ? 'readable' : 'normal' })} label="Readable spacing" />
        </div>
        <div className="toggle-row">
          <span><strong>Compact sidebar</strong><span className="muted"> — icons only, more room for pages.</span></span>
          <Switch on={display.sidebar === 'icons'} onChange={(v) => updateDisplay({ sidebar: v ? 'icons' : 'full' })} label="Compact sidebar" />
        </div>
        <div className="toggle-row">
          <span><strong>Focus mode</strong><span className="muted"> — hides the sidebar and extras. Toggle any time with Shift+F.</span></span>
          <Switch on={display.focus === 'on'} onChange={(v) => updateDisplay({ focus: v ? 'on' : 'off' })} label="Focus mode" />
        </div>
      </div>
    </div>
  );
}

export function EffectsCard() {
  const [effects, setEffects] = useLocal(KEYS.effects, EFFECT_DEFAULTS);
  const fx = { ...EFFECT_DEFAULTS, ...(effects || {}) };
  return (
    <div className="card">
      <SectionHead title={<><Sparkles size={16} /> Fun effects</>} />
      <div className="stack" style={{ gap: 12 }}>
        <div className="toggle-row">
          <span><strong>Snow</strong><span className="muted"> — gentle snowfall over every page.</span></span>
          <Switch on={fx.snow} onChange={(v) => setEffects({ ...fx, snow: v })} label="Snow" />
        </div>
        <div className="toggle-row">
          <span><strong>Sparkle cursor</strong><span className="muted"> — a rainbow trail behind your mouse.</span></span>
          <Switch on={fx.cursor} onChange={(v) => setEffects({ ...fx, cursor: v })} label="Sparkle cursor" />
        </div>
        <p className="faint">Psst — try the Konami code anywhere.</p>
      </div>
    </div>
  );
}

export function NotificationsCard() {
  const [prefs, setPrefs] = useLocal(KEYS.notifPrefs, NOTIF_DEFAULTS);
  const p = { ...NOTIF_DEFAULTS, ...(prefs || {}) };
  const [permission, setPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const set = (patch) => setPrefs({ ...p, ...patch });

  const enableDesktop = async (on) => {
    if (!on) { set({ desktop: false }); return; }
    if (typeof Notification === 'undefined') return;
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPermission(result);
    set({ desktop: result === 'granted' });
  };

  const TYPES = [
    ['like', 'Likes'], ['react', 'Reactions'], ['comment', 'Comments'], ['mention', 'Mentions'], ['follow', 'New followers']
  ];

  return (
    <div className="card">
      <SectionHead title={<><Bell size={16} /> Notifications</>} />
      <div className="stack" style={{ gap: 12 }}>
        {TYPES.map(([key, label]) => (
          <div key={key} className="toggle-row">
            <span><strong>{label}</strong></span>
            <Switch on={p[key]} onChange={(v) => set({ [key]: v })} label={label} />
          </div>
        ))}
        <div className="toggle-row">
          <span><strong>Sound for new notifications</strong></span>
          <Switch on={p.sound} onChange={(v) => set({ sound: v })} label="Notification sound" />
        </div>
        <div className="toggle-row">
          <span>
            <strong>Desktop notifications</strong>
            <span className="muted"> — {permission === 'unsupported' ? 'not supported in this browser.' : permission === 'denied' ? 'blocked in your browser settings.' : 'shown when this tab is in the background.'}</span>
          </span>
          <Switch on={p.desktop && permission === 'granted'} onChange={enableDesktop} label="Desktop notifications" />
        </div>
      </div>
    </div>
  );
}

export function MutedWordsCard() {
  const { accountId, profile } = useSession();
  const [word, setWord] = useState('');
  const [error, setError] = useState('');
  const words = profile?.mutedWords || [];
  const save = (next) => updateDoc(doc(db, COL.accounts, accountId), { mutedWords: next }).catch((e) => setError(e.message));
  const add = (e) => {
    e.preventDefault();
    const w = word.trim().toLowerCase();
    if (!w || words.includes(w)) return;
    setWord('');
    save([...words, w].slice(0, 100));
  };
  return (
    <div className="card">
      <SectionHead title={<><VolumeX size={16} /> Muted words</>} />
      <p className="muted" style={{ marginBottom: 10 }}>Posts containing these words are hidden from your feed.</p>
      <form className="comment-form" onSubmit={add}>
        <input className="input" value={word} onChange={(e) => setWord(e.target.value)} placeholder="Add a word or phrase" maxLength={40} />
        <button className="btn btn-primary" type="submit" disabled={!word.trim()}>Add</button>
      </form>
      {!!words.length && (
        <div className="wrap" style={{ marginTop: 10 }}>
          {words.map((w) => (
            <button key={w} type="button" className="chip" onClick={() => save(words.filter((x) => x !== w))} title="Remove">{w} ✕</button>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function BlockedCard() {
  const { accountId, profile } = useSession();
  const accounts = useAccounts();
  const blocked = (profile?.blocked || []).map((id) => (accounts || []).find((a) => a.id === id) || { id, displayName: 'Unknown member' });
  return (
    <div className="card">
      <SectionHead title={<><Ban size={16} /> Blocked members</>} />
      {!blocked.length ? (
        <p className="muted">Nobody blocked. Block someone from their profile to hide their posts, shorts, notes and chat messages.</p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {blocked.map((a) => (
            <div key={a.id} className="spread">
              <span className="row"><Avatar profile={a} size={28} /> {a.displayName || 'Astral member'}</span>
              <button className="btn btn-sm" onClick={() => setBlocked(accountId, a.id, false)}>Unblock</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Everything the site holds about you, downloaded as one JSON file.
export function DataCard() {
  const { accountId, profile } = useSession();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const exportData = async () => {
    setBusy(true); setDone('');
    try {
      const mine = async (col) => (await getDocs(query(collection(db, col), where('uid', '==', accountId), limit(1000)))).docs.map((d) => ({ id: d.id, ...d.data() }));
      const wallet = await getDoc(doc(db, COL.wallets, accountId));
      const data = {
        exportedAt: new Date().toISOString(),
        account: profile,
        wallet: wallet.exists() ? wallet.data() : null,
        posts: await mine(COL.posts),
        shorts: await mine(COL.shorts),
        comments: await mine(COL.comments),
        results: await mine(COL.redemptions)
      };
      const json = JSON.stringify(data, (k, v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v), 2);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `astral-${profile?.username || 'data'}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setDone('Download started.');
    } catch (err) { setDone(err.message); } finally { setBusy(false); }
  };

  const resetLocal = () => {
    if (!window.confirm('Reset this device’s settings? Theme, display, sounds, favourites, drafts and hidden posts on this browser go back to default. Your account is untouched.')) return;
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('astral')).forEach((k) => localStorage.removeItem(k));
    } catch { /* nothing to reset */ }
    window.location.reload();
  };

  useEffect(() => () => setDone(''), []);

  return (
    <div className="card">
      <SectionHead title="Your data" />
      <div className="stack" style={{ gap: 10 }}>
        <div className="toggle-row">
          <span><strong>Export my data</strong><span className="muted"> — your profile, wallet, posts, shorts, comments and casino results as a JSON file.</span></span>
          <button className="btn btn-sm" onClick={exportData} disabled={busy}><Download size={14} /> {busy ? 'Preparing…' : 'Export'}</button>
        </div>
        <div className="toggle-row">
          <span><strong>Reset this device</strong><span className="muted"> — clears settings saved in this browser only.</span></span>
          <button className="btn btn-sm btn-danger" onClick={resetLocal}><RotateCcw size={14} /> Reset</button>
        </div>
        {done && <p className="faint">{done}</p>}
      </div>
    </div>
  );
}
