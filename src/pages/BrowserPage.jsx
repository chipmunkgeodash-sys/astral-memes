import { useState } from 'react';
import { Globe, ShieldAlert } from 'lucide-react';
import { useSession } from '../lib/session';
import { PageHead, Empty, Field } from '../components/ui';

// The proxy stack (Ultraviolet + Bare-Mux + Epoxy) is served as static files
// under /proxy, carried over from the original deploy untouched.
const PROXY_ENTRY = '/proxy/duckduckgo-browser-v3.html';

export default function BrowserPage() {
  const { can, isOwner } = useSession();
  const [tabName, setTabName] = useState('');
  const [tabIcon, setTabIcon] = useState('');
  const [open, setOpen] = useState(false);

  const allowed = isOwner || can('accessEarlyFeatures') || can('accessPaidGames');

  if (!allowed) {
    return (
      <Empty
        icon={Globe}
        title="Private browser is locked"
        body="This is an early-access feature. Ask an Owner for the Astral role."
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
    <div className="stack">
      <PageHead eyebrow="A little space for yourself" title="Private browser" />

      <div className="card">
        <p className="row muted" style={{ marginBottom: 14 }}>
          <ShieldAlert size={15} />
          Only visit sites you trust. Traffic passes through the proxy transport provider.
        </p>

        <div className="stack" style={{ gap: 12 }}>
          <Field label="Tab name" hint="Changes what this tab is called.">
            <input value={tabName} onChange={(e) => setTabName(e.target.value)} placeholder="Astral Memes" />
          </Field>
          <Field label="Tab icon URL">
            <input value={tabIcon} onChange={(e) => setTabIcon(e.target.value)} placeholder="https://…/favicon.ico" />
          </Field>
          <div className="row">
            <button className="btn" onClick={applyCloak} disabled={!tabName.trim() && !tabIcon.trim()}>
              Apply
            </button>
            {!open && (
              <button className="btn btn-primary" onClick={() => setOpen(true)}>
                <Globe size={15} /> Open browser
              </button>
            )}
          </div>
        </div>
      </div>

      {open && (
        <iframe
          className="frame"
          src={PROXY_ENTRY}
          title="Private browser"
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      )}
    </div>
  );
}
