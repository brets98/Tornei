import { useEffect, useState } from 'react';

type ApiStatus = 'loading' | 'ok' | 'error';

export function App() {
  const [status, setStatus] = useState<ApiStatus>('loading');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setStatus(res.ok ? 'ok' : 'error'))
      .catch(() => setStatus('error'));
  }, []);

  return (
    <main>
      <h1>Tornei</h1>
      <p>API: {status}</p>
    </main>
  );
}
