import { useEffect } from 'react';
import { X } from 'lucide-react';

export function SectionTitle({ eyebrow, title, actions }) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2 className="heading">{title}</h2>
      </div>
      {actions && <div className="store-heading-actions">{actions}</div>}
    </div>
  );
}

export function Empty({ icon: Icon, title, body, children }) {
  return (
    <div className="empty">
      {Icon && <span className="empty-icon"><Icon size={22} /></span>}
      <strong>{title}</strong>
      {body && <span>{body}</span>}
      {children}
    </div>
  );
}

export function Loader({ label = 'Loading…' }) {
  return (
    <div className="state-page">
      <div className="loader" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <p className="form-error">{children}</p>;
}

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="section-title">
          <h2 className="heading">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="game-actions">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="chat-label">{label}</span>
      {children}
      {hint && <small className="permission-hint">{hint}</small>}
    </label>
  );
}
