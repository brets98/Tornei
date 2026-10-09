import { useState, type FormEvent } from 'react';
import { authClient } from '../lib/auth-client';

export function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get('token');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newPassword = String(new FormData(event.currentTarget).get('password'));
    const { error } = await authClient.resetPassword({ newPassword, token: token! });
    if (error) {
      setError(error.message ?? 'Could not reset the password');
    } else {
      setDone(true);
    }
  }

  return (
    <main className="card">
      <h1>Tornei</h1>
      <h2>Choose a new password</h2>
      {!token ? (
        <p className="error">This reset link is invalid or has expired.</p>
      ) : done ? (
        <p className="message">Your password has been changed.</p>
      ) : (
        <form onSubmit={onSubmit}>
          <label>
            New password
            <input
              name="password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit">Save password</button>
        </form>
      )}
      <a href="/">Back to sign in</a>
    </main>
  );
}
