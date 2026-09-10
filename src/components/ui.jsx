import { useEffect } from 'react';
import { X } from 'lucide-react';

export function PageHead({ eyebrow, title, actions }) {
  return (
    <header className="page-head spread">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
      </div>
      {actions && <div className="wrap">{actions}</div>}
    </header>
  );
}

export function SectionHead({ title, actions }) {
  return (
    <div className="spread" style={{ marginBottom: 12 }}>
      <h2>{title}</h2>
      {actions && <div className="wrap">{actions}</div>}
    </div>
  );
}

export function Empty({ icon: Icon, title, body, children }) {
  return (
    <div className="empty">
      {Icon && <span className="empty-icon"><Icon size={20} /></span>}
      <strong>{title}</strong>
      {body && <span>{body}</span>}
      {children}
    </div>
  );
}

export function Loader({ label = 'Loading…' }) {
  return (
    <div className="state">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <p className="error" role="alert">{children}</p>;
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      {label && <span>{label}</span>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Tabs({ value, onChange, options }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => {
        const val = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        return (
          <button
            key={val}
            role="tab"
            aria-selected={value === val}
            onClick={() => onChange(val)}
            type="button"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Toast({ children }) {
  if (!children) return null;
  return <div className="toast" role="status">{children}</div>;
}

// Navigates without prop-drilling the router: pushState plus a synthetic
// popstate, which is exactly what useRouter listens for.
export function navigateTo(path) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

// A member's name, linked to their profile. `to` is a username or a uid.
export function UserLink({ to, children, className = '' }) {
  if (!to) return <strong className={className}>{children}</strong>;
  return (
    <button
      className={`user-link ${className}`}
      onClick={(e) => { e.stopPropagation(); navigateTo(`/u/${encodeURIComponent(to)}`); }}
      type="button"
    >
      {children}
    </button>
  );
}
