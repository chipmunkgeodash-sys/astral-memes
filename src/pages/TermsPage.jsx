import { PageHead } from '../components/ui';

const UPDATED = '10 September 2026';

export default function TermsPage() {
  return (
    <div className="stack content-narrow">
      <PageHead eyebrow={`Last updated ${UPDATED}`} title="Terms of Service" />

      <div className="card legal">
        <p className="muted">
          Astral Memes is a community site for sharing posts, chatting and playing games.
          By creating an account you agree to what's below. It's written plainly on purpose.
        </p>

        <h2>1. Your account</h2>
        <p>
          You pick a username and a password. Keep the password to yourself — anything done
          from your account is treated as done by you. Don't create an account pretending to
          be someone else, and don't share one with other people.
        </p>

        <h2>2. How to behave</h2>
        <p>Don't post, send or upload:</p>
        <ul>
          <li>Harassment, threats, or content attacking someone for who they are</li>
          <li>Sexual content, or anything sexual involving minors — this gets you removed permanently and reported</li>
          <li>Content encouraging self-harm or violence</li>
          <li>Spam, scams, malware, or links designed to trick people</li>
          <li>Other people's private information</li>
        </ul>
        <p>Owners can remove any content and suspend any account for breaking these rules.</p>

        <h2>3. Privacy — who can read what</h2>
        <p>This is the part worth reading properly.</p>
        <ul>
          <li>
            <strong>Direct messages are private.</strong> Only the two people in the
            conversation can read them. Owners cannot, and this is enforced by the database
            itself, not just hidden in the app.
          </li>
          <li>
            <strong>The global chat is public</strong> to everyone with an account.
          </li>
          <li>
            <strong>Group chats are visible to their members, and Owners are members of
            every group.</strong> An Owner is listed in the member list of every group so
            you can always see they're there. If you want a conversation nobody else can
            read, use a direct message.
          </li>
          <li>
            <strong>Posts, profiles, polls and leaderboards are public</strong> to everyone
            with an account.
          </li>
        </ul>

        <h2>4. Astral Coins</h2>
        <p>
          Coins are virtual points inside this site. They have no real-world value, cannot be
          bought with real money, cannot be cashed out, and can be adjusted or reset by an
          Owner. The challenge games use coins only. Nothing here involves real money.
        </p>

        <h2>5. Games</h2>
        <p>
          Games are third-party content, mostly from publicly available collections. They're
          provided as-is and may load resources from other sites. If you find a game with
          inappropriate content or unwanted ads, tell an Owner and it will be removed.
        </p>

        <h2>6. Your content</h2>
        <p>
          What you post stays yours. By posting it here you allow the site to display it to
          other members. Delete your posts any time; copies may sit in backups for a while
          after that.
        </p>

        <h2>7. Ending things</h2>
        <p>
          Stop using the site whenever you like. Owners may suspend or delete accounts that
          break these terms, and may shut the site down or change how it works at any time.
        </p>

        <h2>8. No guarantees</h2>
        <p>
          This is a community project, not a commercial service. It's provided as-is, with no
          promise that it will always work, stay online, or keep your data safe from loss.
          Don't store anything here you can't afford to lose.
        </p>

        <h2>9. Changes</h2>
        <p>
          These terms may change. If they change meaningfully, an announcement will go up on
          the site. Carrying on using it after that means you accept the new version.
        </p>
      </div>
    </div>
  );
}
