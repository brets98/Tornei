import { useState, type FormEvent } from 'react';
import { LatestResult } from '../components/LatestResult';
import { apiPost } from '../lib/api';

const MAX_LENGTH = 2000;

interface Props {
  isAdmin: boolean;
}

export function ResultsPage({ isAdmin }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(false);

  if (!isAdmin) {
    return (
      <article className="page">
        <h1>Results</h1>
        <p className="error">Only administrators can publish results.</p>
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
      setError('Could not publish the result.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="page narrow">
      <h1>Results</h1>
      <p>What you publish here is shown to everyone, including visitors who are not signed in.</p>

      <form onSubmit={onSubmit}>
        <label>
          New result
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
        {published && <p className="message">Result published.</p>}
        <button type="submit" disabled={busy || !text.trim()}>
          Publish
        </button>
      </form>

      <LatestResult />
    </article>
  );
}
