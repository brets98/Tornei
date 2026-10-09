import { useEffect, useState } from 'react';

export interface PublishedResult {
  text: string;
  publishedAt: string;
}

/**
 * Shows the latest published result, updated live: the server pushes each new result
 * over Server-Sent Events. EventSource reconnects by itself if the connection drops.
 */
export function LatestResult() {
  const [result, setResult] = useState<PublishedResult | null | undefined>(undefined);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const source = new EventSource('/api/results/stream');
    source.onmessage = (event: MessageEvent<string>) => {
      setResult(JSON.parse(event.data) as PublishedResult | null);
      setConnected(true);
    };
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, []);

  return (
    <section className="result" aria-label="Latest result">
      <h2>
        Latest result
        {result !== undefined && (
          <span className={connected ? 'live' : 'muted'}>
            {connected ? 'Live' : 'Reconnecting…'}
          </span>
        )}
      </h2>
      {result === undefined &&
        (connected ? <p>Loading…</p> : <p className="error">Could not load the result.</p>)}
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
