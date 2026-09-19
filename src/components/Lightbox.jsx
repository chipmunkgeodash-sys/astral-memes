import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Full-screen image viewer. Click anywhere or press Escape to close.
export default function Lightbox({ src, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!src) return null;
  return createPortal(
    <div className="lightbox" onClick={onClose} role="dialog" aria-label="Image">
      <img src={src} alt="" />
      <button className="btn btn-icon lightbox-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
    </div>,
    document.body
  );
}
