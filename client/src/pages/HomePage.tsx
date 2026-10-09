import { authClient } from '../lib/auth-client';

interface Props {
  user: { name: string; surname: string; email: string };
}

export function HomePage({ user }: Props) {
  return (
    <main className="card">
      <h1>Tornei</h1>
      <p>
        Signed in as <strong>{`${user.name} ${user.surname}`.trim()}</strong> ({user.email})
      </p>
      <button type="button" onClick={() => authClient.signOut()}>
        Sign out
      </button>
    </main>
  );
}
