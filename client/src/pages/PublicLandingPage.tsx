import { Link } from 'react-router';
import { LatestResult } from '../components/LatestResult';

/** What visitors who are not signed in see at "/". */
export function PublicLandingPage() {
  return (
    <div className="public">
      <header className="public-header">
        <span className="brand">Tornei</span>
        <Link to="/sign-in" className="button">
          Sign in
        </Link>
      </header>
      <main className="page public-main">
        <LatestResult />
      </main>
    </div>
  );
}
