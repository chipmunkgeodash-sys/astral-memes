import { useState, useEffect } from 'react';
import { Save, Coins, Rss, Flame, Users } from 'lucide-react';
import { doc, updateDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { PageHead, SectionHead, Field, ErrorNote, Toast, navigateTo } from '../components/ui';
import { useAccounts, followersOf, currentStreak } from '../lib/social';
import Avatar from '../components/Avatar';
import { levelFor, levelTitle, xpFor } from '../lib/levels';
import { AuraTitle } from '../components/AuraName';
import { evaluate, statsFor } from '../lib/achievements';

const PRONOUNS = ['', 'he/him', 'she/her', 'they/them', 'he/they', 'she/they', 'any pronouns'];

const BANNERS = ['', '#5b5bd6', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#111827'];
const STATUS_PRESETS = ['🎮 Gaming', '📚 Studying', '😴 Sleeping', '🎧 Vibing', '🔥 On a roll', '🌙 Night owl'];

function LevelLine({ profile, followers }) {
  const lvl = levelFor(xpFor(profile, followers));
  return (
    <>
      <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
        <span className="level-badge">Lv {lvl.level}<em>{levelTitle(lvl.level)}</em></span>
        <AuraTitle account={profile} />
        <small className="faint">{lvl.xp.toLocaleString()} XP · {(lvl.to - lvl.xp).toLocaleString()} to next level</small>
      </div>
      <div className="xp-bar"><i style={{ width: `${lvl.progress * 100}%` }} /></div>
    </>
  );
}

export default function ProfilePage() {
  const { accountId, profile, balance, roles, isOwner } = useSession();
  const accounts = useAccounts();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [picture, setPicture] = useState('');
  const [status, setStatus] = useState('');
  const [banner, setBanner] = useState('');
  const [links, setLinks] = useState(['', '', '']);
  const [pronouns, setPronouns] = useState('');
  const [birthday, setBirthday] = useState('');
  const [nowPlaying, setNowPlaying] = useState('');
  const [featured, setFeatured] = useState([]);
  const [invisible, setInvisible] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);
  const [myPosts, setMyPosts] = useState([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [postCount, setPostCount] = useState(0);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || '');
    setBio(profile.bio || '');
    setPicture(profile.picture || '');
    setStatus(profile.status || '');
    setBanner(profile.banner || '');
    setLinks([0, 1, 2].map((i) => (profile.links || [])[i] || ''));
    setPronouns(profile.pronouns || '');
    setBirthday(profile.birthday || '');
    setNowPlaying(profile.nowPlaying || '');
    setFeatured(profile.featuredBadges || []);
    setInvisible(!!profile.invisible);
    setHideBalance(!!profile.hideBalance);
  }, [profile?.id]);

  useEffect(() => {
    if (!accountId) return undefined;
    return onSnapshot(
      query(collection(db, COL.posts), where('uid', '==', accountId)),
      (snap) => { setPostCount(snap.size); setMyPosts(snap.docs.map((d) => d.data())); },
      () => setPostCount(0)
    );
  }, [accountId]);

  const save = async () => {
    if (!displayName.trim()) { setError('Add a display name.'); return; }
    setBusy(true); setError(''); setSaved(false);
    try {
      await updateDoc(doc(db, COL.accounts, accountId), {
        displayName: displayName.trim(),
        bio: bio.trim(),
        picture: picture.trim() || '',
        status: status.trim().slice(0, 60),
        banner,
        links: links.map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l)).slice(0, 3),
        pronouns: pronouns.trim().slice(0, 24),
        birthday: /^\d{2}-\d{2}$/.test(birthday) ? birthday : '',
        nowPlaying: nowPlaying.trim().slice(0, 80),
        featuredBadges: featured.slice(0, 3),
        invisible,
        hideBalance,
        timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })()
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const myRoles = roles.filter((r) => (profile?.roleIds || []).includes(r.id));
  const followers = followersOf(accounts, accountId).length;
  const unlocked = evaluate(statsFor({ account: profile, posts: myPosts, coins: balance, followers })).filter((a) => a.unlocked);
  const toggleFeatured = (id) => setFeatured((f) => (f.includes(id) ? f.filter((x) => x !== id) : f.length >= 3 ? f : [...f, id]));
  const [bMonth, bDay] = (birthday || '-').split('-');
  const setBirthdayPart = (m, d) => setBirthday(m && d ? `${m}-${d}` : '');

  return (
    <div className="stack content-narrow">
      <PageHead
        eyebrow="Your space"
        title="Profile"
        actions={profile?.username && (
          <button className="btn btn-sm" onClick={() => navigateTo(`/u/${encodeURIComponent(profile.username)}`)}>View public profile</button>
        )}
      />

      <div className="card profile-card" style={banner ? { '--banner': banner } : undefined}>
        <div className="profile-banner" />
        <div className="profile-top">
          <Avatar profile={{ ...profile, picture }} size={84} online />
        </div>
        <h2>{displayName || 'Astral member'}</h2>
        <LevelLine profile={profile} followers={followers} />
        {profile?.username && <p className="faint">@{profile.username}</p>}
        {status && <p className="profile-status">{status}</p>}
        <p className="muted" style={{ marginTop: 6 }}>{bio || 'No bio yet.'}</p>
        <div className="wrap" style={{ marginTop: 10 }}>
          {isOwner && <span className="chip chip-accent">Owner</span>}
          {myRoles.filter((r) => r.id !== 'owner').map((r) => (
            <span key={r.id} className="chip">
              <span className="dot" style={{ background: r.color || 'currentColor' }} />
              {r.name}
            </span>
          ))}
        </div>
        <div className="profile-stats">
          <span><Coins size={13} /> <strong>{balance.toLocaleString()}</strong> coins</span>
          <span><Rss size={13} /> <strong>{postCount}</strong> posts</span>
          <span><Users size={13} /> <strong>{followers}</strong> followers</span>
          <span><strong>{(profile?.following || []).length}</strong> following</span>
          <span><Flame size={13} /> <strong>{currentStreak(profile)}</strong> day streak</span>
        </div>
      </div>

      <div className="card">
        <SectionHead title="Edit profile" />
        <div className="stack" style={{ gap: 14 }}>
          <Field label="Display name">
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} />
          </Field>
          <Field label="Status" hint="A short line shown on your profile and in Members.">
            <input value={status} onChange={(e) => setStatus(e.target.value)} maxLength={60} placeholder="What are you up to?" />
          </Field>
          <div className="wrap">
            {STATUS_PRESETS.map((s) => (
              <button key={s} type="button" className="btn btn-sm" onClick={() => setStatus(s)}>{s}</button>
            ))}
            {status && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setStatus('')}>Clear</button>}
          </div>
          <div className="row wrap" style={{ gap: 12, alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: 1, minWidth: 160 }}>
              <span>Pronouns</span>
              <input list="pronoun-options" value={pronouns} onChange={(e) => setPronouns(e.target.value)} maxLength={24} placeholder="Optional" />
              <datalist id="pronoun-options">{PRONOUNS.filter(Boolean).map((x) => <option key={x} value={x} />)}</datalist>
            </label>
            <div className="field">
              <span>Birthday (no year)</span>
              <div className="row" style={{ gap: 6 }}>
                <select className="input" value={bMonth} onChange={(e) => setBirthdayPart(e.target.value, bDay || '01')} aria-label="Birthday month">
                  <option value="">Month</option>
                  {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m, i) => (
                    <option key={m} value={m}>{new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'short' })}</option>
                  ))}
                </select>
                <select className="input" value={bDay} onChange={(e) => setBirthdayPart(bMonth || '01', e.target.value)} aria-label="Birthday day">
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map((d) => <option key={d} value={d}>{Number(d)}</option>)}
                </select>
                {birthday && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setBirthday('')}>Clear</button>}
              </div>
            </div>
          </div>
          <Field label="Now playing" hint="A song, game or show — shown on your profile.">
            <input value={nowPlaying} onChange={(e) => setNowPlaying(e.target.value)} maxLength={80} placeholder="🎵 What are you into right now?" />
          </Field>
          <Field label="Bio" hint="A little about you.">
            <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} />
          </Field>
          <div className="field">
            <span>Links</span>
            {links.map((l, i) => (
              <input key={i} value={l} onChange={(e) => setLinks((ls) => ls.map((x, j) => (j === i ? e.target.value : x)))} placeholder={['https://youtube.com/@you', 'https://your-site.com', 'https://…'][i]} />
            ))}
            <span className="hint">Up to three, starting with https://</span>
          </div>
          <Field label="Picture URL">
            <input value={picture} onChange={(e) => setPicture(e.target.value)} placeholder="https://…" />
          </Field>
          <div className="field">
            <span>Banner colour</span>
            <div className="swatches">
              {BANNERS.map((c) => (
                <button
                  key={c || 'none'}
                  type="button"
                  className={banner === c ? 'swatch on' : 'swatch'}
                  style={{ background: c || 'var(--surface-2)' }}
                  onClick={() => setBanner(c)}
                  aria-label={c ? `Banner ${c}` : 'No banner'}
                  aria-pressed={banner === c}
                >
                  {!c && '∅'}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Featured achievements <small className="faint">pick up to 3 · {featured.length}/3</small></span>
            {unlocked.length ? (
              <div className="badge-row">
                {unlocked.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={featured.includes(b.id) ? `badge badge-${b.tier} badge-picked` : `badge badge-${b.tier}`}
                    onClick={() => toggleFeatured(b.id)}
                    aria-pressed={featured.includes(b.id)}
                  >
                    <span aria-hidden="true">{b.icon}</span> {b.name}
                  </button>
                ))}
              </div>
            ) : <span className="hint">Unlock achievements to feature them.</span>}
          </div>
          <div className="field">
            <span>Privacy</span>
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={invisible} onChange={(e) => setInvisible(e.target.checked)} />
              Invisible mode — don't show me as online or when I was last seen
            </label>
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={hideBalance} onChange={(e) => setHideBalance(e.target.checked)} />
              Hide my coin balance on my public profile
            </label>
          </div>
          <ErrorNote>{error}</ErrorNote>
          <div>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              <Save size={15} /> {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      {saved && <Toast>Profile saved</Toast>}
    </div>
  );
}
