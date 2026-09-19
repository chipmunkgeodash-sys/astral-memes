import { STUDIO_GROUPS } from '../lib/studio';
import { useEffect } from 'react';
import { Megaphone } from 'lucide-react';
import { PageHead, navigateTo } from '../components/ui';

// Bump RELEASE whenever a new entry goes on top; the sidebar shows a dot until
// the member has opened this page since.
export const RELEASE = '2026-09-19-studio';
export const SEEN_KEY = 'astral-whats-new-seen';

export function hasUnseenRelease() {
  try { return localStorage.getItem(SEEN_KEY) !== RELEASE; } catch { return false; }
}

// The newest update, grouped by area: [area, route, [feature names]].
const NEWEST = [
  ...STUDIO_GROUPS.map(([name,tools])=>['Studio / '+name,'/studio',tools]),
  ['Hush Moto fuel stops','/hush-moto',['Two gas stations with fuel pumps','Fuel tanks, consumption and low-fuel warnings','Stop and refuel with E','Gas station map markers and fast travel']],
  ['RNG Roll', '/rng', [
    'Pity meter: a guaranteed 1 in 1,000+ every 1,500 dry rolls', 'Combo meter for up to ×3 points', 'Auto-roll stops on a target aura',
    'Auto-roll stops after a set number of rolls', 'Session stats', 'Daily target aura bonus', 'Free Lucky Potion every hour',
    'Roll milestones that pay points', 'Rarity set rewards', 'Rebirth for permanent luck', 'Stage themes shop', 'Luck calculator',
    'Live feed of rare finds', 'Rarity chart', 'Aura detail view', 'Favourite auras', 'Sell duplicate auras', 'Auto-sell duplicates',
    'Copy brag text for your best roll', 'Rare-find tab alert and A / Q hotkeys'
  ]],
  ['Feed and posts', '/feed', [
    'Quote posts', 'YouTube link previews', 'Image links show inline', 'Show more on long posts', 'See who liked a post',
    'See who reacted', 'Like comments', 'Reply to comments', 'Most discussed tab', 'Search the feed', 'Hide a post (with undo)',
    'Muted words', '“New posts” banner', 'Load more', 'Full date on hover', 'Copy post text', 'Character ring',
    'Preview before posting', 'Ctrl+Enter to post', 'Share a post to Global chat', 'Top post of the day', 'Quick post box',
    'Trending badge on hot posts', 'Follow hashtags', 'Sensitive image blur'
  ]],
  ['Profiles, social and chat', '/profile', [
    'Followers and following lists', 'Pronouns', 'Birthdays with a 🎂 badge', 'Joined date', 'Local time', 'Now playing',
    'Featured achievements', 'Posts / Shorts / Comments tabs', 'Guestbook', 'Copy profile link', 'Block members',
    'Invisible mode', 'Hide your coin balance', 'Chat emoji picker', 'Chat /commands like /roll and /shrug', 'Search a conversation',
    'Reply to a chat message', 'Copy a message', 'Jump to latest', '“New messages” divider', 'YouTube previews in chat',
    'Full time on hover', 'Message length counter', 'Level ring around avatars', 'Member of the day'
  ]],
  ['Casino, games and rewards', '/casino', [
    'Limbo', 'Scratch cards', 'Favourite casino games', 'Recently played games', 'Remembers your bet per game',
    'Session profit tracker', 'Loss limit', 'Per-game stats', 'Dice auto-bet', 'Biggest win today', 'Favourite games in the library',
    'Recently played in the library', 'Random game button', 'Level-up celebration', 'Level milestone coin rewards',
    'Weekly streak bonus', 'Customisable Home', 'Clock on Home', 'Quote of the day', 'Birthdays today', 'Today on Astral stats',
    'Friends online', 'XP progress card', 'Weekly community goal', '10 new achievements'
  ]],
  ['Look, settings and search', '/settings', [
    'Colour presets', 'Font choice', 'Compact sidebar', 'Focus mode (Shift+F)', 'Loading bar between pages', 'Page names in the tab title',
    'Unread dot on the tab icon', 'Back button returns to where you were', 'Skip-to-content link', 'A secret code 🌈', 'Snow',
    'Sparkle cursor', 'Desktop notifications', 'Notification sound', 'Choose which notifications you get', 'Search shorts and hashtags',
    'Recent searches', 'More search tabs', 'Export your data', 'Quick post from anywhere (Shift+P)', 'Recently visited in Ctrl+K',
    'Find members from Ctrl+K', 'Away status when idle', 'Reset this device', 'Readable spacing'
  ]]
];
const NEWEST_COUNT = NEWEST.reduce((n, [, , list]) => n + list.length, 0);

