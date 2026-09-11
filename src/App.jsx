import { useRouter } from './lib/useRouter';
import { Ban } from 'lucide-react';
import { useSession } from './lib/session';
import Shell from './components/Shell';
import Particles from './components/Particles';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import FeedPage from './pages/FeedPage';
import ChatPage from './pages/ChatPage';
import CasinoPage from './pages/CasinoPage';
import PollsPage from './pages/PollsPage';
import StorePage from './pages/StorePage';
import GamesPage from './pages/GamesPage';
import MessagesPage from './pages/MessagesPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import UserPage from './pages/UserPage';
import AdminPage from './pages/AdminPage';
import TermsPage from './pages/TermsPage';
import SearchPage from './pages/SearchPage';

const ROUTES = {
  '': HomePage,
  feed: FeedPage,
  chat: ChatPage,
  casino: CasinoPage,
  polls: PollsPage,
  store: StorePage,
  games: GamesPage,
  messages: MessagesPage,
  profile: ProfilePage,
  settings: SettingsPage,
  u: UserPage,
  admin: AdminPage,
  terms: TermsPage,
  search: SearchPage
};

export default function App() {
  const { ready, user, profile, signOut } = useSession();
  const router = useRouter();

  if (!ready) {
    return (
      <>
        <Particles />
        <div className="state">
          <div className="spinner" />
          <span>Loading Astral…</span>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Particles density={1.4} />
        <AuthPage />
      </>
    );
  }

  // Suspended accounts can sign in but get nowhere. The rules block their
  // writes too, so this isn't the only thing standing in the way.
  if (profile?.suspended) {
    return (
      <>
        <Particles />
        <div className="state">
          <span className="empty-icon"><Ban size={22} /></span>
          <h1>Account suspended</h1>
          <p className="muted" style={{ maxWidth: '40ch', textAlign: 'center' }}>
            An Owner has suspended this account. If you think that's a mistake, ask them to look again.
          </p>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </>
    );
  }

  const Page = ROUTES[router.segments[0] || ''] || HomePage;

  return (
    <>
      <Particles />
      <Shell router={router}>
        <Page router={router} />
      </Shell>
    </>
  );
}
