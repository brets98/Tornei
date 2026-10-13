import { Link } from 'react-router';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { LatestResult } from '../components/LatestResult';
import { useI18n } from '../i18n/context';

/** What visitors who are not signed in see at "/". */
export function PublicLandingPage() {
  const { t } = useI18n();
  return (
    <div className="public">
      <header className="public-header">
        <span className="brand">Tornei</span>
        <div className="header-actions">
          <LanguageSwitch />
          <Link to="/sign-in" className="button">
            {t.auth.signIn}
          </Link>
        </div>
      </header>
      <main className="page public-main">
        <LatestResult />
      </main>
    </div>
  );
}
