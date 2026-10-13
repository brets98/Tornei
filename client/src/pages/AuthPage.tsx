import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useI18n } from '../i18n/context';
import { authClient } from '../lib/auth-client';

type Mode = 'sign-in' | 'sign-up' | 'forgot';

export function AuthPage() {
  const { t } = useI18n();
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
          setError(t.auth.verifyFirst);
        } else if (error) {
          setError(error.message ?? t.auth.signInFailed);
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
          setError(error.message ?? t.auth.signUpFailed);
        } else {
          setMessage(t.auth.checkInbox);
        }
      } else {
        await authClient.requestPasswordReset({ email: form.email, redirectTo: '/reset-password' });
        setMessage(t.auth.resetSent);
      }
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setError('');
    const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
    if (error) {
      setError(t.auth.googleUnavailable);
    }
  }

  return (
    <main className="card">
      <div className="page-head">
        <h1>Tornei</h1>
        <LanguageSwitch />
      </div>
      <h2>
        {mode === 'sign-in'
          ? t.auth.signIn
          : mode === 'sign-up'
            ? t.auth.createAccount
            : t.auth.resetPassword}
      </h2>

      <form onSubmit={onSubmit}>
        {mode === 'sign-up' && (
          <>
            <label>
              {t.auth.name}
              <input name="name" required autoComplete="given-name" />
            </label>
            <label>
              {t.auth.surname}
              <input name="surname" required autoComplete="family-name" />
            </label>
          </>
        )}
        <label>
          {t.auth.email}
          <input name="email" type="email" required autoComplete="email" />
        </label>
        {mode !== 'forgot' && (
          <label>
            {t.auth.password}
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
          {mode === 'sign-in'
            ? t.auth.signIn
            : mode === 'sign-up'
              ? t.auth.signUp
              : t.auth.sendResetLink}
        </button>
      </form>

      {mode !== 'forgot' && (
        <button type="button" className="secondary" onClick={signInWithGoogle}>
          {t.auth.google}
        </button>
      )}

      <nav>
        {mode !== 'sign-in' && (
          <button type="button" className="link" onClick={() => switchTo('sign-in')}>
            {t.auth.haveAccount}
          </button>
        )}
        {mode !== 'sign-up' && (
          <button type="button" className="link" onClick={() => switchTo('sign-up')}>
            {t.auth.createAccount}
          </button>
        )}
        {mode === 'sign-in' && (
          <button type="button" className="link" onClick={() => switchTo('forgot')}>
            {t.auth.forgot}
          </button>
        )}
        <Link to="/">{t.auth.backToResult}</Link>
      </nav>
    </main>
  );
}
