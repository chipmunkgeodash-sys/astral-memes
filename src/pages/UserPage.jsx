import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Coins, Rss, MessageCircle, ArrowLeft, Heart, UserX, UserPlus, UserCheck, Flame, Sparkles, Award, Link2, Pin, VolumeX,
  Volume2, Ban, Copy, Cake, Clock, CalendarDays, Music, Clapperboard, MessageSquare, BookOpen, Send, Trash2
} from 'lucide-react';
import {
  addDoc, collection, deleteDoc, doc, getDoc, limit, onSnapshot, query, serverTimestamp, where
} from 'firebase/firestore';
import { db } from '../firebase';
import { COL } from '../lib/schema';
import { useSession } from '../lib/session';
import { Empty, ErrorNote, Modal, Tabs, Toast, UserLink, navigateTo } from '../components/ui';
import {
  useAccounts, followersOf, isOnline, setFollowing, setMuted, setBlocked, currentStreak, formatWhen, fullDate, millis, copyText
} from '../lib/social';
import { levelFor, levelTitle, xpFor } from '../lib/levels';
import { AuraTitle } from '../components/AuraName';
import RichText, { myHandles } from '../components/RichText';
import { evaluate, statsFor } from '../lib/achievements';
import { AURAS, auraById } from '../lib/rng';
import { youtubeThumb } from '../lib/shorts';
import { confetti } from '../lib/confetti';
import Avatar from '../components/Avatar';
import { SkeletonPosts } from '../components/Skeleton';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Birthdays are stored as "MM-DD" with no year.
export const isBirthdayToday = (account) => {
  if (!account?.birthday) return false;
  const now = new Date();
  return account.birthday === `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
export const birthdayLabel = (mmdd) => {
  const [m, d] = (mmdd || '').split('-').map(Number);
  return m && d ? `${MONTHS[m - 1]} ${d}` : '';
};

// A ring around the avatar whose colour follows the member's level.
export const levelRing = (level) => (
  level >= 35 ? 'ring-legend' : level >= 25 ? 'ring-star' : level >= 15 ? 'ring-veteran' : level >= 8 ? 'ring-regular' : level >= 3 ? 'ring-explorer' : 'ring-new'
);

function localTime(tz) {
  if (!tz) return '';
  try { return new Date().toLocaleTimeString(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
}

// /u/<username> — a member's public profile.
export default function UserPage({ router }) {
  const { accountId, roles, profile: me, isOwner: iAmOwner } = useSession();
  const handle = decodeURIComponent(router.segments[1] || '').toLowerCase();
  const accounts = useAccounts();

  const [profileId, setProfileId] = useState(undefined); // undefined = loading, null = not found
  const [wallet, setWallet] = useState(null);
  const [posts, setPosts] = useState([]);
  const [shorts, setShorts] = useState([]);
  const [myComments, setMyComments] = useState([]);
  const [guestbook, setGuestbook] = useState([]);
  const [note, setNote] = useState('');
  const [tab, setTab] = useState('posts');
  const [list, setList] = useState(null); // 'followers' | 'following'
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const celebrated = useRef('');

  useEffect(() => {
    let alive = true;
    setProfileId(undefined);
    setWallet(null);
    setTab('posts');
    (async () => {
      try {
        // The segment is normally a username, but posts and leaderboards link
        // by uid, so fall back to treating it as one.
        const raw = router.segments[1] || '';
        const nameSnap = await getDoc(doc(db, COL.usernames, handle));
        const uid = nameSnap.exists() ? nameSnap.data()?.uid : raw;
        if (!uid) { if (alive) setProfileId(null); return; }

        const accSnap = await getDoc(doc(db, COL.accounts, uid));
        if (!alive) return;
        setProfileId(accSnap.exists() ? accSnap.id : null);

        const walletSnap = await getDoc(doc(db, COL.wallets, uid));
        if (alive && walletSnap.exists()) setWallet(walletSnap.data());
      } catch (err) {
        if (alive) { setError(err.message); setProfileId(null); }
      }
    })();
    return () => { alive = false; };
  }, [handle]);

  // Live copy from the members listener, so follows and status update in place.
  const profile = useMemo(
    () => (profileId ? (accounts || []).find((a) => a.id === profileId) : null),
    [accounts, profileId]
  );

  useEffect(() => {
    if (!profileId) return undefined;
    const byNewest = (rows) => rows.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
    const unsubs = [
      onSnapshot(query(collection(db, COL.posts), where('uid', '==', profileId), limit(50)),
        (snap) => setPosts(byNewest(snap.docs.map((d) => ({ id: d.id, ...d.data() })))), () => setPosts([])),
      onSnapshot(query(collection(db, COL.shorts), where('uid', '==', profileId), limit(50)),
        (snap) => setShorts(byNewest(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.kind === 'youtube'))), () => setShorts([])),
      onSnapshot(query(collection(db, COL.comments), where('uid', '==', profileId), limit(60)),
        (snap) => setMyComments(byNewest(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => !String(c.postId).startsWith('profile_')))), () => setMyComments([])),
      onSnapshot(query(collection(db, COL.comments), where('postId', '==', `profile_${profileId}`), limit(100)),
        (snap) => setGuestbook(byNewest(snap.docs.map((d) => ({ id: d.id, ...d.data() })))), () => setGuestbook([]))
    ];
    return () => unsubs.forEach((u) => u());
  }, [profileId]);

  // Confetti on someone's birthday, once per visit.
  useEffect(() => {
    if (profile && isBirthdayToday(profile) && celebrated.current !== profile.id) {
      celebrated.current = profile.id;
      setTimeout(() => confetti({ count: 90 }), 300);
    }
  }, [profile]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  if (profileId === undefined || (profileId && accounts === null)) {
    return <div className="stack content-narrow"><SkeletonPosts count={2} /></div>;
  }

  if (profileId === null || !profile) {
    return (
      <div className="stack">
        <button className="btn btn-ghost btn-sm" onClick={() => router.navigate('/feed')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={15} /> Back
        </button>
        <ErrorNote>{error}</ErrorNote>
        <Empty icon={UserX} title="No such member" body={`Nobody here goes by “${handle}”.`} />
      </div>
    );
  }

  const isMe = profile.id === accountId;
  const myRoles = roles.filter((r) => (profile.roleIds || []).includes(r.id));
  const ownerBadge = (profile.roleIds || []).includes('owner');
  const followers = followersOf(accounts, profile.id);
  const followingList = (profile.following || []).map((id) => (accounts || []).find((a) => a.id === id)).filter(Boolean);
  const amFollowing = (me?.following || []).includes(profile.id);
  const followsMe = (profile.following || []).includes(accountId);
  const online = isOnline(profile);
  const streak = currentStreak(profile);
  const likes = posts.reduce((n, p) => n + (p.likes || []).length, 0);
  const allBadges = evaluate(statsFor({ account: profile, posts, coins: wallet?.balance || 0, followers: followers.length }));
  const badges = allBadges.filter((a) => a.unlocked);
  const featured = (profile.featuredBadges || []).map((id) => badges.find((b) => b.id === id)).filter(Boolean);
  const best = profile.rng?.best ? auraById(profile.rng.best) : null;
  const lvl = levelFor(xpFor(profile, followers.length));
  const mutuals = followers.filter((f) => (me?.following || []).includes(f.id) && f.id !== accountId);
  const isMuted = (me?.muted || []).includes(profile.id);
  const isBlocked = (me?.blocked || []).includes(profile.id);
  const pinned = profile.pinnedPost ? posts.find((p) => p.id === profile.pinnedPost) : null;
  const links = (profile.links || []).filter((l) => /^https?:\/\//i.test(l));
  const joined = millis(profile.createdAt) || (posts.length ? Math.min(...posts.map((p) => millis(p.createdAt) || Date.now())) : 0);
  const showBalance = wallet && (!profile.hideBalance || isMe);
  const blockedByMe = me?.blocked || [];
  const visibleGuestbook = guestbook.filter((g) => !blockedByMe.includes(g.uid));

  const copyLink = async () => {
    const ok = await copyText(`${window.location.origin}/u/${encodeURIComponent(profile.username || profile.id)}`);
    flash(ok ? 'Profile link copied' : "Couldn't copy");
  };

  const block = () => {
    if (!isBlocked && !window.confirm(`Block ${profile.displayName || 'this member'}? Their posts, shorts, chat messages and notes will be hidden from you.`)) return;
    setBlocked(accountId, profile.id, !isBlocked).then(() => flash(isBlocked ? 'Unblocked' : 'Blocked')).catch((e) => setError(e.message));
  };

  const sign = async (e) => {
    e.preventDefault();
    const body = note.trim();
    if (!body) return;
    setNote('');
    try {
      await addDoc(collection(db, COL.comments), {
        postId: `profile_${profile.id}`, uid: accountId, displayName: me?.displayName || 'Astral member',
        text: body.slice(0, 500), likes: [], createdAt: serverTimestamp()
      });
    } catch (err) { setError(err.message); setNote(body); }
  };

  return (
    <div className="stack content-narrow">
      <button className="btn btn-ghost btn-sm" onClick={() => window.history.back()} style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft size={15} /> Back
      </button>

      <div className="card profile-card" style={profile.banner ? { '--banner': profile.banner } : undefined}>
        <div className="profile-banner" />
        <div className="profile-top">
          <span className={`level-ring ${levelRing(lvl.level)}`} title={`Level ${lvl.level}`}>
            <Avatar profile={profile} size={84} online={online} />
          </span>
          <div className="row wrap" style={{ marginLeft: 'auto' }}>
            {isMe ? (
              <button className="btn btn-sm" onClick={() => router.navigate('/profile')}>Edit profile</button>
            ) : (
              <>
                <button
                  className={amFollowing ? 'btn btn-sm' : 'btn btn-sm btn-primary'}
                  onClick={() => setFollowing(accountId, profile.id, !amFollowing).catch((e) => setError(e.message))}
                >
                  {amFollowing ? <><UserCheck size={14} /> Following</> : <><UserPlus size={14} /> Follow</>}
                </button>
                <button className="btn btn-sm" onClick={() => router.navigate('/messages')}>
                  <MessageCircle size={14} /> Message
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setMuted(accountId, profile.id, !isMuted).catch((e) => setError(e.message))}
                  title={isMuted ? 'Unmute' : 'Mute: hide their posts and shorts'}
                  disabled={isBlocked}
                >
                  {isMuted ? <><Volume2 size={14} /> Unmute</> : <><VolumeX size={14} /> Mute</>}
                </button>
                <button className={isBlocked ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-ghost'} onClick={block} title={isBlocked ? 'Unblock' : 'Block'}>
                  <Ban size={14} /> {isBlocked ? 'Unblock' : 'Block'}
                </button>
              </>
            )}
            <button className="btn btn-sm btn-ghost btn-icon" onClick={copyLink} title="Copy profile link" aria-label="Copy profile link"><Copy size={14} /></button>
          </div>
        </div>

        <h1 style={{ fontSize: '1.5rem' }}>
          {profile.displayName || 'Astral member'}
          {profile.pronouns && <small className="pronouns">{profile.pronouns}</small>}
          {isBirthdayToday(profile) && <span className="birthday-badge" title="Birthday today"> 🎂</span>}
        </h1>
        <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
          <span className="level-badge">Lv {lvl.level}<em>{levelTitle(lvl.level)}</em></span>
          <AuraTitle account={profile} />
        </div>
        <div className="xp-bar" title={`${lvl.xp.toLocaleString()} XP · ${(lvl.to - lvl.xp).toLocaleString()} to level ${lvl.level + 1}`}><i style={{ width: `${lvl.progress * 100}%` }} /></div>
        <p className="faint">
          {profile.username && `@${profile.username}`}
          {followsMe && !isMe && <span className="chip" style={{ marginLeft: 8 }}>Follows you</span>}
        </p>
        {profile.status && <p className="profile-status">{profile.status}</p>}
        {profile.nowPlaying && <p className="now-playing"><Music size={13} /> {profile.nowPlaying}</p>}
        <p className="muted" style={{ marginTop: 6 }}>{profile.bio ? <RichText text={profile.bio} me={myHandles(me)} /> : 'No bio yet.'}</p>
        {!!links.length && (
          <div className="profile-links">
            {links.map((l) => (
              <a key={l} href={l} target="_blank" rel="noreferrer noopener"><Link2 size={13} /> {l.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').slice(0, 40)}</a>
            ))}
          </div>
        )}
        <div className="profile-facts">
          {joined > 0 && <span title={fullDate({ toMillis: () => joined })}><CalendarDays size={13} /> Joined {new Date(joined).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>}
          {profile.birthday && <span><Cake size={13} /> {birthdayLabel(profile.birthday)}</span>}
          {profile.timezone && localTime(profile.timezone) && <span><Clock size={13} /> {localTime(profile.timezone)} their time</span>}
        </div>
        {!isMe && !!mutuals.length && (
          <p className="faint mutuals">
            Followed by {mutuals.slice(0, 2).map((m) => m.displayName || 'someone').join(' and ')}
            {mutuals.length > 2 ? ` and ${mutuals.length - 2} more you follow` : ''}
          </p>
        )}
        <p className="faint" style={{ marginTop: 6 }}>
          {online ? <span className="chip chip-live"><span className="dot" /> Online now</span>
            : profile.lastSeen && !profile.invisible ? `Last seen ${formatWhen(profile.lastSeen)}` : ''}
        </p>

        <div className="wrap" style={{ marginTop: 10 }}>
          {ownerBadge && <span className="chip chip-accent">Owner</span>}
          {myRoles.filter((r) => r.id !== 'owner').map((r) => (
            <span key={r.id} className="chip">
              <span className="dot" style={{ background: r.color || 'currentColor' }} />
              {r.name}
            </span>
          ))}
        </div>

        <div className="profile-stats">
          <button type="button" className="link-quiet" onClick={() => setList('followers')}><strong>{followers.length}</strong> followers</button>
          <button type="button" className="link-quiet" onClick={() => setList('following')}><strong>{followingList.length}</strong> following</button>
          <span><strong>{posts.length}</strong> posts</span>
          <span><strong>{likes}</strong> likes</span>
          {showBalance && <span><Coins size={13} /> <strong>{(wallet.balance ?? 0).toLocaleString()}</strong></span>}
          {streak > 0 && <span><Flame size={13} /> <strong>{streak}</strong> day streak</span>}
        </div>
      </div>

      {!!featured.length && (
        <div className="featured-badges">
          {featured.map((b) => (
            <div key={b.id} className={`featured-badge badge-${b.tier}`}>
              <span aria-hidden="true">{b.icon}</span>
              <strong>{b.name}</strong>
              <small>{b.desc}</small>
            </div>
          ))}
        </div>
      )}

      {(best || profile.rng?.rolls) && (
        <div className="card">
          <h2 className="rng-heading"><Sparkles size={15} /> RNG Roll</h2>
          <div className="profile-stats" style={{ marginTop: 0 }}>
            {best && <span>Best aura <strong>{best.name}</strong></span>}
            <span>Best roll <strong>1 in {(profile.rng.bestRoll || best?.chance || 1).toLocaleString()}</strong></span>
            <span><strong>{(profile.rng.rolls || 0).toLocaleString()}</strong> rolls</span>
            <span><strong>{Object.keys(profile.rng.counts || {}).length}</strong> / {AURAS.length} auras</span>
            {!!profile.rng.rebirths && <span><strong>{profile.rng.rebirths}</strong> rebirths</span>}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="rng-heading"><Award size={15} /> Achievements <small className="faint">{badges.length} / {allBadges.length}</small></h2>
        {badges.length ? (
          <div className="badge-row">
            {badges.map((b) => (
              <span key={b.id} className={`badge badge-${b.tier}`} title={`${b.name} — ${b.desc}`}>
                <span aria-hidden="true">{b.icon}</span> {b.name}
              </span>
            ))}
          </div>
        ) : <p className="faint">None unlocked yet.</p>}
      </div>

      <div className="tabs-scroll">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'posts', label: <><Rss size={12} /> Posts {posts.length}</> },
            { value: 'shorts', label: <><Clapperboard size={12} /> Shorts {shorts.length}</> },
            { value: 'comments', label: <><MessageSquare size={12} /> Comments {myComments.length}</> },
            { value: 'guestbook', label: <><BookOpen size={12} /> Guestbook {visibleGuestbook.length}</> }
          ]}
        />
      </div>

      {tab === 'posts' && (
        <section>
          {pinned && (
            <article className="card pinned" style={{ marginBottom: 12 }}>
              <span className="pinned-label"><Pin size={12} /> Pinned</span>
              {pinned.text && <p className="post-body" style={{ marginTop: 0 }}><RichText text={pinned.text} me={myHandles(me)} /></p>}
              {pinned.imageUrl && <img className="post-image" src={pinned.imageUrl} alt="" loading="lazy" />}
              <div className="row faint" style={{ marginTop: 8 }}><Heart size={13} /> {(pinned.likes || []).length}<span>· {formatWhen(pinned.createdAt)}</span></div>
            </article>
          )}
          {!posts.length ? (
            <Empty icon={Rss} title="No posts yet." />
          ) : (
            <div className="list">
              {posts.map((p) => (
                <article key={p.id} className="card clickable" onClick={() => navigateTo(`/post/${p.id}`)}>
                  {p.text && <p className="post-body" style={{ marginTop: 0 }}><RichText text={p.text} me={myHandles(me)} /></p>}
                  {p.imageUrl && <img className="post-image" src={p.imageUrl} alt="" loading="lazy" />}
                  <div className="row faint" style={{ marginTop: 8 }}>
                    <Heart size={13} /> {(p.likes || []).length}
                    <span title={fullDate(p.createdAt)}>· {formatWhen(p.createdAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'shorts' && (
        !shorts.length ? <Empty icon={Clapperboard} title="No shorts yet." /> : (
          <div className="profile-shorts">
            {shorts.map((s) => (
              <button key={s.id} type="button" className="profile-short" onClick={() => navigateTo(`/shorts/${s.id}`)}>
                <img src={youtubeThumb(s.media)} alt="" loading="lazy" />
                <span><Heart size={11} /> {(s.likes || []).length}</span>
              </button>
            ))}
          </div>
        )
      )}

      {tab === 'comments' && (
        !myComments.length ? <Empty icon={MessageSquare} title="No comments yet." /> : (
          <div className="list">
            {myComments.map((c) => (
              <div key={c.id} className="card clickable profile-comment" role="link" tabIndex={0} onClick={() => navigateTo(`/post/${c.postId}`)} onKeyDown={(e) => { if (e.key === 'Enter') navigateTo(`/post/${c.postId}`); }}>
                <RichText text={c.text} me={myHandles(me)} />
                <small className="faint" title={fullDate(c.createdAt)}>{formatWhen(c.createdAt)}</small>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'guestbook' && (
        <section className="stack" style={{ gap: 10 }}>
          {!isMe && (
            <form className="comment-form" onSubmit={sign}>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Leave ${profile.displayName || 'them'} a note…`} maxLength={500} />
              <button className="btn btn-primary btn-icon" type="submit" disabled={!note.trim()} aria-label="Sign guestbook"><Send size={15} /></button>
            </form>
          )}
          {!visibleGuestbook.length ? <Empty icon={BookOpen} title="The guestbook is empty." body={isMe ? 'Notes people leave on your profile show up here.' : 'Be the first to sign it.'} /> : (
            <div className="list">
              {visibleGuestbook.map((g) => (
                <div key={g.id} className="card guestbook-note">
                  <Avatar profile={(accounts || []).find((a) => a.id === g.uid) || { id: g.uid, displayName: g.displayName }} size={30} />
                  <div className="grow">
                    <span className="row" style={{ gap: 6 }}>
                      <UserLink to={g.uid}>{g.displayName || 'Astral member'}</UserLink>
                      <small className="faint" title={fullDate(g.createdAt)}>{formatWhen(g.createdAt)}</small>
                    </span>
                    <p className="post-body" style={{ margin: '4px 0 0' }}><RichText text={g.text} me={myHandles(me)} /></p>
                  </div>
                  {(g.uid === accountId || isMe || iAmOwner) && (
                    <button className="msg-del" onClick={() => deleteDoc(doc(db, COL.comments, g.id)).catch((e) => setError(e.message))} aria-label="Delete note"><Trash2 size={12} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <ErrorNote>{error}</ErrorNote>

      {list && (
        <Modal title={list === 'followers' ? `Followers · ${followers.length}` : `Following · ${followingList.length}`} onClose={() => setList(null)}>
          <div className="stack" style={{ gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
            {(list === 'followers' ? followers : followingList).map((a) => (
              <div key={a.id} className="spread">
                <span className="row">
                  <Avatar profile={a} size={30} online={isOnline(a)} />
                  <UserLink to={a.username || a.id}>{a.displayName || 'Astral member'}</UserLink>
                </span>
                {a.id !== accountId && (
                  <button
                    className={(me?.following || []).includes(a.id) ? 'btn btn-sm' : 'btn btn-sm btn-primary'}
                    onClick={() => setFollowing(accountId, a.id, !(me?.following || []).includes(a.id)).catch((e) => setError(e.message))}
                  >
                    {(me?.following || []).includes(a.id) ? 'Following' : 'Follow'}
                  </button>
                )}
              </div>
            ))}
            {!(list === 'followers' ? followers : followingList).length && <p className="faint">Nobody yet.</p>}
          </div>
        </Modal>
      )}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
