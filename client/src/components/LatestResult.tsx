import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

export interface PublishedResult {
  text: string;
  publishedAt: string;
}

const REFRESH_MS = 15_000;

interface Props {
  /** Change this value to reload immediately (e.g. right after publishing). */
  refreshKey?: number;
}

/** Shows the latest published result and checks for a new one every 15 seconds. */
export function LatestResult({ refreshKey }: Props) {
  const [result, setResult] = useState<PublishedResult | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () =>
      apiGet<PublishedResult | null>('/results/latest')
        .then((latest) => {
          if (!active) return;
          setResult(latest);
          setFailed(false);
        })
        .catch(() => active && setFailed(true));

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refreshKey]);

  return (
    <section className="result" aria-label="Latest result">
      <h2>Latest result</h2>
      {result === undefined && !failed && <p>Loading…</p>}
      {result === undefined && failed && <p className="error">Could not load the result.</p>}
      {result === null && <p className="muted">No result has been published yet.</p>}
      {result && (
        <>
          <p className="result-text">{result.text}</p>
          <p className="muted">Updated {new Date(result.publishedAt).toLocaleString()}</p>
        </>
      )}
    </section>
  );
}
