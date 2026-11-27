import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useI18n } from '../i18n/context';
import { authClient } from '../lib/auth-client';
import { LanguageSwitch } from './LanguageSwitch';
import { ThemeSwitch } from './ThemeSwitch';

interface Props {
  user: { name: string; surname: string; email: string; role?: string | null };
}

/** Whether the menu was hidden in this browser (`tornei.menu`). */
const MENU_KEY = 'tornei.menu';

function menuHiddenBefore() {
  try {
    return localStorage.getItem(MENU_KEY) === 'hidden';
  } catch {
    return false;
  }
}

export function Layout({ user }: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const isAdmin = user.role === 'admin';
  const [menuHidden, setMenuHidden] = useState(menuHiddenBefore);

  function toggleMenu(hidden: boolean) {
    setMenuHidden(hidden);
    try {
      if (hidden) localStorage.setItem(MENU_KEY, 'hidden');
      else localStorage.removeItem(MENU_KEY);
    } catch {
      // Not saved: the choice lasts until the page is reloaded
    }
  }

  async function signOut() {
    await authClient.signOut();
    navigate('/');
  }

  return (
    <div className={`layout${menuHidden ? ' menu-hidden' : ''}`}>
      {menuHidden && (
        <button
          type="button"
          className="secondary menu-toggle menu-show"
          aria-label={t.menu.show}
          title={t.menu.show}
          onClick={() => toggleMenu(false)}
        >
          ☰
        </button>
      )}
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="brand">Tornei</div>
          <button
            type="button"
            className="secondary menu-toggle"
            aria-label={t.menu.hide}
            title={t.menu.hide}
            onClick={() => toggleMenu(true)}
          >
            «
          </button>
        </div>
        <nav aria-label={t.menu.label}>
          <NavLink to="/" end>
            {t.menu.tournaments}
          </NavLink>
          <NavLink to="/circuits">{t.menu.circuits}</NavLink>
          <NavLink to="/players">{t.menu.players}</NavLink>
          <NavLink to="/live">{t.menu.live}</NavLink>
          <NavLink to="/organizers">{t.menu.organizers}</NavLink>
          {isAdmin && <NavLink to="/results">{t.menu.results}</NavLink>}
          {isAdmin && <NavLink to="/users">{t.menu.users}</NavLink>}
          <NavLink to="/account/password">{t.menu.changePassword}</NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="user-name">{`${user.name} ${user.surname}`.trim()}</span>
          <span className="user-email">{user.email}</span>
          <LanguageSwitch />
          <ThemeSwitch />
          <button type="button" className="secondary" onClick={signOut}>
            {t.menu.signOut}
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
