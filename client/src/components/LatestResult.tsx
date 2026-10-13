import { useEffect, useState } from 'react';
import { fill, useI18n } from '../i18n/context';

export interface PublishedResult {
  text: string;
  publishedAt: string;
}

/**
 * Shows the latest published result, updated live: the server pushes each new result
 * over Server-Sent Events. EventSource reconnects by itself if the connection drops.
 */
export function LatestResult() {
  const { t, locale } = useI18n();
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
    <section className="result" aria-label={t.results.latest}>
      <h2>
        {t.results.latest}
        {result !== undefined && (
          <span className={connected ? 'live' : 'muted'}>
            {connected ? t.results.live : t.results.reconnecting}
          </span>
        )}
      </h2>
      {result === undefined &&
        (connected ? <p>{t.common.loading}</p> : <p className="error">{t.results.loadFailed}</p>)}
      {result === null && <p className="muted">{t.results.none}</p>}
      {result && (
        <>
          <p className="result-text">{result.text}</p>
          <p className="muted">
            {fill(t.results.updated, {
              time: new Date(result.publishedAt).toLocaleString(locale),
            })}
          </p>
        </>
      )}
    </section>
  );
}
