import { authClient } from './lib/auth-client';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

export function App() {
  const { data: session, isPending } = authClient.useSession();

  if (window.location.pathname === '/reset-password') {
    return <ResetPasswordPage />;
  }
  if (isPending) {
    return <main className="card">Loading…</main>;
  }
  return session ? <HomePage user={session.user} /> : <AuthPage />;
}
