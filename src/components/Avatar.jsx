// Profile art. The original stored a colour "pack" per account rather than an
// uploaded image for most members, so fall back to initials on a colour ring.
const PACKS = ['orb-0', 'orb-1', 'orb-2', 'orb-3'];

export default function Avatar({ profile, size = 40 }) {
  const name = profile?.displayName || 'Astral member';
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const pack = PACKS[Math.abs(hash(profile?.id || name)) % PACKS.length];

  if (profile?.photoURL) {
    return (
      <img
        className={`avatar ${pack}`}
        src={profile.photoURL}
        alt={name}
        width={size}
        height={size}
      />
    );
  }

  return (
    <span
      className={`avatar profile-orb ${pack}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-label={name}
    >
      {initials || 'A'}
    </span>
  );
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
  return h;
}
