// Shimmering placeholders shown while data loads, shaped like what's coming.

export function SkeletonPosts({ count = 3 }) {
  return (
    <div className="list" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card skeleton-card">
          <div className="row" style={{ gap: 10 }}>
            <span className="skeleton skeleton-circle" />
            <span className="stack" style={{ gap: 6, flex: 1 }}>
              <span className="skeleton skeleton-line" style={{ width: '35%' }} />
              <span className="skeleton skeleton-line" style={{ width: '20%' }} />
            </span>
          </div>
          <span className="skeleton skeleton-line" style={{ width: '92%', marginTop: 14 }} />
          <span className="skeleton skeleton-line" style={{ width: '70%', marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonGrid({ count = 8, height = 180 }) {
  return (
    <div className="member-grid" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card skeleton-card" style={{ height }}>
          <span className="skeleton skeleton-circle" style={{ margin: '10px auto' }} />
          <span className="skeleton skeleton-line" style={{ width: '60%', margin: '8px auto' }} />
          <span className="skeleton skeleton-line" style={{ width: '40%', margin: '6px auto' }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 6 }) {
  return (
    <div className="stack" style={{ gap: 8 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}
