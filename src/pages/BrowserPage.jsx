import { useState } from 'react';
import { Globe, ShieldAlert } from 'lucide-react';
import { useSession } from '../lib/session';
import { SectionTitle, Empty, Field } from '../components/ui';

// The proxy stack (Ultraviolet + Bare-Mux + Epoxy) is served as static files
// under /proxy and is carried over from the original deploy untouched.
const PROXY_ENTRY = '/proxy/duckduckgo-browser-v3.html';

export default function BrowserPage() {
  const { can, isOwner } = useSession();
  const [tabName, setTabName] = useState(document.title);
  const [tabIcon, setTabIcon] = useState('');
  const [open, setOpen] = useState(false);

  const allowed = isOwner || can('accessEarlyFeatures') || can('accessPaidGames');

  if (!allowed) {
    return (
      <Empty
        icon={Globe}
        title="Astral private browser"
        body="This is an early-access feature. Ask an Owner for access."
      />
    );
  }

  // Tab cloaking: rename the tab and swap the favicon.
  const applyCloak = () => {
    if (tabName.trim()) document.title = tabName.trim();
    if (tabIcon.trim()) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = tabIcon.trim();
    }
  };

  return (
    <div className="browser-page">
      <SectionTitle eyebrow="A LITTLE SPACE FOR YOURSELF" title="Private browser" />

      <p className="browser-notice">
        <ShieldAlert size={15} />
        Only visit sites you trust. Activity may pass through the proxy transport provider.
      </p>

      <div className="form-grid community-card">
        <Field label="Custom tab name">
          <input value={tabName} onChange={(e) => setTabName(e.target.value)} placeholder="Astral Memes" />
        </Field>
        <Field label="Tab icon URL" hint="Tab icon preview updates immediately.">
          <input value={tabIcon} onChange={(e) => setTabIcon(e.target.value)} placeholder="https://…/favicon.ico" />
        </Field>
        <button className="secondary" onClick={applyCloak}>Apply</button>
      </div>

      {open ? (
        <iframe
          className="astral-browser-frame"
          src={PROXY_ENTRY}
          title="Astral private browser"
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      ) : (
        <button className="primary" onClick={() => setOpen(true)}>
          <Globe size={16} /> Open the browser
        </button>
      )}
    </div>
  );
}
