import { useRouter } from './lib/useRouter';
import { useSession } from './lib/session';
import Shell from './components/Shell';
import Particles from './components/Particles';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import FeedPage from './pages/FeedPage';
import ChatPage from './pages/ChatPage';
import ChallengesPage from './pages/ChallengesPage';
import PollsPage from './pages/PollsPage';
import StorePage from './pages/StorePage';
import GamesPage from './pages/GamesPage';
import MessagesPage from './pages/MessagesPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import UserPage from './pages/UserPage';
import AdminPage from './pages/AdminPage';
import OwnerPage from './pages/OwnerPage';
import TermsPage from './pages/TermsPage';

const ROUTES = {
  '': HomePage,
  feed: FeedPage,
  chat: ChatPage,
  challenges: ChallengesPage,
  polls: PollsPage,
  store: StorePage,
  games: GamesPage,
  messages: MessagesPage,
  profile: ProfilePage,
  settings: SettingsPage,
  u: UserPage,
  admin: AdminPage,
  owner: OwnerPage,
  terms: TermsPage
};

export default function App() {
  const { ready, user } = useSession();
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