const LATEST = [
  { icon: '🎬', title: 'Shorts', body: 'A swipeable, full-screen feed of YouTube Shorts. Paste a link to post one, then like, comment and share.', to: '/shorts' },
  { icon: '🔔', title: 'Notifications', body: 'Likes, reactions, comments, follows and mentions in one place, with a bell in the top bar.', to: '/notifications' },
  { icon: '🔢', title: 'Unread count in the tab', body: 'The browser tab shows how many notifications are waiting.', to: '/notifications' },
  { icon: '🔗', title: 'Post links', body: 'Every post has its own page. Use Copy link from the ⋯ menu.', to: '/feed' },
  { icon: '#️⃣', title: 'Hashtags', body: 'Tap any #tag to see every post using it.', to: '/feed' },
  { icon: '📈', title: 'Trending tags', body: "The week's most-used tags, beside the feed.", to: '/feed' },
  { icon: '🖼️', title: 'Image viewer', body: 'Tap a post image to see it full screen.', to: '/feed' },
  { icon: '🙈', title: 'Spoilers', body: 'Wrap text in ||double bars|| to hide it until tapped.', to: '/feed' },
  { icon: '😀', title: 'Emoji shortcodes', body: 'Type :fire:, :skull:, :sob: and friends in posts, comments and chat.', to: '/chat' },
  { icon: '⚡', title: 'Emoji bar', body: 'One-tap emoji right under the post box.', to: '/feed' },
  { icon: '📝', title: 'Drafts', body: "Your unfinished post is kept if you leave the page.", to: '/feed' },
  { icon: '🔇', title: 'Mute', body: "Hide someone's posts and shorts. Manage the list in Settings.", to: '/settings' },
  { icon: '📌', title: 'Pinned posts', body: 'Pin one of your posts to the top of your profile.', to: '/profile' },
  { icon: '👤', title: 'Clickable mentions', body: '@names in posts, comments and chat open that profile.', to: '/feed' },
  { icon: '✨', title: 'Aura titles', body: 'Wear any aura you have found as a title next to your name.', to: '/rng' },
  { icon: '🌐', title: 'Profile links', body: 'Add up to three links to your profile.', to: '/profile' },
  { icon: '🤝', title: 'Mutual followers', body: '"Followed by…" on profiles shows who you both know.', to: '/members' },
  { icon: '🧭', title: 'People to follow', body: 'Suggestions on Home, based on who your friends follow.', to: '/' },
  { icon: '⭐', title: 'Levels and XP', body: 'Level up by posting, rolling, following and keeping streaks.', to: '/profile' },
  { icon: '🎯', title: 'Daily quests', body: 'Three new quests every day that pay RNG points.', to: '/' },
  { icon: '🎡', title: 'Lucky wheel', body: 'A free spin every day in the Casino for 25 to 1,000 coins.', to: '/casino' },
  { icon: '💸', title: 'Big wins ticker', body: "A live strip of the site's biggest recent wins.", to: '/casino' },
  { icon: '🔢', title: 'Keno', body: 'A new casino game: pick up to 10 numbers, win up to 1,683×.', to: '/casino' },
  { icon: '🔍', title: 'Aura search and sort', body: 'Find auras in your RNG collection, sorted how you like.', to: '/rng' },
  { icon: '🪪', title: 'Hover cards', body: "Hover anyone's name for a quick look at their profile.", to: '/members' },
  { icon: '⌨️', title: 'Keyboard shortcuts', body: 'Press ? to see them all, like g then f for the feed.', to: null },
  { icon: '⬆️', title: 'Back to top', body: 'A button to jump back up long pages.', to: '/feed' },
  { icon: '🔠', title: 'Compact mode and text size', body: 'Fit more on screen or make text bigger in Settings.', to: '/settings' },
  { icon: '🧘', title: 'Reduce motion', body: 'Switch off animations in Settings.', to: '/settings' },
  { icon: '🌌', title: 'Backgrounds and online now', body: 'Pick Starfield, Aurora, Grid or Plain, see who is online in the sidebar, and get a banner when you lose connection.', to: '/settings' }
];

