import { useEffect, useState } from 'react';

/** How old the data may get before the dot turns yellow, orange, red (minutes). */
const FRESHNESS = [
  { level: 'fresh', under: 2 },
  { level: 'aging', under: 5 },
  { level: 'stale', under: 10 },
] as const;

/**
 * A dot for how recent the shown data is: green under 2 minutes, yellow under 5, orange under
 * 10, red after (only when updates fail). The time is in its label and tooltip.
 */
export function Freshness({ at, label }: { at: Date; label: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const minutes = (now - at.getTime()) / 60_000;
  const level = FRESHNESS.find((f) => minutes < f.under)?.level ?? 'old';
  return (
    <span
      className={`freshness ${level}`}
      role="status"
      aria-label={label}
      title={label}
      data-level={level}
    />
  );
}
