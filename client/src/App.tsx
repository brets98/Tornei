import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { authClient } from './lib/auth-client';
import { AuthPage } from './pages/AuthPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { UsersPage } from './pages/UsersPage';

export function App() {
  return (
    <Routes>
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="*" element={<SignedInOnly />} />
    </Routes>
  );
}

function SignedInOnly() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <main className="card">Loading…</main>;
  }
  if (!session) {
    return <AuthPage />;
  }

  const { user } = session;
  return (
    <Routes>
      <Route element={<Layout user={user} />}>
        <Route index element={<LandingPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="account/password" element={<ChangePasswordPage email={user.email} />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