const FEATURES = [
  { icon: '💬', title: 'Comments', body: 'Reply to any post in the feed.', to: '/feed' },
  { icon: '🔥', title: 'Reactions', body: 'React to posts with 🔥 😂 💀 😮 😭.', to: '/feed' },
  { icon: '✏️', title: 'Edit posts', body: 'Fix a typo in your own posts after sharing.', to: '/feed' },
  { icon: '🔖', title: 'Saved posts', body: 'Bookmark posts and find them in the Saved tab.', to: '/feed' },
  { icon: '➕', title: 'Follow people', body: 'Follow members from posts, profiles or Members.', to: '/members' },
  { icon: '🗂️', title: 'Feed tabs', body: 'Latest, Top, Following and Saved.', to: '/feed' },
  { icon: '👥', title: 'Members directory', body: 'Search everyone, filter by online, following or followers.', to: '/members' },
  { icon: '🟢', title: 'Online status', body: 'See who is on right now, and when people were last around.', to: '/members' },
  { icon: '🏆', title: 'Leaderboards', body: 'Top 100 for coins, likes, posts, followers, RNG and streaks.', to: '/leaderboard' },
  { icon: '🏅', title: 'Achievements', body: '22 badges to unlock, shown on your profile.', to: '/achievements' },
  { icon: '🎨', title: 'Status and banner', body: 'Set a status line and a banner colour on your profile.', to: '/profile' },
  { icon: '🪪', title: 'Better profiles', body: 'Followers, likes, streak, RNG stats and badges on every profile.', to: '/profile' },
  { icon: '📅', title: 'Daily streak', body: 'Visit every day to build a streak.', to: '/' },
  { icon: '⌨️', title: 'Command palette', body: 'Press Ctrl+K (or ⌘K) to jump anywhere.', to: null },
  { icon: '🌈', title: 'Accent colours', body: 'Pick your own accent colour in Settings.', to: '/settings' },
  { icon: '📣', title: '@mentions', body: 'Messages that @mention you are highlighted in chat.', to: '/chat' },
  { icon: '🔊', title: 'Sound effects', body: 'Little sounds for rolls, wins and likes — switch them off in Settings.', to: '/settings' },
  { icon: '📰', title: "What's new", body: 'This page. Check back for updates.', to: null },
  { icon: '📊', title: 'Casino stats', body: 'Your win rate, net result and biggest win.', to: '/casino' },
  { icon: '🎁', title: 'RNG daily bonus', body: 'Free points every day, bigger with a longer streak. Rolls pay about 5× more points too.', to: '/rng' }
];

export default function WhatsNewPage() {
  useEffect(() => {
    try { localStorage.setItem(SEEN_KEY, RELEASE); } catch { /* not worth reporting */ }
    window.dispatchEvent(new Event('astral-whats-new-seen'));
  }, []);

  return (
    <div className="stack">
      <PageHead
        eyebrow={new Date('2026-09-19T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
        title="What's new"
        actions={<span className="chip chip-accent"><Megaphone size={13} /> {NEWEST_COUNT + LATEST.length + FEATURES.length} new features</span>}
      />
      <h2 className="news-heading">Latest · {NEWEST_COUNT} new features</h2>
      <div className="news-groups">
        {NEWEST.map(([area, to, list]) => (
          <section key={area} className="card news-group">
            <div className="spread">
              <h3>{area} <small className="faint">{list.length}</small></h3>
              <button type="button" className="btn btn-sm" onClick={() => navigateTo(to)}>Open</button>
            </div>
            <ol className="news-list">
              {list.map((f) => <li key={f}>{f}</li>)}
            </ol>
          </section>
        ))}
      </div>

      <h2 className="news-heading">Earlier today · 30 features</h2>
      <div className="news-grid">
        {LATEST.map((f, i) => (
          <button
            key={f.title}
            className="card news-item"
            style={{ '--i': i }}
            onClick={() => f.to && navigateTo(f.to)}
            disabled={!f.to}
          >
            <span className="news-icon" aria-hidden="true">{f.icon}</span>
            <span className="news-text">
              <strong>{f.title}</strong>
              <span>{f.body}</span>
            </span>
          </button>
        ))}
      </div>

      <h2 className="news-heading">Earlier today · 20 features</h2>
      <div className="news-grid">
        {FEATURES.map((f, i) => (
          <button
            key={f.title}
            className="card news-item"
            style={{ '--i': i }}
            onClick={() => f.to && navigateTo(f.to)}
            disabled={!f.to}
          >
            <span className="news-icon" aria-hidden="true">{f.icon}</span>
            <span className="news-text">
              <strong>{f.title}</strong>
              <span>{f.body}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
