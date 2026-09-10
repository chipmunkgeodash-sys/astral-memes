// Initials on a tinted circle, or the member's picture when they have one.
export default function Avatar({ profile, size = 36 }) {
  const name = profile?.displayName || profile?.username || 'Astral member';
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'A';
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };

  if (profile?.picture) {
    return <img className="avatar" style={style} src={profile.picture} alt="" width={size} height={size} />;
  }
  return <span className="avatar" style={style} aria-hidden="true">{initials}</span>;
}
