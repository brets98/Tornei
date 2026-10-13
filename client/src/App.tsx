import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { useI18n } from './i18n/context';
import { authClient } from './lib/auth-client';
import { AuthPage } from './pages/AuthPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { NewTournamentPage } from './pages/NewTournamentPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PublicLandingPage } from './pages/PublicLandingPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ResultsPage } from './pages/ResultsPage';
import { TournamentPage } from './pages/TournamentPage';
import { TournamentsPage } from './pages/TournamentsPage';
import { UsersPage } from './pages/UsersPage';

export function App() {
  const { t } = useI18n();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <main className="card">{t.common.loading}</main>;
  }

  if (!session) {
    return (
      <Routes>
        <Route index element={<PublicLandingPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        {/* Sign-in page, also shown for any page that requires an account */}
        <Route path="*" element={<AuthPage />} />
      </Routes>
    );
  }

  const { user } = session;
  const isAdmin = user.role === 'admin';
  return (
    <Routes>
      <Route path="reset-password" element={<ResetPasswordPage />} />
      <Route path="sign-in" element={<Navigate to="/" replace />} />
      <Route element={<Layout user={user} />}>
        <Route index element={<TournamentsPage />} />
        <Route path="tournaments/new" element={<NewTournamentPage />} />
        <Route path="tournaments/:id" element={<TournamentPage />} />
        <Route path="results" element={<ResultsPage isAdmin={isAdmin} />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="account/password" element={<ChangePasswordPage email={user.email} />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
