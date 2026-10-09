import { useEffect, useState, type FormEvent } from 'react';
import { authClient } from '../lib/auth-client';

interface Props {
  email: string;
}

export function ChangePasswordPage({ email }: Props) {
  // Accounts created with Google have no password until they set one
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  useEffect(() => {
    authClient.listAccounts().then(({ data }) => {
      setHasPassword(Boolean(data?.some((account) => account.providerId === 'credential')));
    });
  }, []);

  return (
    <article className="page narrow">
      <h1>Change password</h1>
      {hasPassword === null && <p>Loading…</p>}
      {hasPassword === true && <ChangePasswordForm />}
      {hasPassword === false && <SetPassword email={email} />}
    </article>
  );
}

function ChangePasswordForm() {
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get('currentPassword'));
    const newPassword = String(form.get('newPassword'));
    setError('');
    setMessage('');

    if (newPassword !== form.get('confirmPassword')) {
      setError('The new passwords do not match.');
      return;
    }

    setBusy(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: form.get('revokeOtherSessions') === 'on',
    });
    setBusy(false);

    if (error) {
      setError(error.message ?? 'Could not change the password.');
    } else {
      formElement.reset();
      setMessage('Your password has been changed.');
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label>
        Current password
        <input name="currentPassword" type="password" required autoComplete="current-password" />
      </label>
      <label>
        New password
        <input
          name="newPassword"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
        />
      </label>
      <label>
        Confirm new password
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
        />
      </label>
      <label className="checkbox">
        <input name="revokeOtherSessions" type="checkbox" defaultChecked />
        Sign out of all other devices
      </label>
      {error && <p className="error">{error}</p>}
      {message && <p className="message">{message}</p>}
      <button type="submit" disabled={busy}>
        Change password
      </button>
    </form>
  );
}

function SetPassword({ email }: { email: string }) {
  const [sent, setSent] = useState(false);

  async function sendLink() {
    await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
    setSent(true);
  }

  return (
    <>
      <p>
        You sign in with Google, so your account does not have a password yet. If you also want to
        sign in with email and password, we can email you a link to set one.
      </p>
      {sent ? (
        <p className="message">We sent a link to {email}.</p>
      ) : (
        <button type="button" onClick={sendLink}>
          Email me a link to set a password
        </button>
      )}
    </>
  );
}
