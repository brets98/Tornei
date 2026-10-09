import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { authClient } from '../lib/auth-client';

type Mode = 'sign-in' | 'sign-up' | 'forgot';

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function switchTo(next: Mode) {
    setMode(next);
    setError('');
    setMessage('');
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    setError('');
    setMessage('');
    setBusy(true);

    try {
      if (mode === 'sign-in') {
        const { error } = await authClient.signIn.email({
          email: form.email,
          password: form.password,
        });
        if (error?.status === 403) {
          setError('Please verify your email first: we have sent you a new link.');
        } else if (error) {
          setError(error.message ?? 'Sign in failed');
        }
      } else if (mode === 'sign-up') {
        const { error } = await authClient.signUp.email({
          name: form.name,
          surname: form.surname,
          email: form.email,
          password: form.password,
          callbackURL: '/',
        });
        if (error) {
          setError(error.message ?? 'Sign up failed');
        } else {
          setMessage('Check your inbox: we sent you a link to verify your email.');
        }
      } else {
        await authClient.requestPasswordReset({ email: form.email, redirectTo: '/reset-password' });
        setMessage('If an account exists for this email, we sent you a reset link.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setError('');
    const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
    if (error) {
      setError('Google sign-in is not available right now.');
    }
  }

  return (
    <main className="card">
      <h1>Tornei</h1>
      <h2>
        {mode === 'sign-in'
          ? 'Sign in'
          : mode === 'sign-up'
            ? 'Create an account'
            : 'Reset password'}
      </h2>

      <form onSubmit={onSubmit}>
        {mode === 'sign-up' && (
          <>
            <label>
              Name
              <input name="name" required autoComplete="given-name" />
            </label>
            <label>
              Surname
              <input name="surname" required autoComplete="family-name" />
            </label>
          </>
        )}
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        {mode !== 'forgot' && (
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={mode === 'sign-up' ? 10 : undefined}
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            />
          </label>
        )}

        {error && <p className="error">{error}</p>}
        {message && <p className="message">{message}</p>}

        <button type="submit" disabled={busy}>
          {mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Sign up' : 'Send reset link'}
        </button>
      </form>

      {mode !== 'forgot' && (
        <button type="button" className="secondary" onClick={signInWithGoogle}>
          Continue with Google
        </button>
      )}

      <nav>
        {mode !== 'sign-in' && (
          <button type="button" className="link" onClick={() => switchTo('sign-in')}>
            Already have an account? Sign in
          </button>
        )}
        {mode !== 'sign-up' && (
          <button type="button" className="link" onClick={() => switchTo('sign-up')}>
            Create an account
          </button>
        )}
        {mode === 'sign-in' && (
          <button type="button" className="link" onClick={() => switchTo('forgot')}>
            Forgot your password?
          </button>
        )}
        <Link to="/">← Back to the latest result</Link>
      </nav>
    </main>
  );
}
