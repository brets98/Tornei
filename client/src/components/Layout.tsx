import { NavLink, Outlet, useNavigate } from 'react-router';
import { authClient } from '../lib/auth-client';

interface Props {
  user: { name: string; surname: string; email: string; role?: string | null };
}

export function Layout({ user }: Props) {
  const navigate = useNavigate();
  const isAdmin = user.role === 'admin';

  async function signOut() {
    await authClient.signOut();
    navigate('/');
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">Tornei</div>
        <nav aria-label="Main">
          <NavLink to="/" end>
            Home
          </NavLink>
          {isAdmin && <NavLink to="/users">Users</NavLink>}
          <NavLink to="/account/password">Change password</NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="user-name">{`${user.name} ${user.surname}`.trim()}</span>
          <span className="user-email">{user.email}</span>
          <button type="button" className="secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
