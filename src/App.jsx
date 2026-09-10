import { useRouter } from './lib/useRouter';
import { useSession } from './lib/session';
import Shell from './components/Shell';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import FeedPage from './pages/FeedPage';
import ChallengesPage from './pages/ChallengesPage';
import PollsPage from './pages/PollsPage';
import StorePage from './pages/StorePage';
import GamesPage from './pages/GamesPage';
import BrowserPage from './pages/BrowserPage';
import MessagesPage from './pages/MessagesPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';

const ROUTES = {
  '': HomePage,
  feed: FeedPage,
  challenges: ChallengesPage,
  polls: PollsPage,
  store: StorePage,
  games: GamesPage,
  browser: BrowserPage,
  messages: MessagesPage,
  profile: ProfilePage,
  admin: AdminPage
};

export default function App() {
  const { ready, user } = useSession();
  const router = useRouter();

  if (!ready) {
    return (
      <div className="state-page">
        <div className="loader" />
        <span>Loading Astral…</span>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  const key = router.segments[0] || '';
  const Page = ROUTES[key] || HomePage;

  return (
    <Shell router={router}>
      <Page router={router} />
    </Shell>
  );
}
