import { useEffect } from 'react';

export default function HushMotoPage() {
  const destination = `/hushmoto${window.location.search}${window.location.hash}`;
  useEffect(() => { window.location.replace(destination); }, [destination]);
  return <main className="state"><p>Opening Hush Moto…</p><a href={destination}>Play Hush Moto</a></main>;
}
