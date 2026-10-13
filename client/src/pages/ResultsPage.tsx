import { useState, type FormEvent } from 'react';
import { LatestResult } from '../components/LatestResult';
import { useI18n } from '../i18n/context';
import { apiPost } from '../lib/api';

const MAX_LENGTH = 2000;

interface Props {
  isAdmin: boolean;
}

export function ResultsPage({ isAdmin }: Props) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(false);

  if (!isAdmin) {
    return (
      <article className="page">
        <h1>{t.results.title}</h1>
        <p className="error">{t.results.adminOnly}</p>
      </article>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPublished(false);
    setBusy(true);
    try {
      await apiPost('/results', { text });
      setText('');
      setPublished(true);
    } catch {
      setError(t.results.publishFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="page narrow">
      <h1>{t.results.title}</h1>
      <p>{t.results.intro}</p>

      <form onSubmit={onSubmit}>
        <label>
          {t.results.newResult}
          <textarea
            name="text"
            rows={4}
            required
            maxLength={MAX_LENGTH}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        {published && <p className="message">{t.results.published}</p>}
        <button type="submit" disabled={busy || !text.trim()}>
          {t.results.publish}
        </button>
      </form>

      <LatestResult />
    </article>
  );
}
